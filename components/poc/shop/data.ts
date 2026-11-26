import { getClubProduct, listClubProducts } from "@/lib/poc/store";
import type { ClubProduct } from "@/lib/poc/types";

/**
 * Crafts publicerade klubbprodukter för klubbshoppen. Går databasen inte att nå visas shoppen som förut, utan dem, i
 * stället för att hela sidan faller.
 */

export async function publishedClubProducts(clubId: string): Promise<ClubProduct[]> {
  try {
    return await listClubProducts({ clubId, status: "publicerad" });
  } catch (e) {
    console.error("[klubbshop] klubbprodukterna kunde inte läsas", e);
    return [];
  }
}

/** Klubbprodukten om den är publicerad och hör till klubben, annars null. */
export async function publishedClubProduct(clubId: string, id: string): Promise<ClubProduct | null> {
  try {
    const p = await getClubProduct(id);
    return p && p.clubId === clubId && p.status === "publicerad" ? p : null;
  } catch (e) {
    console.error("[klubbshop] klubbprodukten kunde inte läsas", e);
    return null;
  }
}
