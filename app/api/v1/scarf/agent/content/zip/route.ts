import { z } from "zod";
import { htmlToPdf } from "@/lib/pdf";
import { CopySchema, cleanLink } from "@/lib/scarfChannels";
import { scarfClub } from "@/lib/scarfClub";
import { materialZip } from "@/lib/scarfContent";
import { FilesShape, IdeaSchema } from "@/lib/scarfFlow";
import { scarfLimit } from "@/lib/scarfLimit";

export const maxDuration = 180;

/** Adressen till en fil som flödet har skapat. Bara filens namn används, så att inget annat än flödets egna filer kan hämtas. */
const made = (ext: string) => z.string().regex(new RegExp(`^/api/v1/files/[0-9a-f-]{36}\\.${ext}$`)).transform((url) => url.slice("/api/v1/files/".length));
const film = z.object({ url: made("mp4"), poster: made("jpg") }).nullable();

const Body = z.object({
  clubId: z.string().max(120),
  idea: IdeaSchema,
  ...FilesShape,
  copy: CopySchema,
  material: z.object({
    // Händelsebilden och affischen saknas i material som sparades innan de fanns.
    images: z.object({ instagram: made("jpg"), facebook: made("jpg"), linkedin: made("jpg"), banner: made("jpg"), story: made("jpg").optional(), poster: made("jpg").optional() }),
    films: z.object({ reels: film, tiktok: film }),
    photos: z.array(made("jpg")).max(2),
    link: z.string().max(400).nullish(),
  }),
});

/** Allt material för det valda motivet i en zip: bilderna, filmerna, texterna och stickfilerna. */
export async function POST(req: Request) {
  const limited = scarfLimit(req, "pack");
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, idea, artFile, photoFile, signFile, copy, material } = parsed.data;
  const found = await scarfClub(clubId);
  if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  try {
    const films = { reels: material.films.reels && { file: material.films.reels.url, poster: material.films.reels.poster }, tiktok: material.films.tiktok && { file: material.films.tiktok.url, poster: material.films.tiktok.poster } };
    const zip = await materialZip({ found, idea, files: { artFile, photoFile, signFile }, copy, material: { images: material.images, films, photos: material.photos, link: cleanLink(material.link) }, pdf: htmlToPdf });
    return new Response(Buffer.from(zip.data), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${zip.name}"` } });
  } catch (err) {
    console.error("scarf/agent/content/zip", err instanceof Error ? err.message : err);
    return Response.json({ error: "Kunde inte packa materialet." }, { status: 500 });
  }
}
