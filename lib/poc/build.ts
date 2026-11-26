import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { readAsset } from "@/lib/newwave/asset";
import { isSoft, type NwProduct, printOf } from "@/lib/newwave/catalog";
import { registryAsset } from "@/lib/newwave/clubAssets";
import { type ClubItem, CLUBS_DIR, queryClubs } from "@/lib/newwave/clubRegistry";
import { wordmarkSpec } from "@/lib/newwave/clubShop";
import { colorName } from "@/lib/newwave/colors";
import { fitPlacement, METHOD_INFO, type Method, zoneLabel } from "@/lib/newwave/marking";
import { fileSlug, isDarkHex, type MadeJob, makeJob } from "@/lib/newwave/printFiles";
import { MOCKUP_VERSION, printFit, printOnPhoto } from "@/lib/newwave/printSurface";
import { htmlToPdf } from "@/lib/pdf";
import { type FontRole, FONTS, fontFor } from "@/lib/newwave/wordmark/fonts";
import { wordmarkJob } from "@/lib/newwave/wordmark/printJob";
import { paletteFor, renderWordmark, textFill, textsFor, type WordmarkClub, wordmarkPng } from "@/lib/newwave/wordmark/render";
import type { Template, TextLayerT, TextSlot } from "@/lib/newwave/wordmark/schema";
import { SMALL_PRINT_CM, type WordmarkSpec, type WordmarkVariant, wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { findTemplate, wordmarkClub } from "@/lib/newwave/wordmark/store";
import { smallFor } from "@/lib/newwave/wordmark/templates";
import { deltaE, hexToRgb, rgbToHex, ROW_H_MM, SCARF, SCARF_TEXT, STITCH_W_MM } from "@/lib/scarf";
import { scarfClub } from "@/lib/scarfClub";
import { MAX_TEXT, MAX_VARIANTS, TEXT_SOURCES, usable, type VariantChoice, variantKey, variantLabel, type VariantTexts, variantTexts } from "@/components/poc/craft/variants";
import { EDGE_MM, END_MM, type Fill, FONT_FILES, type FontKey, L_MM, mirrored, type ScarfDesign, type Section, type Stripe } from "@/lib/scarfDesign";
import { facePreview, knitDesign } from "@/lib/scarfEngine";
import { knitIdea, type KnitResult } from "@/lib/scarfFlow";
import { buildPackage, FAST_COLORS, inspect } from "@/lib/scarfProduction";
import type { ScarfIdea } from "@/lib/scarfRecipes";
import type { Club } from "@/lib/types";
import { baseById, baseProduct, catalogProduct, isPocBase, pocDesign } from "./catalog";
import { type ClubProductDraft, getDesign } from "./store";
import type { CatalogProduct, ClubProduct, Design, OrderLine, ProductionJob } from "./types";

/**
 * Från Crafts design till klubbarnas egna produkter, och från en order till producenternas filer.
 *
 * `clubProductDrafts` gör en design till varje vald klubbs egen: titel, pris, mockup och en `spec` med allt som
 * behövs för att bygga produktionsfilerna senare. `jobFiles` bygger filerna ur `spec` med samma kod som i dag:
 * tryckfilerna med lib/newwave/printFiles.ts och stickfilen med lib/scarfProduction.ts. Inga modellanrop – samma
 * indata ger samma filer.
 *
 * Halsduken följer designen: en ordmall stickas med klubbens namn i mallens typografi och uppställning, en uppladdad
 * fil blir halsdukens motiv. Plaggets färg väljs per klubb efter kontrasten mot trycket, eller av Craft.
 *
 * Ordmallens texter kan bytas per klubb i varianter (components/poc/craft/variants.ts): huvudraden och underraden
 * får t.ex. kortnamnet och orten, "AIK" + "SOLNA". Varje variant blir en egen produkt, och plagget, halsduken och
 * tryckfilerna ritas med variantens texter.
 */

// ── Klubbarna ───────────────────────────────────────────────────────────────

/** En klubb som designen görs för: ur klubbregistret, annars ur Crafts egna klubbar. */
export type PocClub = { id: string; name: string; colors: string[]; logo: string; county: string; municipality: string; sport: string; founded?: number; registry: boolean };

const HEX = /^#[0-9A-F]{6}$/;
const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const sameHex = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Klubbens färger, utan dubbletter, och alltid minst två: en ensam färg får vitt eller svart bredvid sig. */
export function clubColors(raw: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const h of raw ?? []) {
    const hex = h.toUpperCase();
    if (HEX.test(hex) && !out.some((o) => deltaE(o, hex) < 6)) out.push(hex);
  }
  if (!out.length) out.push("#111111");
  if (out.length < 2) out.push(isDarkHex(out[0]) ? "#FFFFFF" : "#111111");
  return out.slice(0, 5);
}

let registryCache: { at: number; byId: Promise<Map<string, ClubItem>> } | null = null;

/** Klubbregistret som en tabell på id; läses om högst en gång i minuten, och samtidiga anrop delar på läsningen. */
function registry(): Promise<Map<string, ClubItem>> {
  if (registryCache && Date.now() - registryCache.at < 60_000) return registryCache.byId;
  const byId = queryClubs({ q: "", county: "", sport: "", sort: "name", offset: 0, limit: 100_000 }).then((res) => new Map((res?.items ?? []).map((c) => [c.id, c])));
  registryCache = { at: Date.now(), byId };
  byId.catch(() => {
    if (registryCache?.byId === byId) registryCache = null;
  });
  return byId;
}

/** En klubb i Crafts klubbval: id, namn, län, kommun, sport, färgerna med komma emellan, märkets version och grundandeåret. */
export type RegistryRow = [id: string, name: string, county: string, municipality: string, sport: string, colors: string, v: string, founded: string];

/** Hela registret i kort form, för Crafts klubbval. Märket hämtas från `/api/v1/newwave/registry/<id>/logo.png?v=<v>`. */
export async function registryClubs(): Promise<RegistryRow[]> {
  return [...(await registry()).values()].map((c) => [c.id, c.name, c.county, c.municipality, c.sport, clubColors(c.colors).join(","), (Date.parse(c.at ?? "") || 0).toString(36), Number(c.founded) ? String(Number(c.founded)) : ""]);
}

export async function pocClub(id: string): Promise<PocClub | null> {
  const r = (await registry()).get(id);
  if (r) return { id, name: r.name, colors: clubColors(r.colors), logo: registryAsset(id, r.at, "logo.png"), county: r.county, municipality: r.municipality, sport: r.sport, founded: Number(r.founded) || undefined, registry: true };
  const w = await wordmarkClub(id).catch(() => null);
  if (!w?.logo) return null;
  return { id, name: w.name, colors: clubColors(w.colors), logo: w.logo, county: "", municipality: CLUBS[id]?.city ?? "", sport: w.sports?.[0] ?? "", founded: w.founded, registry: false };
}

/** Klubben som ordmallarna ritas med: namndelningen och färgerna klubben själv godkänt, annars registrets. */
async function wordmarkClubOf(club: Pick<PocClub, "id" | "name" | "colors" | "logo"> & Partial<Pick<PocClub, "founded" | "sport">>): Promise<WordmarkClub> {
  return (await wordmarkClub(club.id).catch(() => null)) ?? { id: club.id, name: club.name, colors: club.colors, logo: club.logo, founded: club.founded, sports: club.sport ? [club.sport] : [] };
}

/** Klubbmärket som bild: det högupplösta om det finns, annars registrets eller klubbens eget. */
async function crestFile(club: Pick<PocClub, "id" | "logo">) {
  for (const dir of ["logos-hd", "logos"]) {
    const f = await readFile(path.join(CLUBS_DIR, dir, `${club.id}.png`)).catch(() => null);
    if (f) return f;
  }
  return readAsset(club.logo);
}

// ── Specifikationen ─────────────────────────────────────────────────────────

type SpecClub = { id: string; name: string; colors: string[]; logo: string };
type SpecDesign = { id: string; name: string };
/** Ordmallens texter för klubben i den här produkten, och variantens nyckel (samma som klubbproduktens `variant`). */
export type SpecVariant = VariantTexts & { key: string };

/** Plaggets färg: vald av Craft, eller vald automatiskt efter kontrasten mot trycket. */
export type GarmentColor = { hex: string; name: string; how: "auto" | "vald" };

/** Det som behövs för att trycka plagget: klubben, plagget, tryckets placering och designen. */
export type GarmentSpec = {
  v: 1;
  kind: "plagg";
  club: SpecClub;
  /** `garment` är plaggets färg, den som trycket görs för. */
  product: { sku: string; baseId: string; name: string; garment: string };
  /** Hur färgen valdes. Saknas i produkter publicerade innan färgen gick att välja. */
  color?: GarmentColor;
  print: { method: Method; zone: string; sizeCm: number };
  design: (SpecDesign & { type: "ordmall"; wordmark: WordmarkSpec; variant?: SpecVariant }) | (SpecDesign & { type: "fil" });
};

/** Halsdukens mönster när det följer designen: ordmallen (utan texter som blir för små för maskorna), eller filen som motiv. */
export type ScarfPattern = { type: "ordmall"; template: string; drop?: TextSlot[] } | { type: "fil" };

/** Det som behövs för att sticka halsduken: mönstret, texterna och klubbens garner. */
export type ScarfSpec = {
  v: 1;
  kind: "halsduk";
  club: SpecClub;
  /** Klubben som stickmotorn slår upp den (märket och dess färger): `reg:<id>` för registrets klubbar. */
  knitRef: string;
  yarns: string[];
  /** Det klassiska receptet: hela halsduken utan `pattern`, annars baksidans texter, typsnitt och garner. */
  idea: ScarfIdea;
  design: SpecDesign;
  /** Saknas: klassisk klubbhalsduk. */
  pattern?: ScarfPattern;
  /** Varför halsduken inte bär designen, när den fått det klassiska receptet med designens texter i stället. */
  note?: string;
  /** Ordmallens texter i varianten; saknas för mallens egna. */
  variant?: SpecVariant;
};

export type ProductSpec = GarmentSpec | ScarfSpec;

/** Produktens namn efter klubbens: "Storvreta IBK T-shirt". */
const shortName = (p: CatalogProduct) => (p.kind === "halsduk" ? "Halsduk" : p.name.replace(/^Craft\s+/, ""));

/** Texten på halsduken: hela ord som ryms, i versaler. */
function fit(text: string, max: number) {
  const up = text.replace(/\s+/g, " ").trim().toLocaleUpperCase("sv-SE");
  if (up.length <= max) return up;
  let out = "";
  for (const w of up.split(" ")) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return out || up.slice(0, max);
}

/** Skillnad i ljushet, 0–255: gult mot vitt skiljer sig i färg men syns knappt i stickningen eller trycket. */
const contrast = (a: string, b: string) => Math.abs(lum(a) - lum(b));

type ScarfTexts = { main?: string; sub?: string; font?: FontKey; why?: string };

/** Klassisk klubbhalsduk i klubbens garner: ränder i ändarna, märket innanför och klubbens namn (eller `texts`) i mitten. */
export function scarfIdea(club: PocClub, texts: ScarfTexts = {}): ScarfIdea {
  const yarns = clubColors(club.colors);
  const ground = yarns[0];
  const ink = [...yarns.slice(1), "#FFFFFF", "#0A0A0A"].find((h) => contrast(h, ground) >= 70) ?? "#FFFFFF";
  const accent = yarns.find((h) => h !== ground && h !== ink) ?? ink;
  const where = [club.sport, club.municipality].filter(Boolean).join(" · ");
  return {
    id: `klubbhalsduk-${club.id}`.slice(0, 60),
    title: "Klubbhalsduk",
    why: texts.why ?? "Klassisk klubbhalsduk i klubbens garner, med klubbens märke i båda ändar.",
    signal: "",
    recipe: "klassisk",
    front: { main: fit(texts.main ?? club.name, SCARF_TEXT.main), sub: fit(texts.sub ?? where, SCARF_TEXT.sub) },
    back: { main: fit(club.name, SCARF_TEXT.main), sub: club.founded ? `SEDAN ${club.founded}` : "" },
    font: texts.font ?? "anton",
    colors: { ground, ink, accent },
    icon: null,
    art: null,
    number: "",
    roster: [],
  };
}

/** Crafts uppladdade fil som motiv mitt på halsduken, med klubbens namn på ena sidan och året (eller sporten) på den andra. */
function motifIdea(club: PocClub): ScarfIdea {
  const classic = scarfIdea(club);
  const side = club.founded ? `SEDAN ${club.founded}` : fit(club.sport || club.municipality, 12);
  return {
    ...classic,
    why: "Crafts design som motiv mitt på halsduken, i klubbens garner, med klubbens namn och märke.",
    recipe: "motiv",
    front: { main: fit(club.name, SCARF_TEXT.main), sub: side },
    art: "Crafts uppladdade design",
  };
}

// ── Varianterna ─────────────────────────────────────────────────────────────

const MAIN_SLOTS: ReadonlySet<TextSlot> = new Set(["name", "name1", "name2", "monogram"]);
const SUB_SLOTS: ReadonlySet<TextSlot> = new Set(["name", "name1", "name2", "monogram", "tagline", "sport"]);

/**
 * Mallens huvudrad och underrad: huvudraden är den största texten med klubbens namn (oftast Namn 2, den stora
 * skrivstilen), underraden den största av de andra namn- och slagordstexterna (Namn 1, "Sedan 1904", sporten).
 * Årtal, jubileum och ryggens namn och nummer behåller mallens texter.
 */
export function variantSlots(t: Pick<Template, "layers">): { main?: TextSlot; sub?: TextSlot } {
  const texts = t.layers.filter((l): l is TextLayerT => l.kind === "text");
  const biggest = (list: TextLayerT[]) => [...list].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
  const main = biggest(texts.filter((l) => MAIN_SLOTS.has(l.slot))) ?? biggest(texts);
  const sub = biggest(texts.filter((l) => l.slot !== main?.slot && SUB_SLOTS.has(l.slot)));
  return { main: main?.slot, sub: sub?.slot };
}

/** Variantens texter i mallens textfält, till `renderWordmark`; undefined för mallens egna. */
export function slotTexts(t: Pick<Template, "layers">, v?: VariantTexts): Partial<Record<TextSlot, string>> | undefined {
  if (!v?.main && !v?.sub) return undefined;
  const slots = variantSlots(t);
  const out: Partial<Record<TextSlot, string>> = {};
  if (slots.main && v.main) out[slots.main] = v.main;
  if (slots.sub && v.sub) out[slots.sub] = v.sub;
  return Object.keys(out).length ? out : undefined;
}

/** Det ur klubben som variantens texter hämtas från. */
const factsOf = (club: PocClub) => ({ name: club.name, municipality: club.municipality, sport: club.sport, founded: club.founded });

/** Varianten som den sparas i specifikationen; undefined för mallens egna texter. */
const specVariant = (t: VariantTexts): SpecVariant | undefined => {
  const key = variantKey(t);
  return key ? { key, ...t } : undefined;
};

const TextChoiceSchema = z.object({ from: z.enum(TEXT_SOURCES), text: z.string().max(MAX_TEXT * 2).optional() });
export const VariantChoiceSchema = z.object({ main: TextChoiceSchema, sub: TextChoiceSchema });
/** Varianterna per klubb (klubbens id → en eller flera varianter). Saknas en klubb får den mallens egna texter. */
export const VariantChoices = z.record(z.string().regex(/^[a-z0-9-]{1,80}$/), z.array(VariantChoiceSchema).min(1).max(MAX_VARIANTS));

/** Texterna i en mockups eller halsduks adress (`m` och `u`), rensade som ordmallarnas namn. */
export function variantFromQuery(q: URLSearchParams): VariantTexts | undefined {
  const clean = (v: string | null) => v?.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) || undefined;
  const [main, sub] = [clean(q.get("m")), clean(q.get("u"))];
  return main || sub ? { ...(main ? { main } : {}), ...(sub ? { sub } : {}) } : undefined;
}

const variantQuery = (v?: VariantTexts) => `${v?.main ? `&m=${encodeURIComponent(v.main)}` : ""}${v?.sub ? `&u=${encodeURIComponent(v.sub)}` : ""}`;

// ── Ordmallen på halsduken ──────────────────────────────────────────────────

/** Ändränderna och märkena på ordmallens halsduk, i mm; ordmallen får längden däremellan. */
const END_BARS_MM = 72;
const CREST_MM = 170;
/** Luften runt ordmallen [längs, tvärs]; tvärs aldrig mindre än den fria kanten mot vikningen. */
const ART_PAD: [number, number] = [14, 16];
/** Texter i ordmallen: minst så här höga i maskor, med streck minst så här breda, och så stor del av formen kvar i maskorna. */
const LEGIBLE = { heightSt: 7, strokeSt: 1.8, score: 0.78 };
/** Klubbens namn ska bli minst tio maskor högt, som all annan text på halsduken (MIN_TEXT_MM). */
const NAME_ST = 10;
const NAME_SLOTS: ReadonlySet<TextSlot> = new Set(["name", "name1", "name2", "monogram"]);

/** Rutan som ordmallen passas in i på framsidan, i mm: mellan ändränderna och märkena. */
function artBox() {
  const middle = L_MM - END_MM * 2 - 2 * (END_BARS_MM + CREST_MM);
  return { w: middle - ART_PAD[0] * 2, h: SCARF.widthMm - Math.max(ART_PAD[1], EDGE_MM) * 2 };
}

const SCARF_FONT_BY_FILE = new Map<string, FontKey>(Object.entries(FONT_FILES).map(([key, file]) => [file, key as FontKey]));
const ROLE_SCARF_FONT: Record<FontRole, FontKey> = { caps: "slab", script: "pensel", slab: "slab", varsity: "varsity", condensed: "anton", block: "block", serif: "slab", sport: "fart", gothic: "gotisk" };

/** Halsdukens typsnitt för ett av ordmallens: samma fil om halsduken har den, annars ett i samma stil som går att sticka. */
function scarfFont(ref: string): FontKey {
  const font = FONTS[fontFor(ref)];
  return SCARF_FONT_BY_FILE.get(font.file) ?? ROLE_SCARF_FONT[font.role];
}

/** Ett SVG i maskornas upplösning (SS provpunkter per maska åt båda hållen, som stickmotorn), som bläck eller inte. */
const SS = 4;
async function inkMask(svg: string, w: number, h: number) {
  const sized = svg.replace(/ width="[^"]+" height="[^"]+">/, ` width="${w}" height="${h}" preserveAspectRatio="none">`);
  const { data } = await sharp(Buffer.from(sized), { limitInputPixels: 80_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return ink;
}

function inkBox(ink: Uint8Array, w: number, h: number) {
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (ink[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Hur en text blir i maskorna: höjden i maskor, streckens bredd tvärs över i maskor (2 × yta / omkrets) och hur stor
 * del av formen som är kvar när varje maska får den färg som flest av dess provpunkter har.
 */
function knitShape(ink: Uint8Array, w: number, h: number) {
  const b = inkBox(ink, w, h);
  if (!b) return null;
  const bw = Math.ceil(w / SS);
  const cell = new Uint8Array(bw * Math.ceil(h / SS));
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (ink[y * w + x]) cell[Math.floor(y / SS) * bw + Math.floor(x / SS)]++;
  let [union, wrong, area, edge] = [0, 0, 0, 0];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const a = ink[y * w + x];
      const k = cell[Math.floor(y / SS) * bw + Math.floor(x / SS)] * 2 >= SS * SS ? 1 : 0;
      if (a || k) union++;
      if (a !== k) wrong++;
      if (!a) continue;
      area++;
      if (!ink[y * w + x - 1] || !ink[y * w + x + 1] || !ink[(y - 1) * w + x] || !ink[(y + 1) * w + x]) edge++;
    }
  return { heightSt: (b.y1 - b.y0 + 1) / SS, strokeSt: (2 * area) / (edge || 1) / SS, score: 1 - wrong / (union || 1) };
}

type Shape = NonNullable<ReturnType<typeof knitShape>>;
const legible = (m: Shape) => m.heightSt >= LEGIBLE.heightSt && m.strokeSt >= LEGIBLE.strokeSt && m.score >= LEGIBLE.score;
const nf1 = (n: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(n);
const stitches = (n: number) => `${nf1(n)} ${nf1(n) === "1" ? "maska" : "maskor"}`;

/** Ordmallen på halsduken går att sticka (och vilka småtexter som tas bort), eller varför inte – med texterna att sticka i stället. */
export type ScarfPlan = { ok: true; template: string; drop: TextSlot[]; font: FontKey } | { ok: false; reason: string; texts: ScarfTexts };

const plans = new Map<string, Promise<ScarfPlan>>();

/**
 * Går ordmallen att sticka läsbart på halsduken? Varje text i mallen ritas för sig i den storlek den får på halsduken
 * (120 maskor bred, ordmallen mellan ändränderna) och provas mot maskorna. Klubbens namn måste hålla; småtexter som
 * årtal och sport tas bort om de blir för små. Annars klassisk halsduk med mallens texter, och skälet.
 */
export function wordmarkPlan(templateId: string, wm: WordmarkClub, variant?: VariantTexts): Promise<ScarfPlan> {
  const key = JSON.stringify([templateId, wm.name, wm.names ?? null, wm.founded ?? null, wm.sports?.[0] ?? "", Boolean(wm.logo), variant?.main ?? null, variant?.sub ?? null]);
  let hit = plans.get(key);
  if (!hit) {
    hit = planFor(templateId, wm, variant);
    plans.set(key, hit);
    if (plans.size > 6000) plans.delete(plans.keys().next().value!);
    hit.catch(() => plans.delete(key));
  }
  return hit;
}

async function planFor(templateId: string, wm: WordmarkClub, variant?: VariantTexts): Promise<ScarfPlan> {
  const template = await findTemplate(templateId);
  if (!template) return { ok: false, reason: `Ordmallen ${templateId} finns inte längre, så halsduken stickas som klassisk klubbhalsduk.`, texts: {} };
  const own = slotTexts(template, variant);
  const texts = { ...textsFor(wm, {}), ...own };
  const layers = template.layers.filter((l): l is TextLayerT => l.kind === "text" && Boolean(texts[l.slot]?.trim()));
  const opts = { icon: false, ornament: true, variant: "club" as const, canvas: true, ...(own ? { texts: own } : {}) };
  const H = Math.round(template.height);
  // Hela mallens innehåll i dukens enheter, med märkets ruta när klubben har ett märke.
  let b = inkBox(await inkMask((await renderWordmark(template, wm, opts)).svg, 1000, H), 1000, H);
  const icons = wm.logo ? template.layers.filter((l) => l.kind === "icon") : [];
  for (const l of icons) b = { x0: Math.min(b?.x0 ?? Infinity, l.box.x), y0: Math.min(b?.y0 ?? Infinity, l.box.y), x1: Math.max(b?.x1 ?? -Infinity, l.box.x + l.box.w), y1: Math.max(b?.y1 ?? -Infinity, l.box.y + l.box.h) };
  if (!b) return { ok: false, reason: `Ordmallen ${template.name} blir tom för klubben, så halsduken stickas som klassisk klubbhalsduk.`, texts: {} };
  const box = artBox();
  const k = Math.min(box.w / (b.x1 - b.x0 + 1), box.h / (b.y1 - b.y0 + 1));
  const [pw, ph] = [Math.max(SS, Math.round(((1000 * k) / ROW_H_MM) * SS)), Math.max(SS, Math.round(((H * k) / STITCH_W_MM) * SS))];
  const measured = (
    await Promise.all(
      layers.map(async (layer) => {
        const shape = knitShape(await inkMask((await renderWordmark({ ...template, layers: [layer] }, wm, opts)).svg, pw, ph), pw, ph);
        return shape ? [{ layer, text: texts[layer.slot].trim(), shape }] : [];
      }),
    )
  ).flat();
  const names = measured.filter((m) => NAME_SLOTS.has(m.layer.slot)).sort((a, c) => c.shape.heightSt - a.shape.heightSt);
  const main = names[0] ?? [...measured].sort((a, c) => c.shape.heightSt - a.shape.heightSt)[0];
  const font = scarfFont(main?.layer.font ?? "anton");
  const bad = names.find((m) => !legible(m.shape)) ?? (main && main.shape.heightSt < NAME_ST ? main : undefined);
  if (!main || bad) {
    // Mallens texter, den största först, på en klassisk halsduk i ett typsnitt i mallens stil.
    const order = [...measured].sort((a, c) => c.shape.heightSt - a.shape.heightSt).map((m) => (m.layer.case === "upper" ? m.text.toLocaleUpperCase("sv-SE") : m.text));
    const sub = [...new Set(order.slice(1))].filter((t) => t.toLocaleUpperCase("sv-SE") !== order[0]?.toLocaleUpperCase("sv-SE")).join(" · ");
    const flaws = bad
      ? [
          bad.shape.heightSt < (main === bad ? NAME_ST : LEGIBLE.heightSt) ? `blir bara ${stitches(bad.shape.heightSt)} hög (minst ${main === bad ? NAME_ST : LEGIBLE.heightSt} behövs)` : "",
          bad.shape.strokeSt < LEGIBLE.strokeSt ? `får streck på bara ${stitches(bad.shape.strokeSt)} (minst ${nf1(LEGIBLE.strokeSt)} behövs)` : "",
          bad.shape.score < LEGIBLE.score ? `behåller bara ${Math.round(bad.shape.score * 100)} % av sin form i maskorna` : "",
        ].filter(Boolean)
      : [];
    const why = bad ? `”${bad.text}” ${flaws.join(" och ")} i halsdukens 120 maskors bredd` : "mallen har ingen text med klubbens namn";
    return {
      ok: false,
      reason: `Ordmallen ${template.name} går inte att sticka läsbart: ${why}. Halsduken stickas som klassisk klubbhalsduk med mallens texter.`,
      texts: { main: order[0] ?? wm.name, sub, font, why: `Klassisk klubbhalsduk med texterna ur ordmallen ${template.name}, som är för fin för maskorna.` },
    };
  }
  const drop = [...new Set(measured.filter((m) => !NAME_SLOTS.has(m.layer.slot) && !legible(m.shape)).map((m) => m.layer.slot))];
  return { ok: true, template: template.id, drop, font };
}

// ── Plaggets färg ───────────────────────────────────────────────────────────

export type Swatch = { name: string; hex: string };

/** Färgerna plaggen kan få när katalogen bara har plaggets egen: New Waves vita, svarta och gråa plagg. */
export const STANDARD_COLORS: Swatch[] = [
  { name: "Vit", hex: "#F4F3EF" },
  { name: "Svart", hex: "#111111" },
  { name: "Grå", hex: "#9A9CA1" },
];
/** Craft väljer färgen själv: automatiskt efter kontrast, klubbens mörkaste färg eller en av plaggets. */
export const AUTO_COLOR = "auto";
export const CLUB_COLOR = "klubb";

export { pocDesign };

/** Tryckkedjan klarar plagg i valfri färg: tryck och transfer – men inte sublimering eller gravyr. */
export const recolorable = (base: NwProduct) => !["sublimering", "gravyr"].includes(pocDesign(base)?.method ?? "gravyr");

/** Plaggets egna färger ur Crafts produktdata, när det finns flera. */
const ownColors = (p: CatalogProduct) => (p.colors && p.colors.length >= 2 ? p.colors.map((c) => ({ name: c.name, hex: c.hex.toUpperCase() })) : null);

/** Färgerna Craft kan välja för plagget: Crafts egna om katalogen har flera, annars vitt, svart och grått. */
export function garmentOptions(p: CatalogProduct, base: NwProduct): Swatch[] {
  const own = ownColors(p);
  if (own) return own;
  const list = recolorable(base) ? [...STANDARD_COLORS, { name: base.garmentColor, hex: base.garmentHex.toUpperCase() }] : [{ name: base.garmentColor, hex: base.garmentHex.toUpperCase() }];
  return list.filter((c, i) => list.findIndex((o) => deltaE(o.hex, c.hex) < 6) === i);
}

/** Klubbens mörkaste färg som plaggfärg: när tryckkedjan klarar det och färgen är mörk men inte bara svart. */
export function clubDark(p: CatalogProduct, base: NwProduct, colors: readonly string[]): Swatch | null {
  if (ownColors(p) || !recolorable(base)) return null;
  const darkest = [...colors].filter((c) => HEX.test(c.toUpperCase())).sort((a, b) => lum(a) - lum(b))[0]?.toUpperCase();
  if (!darkest || !isDarkHex(darkest) || deltaE(darkest, "#111111") < 12) return null;
  return { name: colorName(darkest), hex: darkest };
}

const relLum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Kontrasten mellan två färger, 1–21 (WCAG). */
const wcag = (a: string, b: string) => {
  const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Ordmallen på plagget: på vitt som på vita plagg, på svart som på svarta, och på alla andra färger med plaggets färg
 * som botten – vita eller svarta bokstäver och den av klubbens färger som syns.
 */
export function wordmarkLook(garment: string, colors: readonly string[]): { variant: WordmarkVariant; colors: string[] } {
  if (wcag(garment, "#FFFFFF") < 1.25) return { variant: "light", colors: [...colors] };
  if (deltaE(garment, "#111111") < 10) return { variant: "dark", colors: [...colors] };
  return { variant: "club", colors: [garment.toUpperCase(), ...colors.filter((c) => deltaE(c, garment) >= 6)] };
}

/** Ordmallen trycks som New Waves vanliga wordmark (vit eller svart variant) – annars ritas den här för plaggets färg. */
const standardLook = (garment: string, colors: readonly string[]) => wordmarkLook(garment, colors).variant === (isDarkHex(garment) ? "dark" : "light");

/** Tryckfärgerna för plaggets färg: de av klubbens färger som syns på plagget, annars vitt eller svart. */
function inksFor(colors: string[], garment: string): [string, string | null] {
  const shows = (h: string) => contrast(h, garment) >= 60;
  const first = colors.find(shows) ?? (isDarkHex(garment) ? "#FFFFFF" : "#111111");
  const second = colors.find((h) => h !== first && shows(h) && deltaE(h, first) > 20) ?? null;
  return [first, second];
}

/** Färgerna designen trycks i på plagget: ordmallens bokstäver och detaljer, eller filens två toner. */
function inksOn(design: Design, colors: readonly string[], garment: string): [string, string | null] {
  if (design.source.type === "fil") return inksFor(clubColors(colors), garment);
  const look = wordmarkLook(garment, colors);
  const pal = paletteFor(look.colors, look.variant);
  return [textFill(pal, "primary"), pal.secondary];
}

/**
 * Hur bra trycket syns på plagget. Bokstäverna ska ha tydlig kontrast (minst 3:1, som stor text) och detaljerna synas
 * (2:1) – en svart hoodie med mörkblått tryck klarar inte det. Klubbens egna färger i bokstäverna ger plus.
 */
function inkScore([a, b]: [string, string | null], garment: string, colors: readonly string[]) {
  const ca = wcag(a, garment);
  const cb = b ? wcag(b, garment) : ca;
  const club = (h: string) => colors.some((c) => deltaE(c, h) < 6);
  return { ok: ca >= 3 && cb >= 2, score: Math.min(ca, 7) / 7 + (club(a) ? 0.5 : 0) + (b && club(b) ? 0.1 : 0) };
}

/**
 * Plaggets färg för klubben. `pick` är Crafts val: en av plaggets färger, "klubb" för klubbens mörkaste eller "auto".
 * Automatiskt behålls plaggets egen färg när trycket syns bra på den, annars tas den färg där trycket syns bäst.
 */
export function garmentColor(p: CatalogProduct, base: NwProduct, design: Design, colors: readonly string[], pick?: string): GarmentColor {
  const dark = clubDark(p, base, colors);
  const options = [...garmentOptions(p, base), ...(dark ? [dark] : [])];
  if (pick === CLUB_COLOR && dark) return { ...dark, how: "vald" };
  const chosen = pick && options.find((o) => sameHex(o.hex, pick));
  if (chosen) return { ...chosen, how: "vald" };
  const scored = options.map((o) => ({ o, ...inkScore(inksOn(design, colors, o.hex), o.hex, colors) }));
  const best = [...scored].sort((x, y) => Number(y.ok) - Number(x.ok) || y.score - x.score)[0];
  const own = scored.find((s) => sameHex(s.o.hex, base.garmentHex)) ?? scored[0];
  const won = own.ok && own.score >= best.score - 0.45 ? own : best;
  return { ...won.o, how: "auto" };
}

// ── Förhandsbilder och mockuper ─────────────────────────────────────────────

/** Höjs när förhandsbilderna ritas annorlunda, så att webbläsarna släpper de gamla. */
const PREVIEW_VERSION = 4;

/** Halsdukens förhandsbild: klassisk utan design, annars med ordmallen (i variantens texter) eller den uppladdade filen. */
export const scarfPreviewUrl = (clubId: string, size: 480 | 800 = 800, source?: { template: string } | { designId: string }, variant?: VariantTexts) =>
  `/api/v1/craft/halsduk?c=${encodeURIComponent(clubId)}${source ? ("template" in source ? `&t=${encodeURIComponent(source.template)}${variantQuery(variant)}` : `&d=${encodeURIComponent(source.designId)}`) : ""}&s=${size}&v=${PREVIEW_VERSION}`;
export const fileMockupUrl = (designId: string, clubId: string, sku: string, size: 480 | 800 = 800) =>
  `/api/v1/craft/designs/${encodeURIComponent(designId)}/mockup?c=${encodeURIComponent(clubId)}&p=${encodeURIComponent(sku)}&s=${size}&v=${PREVIEW_VERSION}`;
/** Plagget i valfri färg, med ordmallen (i variantens texter) eller filen ritad för den färgen. */
export const garmentMockupUrl = (source: { template: string } | { designId: string }, clubId: string, sku: string, garment: string, size: 480 | 800 = 800, variant?: VariantTexts) =>
  `/api/v1/craft/mockup?${"template" in source ? `t=${encodeURIComponent(source.template)}${variantQuery(variant)}` : `d=${encodeURIComponent(source.designId)}`}&c=${encodeURIComponent(clubId)}&p=${encodeURIComponent(sku)}&g=${garment.slice(1).toUpperCase()}&s=${size}&v=${PREVIEW_VERSION}`;

/** Artikeln med plaggets standarddesign (metod, placering och storlek), uträknad en gång per publicering. */
type Article = { p: CatalogProduct; base?: NwProduct; d?: NonNullable<ReturnType<typeof pocDesign>> };

/**
 * Samma adress som `mockupUrl` i lib/newwave/clubShop.ts – butikens mockupväg med wordmarket som tryck – men med
 * plaggets standarddesign uträknad i förväg, så att tusentals klubbar går fort.
 */
const wordmarkMockupUrl = (base: NwProduct, d: Article["d"] & {}, spec: WordmarkSpec, clubId: string, size: 480 | 800 = 800) =>
  `/api/v1/newwave/mockup?p=${base.id}&l=${encodeURIComponent(`${wordmarkUrl(spec, clubId, base.dark ? "dark" : "light", 1200, "png", d.sizeCm)}&u=`)}&s=${size}&z=${d.zone}`;

// ── Klubbprodukterna ────────────────────────────────────────────────────────

/**
 * `colors`: Crafts val per artikelnummer: "auto", "klubb" eller en färg (#RRGGBB); saknas = automatiskt. `variants`:
 * ordmallens texter per klubb, en produkt per variant; saknas klubben får den mallens egna texter.
 */
export type DraftOptions = { colors?: Record<string, string>; variants?: Record<string, VariantChoice[]> };
/** Plaggets färg per artikelnummer i förhandsvisningen och publiceringen: "auto" (efter kontrasten mot trycket), "klubb" (klubbens mörkaste färg) eller #RRGGBB. */
export const ColorChoices = z.record(z.string().max(40), z.union([z.literal(AUTO_COLOR), z.literal(CLUB_COLOR), z.string().regex(/^#[0-9A-Fa-f]{6}$/)]));

/**
 * Halsdukens specifikation för designen och klubben: ordmallen om den går att sticka läsbart, filen som motiv, annars
 * klassisk. Med en variant stickas ordmallen med variantens texter, och den klassiska halsduken får dem på framsidan.
 */
export async function scarfSpecFor(design: Design, club: PocClub, wm?: WordmarkClub, texts?: VariantTexts): Promise<ScarfSpec> {
  const specClub: SpecClub = { id: club.id, name: club.name, colors: club.colors, logo: club.logo };
  const common = { v: 1 as const, kind: "halsduk" as const, club: specClub, knitRef: club.registry ? `reg:${club.id}` : club.id, yarns: club.colors, design: { id: design.id, name: design.name } };
  if (design.source.type === "fil") return { ...common, idea: motifIdea(club), pattern: { type: "fil" } };
  const variant = texts ? specVariant(texts) : undefined;
  const front = variant ? { main: variant.main, sub: variant.sub } : {};
  const plan = await wordmarkPlan(design.source.template, { ...(wm ?? (await wordmarkClubOf(club))), colors: club.colors }, variant);
  if (plan.ok) return { ...common, idea: scarfIdea(club, { font: plan.font, ...front }), pattern: { type: "ordmall", template: plan.template, ...(plan.drop.length ? { drop: plan.drop } : {}) }, ...(variant ? { variant } : {}) };
  return { ...common, idea: scarfIdea(club, plan.texts), note: plan.reason, ...(variant ? { variant } : {}) };
}

const sourceOf = (design: Design) => (design.source.type === "ordmall" ? { template: design.source.template } : { designId: design.id });

async function draft(design: Design, club: PocClub, { p, base, d }: Article, opts: DraftOptions, wm: WordmarkClub | null, variant?: SpecVariant): Promise<ClubProductDraft | null> {
  const specClub: SpecClub = { id: club.id, name: club.name, colors: club.colors, logo: club.logo };
  const label = variant ? variantLabel(variant) : "";
  const title = `${club.name} ${shortName(p)}${label ? ` – ${label}` : ""}`;
  const common = { designId: design.id, clubId: club.id, sku: p.sku, kind: p.kind, title, priceSek: p.priceSek, variant: variant?.key ?? "" };
  const specDesign: SpecDesign = { id: design.id, name: design.name };
  if (p.kind === "halsduk") {
    const spec = await scarfSpecFor(design, club, wm ?? undefined, variant);
    return { ...common, mockupUrl: scarfPreviewUrl(club.id, 800, sourceOf(design), variant), spec };
  }
  if (!base || !d) return null;
  // Färgen väljs mot ordmallens färger (klubbens godkända), eller mot klubbens färger för en uppladdad fil.
  const colors = design.source.type === "ordmall" && wm ? clubColors(wm.colors) : club.colors;
  const color = garmentColor(p, base, design, colors, opts.colors?.[p.sku]);
  const product = { sku: p.sku, baseId: base.id, name: base.name, garment: color.hex };
  const print = { method: d.method, zone: d.zone, sizeCm: d.sizeCm };
  const asPhoto = sameHex(color.hex, base.garmentHex);
  if (design.source.type === "ordmall") {
    const wordmark = wordmarkSpec(design.source.template);
    const spec: GarmentSpec = { v: 1, kind: "plagg", club: specClub, product, color, print, design: { ...specDesign, type: "ordmall", wordmark, ...(variant ? { variant } : {}) } };
    // Butikens mockupväg ritar bara New Waves plagg med mallens egna texter; resten ritas av Crafts mockupväg.
    const standard = asPhoto && !variant && !isPocBase(base) && wordmarkLook(color.hex, wm?.colors ?? club.colors).variant === (base.dark ? "dark" : "light");
    return { ...common, mockupUrl: standard ? wordmarkMockupUrl(base, d, wordmark, club.id) : garmentMockupUrl({ template: design.source.template }, club.id, p.sku, color.hex, 800, variant), spec };
  }
  const spec: GarmentSpec = { v: 1, kind: "plagg", club: specClub, product, color, print, design: { ...specDesign, type: "fil" } };
  return { ...common, mockupUrl: asPhoto ? fileMockupUrl(design.id, club.id, p.sku) : garmentMockupUrl({ designId: design.id }, club.id, p.sku, color.hex), spec };
}

/**
 * Klubbens varianter med texterna ifyllda, utan dubbletter: två val som ger samma texter blir samma produkt. En
 * variant med en egen text som är tom hoppas över för klubben.
 */
export function clubVariants(design: Design, club: PocClub, choices: VariantChoice[] | undefined): (SpecVariant | undefined)[] {
  if (design.source.type !== "ordmall") return [undefined];
  const out = new Map<string, SpecVariant | undefined>();
  for (const c of usable(choices ?? [])) {
    const v = specVariant(variantTexts(c, factsOf(club)));
    out.set(v?.key ?? "", v);
  }
  return [...out.values()];
}

/**
 * En rad per klubb, variant och artikel till `upsertClubProducts`: designen gjord till klubbens egen, med klubbens
 * namn (eller variantens texter), färger och märke, och plaggets färg vald för klubben. Okända klubbar och artiklar
 * hoppas över. Inga bilder ritas här – mockuperna ritas först när någon tittar på dem – men ordmallens halsduk provas
 * mot maskorna, några hundradels sekunder per klubb och variant.
 */
export async function clubProductDrafts(design: Design, clubIds: string[], skus: string[], opts: DraftOptions = {}): Promise<ClubProductDraft[]> {
  const articles: Article[] = [...new Set(skus)].flatMap((sku) => {
    const p = catalogProduct(sku);
    if (!p) return [];
    const base = baseProduct(p);
    const d = base ? pocDesign(base) : undefined;
    // Ett plagg som bara kan broderas görs inte i flödet.
    if (base && !d) return [];
    return [{ p, base, d: d ?? undefined }];
  });
  if (!articles.length) return [];
  const ids = [...new Set(clubIds)];
  const out: ClubProductDraft[] = [];
  // Några klubbar åt gången: halsdukens ordmall ritas och provas för varje klubb.
  for (let i = 0; i < ids.length; i += 8) {
    const part = await Promise.all(
      ids.slice(i, i + 8).map(async (id) => {
        const club = await pocClub(id);
        if (!club) return [];
        const wm = design.source.type === "ordmall" ? await wordmarkClubOf(club) : null;
        const variants = clubVariants(design, club, opts.variants?.[id]);
        return (await Promise.all(variants.flatMap((v) => articles.map((a) => draft(design, club, a, opts, wm, v))))).flatMap((d) => (d ? [d] : []));
      }),
    );
    out.push(...part.flat());
  }
  return out;
}

/** Läser `spec` från databasen; ger null om den inte är en av våra. */
export function readSpec(spec: Record<string, unknown>): ProductSpec | null {
  const s = spec as Partial<ProductSpec>;
  if (s.v !== 1 || !s.club || (s.kind !== "plagg" && s.kind !== "halsduk")) return null;
  return s as ProductSpec;
}

// ── Konstverket ─────────────────────────────────────────────────────────────

const DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/;

const designs = new Map<string, Design>();

/** Designen ur databasen. En design ändras aldrig när den väl är sparad, så de senaste hålls i minnet åt mockuperna. */
export async function designById(id: string): Promise<Design | null> {
  const hit = designs.get(id);
  if (hit) return hit;
  const d = await getDesign(id);
  if (d) {
    designs.set(id, d);
    if (designs.size > 20) designs.delete(designs.keys().next().value!);
  }
  return d;
}

/** Den uppladdade filen, som den sparades med designen. */
export async function designArt(design: Design): Promise<Buffer | null> {
  if (design.source.type !== "fil") return null;
  const url = design.source.artUrl;
  const m = DATA_URL.exec(url);
  return m ? Buffer.from(m[2], "base64") : readAsset(url);
}

/**
 * En ljus, jämn bakgrund (JPG, eller PNG utan genomskinlighet) blir genomskinlig – bara den som hänger ihop med
 * kanterna, så att vita fält inne i ett märke eller motiv blir kvar. Kantpixlarna tonas ut, så att kanten blir mjuk.
 */
async function knockout(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => p * 4);
  const bg = corners.every((i) => data[i + 3] > 250) ? [0, 1, 2].map((k) => corners.reduce((sum, i) => sum + data[i + k], 0) / 4) : null;
  const dist = (p: number) => Math.abs(data[p * 4] - bg![0]) + Math.abs(data[p * 4 + 1] - bg![1]) + Math.abs(data[p * 4 + 2] - bg![2]);
  if (!bg || corners.some((i) => dist(i / 4) >= 30) || 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] <= 200) return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const d = dist(p);
    if (d >= 90) continue;
    data[p * 4 + 3] = d < 36 ? 0 : Math.round((data[p * 4 + 3] * (d - 36)) / 54);
    if (d >= 36) continue;
    const [x, y] = [p % w, Math.floor(p / w)];
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const trimmed = (png: Buffer) => sharp(png).trim({ threshold: 1 }).png().toBuffer().catch(() => png);

/** Läser en uppladdad bild och gör den till en PNG med genomskinlig bakgrund, beskuren och högst 2 000 px. */
export async function normalizeArt(input: Buffer): Promise<Buffer> {
  const png = await sharp(input, { density: 300, limitInputPixels: 60_000_000 }).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return trimmed(await knockout(png));
}

/** Motivet i två toner: mörka partier i `a`, ljusa i `b`. Utan `b` blir ljusa partier genomskinliga. */
async function tintArt(art: Buffer, a: string, b: string | null, max = 1600) {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b ?? a);
  const src = await sharp(art).resize(max, max, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = src.data;
  for (let i = 0; i < px.length; i += 4) {
    const t = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    if (b) {
      px[i] = Math.round(ra + (rb - ra) * t);
      px[i + 1] = Math.round(ga + (gb - ga) * t);
      px[i + 2] = Math.round(ba + (bb - ba) * t);
    } else {
      [px[i], px[i + 1], px[i + 2]] = [ra, ga, ba];
      px[i + 3] = Math.round(px[i + 3] * (1 - t));
    }
  }
  return { png: await sharp(px, { raw: { width: src.info.width, height: src.info.height, channels: 4 } }).png().toBuffer(), w: src.info.width, h: src.info.height };
}

/**
 * Det uppladdade konstverket gjort till klubbens eget: i klubbens färger (mörka partier i den första färgen som syns
 * på plagget, ljusa i den andra) och med klubbens märke ovanför. Har klubben bara en färg som syns blir ljusa partier
 * genomskinliga, så att plagget syns igenom.
 */
export async function clubArtwork(art: Buffer, club: Pick<PocClub, "id" | "logo" | "colors">, garment: string, width = 2000): Promise<Buffer> {
  const [a, b] = inksFor(clubColors(club.colors), garment);
  const { png: tinted, w: aw, h: ah } = await tintArt(art, a, b);
  const logo = await crestFile(club);
  // Märket utan vit ruta runt, lika högt som tre fjärdedelar av motivet och högst hälften så brett.
  const crest = logo
    ? await knockout(await sharp(logo).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).png().toBuffer())
        .then(trimmed)
        .then((png) => sharp(png).resize(Math.round(aw * 0.5), Math.round(ah * 0.75), { fit: "inside" }).png().toBuffer({ resolveWithObject: true }))
        .catch(() => null)
    : null;
  const gap = crest ? Math.round(ah * 0.08) : 0;
  const [cw, chh] = crest ? [crest.info.width, crest.info.height] : [0, 0];
  const W = Math.max(aw, cw);
  const H = chh + gap + ah;
  const layers = [...(crest ? [{ input: crest.data, left: Math.round((W - cw) / 2), top: 0 }] : []), { input: tinted, left: Math.round((W - aw) / 2), top: chh + gap }];
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
  return sharp(out).resize({ width }).png().toBuffer();
}

/**
 * Produktfotot i en annan färg, som RGBA i `size` pixlar. Plagget är allt som inte hänger ihop med fotots ljusa
 * bakgrund; det får färgen med fotots ljus och skuggor kvar. På mörka plagg behåller ljusa partier (skuggan under
 * plagget, metallhylsor) fotots färg.
 */
async function recolorPhoto(photo: Buffer, hex: string, size: number): Promise<Buffer> {
  const { data } = await sharp(photo).resize(size, size, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [w, n] = [size, size * size];
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  const bg = Math.max(L[0], L[w - 1], L[n - w], L[n - 1]);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, n - w + x);
  for (let y = 0; y < w; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p] || bg - L[p] > 7) continue;
    seen[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < n - w) stack.push(p + w);
  }
  const vals: number[] = [];
  for (let i = 0; i < n; i += 7) if (!seen[i]) vals.push(L[i]);
  vals.sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)] ?? 128;
  const dark = med < 128;
  const [tr, tg, tb] = hexToRgb(hex);
  const out = Buffer.alloc(n * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Mjuk kant: andelen plagg bland grannarna.
      let [s, c] = [0, 0];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [xx, yy] = [x + dx, y + dy];
          if (xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
          s += seen[yy * w + xx] ? 0 : 1;
          c++;
        }
      const a = (s / c) * Math.max(0, Math.min(1, ((bg - L[i]) / Math.max(1, bg - med)) * (dark ? 1.3 : 2)));
      const d = Math.max(-0.6, Math.min(0.6, ((L[i] - med) / 255) * 2.6));
      const tone = (t: number) => Math.max(0, Math.min(255, d < 0 ? t * (1 + d) : t + (255 - t) * d * 0.8));
      const rgb = [tone(tr), tone(tg), tone(tb)];
      for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(data[i * 3 + k] * (1 - a) + rgb[k] * a);
      out[i * 4 + 3] = 255;
    }
  return out;
}

const POC_PHOTO = /^\/poc\/plagg\/[A-Za-z0-9._-]+\.(?:jpg|png)$/;

/** Plaggets foto: Crafts egna ligger i public/poc/plagg/, New Waves läses som butiken läser dem. */
const photoOf = (p: NwProduct) => (POC_PHOTO.test(p.photo) ? readFile(path.join(process.cwd(), "public", p.photo)).catch(() => null) : readAsset(p.photo));

/**
 * Produktfotot med trycket på, som JPEG i `size` pixlar – samma motor som butikens mockuper, med bilden i minnet.
 * Med `garment` får plagget den färgen.
 */
export async function artMockup(p: NwProduct, art: Buffer, size: number, zone?: string, garment = p.garmentHex): Promise<Buffer | null> {
  const photoFile = await photoOf(p);
  if (!photoFile) return null;
  const recolor = !sameHex(garment, p.garmentHex);
  const s = printOf(p, zone);
  const meta = await sharp(art).metadata();
  const fitted = printFit(s, (meta.width || 1) / (meta.height || 1), size);
  const [photo, logo] = await Promise.all([
    recolor ? recolorPhoto(photoFile, garment, size) : sharp(photoFile).resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
    sharp(art)
      .resize(Math.max(1, Math.round(fitted.w * 2)), Math.max(1, Math.round(fitted.h * 2)), { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  const out = printOnPhoto(s, { data: photo, width: size, height: size }, { data: logo.data, width: logo.info.width, height: logo.info.height }, { dark: recolor ? isDarkHex(garment) : p.dark, soft: isSoft(p) });
  return sharp(Buffer.from(out.buffer, out.byteOffset, out.byteLength), { raw: { width: size, height: size, channels: 4 } })
    .jpeg({ quality: 86 })
    .toBuffer();
}

/** Mockupen av ett uppladdat konstverk på plagget, för en klubb, i plaggets färg (`garment`) eller fotots. */
export async function fileMockup(design: Design, clubId: string, sku: string, size: number, garment?: string): Promise<Buffer | null> {
  const p = catalogProduct(sku);
  const base = p ? baseProduct(p) : undefined;
  const [club, art] = await Promise.all([pocClub(clubId), designArt(design)]);
  if (!base || !club || !art) return null;
  const color = garment ?? base.garmentHex;
  const zone = pocDesign(base)?.zone;
  return artMockup(base, await clubArtwork(art, club, color, 1200), size, zone, color);
}

/** Ordmallen ritad för plaggets färg (se `wordmarkLook`), med mallens lilla version för små tryck och variantens texter. */
async function garmentWordmark(template: string, clubId: string, garment: string, compact: boolean, size: number, variant?: VariantTexts) {
  const [found, wm] = await Promise.all([findTemplate(template), wordmarkClub(clubId)]);
  if (!found || !wm) return null;
  const tpl = compact && !found.hidden ? ((await findTemplate(smallFor(found))) ?? found) : found;
  const look = wordmarkLook(garment, wm.colors);
  const texts = slotTexts(tpl, variant);
  const out = await renderWordmark(tpl, { ...wm, colors: look.colors }, { icon: true, ornament: true, variant: look.variant, ...(texts ? { texts } : {}) });
  return { svg: out.svg, png: await wordmarkPng(out, size), look, club: wm, template: tpl.id };
}

/** Mockupen av designen på plagget i valfri färg: ordmallen (`template`, i variantens texter) eller den uppladdade filen. */
export async function garmentMockup(source: { template: string } | { design: Design }, clubId: string, sku: string, garment: string, size: number, variant?: VariantTexts): Promise<Buffer | null> {
  if ("design" in source) return fileMockup(source.design, clubId, sku, size, garment);
  const p = catalogProduct(sku);
  const base = p ? baseProduct(p) : undefined;
  if (!base) return null;
  const d = pocDesign(base);
  if (!d) return null;
  const art = await garmentWordmark(source.template, clubId, garment, d.sizeCm <= SMALL_PRINT_CM, 1200, variant);
  return art ? artMockup(base, art.png, size, d.zone, garment) : null;
}

// ── Halsduken ───────────────────────────────────────────────────────────────

type Knit = KnitResult & { note?: string };

/** Halsduken klarar stickeriets regler: inga varningar i kontrollen och högst fyra garner per varv. */
const fine = (r: KnitResult) => r.report.ok && r.report.maxColorsPerRow <= FAST_COLORS;

const nearestOf = (hex: string, list: string[]) => list.reduce((best, h) => (deltaE(h, hex) < deltaE(best, hex) ? h : best), list[0]);

/**
 * Stickar märket i sina egna färger när halsduken då ryms i fyra garner, annars i halsdukens garner (botten, text och
 * detalj) – så att inget varv behöver fler än fyra. Varnar kontrollen ändå provas halsdukens garner. `best` är null om
 * ingen variant klarar reglerna.
 */
async function knitWithin(club: Club, colors: ScarfIdea["colors"], make: (club: Club) => Promise<KnitResult>): Promise<{ best: KnitResult | null; last: KnitResult }> {
  const own = [colors.ground, colors.ink, colors.accent].map((h) => h.toUpperCase());
  const yarns: string[] = [];
  for (const h of [...own, ...club.crestColors]) if (!yarns.some((y) => deltaE(y, h) < 12)) yarns.push(h);
  const shared = { ...club, crestColors: [...new Set(club.crestColors.map((h) => nearestOf(h, own)))] };
  const first = await make(yarns.length <= FAST_COLORS ? club : shared);
  if (fine(first)) return { best: first, last: first };
  if (yarns.length > FAST_COLORS) return { best: null, last: first };
  const second = await make(shared);
  return { best: fine(second) ? second : null, last: second };
}

/**
 * Märket i ordmallens ruta för märket: på en platta i textens garn när märkets ytterkant annars har bottnens färg och
 * skulle försvinna i stickningen – som stickmotorn gör med märkena i ändarna.
 */
async function crestOnPlate(crest: Buffer, w: number, h: number, ground: string, plate: string): Promise<{ png: Buffer; w: number; h: number }> {
  const trimmedCrest = await sharp(crest).trim({ threshold: 8 }).png().toBuffer().catch(() => crest);
  const fit = async (bw: number, bh: number) => sharp(trimmedCrest).resize(Math.max(1, Math.round(bw)), Math.max(1, Math.round(bh)), { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const first = await fit(w, h);
  const { data, info } = first;
  const [cw, ch] = [info.width, info.height];
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < cw && y < ch && data[(y * cw + x) * 4 + 3] >= 128;
  // Kanten, och hela ytan: ett märke i bottnens färg med en tunn ljus kontur försvinner lika mycket som ett med mörk kant.
  let [edge, lostEdge, area, lostArea] = [0, 0, 0, 0];
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      if (!opaque(x, y)) continue;
      const i = (y * cw + x) * 4;
      const near = deltaE(rgbToHex([data[i], data[i + 1], data[i + 2]]), ground) < 25;
      area++;
      if (near) lostArea++;
      if (opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1)) continue;
      edge++;
      if (near) lostEdge++;
    }
  const png = await sharp(data, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer();
  if (lostEdge <= edge * 0.45 && lostArea <= area * 0.4) return { png, w: cw, h: ch };
  const m = Math.round(Math.min(cw, ch) * 0.08);
  const inner = await fit(cw - m * 2, ch - m * 2);
  const [iw, ih] = [inner.info.width, inner.info.height];
  const [pw, ph] = [iw + m * 2, ih + m * 2];
  const disc = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${Math.min(pw, ph) / 2}" fill="${plate}"/></svg>`);
  const out = await sharp(disc)
    .composite([{ input: await sharp(inner.data, { raw: { width: iw, height: ih, channels: 4 } }).png().toBuffer(), left: m, top: m }])
    .png()
    .toBuffer();
  return { png: out, w: pw, h: ph };
}

/**
 * Ordmallen som bild för halsduken: på mallens hela duk, med märket (stickmotorns egen bild av det) inlagt i mallens
 * ruta för märket, på en platta om det behövs. Beskuren till innehållet.
 */
async function scarfWordmark(template: Template, wm: WordmarkClub, crest: Buffer | null | undefined, ground: string, plate: string, texts?: Partial<Record<TextSlot, string>>): Promise<Buffer> {
  const SIZE = 1600;
  const rendered = await renderWordmark(template, wm, { icon: false, ornament: true, variant: "club", canvas: true, ...(texts ? { texts } : {}) });
  const k = SIZE / Math.max(rendered.width, rendered.height);
  const layers: { input: Buffer; left: number; top: number }[] = [];
  for (const l of crest ? template.layers : []) {
    if (l.kind !== "icon") continue;
    const c = await crestOnPlate(crest!, l.box.w * k, l.box.h * k, ground, plate);
    layers.push({ input: c.png, left: Math.round(l.box.x * k + (l.box.w * k - c.w) / 2), top: Math.round(l.box.y * k + (l.box.h * k - c.h) / 2) });
  }
  const png = await wordmarkPng(rendered, SIZE);
  const out = layers.length ? await sharp(png).composite(layers).png().toBuffer() : png;
  return sharp(out).trim({ threshold: 1 }).png().toBuffer().catch(() => out);
}

/** Ordmallen på halsduken: ändränder, ordmallen i mitten av framsidan och klubbens namn på baksidan. */
async function knitWordmark(spec: ScarfSpec, pattern: Extract<ScarfPattern, { type: "ordmall" }>, club: Club, crest: Buffer | null | undefined): Promise<KnitResult> {
  const [found, wm] = await Promise.all([findTemplate(pattern.template), wordmarkClubOf(spec.club)]);
  if (!found) throw new Error(`Ordmallen ${pattern.template} finns inte`);
  const drop = new Set(pattern.drop ?? []);
  const template: Template = { ...found, layers: found.layers.filter((l) => l.kind !== "text" || !drop.has(l.slot)) };
  const look = paletteFor(spec.yarns, "club");
  const palette: string[] = [];
  const add = (hex: string, min = 12) => {
    const h = hex.toUpperCase();
    const at = palette.findIndex((p) => deltaE(p, h) < min);
    if (at >= 0) return at;
    if (palette.length >= SCARF.maxColors) return -1;
    palette.push(h);
    return palette.length - 1;
  };
  const [G, I] = [add(look.paper), add(look.ink)];
  const A = add(look.secondary);
  const crestYarns = crest ? [...new Set(club.crestColors.map((h) => add(h)).filter((i) => i >= 0))] : [];
  // Variantens texter hamnar i samma textfält som när halsduken provades mot maskorna (hela mallen, före `drop`).
  const art = await scarfWordmark(template, { ...wm, colors: spec.yarns }, crest, palette[G], palette[I], slotTexts(found, spec.variant));

  const solid = (yarn: number): Fill => ({ kind: "solid", yarn });
  const stripes = (...list: [number, number][]): Stripe[] => list.map(([yarn, mm]) => ({ yarn, mm }));
  const detail = (ground: number, ink: number) => (A === ground ? ink : A);
  const endBars = (ground: number, ink: number): Section => ({ mm: END_BARS_MM, fill: { kind: "bars", stripes: stripes([ink, 22], [ground, 8], [detail(ground, ink), 12], [ground, 8], [ink, 22]) } });
  const crestAt = (ground: number): Section[] => (crest ? [{ mm: CREST_MM, fill: solid(ground), content: { kind: "crest", yarns: crestYarns.length ? crestYarns : undefined, plate: ground === G ? I : G }, pad: [12, 15] }] : []);
  const up = (s: string) => s.trim().toLocaleUpperCase("sv-SE");
  const [bm, bs] = [up(spec.idea.back.main) || up(spec.club.name), up(spec.idea.back.sub)];
  const design: ScarfDesign = {
    palette,
    // Som den klassiska: ändränder och märket i båda ändar, och ordmallen i mitten i stället för namnet.
    // Ordmallen i bottnens, textens och detaljens garn – bottnens också, så att text urstansad i en platta (som i
    // Hjälmens kapsel) står kvar i bottnens färg.
    front: { sections: mirrored([endBars(G, I), ...crestAt(G)], [{ fill: solid(G), content: { kind: "art", yarns: [...new Set([G, I, A])] }, pad: ART_PAD }]) },
    back: {
      sections: mirrored([endBars(I, G), ...crestAt(I)], [{ fill: solid(I), content: { kind: "text", lines: [bm, bs].filter(Boolean), font: spec.idea.font, yarn: G, stretch: bm.length <= 8 } }]),
      edge: { stripes: stripes([-1, EDGE_MM], [detail(I, G), 3]), skip: 1 },
    },
    backReads: "hold-up",
  };
  let knit = await knitDesign(design, { crest, art });
  let report = inspect(knit);
  if (report.checks.some((c) => c.id === "loose" && c.level === "varning")) {
    const cleaned = await knitDesign(design, { crest, art }, { clean: true });
    const again = inspect(cleaned);
    if (again.checks.every((c) => c.id !== "loose" || c.level === "ok")) [knit, report] = [cleaned, again];
  }
  return {
    built: { design, uses: { crest: Boolean(crest), portrait: false, art: true }, consent: null },
    knit,
    report,
    front: `ordmallen ${found.name} med ${spec.variant ? variantLabel(spec.variant) : spec.club.name}`,
    back: [bm, bs].filter(Boolean).join(" / "),
  };
}

/** Crafts uppladdade fil i halsdukens garner: mörka partier i textens garn, ljusa i detaljens om det syns mot bottnen. */
async function scarfArt(spec: ScarfSpec) {
  const design = await designById(spec.design.id).catch(() => null);
  const art = design ? await designArt(design) : null;
  if (!art) return null;
  const { ground, ink, accent } = spec.idea.colors;
  const second = contrast(accent, ground) >= 60 && deltaE(accent, ink) > 20 ? accent : null;
  return (await tintArt(art, ink, second, 1200)).png;
}

/**
 * Stickar halsduken ur specifikationen: klubbens märke och märkets färger från stickmotorns klubbuppslag, garnerna från
 * klubbens färger. Ordmallen och filen faller tillbaka på den klassiska halsduken om de inte klarar stickeriets regler;
 * då står skälet i `note`.
 */
async function knitScarf(spec: ScarfSpec): Promise<Knit> {
  const found = await scarfClub(spec.knitRef);
  if (!found) throw new Error(`Hittar inte ${spec.club.name} för stickningen`);
  const club = { ...found.club, palette: spec.yarns.map((hex) => ({ name: hex, hex })) };
  const colors = spec.idea.colors;
  let note = spec.note;
  const pattern = spec.pattern;
  if (pattern?.type === "ordmall") {
    const r = await knitWithin(club, colors, (c) => knitWordmark(spec, pattern, c, found.crest)).catch((e) => {
      console.error("poc/build halsduk ordmall", spec.club.id, e instanceof Error ? e.message : e);
      return null;
    });
    if (r?.best) return r.best;
    note = "Ordmallen klarade inte stickeriets kontroll på halsduken, så den stickas som klassisk klubbhalsduk.";
  } else if (pattern?.type === "fil") {
    const art = await scarfArt(spec);
    const r = art ? await knitWithin(club, colors, (c) => knitIdea(c, spec.idea, { crest: found.crest, art })) : null;
    if (r?.best) return r.best;
    note = art ? "Motivet klarade inte stickeriets kontroll på halsduken, så den stickas som klassisk klubbhalsduk." : "Designens fil saknas, så halsduken stickas som klassisk klubbhalsduk.";
  }
  const idea: ScarfIdea = pattern?.type === "fil" ? { ...spec.idea, recipe: "klassisk", art: null, front: { main: spec.idea.front.main, sub: "" } } : spec.idea;
  const r = await knitWithin(club, colors, (c) => knitIdea(c, idea, { crest: found.crest }));
  return { ...(r.best ?? r.last), ...(note ? { note } : {}) };
}

/** Förhandsbilden av klubbens halsduk: framsidan liggande, diagonalt i en kvadrat på ljus botten. */
export async function scarfPreview(spec: ScarfSpec, size: number): Promise<Buffer | null> {
  const { knit } = await knitScarf(spec);
  const face = await facePreview(knit.faces[0], knit.palette, Math.round(size * 1.25));
  const turned = await sharp(face).rotate(-32, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const fitted = await sharp(turned).resize(Math.round(size * 0.92), Math.round(size * 0.92), { fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: size, height: size, channels: 3, background: "#F2F2F0" } })
    .composite([{ input: fitted.data, left: Math.round((size - fitted.info.width) / 2), top: Math.round((size - fitted.info.height) / 2) }])
    .jpeg({ quality: 86 })
    .toBuffer();
}

/** Det som avgör hur halsduken blir, för förhandsbildens cache: allt utom designens id och namn (utom för en fil). */
export const scarfKey = (spec: ScarfSpec) => [spec.club, spec.yarns, spec.idea, spec.pattern ?? null, spec.note ?? null, spec.pattern?.type === "fil" ? spec.design.id : null, spec.variant ?? null];

// ── Förhandsbilder på disk ──────────────────────────────────────────────────

const CACHE_DIR = path.join(process.cwd(), ".data", "poc", "previews");
const pending = new Map<string, Promise<Buffer | null>>();
/** Högst tre bilder ritas samtidigt; en förhandsvisning av många klubbar köar resten. */
const PARALLEL = 3;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Ritar en förhandsbild en gång per innehåll och sparar den; samtidiga anrop för samma bild väntar på samma ritning. */
export function cachedImage(parts: unknown[], make: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const key = createHash("sha256").update(JSON.stringify([PREVIEW_VERSION, MOCKUP_VERSION, ...parts])).digest("hex").slice(0, 40);
  const hit = pending.get(key);
  if (hit) return hit;
  const file = path.join(CACHE_DIR, `${key}.jpg`);
  const run = (async () => {
    const saved = await readFile(file).catch(() => null);
    if (saved) return saved;
    const made = await limited(make);
    if (!made) return null;
    await mkdir(CACHE_DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}`;
    await writeFile(tmp, made);
    await rename(tmp, file);
    return made;
  })().finally(() => pending.delete(key));
  pending.set(key, run);
  return run;
}

// ── Produktionsfilerna ──────────────────────────────────────────────────────

export type BuiltFile = { name: string; label: string; data: Buffer };
type Made = { files: BuiltFile[]; about: string[] };

const SCARF_LABELS: [RegExp, string][] = [
  [/\.bmp$/, "Stickfil, BMP 240 × 1 210"],
  [/-korrektur\.png$/, "Korrektur"],
  [/^garn\.csv$/, "Garnlista"],
  [/^stickorder\.json$/, "Stickorder, maskinläsbar"],
  [/^stickorder\.pdf$/, "Stickorder"],
  [/\.txt$/i, "Läs mig"],
];

/** Stickpaketet för halsduken: stickfilen, korrekturen, garnlistan och stickordern. */
export async function scarfPackage(spec: ScarfSpec, date: string) {
  const r = await knitScarf(spec);
  const why = r.note ? `${spec.idea.why} ${r.note}` : spec.pattern?.type === "ordmall" ? `Crafts design ”${spec.design.name}” med klubbens namn i ordmallens typografi.` : spec.idea.why;
  const pack = await buildPackage({ club: spec.club.name, title: spec.idea.title, why, front: r.front, back: r.back, consent: r.built.consent, knit: r.knit, report: r.report, date, pdf: htmlToPdf });
  return { r, pack };
}

async function scarfFiles(spec: ScarfSpec, date: string): Promise<Made> {
  const { r, pack } = await scarfPackage(spec, date);
  return {
    files: pack.files.map((f) => ({ name: f.name, label: SCARF_LABELS.find(([re]) => re.test(f.name))?.[1] ?? f.what, data: f.data })),
    about: [
      `Jacquardstickad halsduk, ${r.knit.palette.length} garner: ${r.knit.palette.join(", ")}`,
      `Framsida: ${r.front}. Baksida: ${r.back}.`,
      ...(r.note ? [`Obs: ${r.note}`] : []),
      `Kontroll: ${r.report.ok ? "klar för stickning" : "se varningarna i LAS-MIG.txt"}, högst ${r.report.maxColorsPerRow} garner per varv`,
    ],
  };
}

const describe = (job: MadeJob) => [
  `${job.methodLabel}, ${job.placement.toLowerCase()}, ${job.sizeMm.map((v) => Math.round(v)).join(" × ")} mm`,
  ...(job.inks.length ? [`Färger: ${job.inks.map((i) => `${i.name} ${i.hex} (${i.pantone})`).join(", ")}`] : []),
  ...job.notes,
];

/** Färgerna i ett wordmark som trycks: bokstävernas och formernas (inte bottnens) plus en för märket. */
function inkCount(svg: string, paper: string) {
  const fills = new Set([...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()).filter((c) => c !== paper.toUpperCase()));
  return fills.size + (svg.includes("<image") ? 1 : 0);
}

async function garmentFiles(spec: GarmentSpec): Promise<Made> {
  const base = baseById(spec.product.baseId);
  if (!base) throw new Error(`Plagget ${spec.product.baseId} finns inte i katalogen`);
  const { method, sizeCm } = spec.print;
  const garment = spec.product.garment;
  if (spec.design.type === "ordmall") {
    const wm = spec.design.wordmark;
    const variant = spec.design.variant;
    const compact = sizeCm <= SMALL_PRINT_CM;
    const club = await wordmarkClub(spec.club.id).catch(() => null);
    if (club && !wm.names?.[spec.club.id] && (variant || !standardLook(garment, club.colors))) {
      // Plagg i en färg som inte är vit eller svart, eller en variant: ordmallen ritas för färgen och med variantens
      // texter, som i mockupen.
      const art = await garmentWordmark(wm.template, spec.club.id, garment, compact, 3543, variant);
      if (!art) throw new Error(`Ordmallen ${wm.template} gick inte att rita för ${spec.club.name}`);
      const info = METHOD_INFO[method];
      const colors = info.fixedColors ?? Math.min(info.maxColors, Math.max(1, inkCount(art.svg, paletteFor(art.look.colors, art.look.variant).paper)));
      const meta = await sharp(art.png).metadata();
      const placement = fitPlacement(base, { method, colors, shape: "original" as const, zone: spec.print.zone, sizeCm }, (meta.width || 1) / (meta.height || 1));
      const slug = `${fileSlug(spec.club.name)}-${wm.template}${variant ? `-${fileSlug(variantLabel(variant))}` : ""}`;
      const job = await makeJob({ club: spec.club.name, palette: art.look.colors, product: base, color: garment, placement, art: art.png, slug });
      const texts = variant ? [`Texter: ${[variant.main && `huvudrad ”${variant.main}”`, variant.sub && `underrad ”${variant.sub}”`].filter(Boolean).join(", ")}`] : [];
      return { files: [...job.files.map((f) => ({ name: f.name, label: f.label, data: f.data })), { name: `${slug}-original.svg`, label: "Original, vektor", data: Buffer.from(art.svg) }], about: [...describe(job), ...texts] };
    }
    const names = wm.names?.[spec.club.id];
    const q = { template: wm.template, club: spec.club.id, name1: names?.name1, name2: names?.name2, team: wm.team, player: wm.player, number: wm.number, icon: wm.icon, ornament: wm.ornament, worn: Boolean(wm.worn), compact, variant: "light" as const, size: 3543, format: "png" as const };
    const w = await wordmarkJob(q, base, method, sizeCm, garment);
    if (!w) throw new Error(`Ordmallen ${wm.template} gick inte att rita för ${spec.club.name}`);
    return { files: [...w.job.files.map((f) => ({ name: f.name, label: f.label, data: f.data })), { name: `${w.slug}-original.svg`, label: "Original, vektor", data: w.svg }], about: describe(w.job) };
  }
  const design = await designById(spec.design.id);
  const art = design ? await designArt(design) : null;
  if (!art) throw new Error(`Konstverket i designen ${spec.design.name} saknas`);
  const club = await clubArtwork(art, spec.club, garment, 3000);
  const meta = await sharp(club).metadata();
  const colors = METHOD_INFO[method].fixedColors ?? Math.min(METHOD_INFO[method].maxColors, inksFor(spec.club.colors, garment)[1] ? 3 : 2);
  const placement = fitPlacement(base, { method, colors, shape: "original" as const, zone: spec.print.zone, sizeCm }, (meta.width || 1) / (meta.height || 1));
  const job = await makeJob({ club: spec.club.name, palette: spec.club.colors, product: base, color: garment, placement, art: club, slug: `${fileSlug(spec.club.name)}-${fileSlug(spec.design.name) || "design"}` });
  return { files: job.files.map((f) => ({ name: f.name, label: f.label, data: f.data })), about: describe(job) };
}

const memo = new Map<string, Promise<BuiltFile[]>>();
const PRODUCER_LABEL = { tryckeri: "Tryckeriet", stickeri: "Stickeriet" } as const;

/**
 * Produktionsfilerna till ett jobb: en arbetsorder med raderna, och för varje klubbprodukt i jobbet dess filer –
 * stickpaketet (stickfil BMP 240 × 1 210, korrektur, garnlista) för halsdukar och tryckfilerna för plagg. Filnamnen
 * börjar med produktens nummer i jobbet ("01-…"), så att de är unika. Samma jobb byggs bara en gång åt gången.
 */
export function jobFiles(job: Pick<ProductionJob, "id" | "orderNumber" | "producer" | "lineIds" | "createdAt">, lines: OrderLine[], products: ClubProduct[]): Promise<BuiltFile[]> {
  const mine = job.lineIds.length ? lines.filter((l) => job.lineIds.includes(l.id)) : lines;
  const key = createHash("sha256")
    .update(JSON.stringify([job.id, job.orderNumber, job.createdAt, mine.map((l) => [l.id, l.clubProductId, l.size, l.qty]), products.filter((p) => mine.some((l) => l.clubProductId === p.id)).map((p) => [p.id, p.spec])]))
    .digest("hex");
  let hit = memo.get(key);
  if (!hit) {
    hit = buildJobFiles(job, mine, products);
    memo.set(key, hit);
    if (memo.size > 12) memo.delete(memo.keys().next().value!);
    hit.catch(() => memo.delete(key));
  }
  return hit;
}

async function buildJobFiles(job: Pick<ProductionJob, "id" | "orderNumber" | "producer" | "createdAt">, lines: OrderLine[], products: ClubProduct[]): Promise<BuiltFile[]> {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(job.createdAt));
  const byId = new Map(products.map((p) => [p.id, p]));
  const groups = [...new Set(lines.map((l) => l.clubProductId))];
  const files: BuiltFile[] = [];
  const sheet: string[] = [];
  for (const [i, cpId] of groups.entries()) {
    const nr = String(i + 1).padStart(2, "0");
    const product = byId.get(cpId);
    const mineLines = lines.filter((l) => l.clubProductId === cpId);
    const title = product?.title ?? mineLines[0]?.title ?? cpId;
    const qty = mineLines.reduce((n, l) => n + l.qty, 0);
    sheet.push("", `${nr}  ${title} (${mineLines[0]?.sku ?? product?.sku ?? ""}), ${qty} st`);
    for (const l of mineLines) sheet.push(`    ${l.qty} × ${l.size ?? "One size"}`);
    const spec = product ? readSpec(product.spec) : null;
    try {
      if (!spec) throw new Error("Produkten saknar produktionsunderlag");
      const made = spec.kind === "halsduk" ? await scarfFiles(spec, date) : await garmentFiles(spec);
      const base = spec.kind === "plagg" ? baseById(spec.product.baseId) : undefined;
      if (base && spec.kind === "plagg") sheet.push(`    Plagg: ${base.name}, ${(spec.color?.name ?? colorName(spec.product.garment)).toLowerCase()} (${spec.product.garment}), ${zoneLabel(base, spec.print.zone).toLowerCase()}`);
      sheet.push(...made.about.map((a) => `    ${a}`));
      sheet.push("    Filer:");
      for (const f of made.files) {
        const name = `${nr}-${f.name}`;
        files.push({ name, label: `${title}: ${f.label}`, data: f.data });
        sheet.push(`      ${name}`);
      }
    } catch (e) {
      console.error("poc/build jobFiles", cpId, e instanceof Error ? e.message : e);
      sheet.push(`    Filerna kunde inte byggas: ${e instanceof Error ? e.message : "okänt fel"}`);
    }
  }
  const head = [`Arbetsorder ${job.orderNumber}`, `${PRODUCER_LABEL[job.producer]} · jobb ${job.id} · ${date}`, "", `${lines.reduce((n, l) => n + l.qty, 0)} st i ${groups.length} ${groups.length === 1 ? "produkt" : "produkter"}:`];
  return [{ name: "arbetsorder.txt", label: "Arbetsorder", data: Buffer.from([...head, ...sheet, ""].join("\r\n")) }, ...files];
}
