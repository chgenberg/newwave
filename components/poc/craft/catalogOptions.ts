import { garmentOptions, recolorable } from "@/lib/poc/build";
import { baseProduct, catalogInfo, methodLabelOf, pocCatalog } from "@/lib/poc/catalog";
import { stockMap } from "@/lib/poc/hub/stock";
import type { SkuStock } from "@/lib/poc/hub/stock-rules";
import type { ProductOption } from "./CollectionBuilder";

/**
 * Katalogen för Crafts sidor (klubbkollektionen och shopparna): produkterna som säljs, med foto, tryckmetod, färgerna
 * plagget kan få och lagret i New Waves hubb. Går lagret inte att läsa visas produkterna utan det.
 */
export async function productOptions(opts: { scarfPhoto?: string } = {}): Promise<ProductOption[]> {
  const catalog = pocCatalog();
  let stock = new Map<string, SkuStock>();
  try {
    stock = await stockMap(catalog.map((p) => p.sku));
  } catch (e) {
    console.error("craft: lagret kunde inte läsas", e instanceof Error ? e.message : e);
  }
  return catalog.map((entry): ProductOption => {
    const { source: _source, active: _active, updatedAt: _updated, ...p } = entry;
    void [_source, _active, _updated];
    const s = stock.get(p.sku);
    const base = baseProduct(p);
    if (!base) return { ...p, ...(opts.scarfPhoto ? { photo: opts.scarfPhoto } : {}), ...(s ? { stock: s } : {}) };
    // Klubbens mörkaste färg går när tryckkedjan klarar färgade plagg och Craft inte har egna färger för plagget.
    return { ...p, photo: base.photo, method: methodLabelOf(base), colorOptions: garmentOptions(p, base), clubColor: recolorable(base) && !(p.colors && p.colors.length >= 2), ...(s ? { stock: s } : {}) };
  });
}

const when = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

/** Var produkterna kommer ifrån, för rubriken över produktvalet. */
export function catalogNote(): string {
  const { source, updatedAt } = catalogInfo();
  const at = updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? when.format(new Date(updatedAt)) : null;
  if (source === "hubb") return `produkter och lager från New Waves hubb${at ? `, uppdaterade ${at}` : ""}`;
  if (source === "import") return `Crafts produktdata${at ? `, importerad ${at}` : ""}`;
  return "plaggen är platshållare tills Crafts produktdata finns";
}
