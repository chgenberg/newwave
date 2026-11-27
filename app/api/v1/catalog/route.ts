import { garmentOptions } from "@/lib/poc/build";
import { baseProduct, catalogInfo, methodLabelOf, pocCatalog } from "@/lib/poc/catalog";
import { stockMap } from "@/lib/poc/hub/stock";
import { colorRef, productStock, type SkuStock, stockColors } from "@/lib/poc/hub/stock-rules";

export const dynamic = "force-dynamic";

/** Lagret per storlek; `available` är null när saldot inte räknas (hubben har inte rapporterat artikeln). */
const sizesOf = (s: ReturnType<typeof productStock>) => s.sizes.map((x) => ({ size: x.size, state: x.state, available: x.available, ...(x.incoming ? { incoming: x.incoming } : {}), ...(x.eta ? { eta: x.eta } : {}) }));

/**
 * Katalogen: produkterna som säljs – från New Waves hubb, Crafts importerade produktdata eller platshållarna (`source`)
 * – och halsduken, med plaggens produktfoto, tryckmetod och färgerna plagget kan få (`colorOptions`; klubbens mörkaste
 * färg kan tillkomma per klubb). `stock` är lagret per storlek (alla färger ihop) och, när hubben rapporterar färger,
 * per färg: `tracked: false` betyder att artikeln säljs obegränsat.
 */
export async function GET() {
  const catalog = pocCatalog();
  const info = catalogInfo();
  let stock = new Map<string, SkuStock>();
  let stockError: string | undefined;
  try {
    stock = await stockMap(catalog.map((p) => p.sku));
  } catch (e) {
    console.error("catalog: lagret kunde inte läsas", e instanceof Error ? e.message : e);
    stockError = "Lagret kunde inte läsas just nu";
  }
  const products = catalog.map((p) => {
    const base = baseProduct(p);
    const s = stock.get(p.sku);
    const all = productStock(s, p.sizes);
    const colors = stockColors(s).map((color) => {
      const known = p.colors?.find((c) => c.name.toLowerCase() === color.toLowerCase() || c.hex.toLowerCase() === color.toLowerCase());
      return { color, sizes: sizesOf(productStock(s, p.sizes, colorRef(known ?? (/^#?[0-9a-f]{6}$/i.test(color) ? { hex: color.startsWith("#") ? color : `#${color}` } : { name: color }), p.colors))) };
    });
    // Metoden som plagget verkligen trycks med i flödet (inget broderi, se pocDesign).
    return {
      ...p,
      ...(base ? { photo: base.photo, method: methodLabelOf(base), colorOptions: garmentOptions(p, base) } : {}),
      stock: { tracked: all.tracked, label: all.label?.text ?? null, sizes: sizesOf(all), ...(colors.length ? { colors } : {}) },
    };
  });
  return Response.json({ source: info.source, updatedAt: info.updatedAt ?? null, ...(stockError ? { stockError } : {}), products });
}
