import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { FONT_KEYS, ICONS, type FontKey, type IconId } from "./scarfDesign";
import { facePreview, knitDesign, sheetPreview, type Knitted } from "./scarfEngine";
import { inspect, type ProductionReport } from "./scarfProduction";
import { RECIPE_IDS, buildDesign, type Built, type RecipeId, type ScarfClub, type ScarfIdea } from "./scarfRecipes";
import { loadFile } from "./store";
import type { Club } from "./types";

/** Gemensamt för flödets API-rutter och demokörningen: från idé till stickad halsduk med kontroll och korrektur. */

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const line = (max: number) => z.string().max(max);

export const IdeaSchema = z.object({
  id: z.string().max(60),
  title: z.string().min(1).max(60),
  why: z.string().max(400),
  signal: z.string().max(160),
  recipe: z.enum(RECIPE_IDS as [RecipeId, ...RecipeId[]]),
  front: z.object({ main: line(24), sub: line(40) }),
  back: z.object({ main: line(24), sub: line(40) }),
  font: z.enum(FONT_KEYS as [FontKey, ...FontKey[]]),
  colors: z.object({ ground: hex, ink: hex, accent: hex }),
  icon: z.enum(Object.keys(ICONS) as [IconId, ...IconId[]]).nullable(),
  art: z.string().max(500).nullable(),
  number: z.string().max(2),
  roster: z.array(z.string().max(24)).max(18),
});

export const ART_FILE = /^[0-9a-f-]{36}\.png$/;

const read = (file: string) => readFile(file).catch(() => null);

/** Skölden i färg: klubbens egen uppladdade om den finns, annars den som följer med. */
export async function clubCrest(club: Club) {
  const file = club.brand.crest.farg;
  return (await read(path.join(process.cwd(), ".data", "brand", club.id, "kit", file))) ?? (await read(path.join(process.cwd(), "brand-kits", club.id, file)));
}

const samplePortrait = () => read(path.join(process.cwd(), "public", "demo", "portrait.jpg"));

export type KnitResult = { built: Built; knit: Knitted; report: ProductionReport; front: string; back: string };

/** `crest` är sköldens bild; anges den inte läses klubbens egen från profilen. */
export async function knitIdea(club: ScarfClub | Club, idea: ScarfIdea, opts: { artFile?: string | null; art?: Buffer | null; crest?: Buffer | null } = {}): Promise<KnitResult> {
  const [crest, portrait] = await Promise.all([opts.crest !== undefined ? opts.crest : "brand" in club ? clubCrest(club) : null, idea.recipe === "portratt" ? samplePortrait() : null]);
  const art = opts.art ?? (opts.artFile && ART_FILE.test(opts.artFile) ? ((await loadFile(opts.artFile))?.data ?? null) : null);
  const built = buildDesign(club, idea, { crest: Boolean(crest), portrait: Boolean(portrait), art: Boolean(art) });
  let knit = await knitDesign(built.design, { crest, portrait, art });
  let report = inspect(knit);
  // För många ensamma maskor – oftast ett märke med tunna linjer. Då städas mönstret och kontrolleras igen.
  if (report.checks.some((c) => c.id === "loose" && c.level === "varning")) {
    const cleaned = await knitDesign(built.design, { crest, portrait, art }, { clean: true });
    const again = inspect(cleaned);
    if (again.checks.every((c) => c.id !== "loose" || c.level === "ok")) [knit, report] = [cleaned, again];
  }
  const text = (side: { main: string; sub: string }) => [side.main, side.sub].filter(Boolean).join(" / ") || "ingen text";
  return { built, knit, report, front: idea.recipe === "bar" ? "ingen text" : text(idea.front), back: text(idea.back) };
}

const jpgUrl = async (png: Buffer) => `data:image/jpeg;base64,${(await sharp(png).flatten({ background: "#F5F5F7" }).jpeg({ quality: 86 }).toBuffer()).toString("base64")}`;

/** Fram- och baksida som bilder till gränssnittet. */
export async function previews(knit: Knitted, width = 1800) {
  const [front, back] = await Promise.all(knit.faces.map((f) => facePreview(f, knit.palette, width).then(jpgUrl)));
  return { front, back };
}

export const proof = (knit: Knitted) => sheetPreview(knit, 2000);
