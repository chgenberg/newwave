import sharp from "sharp";
import { seasonFor } from "./calendar";
import { editWithMask, editWithReference, generatePhoto, hasOpenAIKey } from "./openai";
import { detectMarker, printOntoFabric } from "./photoComposite";
import { loadFile, saveFile } from "./store";
import { reviewAsset } from "./reviewer";
import type { Club, Concept, Review } from "./types";

export type ReviewedPhoto = { id: string; label: string; url: string; review: Review | null; attempts: number; method: "exakt tryck" | "referens" };

export type Scene = { id: string; label: string; print: "light" | "dark"; prompt: string; fabric: string; anchor?: "top" | "center" };

const MARKER =
  "one flat, solid, pure bright green (#00FF00) rectangle in portrait orientation (3:4), centred on the chest, large – covering the whole chest area from just below the collar to above the stomach and following the fabric naturally. The rectangle has no texture, text or pattern. Nothing else is printed on the garment and there is no other bright green anywhere in the image.";

export function scenes(club: Club, concept: Concept): Scene[] {
  const season = seasonFor(new Date()).title.toLowerCase();
  const signal = concept.signal.toLowerCase();
  const people = /fars dag/.test(signal)
    ? `a father and his young child laughing together; the father wears a plain white crew-neck t-shirt with ${MARKER} The child wears a plain white t-shirt with nothing on it`
    : /mors dag/.test(signal)
      ? `a mother and her young child laughing together; the mother wears a plain white crew-neck t-shirt with ${MARKER} The child wears a plain white t-shirt with nothing on it`
      : `a young adult supporter, relaxed and proud, wearing a plain white crew-neck cotton t-shirt with ${MARKER}`;
  const place = /halloween/.test(signal)
    ? "on the steps outside a football stadium at dusk with a few carved pumpkins, warm floodlights"
    : /jul|lucia|black friday/.test(signal)
      ? "in a cosy Scandinavian living room with a Christmas tree and warm lights"
      : `outside a compact city football stadium in ${club.city} on a ${season} evening, floodlights glowing behind`;

  const look = `Hyperrealistic editorial sportswear campaign photo, shot on a full-frame camera with a 50mm lens, natural light, shallow depth of field. Real skin texture, natural hands and faces, realistic cotton fabric and stitching – indistinguishable from a real photo shoot.
Any people are fictional and generic, not famous, not football players. No logos, no brands, no other football clubs, no green, red or yellow clothing or scarves.`;

  return [
    { id: "livsstil", label: "Livsstil", print: "light", fabric: "plain white cotton t-shirt fabric", prompt: `${look}\n${people}, ${place}.` },
    {
      id: "produkt",
      label: "Produkt",
      print: "light",
      fabric: "plain white cotton t-shirt fabric",
      prompt: `${look}\nProduct photo: a plain white crew-neck t-shirt laid flat and neatly styled on a blue plastic stadium seat in an empty stand, a blue-and-white striped scarf beside it, soft ${season} daylight. On the chest of the t-shirt there is ${MARKER}`,
    },
    {
      id: "filt",
      label: "Filt i soffan",
      print: "light",
      anchor: "center",
      fabric: "soft cream white fleece blanket fabric",
      prompt: `${look}\nInterior photo, no people: a cosy Scandinavian living room on a ${season} evening. A soft cream white fleece throw blanket is draped over the back and seat of a light grey sofa, with chunky knitted cushions, a wooden side table with a ceramic mug and a few books, warm lamp light and a glowing wood stove in the background. On the front of the draped blanket, facing the camera, there is one flat, solid, pure bright green (#00FF00) rectangle in portrait orientation (3:4), large, centred on the visible part of the blanket and following its drape. The rectangle has no texture, text or pattern, and there is no other bright green anywhere in the image.`,
    },
  ];
}

export const SCENE_IDS = ["livsstil", "produkt", "filt"] as const;

export async function shootBlank(scene: Scene, feedback?: string) {
  const prompt = feedback ? `${scene.prompt}\nAvoid these issues from a previous attempt: ${feedback}` : scene.prompt;
  const raw = await generatePhoto(prompt);
  const marker = await detectMarker(raw);
  if (!marker) return null;
  const blank = await editWithMask(
    await sharp(raw).png().toBuffer(),
    marker.maskPng,
    `Replace the masked green rectangle with ${scene.fabric}, continuing the natural folds, shading and texture of the garment seamlessly. Keep everything else identical. No print, no graphics, no text.`,
  );
  return { raw, blank, marker };
}

async function shootWithExactPrint(scene: Scene, print: Buffer, feedback?: string) {
  const shot = await shootBlank(scene, feedback);
  return shot ? printOntoFabric(shot.blank, print, shot.marker, { ink: scene.print, anchor: scene.anchor }) : null;
}

export async function productPhotos(
  club: Club,
  concept: Concept,
  prints: { light: string; dark: string },
  sceneIds: readonly string[] = ["livsstil", "produkt"],
): Promise<ReviewedPhoto[]> {
  if (!hasOpenAIKey()) return [];
  const id = (url: string) => url.split("/").pop()!;
  const [light, dark] = await Promise.all([loadFile(id(prints.light)), loadFile(id(prints.dark))]);
  if (!light || !dark) throw new Error("Tryckfilerna hittades inte");

  const list = scenes(club, concept).filter((s) => sceneIds.includes(s.id));
  const results = await Promise.allSettled(
    list.map(async (s) => {
      const print = s.print === "light" ? light.data : dark.data;
      const ref = await sharp(print).resize(1024, 1024, { fit: "inside" }).png().toBuffer();
      let feedback: string | undefined;
      let best: { jpg: Buffer; review: Review | null; method: "exakt tryck" | "referens" } | null = null;
      let attempts = 0;
      while (attempts <= club.agent.review.maxRetries) {
        attempts++;
        const exact = await shootWithExactPrint(s, print, feedback).catch(() => null);
        const jpg = exact ?? (await editWithReference(feedback ? `${s.prompt}\nFix: ${feedback}` : s.prompt, ref));
        const review = await reviewAsset(club, concept, [jpg], "produktfoto").catch(() => null);
        if (!best || (review && (!best.review || review.sales + review.realism + review.brandFit > best.review.sales + best.review.realism + best.review.brandFit))) {
          best = { jpg, review, method: exact ? "exakt tryck" : "referens" };
        }
        if (!review || review.verdict === "publicera") break;
        feedback = review.issues.join("; ");
      }
      const file = await saveFile(best!.jpg, "jpg");
      return { id: s.id, label: s.label, url: file.url, review: best!.review, attempts, method: best!.method };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
