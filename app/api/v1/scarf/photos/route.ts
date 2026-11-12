import sharp from "sharp";
import { z } from "zod";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { FAITHFUL, SAME_PHOTO, SNAPSHOT, editToJpg, people, references, scarfReferences, worn } from "@/lib/scarfPhoto";
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

/** Halsdukens bild från webbläsaren, som underlag till bildmodellen: ändarna som de hänger, och hela halsduken liggande. */
const scarfRefs = async (scarfDataUrl: string) => {
  const { hanging, flat } = await scarfReferences(Buffer.from(scarfDataUrl.split(",")[1] ?? "", "base64"));
  return [
    { buf: hanging, name: "hanging-ends.png" },
    { buf: flat, name: "scarf.png" },
  ];
};

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
    const scarf = await scarfRefs(d.scarfDataUrl);

    if (d.mode === "self") {
      const personPng = await decodePng(d.personDataUrl, 1280);
      const prompt = [
        SAME_PHOTO,
        `Image 1 is a photo of a real person. ${references(clubName, 2)}`,
        "Keep the person in Image 1 completely identical — same face, facial features, expression, hair, glasses, skin tone, lighting and background.",
        "Put the knitted scarf on the person with the soft weight and gentle folds of a real knitted jacquard scarf.",
        worn(2),
        "If the photo is cropped at the chest, the two ends simply continue straight down out of the frame.",
        "Realistic knitted yarn texture. No other brand logos.",
      ].join("\n");
      const url = await editToStoredJpg([{ buf: personPng, name: "person.png" }, ...scarf], prompt, "1024x1024");
      return Response.json({ photos: [{ id: "self", label: "Du i halsduken", url }] satisfies ScarfPhoto[] });
    }

    // Vardagliga platser och vanligt ljus: fotona ska se ut som mobilbilder som någon i klubben har tagit.
    const shot = (place: string, scarf: string) => (who: string) => `Photo from the hips up, facing the camera: ${who}, ${place}. The person wears the exact knitted ${scarf} from the reference images.`;
    const everyday: { id: string; label: string; scene: (who: string) => string }[] = [
      { id: "stad", label: "På stan", scene: shot("standing on an ordinary Swedish town street on a grey winter afternoon, with shop fronts and parked bicycles behind", "scarf") },
      { id: "jobbet", label: "Utanför jobbet", scene: shot("standing outside the entrance of an ordinary Swedish workplace on a cold grey morning, with a brick wall and a car park behind", "scarf") },
      { id: "promenad", label: "På promenad", scene: shot("standing on a gravel path in a town park on an overcast day, with bare trees and a park bench behind", "scarf") },
      { id: "kvall", label: "I kvällsljus", scene: shot("standing on a pavement in the early evening under ordinary street lamps, with lit windows and a few parked cars behind", "scarf") },
    ];
    const sport: { id: string; label: string; scene: (who: string) => string }[] = [
      { id: "stand", label: "På läktaren", scene: shot("standing in the stand of a local Swedish sports arena before the match starts, with half-empty rows and a few other supporters behind", "supporter scarf") },
      { id: "arena", label: "Utanför arenan", scene: shot("standing outside the entrance of a local Swedish sports arena on a grey match day, with a bicycle rack, a parked car and other supporters behind", "supporter scarf") },
      { id: "street", label: "På väg till matchen", scene: shot("standing on the pavement of an ordinary Swedish town street on the way to the match on a grey afternoon, with parked cars and a bus stop behind", "supporter scarf") },
      { id: "closeup", label: "Porträtt i kvällsljus", scene: shot("standing outside a local Swedish sports arena in the early evening under ordinary outdoor lamps, with the lit entrance and a few supporters behind", "supporter scarf") },
    ];

    const scenes = d.setting === "vardag" ? everyday : sport;
    const who = people(scenes.length);
    const settled = await Promise.allSettled(
      scenes.map(async (s, i) => {
        const prompt = [SNAPSHOT, references(clubName), s.scene(who[i]), worn(), FAITHFUL, "Vertical picture with some space above the head; both fringed ends are inside the picture."].join("\n");
        const url = await editToStoredJpg(scarf, prompt, "1024x1536");
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
