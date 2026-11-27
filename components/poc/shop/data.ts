import { catalogProduct, sellable } from "@/lib/poc/catalog";
import { stockMap } from "@/lib/poc/hub/stock";
import { type ProductStock, productStock, specColor } from "@/lib/poc/hub/stock-rules";
import { getClubProduct, listClubProducts } from "@/lib/poc/store";
import type { ClubProduct } from "@/lib/poc/types";

/**
 * Crafts publicerade klubbprodukter för klubbshoppen. Går databasen inte att nå visas shoppen som förut, utan dem, i
 * stället för att hela sidan faller. En produkt som inte säljs längre (borttagen i New Waves hubb) visas inte.
 */

export async function publishedClubProducts(clubId: string): Promise<ClubProduct[]> {
  try {
    return (await listClubProducts({ clubId, status: "publicerad" })).filter((p) => sellable(p.sku));
  } catch (e) {
    console.error("[klubbshop] klubbprodukterna kunde inte läsas", e);
    return [];
  }
}

/** Klubbprodukten om den är publicerad och hör till klubben, annars null. Den kan ha slutat säljas (`sellable`). */
export async function publishedClubProduct(clubId: string, id: string): Promise<ClubProduct | null> {
  try {
    const p = await getClubProduct(id);
    return p && p.clubId === clubId && p.status === "publicerad" ? p : null;
  } catch (e) {
    console.error("[klubbshop] klubbprodukten kunde inte läsas", e);
    return null;
  }
}

/** Storlekarna som produkten säljs i; halsduken och plagg utan storlekar i one size. */
export const shopSizes = (p: Pick<ClubProduct, "sku">) => {
  const sizes = catalogProduct(p.sku)?.sizes ?? [];
  return sizes.length ? sizes : ["One size"];
};

/**
 * Lagret för klubbprodukterna, storlek för storlek i plaggets färg (lib/poc/hub/stock-rules.ts). Produkter vars artikel
 * hubben aldrig rapporterat säljs som förut, obegränsat. Går lagret inte att läsa säljs allt som förut – kassan prövar
 * lagret igen när ordern läggs.
 */
export async function shopStock(products: Pick<ClubProduct, "id" | "sku" | "spec">[]): Promise<Map<string, ProductStock>> {
  const out = new Map<string, ProductStock>();
  if (!products.length) return out;
  try {
    const stock = await stockMap([...new Set(products.map((p) => p.sku))]);
    for (const p of products) {
      const s = stock.get(p.sku);
      if (s) out.set(p.id, productStock(s, shopSizes(p), specColor(p.spec, catalogProduct(p.sku)?.colors)));
    }
  } catch (e) {
    console.error("[klubbshop] lagret kunde inte läsas", e instanceof Error ? e.message : e);
  }
  return out;
}
