import sharp from "sharp";
import { z } from "zod";
import { cleanText, readJson } from "@/lib/demoLimit";
import { pickView, saveOwnClub, scarfClub } from "@/lib/scarfClub";
import { scarfLimit } from "@/lib/scarfLimit";

export const maxDuration = 60;

/** Den valda klubben som sidan behöver den: namn, märke, färger och laddningsrutans rader. */
export async function GET(req: Request) {
  const found = await scarfClub(new URL(req.url).searchParams.get("ref") ?? "");
  if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  return Response.json(pickView(found), { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["klubb", "foretag"]),
  /** Sporten, eller vad företaget gör. */
  what: z.string().max(60).optional(),
  city: z.string().max(60).optional(),
  logo: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(5_600_000),
});

/** En egen logga blir en klubb som flödet kan köras för: färgerna läses ur loggan, namnet står på halsdukarna. */
export async function POST(req: Request) {
  const limited = scarfLimit(req, "upload");
  if (limited) return limited;
  const body = await readJson(req, 6_000_000);
  if (body === undefined) return Response.json({ error: "Bilden är för stor – välj en under 4 MB." }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Fyll i namnet och välj en bild i PNG, JPG eller WebP." }, { status: 400 });
  const name = cleanText(parsed.data.name, 60);
  if (!name) return Response.json({ error: "Fyll i namnet." }, { status: 400 });
  // Bilden läses om från grunden, så att bara en riktig bild av rimlig storlek sparas.
  const logo = await sharp(Buffer.from(parsed.data.logo.split(",")[1] ?? "", "base64"), { limitInputPixels: 40_000_000 })
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
    .catch(() => null);
  if (!logo) return Response.json({ error: "Kunde inte läsa bilden – prova PNG eller JPG." }, { status: 400 });
  const ref = await saveOwnClub({ name, group: parsed.data.kind === "foretag" ? "annat" : "idrott", category: cleanText(parsed.data.what ?? "", 40), city: cleanText(parsed.data.city ?? "", 40), logo });
  const found = await scarfClub(ref);
  if (!found) return Response.json({ error: "Kunde inte spara loggan." }, { status: 500 });
  return Response.json(pickView(found));
}
