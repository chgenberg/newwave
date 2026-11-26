import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BILAGA2, type Bilaga2Zone } from "@/lib/newwave/bilaga2";
import { type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { surface } from "@/lib/newwave/printSurface";
import type { CatalogProduct } from "./types";

/**
 * POC-flödets katalog: Crafts plagg och den stickade klubbhalsduken. Crafts riktiga produktdata läses från
 * lib/poc/catalog-data.json när den finns (den skrivs av scripts/poc-import-catalog.ts); annars används platshållare.
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
  ["craft-traningsjacka", "Craft Träningsjacka", "p006"],
  ["craft-vast", "Craft Väst", "p010"],
  ["craft-mossa", "Craft Mössa", "p012"],
];

const SCARF: CatalogProduct = { sku: SCARF_SKU, name: "Stickad klubbhalsduk", kind: "halsduk", priceSek: SCARF_PRICE_SEK, sizes: ["One size"], placeholder: false };

const PLACEHOLDERS: CatalogProduct[] = GARMENTS.map(([sku, name, baseId]): CatalogProduct => {
  const base = baseById(baseId);
  if (!base) throw new Error(`${baseId} saknas i katalogen`);
  return { sku, name, kind: "plagg", priceSek: base.priceSek, sizes: base.sizes, baseId, placeholder: true };
});

/** Ett artikelnummer som går att ha i adresser och filnamn: bokstäver, siffror, punkt, bindestreck och understreck. */
export const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/** En produkt i lib/poc/catalog-data.json. Importskriptet kontrollerar samma sak, rad för rad. */
export const CatalogRowSchema = z
  .object({
    sku: z.string().regex(SKU, "artikelnumret får bara ha bokstäver, siffror, punkt, bindestreck och understreck (högst 40 tecken)"),
    name: z.string().trim().min(1, "namnet saknas").max(80, "namnet är längre än 80 tecken"),
    kind: z.enum(["plagg", "halsduk"], "slaget ska vara plagg eller halsduk"),
    priceSek: z.number("priset ska vara ett tal").int("priset ska vara hela kronor").positive("priset ska vara större än 0").max(100_000, "priset är orimligt högt"),
    sizes: z.array(z.string().trim().min(1).max(20, "en storlek är längre än 20 tecken")).min(1, "storlekar saknas").max(30, "fler än 30 storlekar"),
    colors: z.array(z.object({ name: z.string().trim().min(1).max(40), hex: z.string().regex(/^#[0-9A-F]{6}$/, "färgkoden ska vara #RRGGBB") })).max(20, "fler än 20 färger").default([]),
    baseId: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "plagg" && !p.baseId) ctx.addIssue({ code: "custom", path: ["baseId"], message: "basplagg saknas – vilket plagg i New Waves katalog ger foto och tryckyta" });
    if (p.kind === "plagg" && p.baseId && !baseById(p.baseId)) ctx.addIssue({ code: "custom", path: ["baseId"], message: `basplagget ${p.baseId} finns inte i katalogen` });
    if (p.kind === "halsduk" && p.baseId) ctx.addIssue({ code: "custom", path: ["baseId"], message: "halsduken stickas och har inget basplagg" });
  });
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

/** Crafts produktdata, om den importerats och är giltig; annars null (och platshållarna används). */
function imported(): CatalogProduct[] | null {
  let raw: string;
  try {
    raw = readFileSync(CATALOG_DATA_FILE, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = CatalogFileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      const products = parsed.data.products.map((p): CatalogProduct => ({ ...p, colors: p.colors.length ? p.colors : undefined, placeholder: false }));
      return products.some((p) => p.kind === "halsduk") ? products : [...products, SCARF];
    }
    console.error("poc/catalog: lib/poc/catalog-data.json är ogiltig – platshållarna används:", parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  } catch (e) {
    console.error("poc/catalog: lib/poc/catalog-data.json går inte att läsa – platshållarna används:", e instanceof Error ? e.message : e);
  }
  return null;
}

export const POC_CATALOG: CatalogProduct[] = imported() ?? [...PLACEHOLDERS, SCARF];

export const catalogProduct = (sku: string) => POC_CATALOG.find((p) => p.sku === sku);

/** Plaggets bas: foto, tryckyta och tryckmetod. */
export const baseProduct = (p: Pick<CatalogProduct, "baseId">) => (p.baseId ? baseById(p.baseId) : undefined);
