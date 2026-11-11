import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { htmlToPdf } from "@/lib/pdf";
import { bankScarf } from "@/lib/scarfBank";
import { ART_FILE, IdeaSchema, knitIdea } from "@/lib/scarfFlow";
import { buildPackage } from "@/lib/scarfProduction";

export const maxDuration = 120;

const SLUG = /^[a-z0-9-]{1,120}$/;
const Body = z.object({
  clubId: z.string(),
  idea: IdeaSchema,
  artFile: z.string().regex(ART_FILE).nullable().optional(),
  /** En halsduk ur demokollektionen: det ritade motivet ligger under public/halsduk/demo. */
  demo: z.string().regex(SLUG).optional(),
});
/** En halsduk ur inspirationsbanken: klubben, idén, skölden och motivet hämtas ur banken. */
const BankBody = z.object({ bank: z.string().regex(SLUG) });

const asset = (dir: "demo" | "bank", name: string) => readFile(path.join(process.cwd(), "public", "halsduk", dir, name)).catch(() => null);

async function zipResponse(club: string, title: string, why: string, result: Awaited<ReturnType<typeof knitIdea>>) {
  const { built, knit, report, front, back } = result;
  const date = new Date().toISOString().slice(0, 10);
  const pack = await buildPackage({ club, title, why, front, back, consent: built.consent, knit, report, date, pdf: htmlToPdf });
  const zip = new JSZip();
  for (const f of pack.files) zip.file(f.name, f.data);
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(Buffer.from(out), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="stickfiler-${pack.base}-${date}.zip"` } });
}

/** Steg 7: stickfilerna till Seger som en zip – mönstret i JPG, BMP och PNG, stickorder, garnlista och korrektur. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    const banked = BankBody.safeParse(body);
    if (banked.success) {
      const entry = bankScarf(banked.data.bank);
      if (!entry) return Response.json({ error: "Okänd halsduk" }, { status: 404 });
      const [crest, art] = await Promise.all([asset("bank", `${entry.club.id}-skold.png`), entry.art ? asset("bank", `${entry.slug}-motiv.png`) : null]);
      return await zipResponse(entry.club.name, entry.idea.title, entry.idea.why, await knitIdea(entry.club, entry.idea, { crest, art }));
    }
    const parsed = Body.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Ogiltig idé" }, { status: 400 });
    const club = CLUBS[parsed.data.clubId];
    if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
    const { idea } = parsed.data;
    const art = parsed.data.demo ? await asset("demo", `${parsed.data.demo}-motiv.png`) : null;
    return await zipResponse(club.name, idea.title, idea.why, await knitIdea(club, idea, { artFile: parsed.data.artFile, art }));
  } catch (err) {
    console.error("scarf/agent/package", err instanceof Error ? err.message : err);
    return Response.json({ error: "Kunde inte skapa stickfilerna." }, { status: 500 });
  }
}
