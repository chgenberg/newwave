import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { htmlToPdf } from "@/lib/pdf";
import { ART_FILE, IdeaSchema, knitIdea } from "@/lib/scarfFlow";
import { buildPackage } from "@/lib/scarfProduction";

export const maxDuration = 120;

const Body = z.object({
  clubId: z.string(),
  idea: IdeaSchema,
  artFile: z.string().regex(ART_FILE).nullable().optional(),
  /** En halsduk ur demokollektionen: det ritade motivet ligger under public/halsduk/demo. */
  demo: z.string().regex(/^[a-z0-9-]{1,120}$/).optional(),
});

/** Steg 7: stickfilerna till Seger som en zip – mönstret i JPG, BMP och PNG, stickorder, garnlista och korrektur. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig idé" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { idea } = parsed.data;
  try {
    const art = parsed.data.demo ? await readFile(path.join(process.cwd(), "public", "halsduk", "demo", `${parsed.data.demo}-motiv.png`)).catch(() => null) : null;
    const { built, knit, report, front, back } = await knitIdea(club, idea, { artFile: parsed.data.artFile, art });
    const date = new Date().toISOString().slice(0, 10);
    const pack = await buildPackage({ club: club.name, title: idea.title, why: idea.why, front, back, consent: built.consent, knit, report, date, pdf: htmlToPdf });
    const zip = new JSZip();
    for (const f of pack.files) zip.file(f.name, f.data);
    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Response(Buffer.from(out), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="stickfiler-${pack.base}-${date}.zip"` } });
  } catch (err) {
    console.error("scarf/agent/package", err instanceof Error ? err.message : err);
    return Response.json({ error: "Kunde inte skapa stickfilerna." }, { status: 500 });
  }
}
