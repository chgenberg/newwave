import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogInfo, catalogProduct, type CatalogSource, type HubCatalogFile, HubProductSchema, HUB_PRODUCTS_FILE, type HubRejection, type HubStoredProduct, readHubFile, reloadCatalog, SCARF_SKU } from "../catalog";
import { query } from "../db";
import type { HubProduct } from "./types";

/**
 * Produkterna från New Waves hubb: artikelnummer, namn, pris, storlekar och färger. De sparas atomiskt som JSON på
 * volymen (.data/poc/hub-products.json, i produktion /app/.data) och blir katalogen (`pocCatalog` i lib/poc/catalog.ts)
 * så snart hubben skickat en, utan omstart. Varje produkt prövas med samma regler som Crafts importerade produktdata;
 * de som inte kan tas in sparas med orsaken (`productSummary`), så att Craft ser vad som saknas och varför.
 *
 * Priset: klubbprodukter utan eget pris (`custom_price`) följer hubbens nya pris; de som Craft satt priset på behåller
 * sitt. Ordrar som redan lagts behåller sitt pris. En produkt som tas bort (eller kommer med `active: false`) säljs inte
 * längre, men finns kvar för gamla ordrar och klubbprodukter.
 */

/** Hur många avvisade produkter som sparas, de senaste först. */
const MAX_REJECTED = 200;

const g = globalThis as unknown as { pocHubProductsLock?: Promise<unknown> };

/** En ändring av filen åt gången i processen (hubbens händelser kan behandlas samtidigt). Det finns bara en instans. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = (g.pocHubProductsLock ?? Promise.resolve()).then(fn, fn);
  g.pocHubProductsLock = run.catch(() => {});
  return run;
}

const emptyFile = (): HubCatalogFile => ({ v: 1, updatedAt: new Date().toISOString(), products: [], retired: [], rejected: [] });

async function save(file: HubCatalogFile) {
  await mkdir(path.dirname(HUB_PRODUCTS_FILE), { recursive: true });
  const tmp = `${HUB_PRODUCTS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 1)}\n`);
  await rename(tmp, HUB_PRODUCTS_FILE);
  reloadCatalog();
}

/** Fälten som de kommer, städade: färgkoder med versaler, hela kronor, halsduken i one size om storlekar saknas. */
function tidy(p: HubProduct): unknown {
  if (!p || typeof p !== "object") return p;
  const sizes = (Array.isArray(p.sizes) ? p.sizes : []).map((s) => String(s).trim()).filter(Boolean);
  return {
    sku: typeof p.sku === "string" ? p.sku.trim() : p.sku,
    name: typeof p.name === "string" ? p.name.trim() : p.name,
    kind: p.kind,
    priceSek: typeof p.priceSek === "number" && Number.isFinite(p.priceSek) ? Math.round(p.priceSek) : p.priceSek,
    sizes: sizes.length || p.kind !== "halsduk" ? [...new Set(sizes)] : ["One size"],
    colors: Array.isArray(p.colors) ? p.colors.map((c) => ({ name: typeof c?.name === "string" ? c.name.trim() : c?.name, hex: typeof c?.hex === "string" ? c.hex.trim().toUpperCase() : c?.hex })) : p.colors,
    baseId: typeof p.baseId === "string" && p.baseId.trim() ? p.baseId.trim() : undefined,
    images: p.images,
    active: p.active,
  };
}

const LABEL: Record<string, string> = { sku: "artikelnummer", name: "namn", kind: "slag", priceSek: "pris", sizes: "storlekar", colors: "färger", baseId: "basplagg", images: "bilder", active: "aktiv" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type ApplyProductsResult = { ok: boolean; message: string; added: string[]; updated: string[]; rejected: HubRejection[]; prices: number };

/**
 * Lägger till och uppdaterar hubbens produkter. Varje produkt prövas för sig: de som stämmer sparas, de andra sparas
 * som avvisade med orsaken (t.ex. ett plagg utan basplagg för foto och tryckytor). Klubbprodukter utan eget pris får
 * hubbens nya pris. `ok: false` bara när ingen produkt gick att ta in.
 */
export async function applyProducts(products: HubProduct[]): Promise<ApplyProductsResult> {
  const at = new Date().toISOString();
  const accepted = new Map<string, HubStoredProduct>();
  const rejected = new Map<string, HubRejection>();
  for (const raw of Array.isArray(products) ? products : []) {
    const parsed = HubProductSchema.safeParse(tidy(raw));
    const sku = typeof raw?.sku === "string" && raw.sku.trim() ? raw.sku.trim() : "(utan artikelnummer)";
    if (parsed.success) {
      rejected.delete(sku);
      accepted.set(parsed.data.sku, { ...parsed.data, updatedAt: at });
    } else {
      accepted.delete(sku);
      const reasons = [...new Set(parsed.error.issues.map((i) => `${LABEL[String(i.path[0])] ?? i.path.join(".")}: ${i.message}`))];
      rejected.set(sku, { sku, ...(typeof raw?.name === "string" && raw.name.trim() ? { name: raw.name.trim().slice(0, 120) } : {}), reasons, at });
    }
  }

  const { added, updated } = await locked(async () => {
    const file = readHubFile() ?? emptyFile();
    const bySku = new Map(file.products.map((p) => [p.sku, p]));
    const added: string[] = [];
    const updated: string[] = [];
    for (const p of accepted.values()) {
      (bySku.has(p.sku) ? updated : added).push(p.sku);
      bySku.set(p.sku, p);
    }
    const now = [...rejected.values()];
    const keep = file.rejected.filter((r) => !accepted.has(r.sku) && !rejected.has(r.sku));
    await save({
      v: 1,
      updatedAt: at,
      // Nya produkter sist, så att ordningen hubben skickade dem i behålls.
      products: [...bySku.values()],
      retired: file.retired.filter((s) => !accepted.has(s) || !accepted.get(s)!.active),
      rejected: [...now, ...keep].slice(0, MAX_REJECTED),
    });
    return { added, updated };
  });

  // Klubbprodukter utan eget pris följer hubbens pris. Går databasen inte att nå kastas felet, så att hubben skickar
  // om; filen ovan blir då densamma igen.
  const priced = [...accepted.values()].filter((p) => p.active);
  let prices = 0;
  if (priced.length) {
    const res = await query(
      `UPDATE club_products c SET price_sek = t.price, updated_at = now()
       FROM unnest($1::text[], $2::numeric[]) AS t(sku, price)
       WHERE c.sku = t.sku AND NOT c.custom_price AND c.price_sek <> t.price
       RETURNING c.id`,
      [priced.map((p) => p.sku), priced.map((p) => p.priceSek)],
    );
    prices = res.length;
  }

  const rej = [...rejected.values()];
  const inactive = [...accepted.values()].filter((p) => !p.active).length;
  const message = [
    accepted.size ? `${plural(accepted.size, "produkt", "produkter")} in (${[added.length ? `${added.length} nya` : "", updated.length ? `${updated.length} ändrade` : ""].filter(Boolean).join(", ")})` : "Inga produkter in",
    inactive ? `${inactive} säljs inte längre` : "",
    prices ? `${plural(prices, "klubbprodukt", "klubbprodukter")} fick nytt pris` : "",
    rej.length ? `${rej.length} ${rej.length === 1 ? "avvisad" : "avvisade"}: ${rej.slice(0, 3).map((r) => `${r.sku} (${r.reasons.join("; ")})`).join(", ")}${rej.length > 3 ? " …" : ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  console.log("poc/hubb produkter", message);
  return { ok: accepted.size > 0 || !rej.length, message, added, updated, rejected: rej, prices };
}

/**
 * Hubben har tagit bort produkterna: de säljs inte längre (klubbprodukterna med dem syns inte i shoppen och går inte att
 * beställa), men finns kvar för gamla ordrar. Ett artikelnummer som hubben aldrig skickat som produkt (t.ex. ur Crafts
 * importerade produktdata) slutar också säljas. Klubbhalsduken finns alltid.
 */
export async function deleteProducts(skus: string[]): Promise<{ ok: true; message: string; removed: string[] }> {
  const list = [...new Set((Array.isArray(skus) ? skus : []).map((s) => String(s).trim()).filter(Boolean))];
  const kept = list.filter((s) => s === SCARF_SKU);
  const removed = await locked(async () => {
    const file = readHubFile() ?? emptyFile();
    const at = new Date().toISOString();
    const known = new Set(file.products.map((p) => p.sku));
    const out: string[] = [];
    const products = file.products.map((p) => {
      if (!list.includes(p.sku) || !p.active) return p;
      out.push(p.sku);
      return { ...p, active: false, updatedAt: at };
    });
    const retired = new Set(file.retired);
    for (const s of list)
      if (!known.has(s) && s !== SCARF_SKU && !retired.has(s)) {
        retired.add(s);
        if (catalogProduct(s)) out.push(s);
      }
    await save({ ...file, v: 1, updatedAt: at, products, retired: [...retired] });
    return out;
  });
  const message = [removed.length ? `${plural(removed.length, "produkt", "produkter")} säljs inte längre: ${removed.slice(0, 5).join(", ")}${removed.length > 5 ? " …" : ""}` : "Inga produkter att ta bort", kept.length ? "klubbhalsduken finns alltid" : ""].filter(Boolean).join(", ");
  console.log("poc/hubb produkter", message);
  return { ok: true, message, removed };
}

export type ProductSummary = {
  /** Var katalogen kommer ifrån nu: hubben, Crafts importerade produktdata eller platshållarna. */
  source: Exclude<CatalogSource, "inbyggd">;
  /** När hubben senast ändrade produkterna. */
  updatedAt?: string;
  /** Hubbens produkter som säljs, och de som inte säljs längre. */
  count: number;
  inactive: number;
  /** Produkterna i katalogen just nu, med halsduken. */
  catalog: number;
  /** Produkter som hubben skickat men som inte kunde tas in, och varför – de senaste först. */
  rejected: HubRejection[];
  /** Artikelnummer som hubben tagit bort utan att ha skickat dem som produkter. */
  retired: string[];
};

/** Hubbens produkter i siffror, och de som inte kunde tas in, för Crafts integrationssida. */
export async function productSummary(): Promise<ProductSummary> {
  const file = readHubFile();
  const info = catalogInfo();
  return {
    source: info.source,
    updatedAt: file?.updatedAt,
    count: file?.products.filter((p) => p.active).length ?? 0,
    inactive: file?.products.filter((p) => !p.active).length ?? 0,
    catalog: info.count,
    rejected: file?.rejected ?? [],
    retired: file?.retired ?? [],
  };
}
