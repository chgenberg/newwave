import sharp from "sharp";
import { z } from "zod";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { DRAPE, FAITHFUL, REALISM, editToJpg, scarfReference } from "@/lib/scarfPhoto";
import { saveFile } from "@/lib/store";

export const maxDuration = 300;

const limiter = createLimiter(() => ({
  perKey: envInt("SCARF_PHOTOS_PER_IP_PER_HOUR", 20),
  global: envInt("SCARF_PHOTOS_GLOBAL_PER_HOUR", 200),
  windowMs: 60 * 60_000,
}));

const DataImage = z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(6_000_000);

const Body = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("self"),
    club: z.string().trim().min(1).max(80),
    headline: z.string().trim().max(80).default(""),
    scarfDataUrl: DataImage,
    personDataUrl: DataImage,
  }),
  z.object({
    mode: z.literal("four"),
    club: z.string().trim().min(1).max(80),
    headline: z.string().trim().max(80).default(""),
    scarfDataUrl: DataImage,
    /** "vardag" för företag och föreningar utanför idrotten: stad och arbetsplats i stället för läktare och arena. */
    setting: z.enum(["sport", "vardag"]).default("sport"),
  }),
]);

export type ScarfPhoto = { id: string; label: string; url: string };

async function decodePng(dataUrl: string, maxSide = 1400) {
  const b64 = dataUrl.split(",")[1] ?? "";
  return sharp(Buffer.from(b64, "base64"))
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** Halsdukens bild från webbläsaren, som referensbild till bildmodellen. */
const scarfReferencePng = (scarfDataUrl: string) => scarfReference(Buffer.from(scarfDataUrl.split(",")[1] ?? "", "base64"));

async function editToStoredJpg(files: { buf: Buffer; name: string }[], prompt: string, size: "1024x1024" | "1024x1536" = "1024x1024") {
  return (await saveFile(await editToJpg(files, prompt, size), "jpg")).url;
}

export async function POST(req: Request) {
  if (!hasOpenAIKey()) return Response.json({ error: "OpenAI-nyckel saknas på servern." }, { status: 503 });
  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) {
    return Response.json(
      { error: "Många skapar fotografier just nu – vänta en liten stund och försök igen." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
    );
  }
  const body = await readJson(req, 12_000_000);
  if (body === undefined) return Response.json({ error: "Bilden är för stor." }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });

  try {
    const d = parsed.data;
    const clubName = cleanText(d.club, 80) || "Klubben";
    const headline = cleanText(d.headline, 80);
    const scarfPng = await scarfReferencePng(d.scarfDataUrl);
    const textHint = headline ? ` featuring the text "${headline}"` : "";

    if (d.mode === "self") {
      const personPng = await decodePng(d.personDataUrl, 1280);
      const prompt = [
        REALISM,
        "Image 1 is a photo of a real person. Image 2 is the exact custom knitted football supporter scarf to place on them.",
        "Keep the person in Image 1 completely identical — same face, facial features, expression, hair, glasses, skin tone, lighting and background.",
        `Put the knitted supporter scarf from Image 2 (${clubName}${textHint}) on the person so its colours, end crests, stripes, fringes and design from Image 2 are clearly visible with the soft weight and gentle folds of a real knitted jacquard scarf.`,
        DRAPE,
        "If the photo is cropped at the chest, the two ends simply continue straight down out of the frame.",
      ].join("\n");
      const url = await editToStoredJpg(
        [
          { buf: personPng, name: "person.png" },
          { buf: scarfPng, name: "scarf.png" },
        ],
        prompt,
        "1024x1024",
      );
      return Response.json({ photos: [{ id: "self", label: "Du i halsduken", url }] satisfies ScarfPhoto[] });
    }

    const everyday: { id: string; label: string; scene: string }[] = [
      { id: "stad", label: "På stan", scene: "Waist-up photo, facing the camera: a smiling Scandinavian woman in her early 30s in a dark wool coat on a Swedish city street on a crisp winter afternoon with softly blurred shop windows behind her, wearing the exact knitted scarf from the reference image." },
      { id: "jobbet", label: "Utanför jobbet", scene: "Waist-up photo, facing the camera: a friendly Scandinavian man in his 40s in a dark jacket outside a small workplace entrance on a cold bright morning, wearing the exact knitted scarf from the reference image." },
      { id: "promenad", label: "På promenad", scene: "Waist-up photo, facing the camera: a joyful young adult in a neutral dark sweater and open coat on a frosty park path in golden afternoon light, wearing the exact knitted scarf from the reference image." },
      { id: "kvall", label: "I kvällsljus", scene: "Waist-up editorial portrait, facing the camera: a charismatic Scandinavian person in their 50s in a classic coat in warm evening light with string lights softly blurred behind, wearing the exact knitted scarf from the reference image." },
    ];
    const sport: { id: string; label: string; scene: string }[] = [
      {
        id: "stand",
        label: "På läktaren",
        scene:
          "Waist-up photo, facing the camera: a smiling Scandinavian woman in her late 20s in a dark wool coat standing in a football stadium stand at dusk with warm floodlights and a softly blurred crowd behind her, wearing the exact knitted supporter scarf from the reference image.",
      },
      {
        id: "arena",
        label: "Utanför arenan",
        scene:
          "Waist-up photo, facing the camera: a proud Scandinavian man in his late 30s in a dark jacket outside a modern Scandinavian football stadium on an autumn match evening, wearing the exact knitted supporter scarf from the reference image.",
      },
      {
        id: "street",
        label: "På väg till matchen",
        scene:
          "Waist-up photo, facing the camera: a joyful young adult supporter on a cobblestone city street in Gothenburg in golden afternoon light, in a neutral dark sweater, wearing the exact knitted supporter scarf from the reference image.",
      },
      {
        id: "closeup",
        label: "Porträtt i kvällsljus",
        scene:
          "Waist-up editorial portrait, facing the camera: a charismatic Scandinavian supporter in their 40s in a classic coat in warm evening light, wearing the exact knitted supporter scarf from the reference image.",
      },
    ];

    const scenes = d.setting === "vardag" ? everyday : sport;
    const settled = await Promise.allSettled(
      scenes.map(async (s) => {
        const prompt = [
          REALISM,
          `The reference image shows the exact custom knitted football scarf for ${clubName}${textHint}.`,
          s.scene,
          DRAPE,
          FAITHFUL,
        ].join("\n");
        const url = await editToStoredJpg([{ buf: scarfPng, name: "scarf.png" }], prompt, "1024x1536");
        return { id: s.id, label: s.label, url } satisfies ScarfPhoto;
      }),
    );

    const photos = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (!photos.length) throw new Error("Kunde inte skapa fotografierna just nu.");
    return Response.json({ photos, failedCount: scenes.length - photos.length });
  } catch (e) {
    console.error("scarf/photos", errorMessage(e));
    return Response.json({ error: "Kunde inte skapa fotografierna just nu." }, { status: 502 });
  }
}
