import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BILAGA2, type Bilaga2Zone } from "@/lib/newwave/bilaga2";
import { type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { defaultDesign, type Design, maxCmIn, METHOD_INFO, zoneMethods, zonesFor } from "@/lib/newwave/marking";
import { surface } from "@/lib/newwave/printSurface";
import type { CatalogProduct } from "./types";

/**
 * POC-flödets katalog: Crafts plagg och den stickade klubbhalsduken. Produkterna kommer från New Waves hubb när hubben
 * skickat några (.data/poc/hub-products.json, skriven av lib/poc/hub/products.ts), annars från Crafts produktdata i
 * lib/poc/catalog-data.json (skriven av scripts/poc-import-catalog.ts), annars från platshållarna. Katalogen läses om
 * när filerna ändras, utan omstart (`pocCatalog`).
 * Varje plagg lånar foto, tryckyta och tryckmetod av ett plagg (`baseId`) – i New Waves katalog eller, för
 * sweatshirten och joggingbyxorna, Crafts egna nedan – så att mockuper och tryckfiler görs med samma motor som i dag.
 */

/** Halsduken säljs till samma pris som i klubbens godkännanden (lib/newwave/hubDelivery.ts). */
export const SCARF_PRICE_SEK = 199;
export const SCARF_SKU = "klubbhalsduk";

// ── Crafts egna plagg ───────────────────────────────────────────────────────

const WEAR = ["XS", "S", "M", "L", "XL", "XXL"];
const zone = (id: string, label: string, mm: [number, number], techniques: Bilaga2Zone["techniques"], offset: [number, number], startCm?: number): Bilaga2Zone => ({
  id,
  label,
  widthMm: mm[0],
  heightMm: mm[1],
  techniques,
  dir: [0, 0, 1],
  offset,
  startCm,
});
const hoodieZone = (id: string) => BILAGA2.hoodie.find((z) => z.id === id)!;

/**
 * Plagg som New Waves katalog saknar, med Crafts egna produktfoton (craftsportswear.com, se
 * public/poc/plagg/): foto, tryckytor och tryckmetod i samma form som lib/newwave/catalog.ts, så att mockuper,
 * färgval och tryckfiler görs med samma motor. Fotona är gjorda kvadratiska, med plagget centrerat. 3D-modellerna
 * kommer senare (Tripo).
 */
/** Basplaggen som bara finns i POC-flödet (sweatshirt och joggingbyxor ur Crafts egna produktbilder). */
export const POC_BASES: NwProduct[] = [
  {
    id: "poc-sweatshirt",
    name: "Sweatshirt",
    category: "Kläder",
    kind: "top",
    // Community 2.0 R Neck i färgen Tofu (art. 1915299-1050).
    garmentColor: "Tofu",
    garmentHex: "#E7E1D0",
    dark: false,
    priceSek: 549,
    sizes: WEAR,
    printArea: { widthCm: 43, heightCm: 36, method: "Screentryck" },
    // Mitt på bröstet (huvudtrycket) och bröstet, som hoodiens ytor i Bilaga 2.
    bilaga2: [{ ...hoodieZone("brost"), label: "Mitt på bröstet" }, { ...hoodieZone("vanster"), label: "Bröstet" }],
    seasons: ["höst", "vinter", "vår"],
    use: "läktaren, vardag och resor",
    photo: "/poc/plagg/sweatshirt-community-tofu.jpg",
    print: surface({ cx: 0.5, cy: 0.315, w: 0.25, h: 0.29, bend: 28, top: true }),
    chest: surface({ cx: 0.6, cy: 0.245, w: 0.1, h: 0.12, bend: 18, top: true }),
    model: null,
    zone: { dir: [0, 0, 1], offset: [0, 0.16] },
    sizeCm: 72,
    printCm: 22,
  },
  {
    id: "poc-joggingbyxor",
    name: "Joggingbyxor",
    category: "Kläder",
    kind: "top",
    // Community 2.0 Pants, svart (art. 1915305-999000), samma teamwearserie som sweatshirten.
    garmentColor: "Svart",
    garmentHex: "#111111",
    dark: true,
    priceSek: 499,
    sizes: WEAR,
    printArea: { widthCm: 12, heightCm: 12, method: "Transfer" },
    // Låret: på högra benet, mitt emot Crafts logga på det vänstra. 12 cm brett, så att ordmallen trycks hel (med
    // underraden) och inte i sin lilla version som bröstloggorna.
    bilaga2: [zone("lar", "Låret", [120, 120], ["transfer", "screentryck"], [-0.1, 0.12])],
    seasons: ["höst", "vinter", "vår"],
    use: "träning, uppvärmning och resor",
    photo: "/poc/plagg/joggingbyxor-community-svart.jpg",
    print: surface({ cx: 0.416, cy: 0.295, w: 0.095, h: 0.085, bend: 24 }),
    model: null,
    zone: { dir: [0, 0, 1], offset: [-0.1, 0.12] },
    sizeCm: 100,
    printCm: 12,
  },
];

/** Plaggets bas: Crafts egna plagg ovan, annars New Waves katalog. */
export const baseById = (id: string): NwProduct | undefined => POC_BASES.find((p) => p.id === id) ?? nwProduct(id);

/** Fotot hör till Crafts egna plagg (public/poc/plagg/), inte New Waves katalog. */
export const isPocBase = (p: Pick<NwProduct, "id">) => POC_BASES.some((b) => b.id === p.id);

/** Platshållarplaggen: artikelnummer, namn och plagget som de lånar foto och tryckyta av. */
const GARMENTS: [sku: string, name: string, baseId: string][] = [
  ["craft-t-shirt", "Craft T-shirt", "p001"],
  ["craft-hoodie", "Craft Hoodie", "p004"],
  ["craft-sweatshirt", "Craft Sweatshirt", "poc-sweatshirt"],
  ["craft-joggingbyxor", "Craft Joggingbyxor", "poc-joggingbyxor"],
  // Träningsjackan (p006), västen (p010) och mössan (p012) är borta: flödet har inget broderi, och enligt New Waves
  // Bilaga 2 tar deras bröst och framsida bara broderi. Mössan kan komma tillbaka som stickad hos stickeriet.
];

/**
 * Basplaggets design i flödet. Flödet har två producenter – tryckeriet och stickeriet – och inget broderi
 * (Christophers beslut, november 2026). Broderar baskatalogen trycks märket med transfer, eller screentryck, på första
 * ytan som tar det enligt Bilaga 2; tar ingen yta tryck går plagget inte att göra här, och då ger funktionen null.
 */
export function pocDesign(base: NwProduct): Design | null {
  const d = defaultDesign(base);
  if (d.method !== "brodyr") return d;
  for (const method of ["transfer", "screentryck"] as const) {
    const zone = zonesFor(base).find((z) => zoneMethods(base, z.id).includes(method));
    if (zone) return { ...d, method, colors: METHOD_INFO[method].fixedColors ?? 1, zone: zone.id, sizeCm: Math.min(maxCmIn(base, zone.id), Math.max(2, Math.round(base.printCm))) };
  }
  return null;
}

/** Tryckmetoden som plagget får i flödet, för katalogen och Crafts sidor. */
export const methodLabelOf = (base: NwProduct) => {
  const d = pocDesign(base);
  return d ? METHOD_INFO[d.method].label : "Går inte att trycka";
};

const SCARF: CatalogProduct = { sku: SCARF_SKU, name: "Stickad klubbhalsduk", kind: "halsduk", priceSek: SCARF_PRICE_SEK, sizes: ["One size"], placeholder: false };

const PLACEHOLDERS: CatalogProduct[] = GARMENTS.map(([sku, name, baseId]): CatalogProduct => {
  const base = baseById(baseId);
  if (!base) throw new Error(`${baseId} saknas i katalogen`);
  return { sku, name, kind: "plagg", priceSek: base.priceSek, sizes: base.sizes, baseId, placeholder: true };
});

/** Ett artikelnummer som går att ha i adresser och filnamn: bokstäver, siffror, punkt, bindestreck och understreck. */
export const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/** Fälten i en produkt, utan kontrollerna mellan dem (de ligger i `rowRules`). */
const CatalogRowFields = z.object({
  sku: z.string().regex(SKU, "artikelnumret får bara ha bokstäver, siffror, punkt, bindestreck och understreck (högst 40 tecken)"),
  name: z.string().trim().min(1, "namnet saknas").max(80, "namnet är längre än 80 tecken"),
  kind: z.enum(["plagg", "halsduk"], "slaget ska vara plagg eller halsduk"),
  priceSek: z.number("priset ska vara ett tal").int("priset ska vara hela kronor").positive("priset ska vara större än 0").max(100_000, "priset är orimligt högt"),
  sizes: z.array(z.string().trim().min(1).max(20, "en storlek är längre än 20 tecken")).min(1, "storlekar saknas").max(30, "fler än 30 storlekar"),
  colors: z.array(z.object({ name: z.string().trim().min(1).max(40), hex: z.string().regex(/^#[0-9A-F]{6}$/, "färgkoden ska vara #RRGGBB") })).max(20, "fler än 20 färger").default([]),
  baseId: z.string().optional(),
});

/** Plagg har ett basplagg som finns; halsduken stickas och har inget. */
function rowRules(p: z.infer<typeof CatalogRowFields>, ctx: z.RefinementCtx) {
  if (p.kind === "plagg" && !p.baseId) ctx.addIssue({ code: "custom", path: ["baseId"], message: "basplagg saknas – vilket plagg i New Waves katalog ger foto och tryckyta" });
  if (p.kind === "plagg" && p.baseId && !baseById(p.baseId)) ctx.addIssue({ code: "custom", path: ["baseId"], message: `basplagget ${p.baseId} finns inte i katalogen` });
  if (p.kind === "halsduk" && p.baseId) ctx.addIssue({ code: "custom", path: ["baseId"], message: "halsduken stickas och har inget basplagg" });
}

/** En produkt i lib/poc/catalog-data.json. Importskriptet kontrollerar samma sak, rad för rad. */
export const CatalogRowSchema = CatalogRowFields.superRefine(rowRules);
export type CatalogRow = z.infer<typeof CatalogRowSchema>;

export const CatalogFileSchema = z.object({
  importedAt: z.string(),
  source: z.string().optional(),
  products: z
    .array(CatalogRowSchema)
    .min(1)
    .refine((list) => new Set(list.map((p) => p.sku)).size === list.length, "samma artikelnummer finns flera gånger"),
});

export const CATALOG_DATA_FILE = path.join(process.cwd(), "lib", "poc", "catalog-data.json");

/**
 * En produkt från New Waves hubb (lib/poc/hub/products.ts): samma regler som Crafts importerade produktdata, och
 * plagget måste gå att trycka – flödet har inget broderi.
 */
export const HubProductSchema = CatalogRowFields.extend({
  images: z.array(z.string().max(1000)).max(20, "fler än 20 bilder").default([]),
  active: z.boolean().default(true),
}).superRefine((p, ctx) => {
  rowRules(p, ctx);
  const base = p.kind === "plagg" && p.baseId ? baseById(p.baseId) : undefined;
  if (base && !pocDesign(base)) ctx.addIssue({ code: "custom", path: ["baseId"], message: `basplagget ${base.id} (${base.name}) går bara att brodera, och flödet har bara tryck och stickning` });
});

/** Hubbens produkter som de sparas: med tiden de senast ändrades. */
const HubStoredProduct = CatalogRowFields.extend({ images: z.array(z.string()).default([]), active: z.boolean().default(true), updatedAt: z.string() });
export type HubStoredProduct = z.infer<typeof HubStoredProduct>;

/** En produkt som hubben skickat men som inte kunde tas in, och varför. */
export type HubRejection = { sku: string; name?: string; reasons: string[]; at: string };

/**
 * Hubbens katalog, som lib/poc/hub/products.ts skriver den. `products` är alla produkter hubben skickat, också de som
 * inte säljs längre (`active: false`), så att gamla ordrar och klubbprodukter fortfarande har namn, foto och tryckyta.
 * `retired`: artikelnummer som hubben tagit bort utan att ha skickat dem som produkter (t.ex. ur Crafts importerade
 * produktdata). `rejected`: produkter som inte kunde tas in.
 */
export type HubCatalogFile = { v: 1; updatedAt: string; products: HubStoredProduct[]; retired: string[]; rejected: HubRejection[] };

/**
 * Hubbens katalog på volymen (i produktion /app/.data, som är beständig). Skrivs atomiskt (en ny fil som byter namn),
 * så att den aldrig läses halvskriven.
 */
export const HUB_PRODUCTS_FILE = path.join(process.cwd(), ".data", "poc", "hub-products.json");

const HubFileShape = z.object({
  v: z.literal(1),
  updatedAt: z.string(),
  products: z.array(z.unknown()).default([]),
  retired: z.array(z.string()).default([]),
  rejected: z.array(z.object({ sku: z.string(), name: z.string().optional(), reasons: z.array(z.string()), at: z.string() })).default([]),
});

/**
 * Hubbens katalog, eller null om hubben inte skickat några produkter. En produkt som inte längre stämmer (t.ex. ett
 * basplagg som försvunnit) hoppas över för sig, så att resten av katalogen finns kvar.
 */
export function readHubFile(): HubCatalogFile | null {
  let raw: string;
  try {
    raw = readFileSync(HUB_PRODUCTS_FILE, "utf8");
  } catch {
    return null;
  }
  try {
    const file = HubFileShape.parse(JSON.parse(raw));
    const products: HubStoredProduct[] = [];
    for (const item of file.products) {
      const p = HubStoredProduct.safeParse(item);
      if (p.success) products.push(p.data);
      else console.error("poc/catalog: en produkt från hubben går inte att läsa och hoppas över:", (item as { sku?: unknown })?.sku, p.error.issues[0]?.message);
    }
    return { ...file, products };
  } catch (e) {
    console.error("poc/catalog: .data/poc/hub-products.json går inte att läsa – hubbens produkter används inte:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Crafts produktdata, om den importerats och är giltig; annars null (och platshållarna används). */
function imported(): { products: CatalogProduct[]; importedAt: string } | null {
  let raw: string;
  try {
    raw = readFileSync(CATALOG_DATA_FILE, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = CatalogFileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { products: parsed.data.products.map((p): CatalogProduct => ({ ...p, colors: p.colors.length ? p.colors : undefined, placeholder: false })), importedAt: parsed.data.importedAt };
    console.error("poc/catalog: lib/poc/catalog-data.json är ogiltig – platshållarna används:", parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  } catch (e) {
    console.error("poc/catalog: lib/poc/catalog-data.json går inte att läsa – platshållarna används:", e instanceof Error ? e.message : e);
  }
  return null;
}

// ── Katalogen medan servern kör ─────────────────────────────────────────────

/** Var katalogen kommer ifrån: New Waves hubb, Crafts importerade produktdata eller platshållarna. "inbyggd" är halsduken när ingen källa har en. */
export type CatalogSource = "hubb" | "import" | "platshållare" | "inbyggd";

/** En produkt i katalogen: var den kommer ifrån och om den säljs (`active`). */
export type CatalogEntry = CatalogProduct & { source: CatalogSource; active: boolean; updatedAt?: string };

/** Bara det som går att göra med tryck eller stickning; ett importerat plagg som bara kan broderas visas inte. */
const printable = (p: CatalogProduct) => p.kind === "halsduk" || !p.baseId || Boolean(baseById(p.baseId) && pocDesign(baseById(p.baseId)!));

type Snapshot = { key: string; checkedAt: number; source: Exclude<CatalogSource, "inbyggd">; updatedAt?: string; active: CatalogEntry[]; bySku: Map<string, CatalogEntry> };

/**
 * Katalogen ur källorna, i ordning: hubbens produkter om hubben skickat några, annars Crafts importerade produktdata,
 * annars platshållarna. Halsduken finns alltid: har källan ingen som säljs läggs klubbhalsduken till. Produkter som
 * inte säljs längre (borttagna i hubben, eller ur en källa som inte används) finns kvar för uppslag, så att gamla
 * klubbprodukter och ordrar har namn, foto och tryckyta.
 */
function build(key: string): Snapshot {
  const hub = readHubFile();
  const imp = imported();
  const retired = new Set(hub?.retired ?? []);
  const fromHub = hub?.products.length ? hub.products.map((p): CatalogEntry => ({ sku: p.sku, name: p.name, kind: p.kind, priceSek: p.priceSek, sizes: p.sizes, ...(p.baseId ? { baseId: p.baseId } : {}), ...(p.colors.length ? { colors: p.colors } : {}), placeholder: false, source: "hubb", active: p.active, updatedAt: p.updatedAt })) : null;
  const fromImport = imp?.products.map((p): CatalogEntry => ({ ...p, source: "import", active: true, updatedAt: imp.importedAt })) ?? null;
  const fromPlaceholders = PLACEHOLDERS.map((p): CatalogEntry => ({ ...p, source: "platshållare", active: true }));
  const source: Snapshot["source"] = fromHub ? "hubb" : fromImport ? "import" : "platshållare";
  // Det hubben tagit bort säljs inte, ur vilken källa det än kommer – utom halsduken, som alltid finns.
  const primary = (fromHub ?? fromImport ?? fromPlaceholders).filter(printable).map((p) => (retired.has(p.sku) && p.sku !== SCARF_SKU ? { ...p, active: false } : p));
  const active = primary.filter((p) => p.active);
  if (!active.some((p) => p.kind === "halsduk")) active.push({ ...SCARF, source: "inbyggd", active: true });
  const bySku = new Map<string, CatalogEntry>();
  for (const p of active) bySku.set(p.sku, p);
  for (const list of [primary, fromHub ?? [], fromImport ?? [], fromPlaceholders, [{ ...SCARF, source: "inbyggd" as const, active: false }]])
    for (const p of list) if (!bySku.has(p.sku) && printable(p)) bySku.set(p.sku, { ...p, active: false });
  return { key, checkedAt: Date.now(), source, updatedAt: source === "hubb" ? hub?.updatedAt : source === "import" ? imp?.importedAt : undefined, active, bySku };
}

/** Hur ofta filerna kontrolleras (ändringstiden), så att varje uppslag inte behöver fråga filsystemet. */
const CHECK_MS = 1000;
let current: Snapshot | null = null;

const stamp = (file: string) => {
  const s = statSync(file, { throwIfNoEntry: false });
  return s ? `${s.mtimeMs}:${s.size}` : "-";
};

function snapshot(): Snapshot {
  const now = Date.now();
  if (current && now - current.checkedAt < CHECK_MS) return current;
  const key = `${stamp(HUB_PRODUCTS_FILE)}|${stamp(CATALOG_DATA_FILE)}`;
  if (current?.key === key) {
    current.checkedAt = now;
    return current;
  }
  current = build(key);
  return current;
}

/** Läser om katalogen direkt, efter att hubbens produkter skrivits i den här processen. */
export function reloadCatalog() {
  current = null;
}

/**
 * Katalogen som säljs just nu: produkterna Craft kan publicera och kunderna kan köpa, med halsduken. Synkron; läses om
 * när hubben ändrat produkterna eller Crafts produktdata importerats, utan omstart.
 */
export const pocCatalog = (): CatalogEntry[] => snapshot().active;

/**
 * Produkten med artikelnumret, också om den inte säljs längre (`active: false`) – så att gamla klubbprodukter och ordrar
 * fortfarande har namn, foto och tryckyta. Om den går att köpa avgör `sellable`.
 */
export const catalogProduct = (sku: string): CatalogEntry | undefined => snapshot().bySku.get(sku);

/** Produkten finns i katalogen och säljs: går att publicera och köpa. */
export const sellable = (sku: string) => snapshot().bySku.get(sku)?.active === true;

/** Var katalogen kommer ifrån och när den senast ändrades, för Crafts sidor och integrationssidan. */
export function catalogInfo(): { source: Snapshot["source"]; updatedAt?: string; count: number } {
  const s = snapshot();
  return { source: s.source, updatedAt: s.updatedAt, count: s.active.length };
}

/** Plaggets bas: foto, tryckyta och tryckmetod. */
export const baseProduct = (p: Pick<CatalogProduct, "baseId">) => (p.baseId ? baseById(p.baseId) : undefined);
