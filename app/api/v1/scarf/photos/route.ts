import sharp from "sharp";
import { z } from "zod";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { scarfClub, sportOf } from "@/lib/scarfClub";
import { FAITHFUL, SAME_PHOTO, SNAPSHOT, UPRIGHT, editToJpg, references, scarfReferences, shoot, worn } from "@/lib/scarfPhoto";
import { outdoors, people, settingOf, type Season } from "@/lib/scarfScene";
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
    /** Klubben i flödet, om fotot hör till en. Då tas bilderna på sportens egen plats – ishallen, idrottshallen eller planen. */
    clubId: z.string().max(120).optional(),
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
  const facts = await scarfReferences(Buffer.from(scarfDataUrl.split(",")[1] ?? "", "base64"));
  return {
    facts,
    files: [
      { buf: facts.hanging, name: "hanging-ends.png" },
      { buf: facts.flat, name: "scarf.png" },
    ],
  };
};

type Scene = { id: string; label: string; where: string; wear: Season | "hall" };

/** Fyra vardagliga platser och vanligt ljus: fotona ska se ut som mobilbilder som någon i klubben har tagit. */
function scenes(setting: "sport" | "vardag", sport: string | null): Scene[] {
  const town = settingOf({ everyday: true });
  if (setting === "vardag") {
    return [
      { id: "stad", label: "På stan", ...town.at("entrance") },
      { id: "jobbet", label: "Utanför jobbet", ...town.at("stand") },
      { id: "promenad", label: "På promenad", where: `standing on a gravel path in a town park, with trees and a park bench behind. ${outdoors(town.season)}`, wear: town.season },
      { id: "kvall", label: "I kvällsljus", ...town.at("entrance", true) },
    ];
  }
  const home = settingOf({ sport });
  const street = town.at("entrance");
  return [
    { id: "stand", label: "På läktaren", ...home.at("stand") },
    { id: "arena", label: "Utanför arenan", ...home.at("entrance") },
    { id: "street", label: "På väg till matchen", where: `on the way to the match, ${street.where}`, wear: street.wear },
    { id: "closeup", label: "Porträtt i kvällsljus", ...home.at("entrance", true) },
  ];
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
    const { facts, files: scarf } = await scarfRefs(d.scarfDataUrl);

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
      const url = (await saveFile(await editToJpg([{ buf: personPng, name: "person.png" }, ...scarf], prompt, "1024x1024"), "jpg")).url;
      return Response.json({ photos: [{ id: "self", label: "Du i halsduken", url }] satisfies ScarfPhoto[] });
    }

    const found = d.clubId ? await scarfClub(d.clubId).catch(() => null) : null;
    const list = scenes(d.setting, found ? sportOf(found) : null);
    const who = people(list.map((s) => s.wear));
    const what = d.setting === "vardag" ? "scarf" : "supporter scarf";
    // Varje foto granskas mot mönstret och tas om en gång om något avviker.
    const settled = await Promise.allSettled(
      list.map(async (s, i) => {
        const prompt = [SNAPSHOT, references(clubName), `Photo from the hips up, facing the camera: ${who[i]}, ${s.where} The person wears the exact knitted ${what} from the reference images.`, worn(), FAITHFUL, UPRIGHT].join("\n");
        const url = (await saveFile(await shoot("worn", scarf, prompt, "1024x1536", facts), "jpg")).url;
        return { id: s.id, label: s.label, url } satisfies ScarfPhoto;
      }),
    );

    const photos = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (!photos.length) throw new Error("Kunde inte skapa fotografierna just nu.");
    return Response.json({ photos, failedCount: list.length - photos.length });
  } catch (e) {
    console.error("scarf/photos", errorMessage(e));
    return Response.json({ error: "Kunde inte skapa fotografierna just nu." }, { status: 502 });
  }
}
