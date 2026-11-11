import { toFile } from "openai";
import sharp from "sharp";
import { IMAGE_MODEL, IMAGE_QUALITY, openai } from "./openai";

/**
 * Fotografier av en stickad halsduk på en person, gjorda av bildmodellen med halsdukens mönster som referens.
 * Delas av fotostudion (app/api/v1/scarf/photos) och av materialet för sociala medier.
 */

export const REALISM =
  "Hyperrealistic editorial photography shot on a full-frame camera with an 85mm f/1.8 lens, natural skin texture, realistic knitted jacquard wool/acrylic yarn texture and fringes, natural fabric folds and lighting. Indistinguishable from a real photograph. No extra limbs or fingers, no watermarks.";

/** The one way the scarf is worn in every photo: hung around the neck, both ends straight down the chest. */
export const DRAPE =
  "How the scarf is worn (strict): the classic football supporter way – the scarf lies once loosely around the back of the neck and BOTH ends hang straight down the front of the body, side by side and parallel, one on each side of the chest, reaching about to the waist. Each hanging end lies flat and untwisted with its crest, end stripes and fringes at the bottom, facing the camera and fully readable. The scarf is NOT wrapped around the neck, NOT knotted, NOT looped, NOT tucked into the jacket, NOT thrown over one shoulder and NOT held in the hands. Both hands are relaxed and do not cover the scarf.";

export const FAITHFUL =
  "Reproduce the scarf's exact colours, end stripes, club crests, fringes and central graphic/text from the reference image with realistic knitted yarn texture. Fictional generic person, no other brand logos.";

/** Builds a clean reference sheet showing the knitted scarf with fringes on a neutral studio card so the image model sees its exact colours, crest and lettering. */
export async function scarfReference(image: Buffer) {
  const scarf = await sharp(image).resize({ width: 1400, withoutEnlargement: true }).png().toBuffer();
  const meta = await sharp(scarf).metadata();
  const w = meta.width ?? 1400;
  const h = meta.height ?? 200;
  const padY = Math.max(120, Math.round((w * 0.55 - h) / 2));
  return sharp({ create: { width: w + 80, height: h + padY * 2, channels: 3, background: { r: 245, g: 245, b: 247 } } })
    .composite([{ input: scarf, left: 40, top: padY }])
    .png()
    .toBuffer();
}

/** Bildmodellen gör ett fotografi utifrån referensbilderna. Ger en JPG. */
export async function editToJpg(files: { buf: Buffer; name: string }[], prompt: string, size: "1024x1024" | "1024x1536" = "1024x1024") {
  const res = await openai().images.edit({
    model: IMAGE_MODEL,
    image: await Promise.all(files.map((f) => toFile(f.buf, f.name, { type: "image/png" }))),
    prompt,
    size,
    quality: IMAGE_QUALITY,
    output_format: "jpeg",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return sharp(Buffer.from(b64, "base64")).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

/** De två fotografierna som materialet för sociala medier byggs av. Platsen är neutral, så att den passar alla sporter och orter. */
const SOCIAL = {
  sport: [
    "Waist-up photo, facing the camera: a smiling Scandinavian woman in her late 20s in a dark wool coat outside a Swedish sports arena on a match evening, warm floodlights and softly blurred supporters far behind her, wearing the exact knitted supporter scarf from the reference image.",
    "Waist-up photo, facing the camera: a joyful Scandinavian man in his 30s in a neutral dark jacket on a Swedish town street in golden late-afternoon light, on his way to the match, wearing the exact knitted supporter scarf from the reference image.",
  ],
  vardag: [
    "Waist-up photo, facing the camera: a smiling Scandinavian woman in her early 30s in a dark wool coat on a Swedish city street on a crisp winter afternoon with softly blurred shop windows behind her, wearing the exact knitted scarf from the reference image.",
    "Waist-up photo, facing the camera: a friendly Scandinavian man in his 40s in a dark jacket on a frosty park path in golden afternoon light, wearing the exact knitted scarf from the reference image.",
  ],
} as const;

/**
 * Två stående fotografier av halsduken på modell. `scarf` är framsidan som den blir stickad.
 * Det som inte går att fotografera hoppas över – listan kan bli kortare, eller tom.
 */
export async function socialPhotos(input: { club: string; headline: string; scarf: Buffer; setting: "sport" | "vardag" }) {
  const reference = await scarfReference(await sharp(input.scarf).flatten({ background: "#F5F5F7" }).png().toBuffer());
  const hint = input.headline ? ` featuring the text "${input.headline}"` : "";
  const settled = await Promise.allSettled(
    SOCIAL[input.setting].map((scene) =>
      editToJpg(
        [{ buf: reference, name: "scarf.png" }],
        [REALISM, `The reference image shows the exact custom knitted scarf for ${input.club}${hint}.`, scene, DRAPE, FAITHFUL, "Vertical composition with the person centred and some calm space above the head."].join("\n"),
        "1024x1536",
      ),
    ),
  );
  return { photos: settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])), errors: settled.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : [])) };
}
