import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { z } from "zod";
import { cleanText, readJson } from "@/lib/demoLimit";
import { htmlToPdf } from "@/lib/pdf";
import { bankScarf } from "@/lib/scarfBank";
import { CALIBRATION, knitCalibration } from "@/lib/scarfCalibration";
import { scarfClub } from "@/lib/scarfClub";
import { FilesShape, IdeaSchema, knitIdea } from "@/lib/scarfFlow";
import { scarfLimit } from "@/lib/scarfLimit";
import { knitLogoScarf } from "@/lib/scarfLogo";
import { buildPackage, type ProductionReport } from "@/lib/scarfProduction";
import type { Knitted } from "@/lib/scarfEngine";

export const maxDuration = 120;

const SLUG = /^[a-z0-9-]{1,120}$/;
const Body = z.object({
  clubId: z.string().max(120),
  idea: IdeaSchema,
  ...FilesShape,
  /** En halsduk ur demokollektionen: det ritade motivet ligger under public/halsduk/demo. */
  demo: z.string().regex(SLUG).optional(),
});
/** En halsduk ur inspirationsbanken: klubben, idén, skölden och motivet hämtas ur banken. */
const BankBody = z.object({ bank: z.string().regex(SLUG) });
/** Kalibreringshalsduken: stickas en gång och visar hur maskinen vänder filerna. */
const CalibrationBody = z.object({ calibration: z.literal(true) });
/** Halsduken från sidans 3D-vy: en garnfärg och loggan på båda ändarna. */
const HeroBody = z.object({
  hero: z.object({
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    logo: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(5_600_000),
    name: z.string().max(80).optional(),
  }),
});

const asset = (dir: "demo" | "bank", name: string) => readFile(path.join(process.cwd(), "public", "halsduk", dir, name)).catch(() => null);

type Knit = { consent: string | null; knit: Knitted; report: ProductionReport; front: string; back: string };

async function zipResponse(club: string, title: string, why: string, { consent, knit, report, front, back }: Knit, extra: { name: string; data: string }[] = []) {
  const date = new Date().toISOString().slice(0, 10);
  const pack = await buildPackage({ club, title, why, front, back, consent, knit, report, date, pdf: htmlToPdf });
  const zip = new JSZip();
  for (const f of pack.files) zip.file(f.name, f.data);
  for (const f of extra) zip.file(f.name, f.data);
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(Buffer.from(out), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="stickfiler-${pack.base}-${date}.zip"` } });
}

const fromIdea = (r: Awaited<ReturnType<typeof knitIdea>>): Knit => ({ consent: r.built.consent, knit: r.knit, report: r.report, front: r.front, back: r.back });

/** Steg 7: stickfilerna till Seger som en zip – mönstret i JPG, BMP och PNG, stickorder, garnlista och korrektur. */
export async function POST(req: Request) {
  const limited = scarfLimit(req, "pack");
  if (limited) return limited;
  const body = await readJson(req, 6_000_000);
  if (body === undefined) return Response.json({ error: "Bilden är för stor." }, { status: 413 });
  try {
    const banked = BankBody.safeParse(body);
    if (banked.success) {
      const entry = bankScarf(banked.data.bank);
      if (!entry) return Response.json({ error: "Okänd halsduk" }, { status: 404 });
      const [crest, art] = await Promise.all([asset("bank", `${entry.club.id}-skold.png`), entry.art ? asset("bank", `${entry.slug}-motiv.png`) : null]);
      return await zipResponse(entry.club.name, entry.idea.title, entry.idea.why, fromIdea(await knitIdea(entry.club, entry.idea, { crest, art })));
    }

    if (CalibrationBody.safeParse(body).success) {
      const { knit, report } = await knitCalibration();
      return await zipResponse(CALIBRATION.club, CALIBRATION.title, CALIBRATION.why, { consent: null, knit, report, front: "A / FRAMSIDA / B", back: "B / BAKSIDA / A" }, [{ name: CALIBRATION.file, data: CALIBRATION.guide }]);
    }

    const hero = HeroBody.safeParse(body);
    if (hero.success) {
      const { color, logo, name } = hero.data.hero;
      // Bilden läses om från grunden, så att bara en riktig bild av rimlig storlek når stickmotorn.
      const png = await sharp(Buffer.from(logo.split(",")[1] ?? "", "base64"), { limitInputPixels: 40_000_000 })
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer()
        .catch(() => null);
      if (!png) return Response.json({ error: "Kunde inte läsa loggan." }, { status: 400 });
      const { knit, report, turned } = await knitLogoScarf(png, color);
      const why = `En garnfärg och loggan på båda ändarna, strax innanför fransarna.${turned ? " Loggan är vriden ett kvarts varv, så att den står rätt när halsduken hänger om halsen." : " Loggan ligger längs halsduken, som text."}`;
      return await zipResponse(cleanText(name ?? "", 60) || "Egen logga", "Logga i båda ändar", why, { consent: null, knit, report, front: "ingen text", back: "ingen text" });
    }

    const parsed = Body.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Ogiltig idé" }, { status: 400 });
    const found = await scarfClub(parsed.data.clubId);
    if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
    const { idea, artFile, photoFile, signFile } = parsed.data;
    const art = parsed.data.demo ? await asset("demo", `${parsed.data.demo}-motiv.png`) : null;
    return await zipResponse(found.club.name, idea.title, idea.why, fromIdea(await knitIdea(found.club, idea, { artFile, photoFile, signFile, art, crest: found.crest })));
  } catch (err) {
    console.error("scarf/agent/package", err instanceof Error ? err.message : err);
    return Response.json({ error: "Kunde inte skapa stickfilerna." }, { status: 500 });
  }
}
