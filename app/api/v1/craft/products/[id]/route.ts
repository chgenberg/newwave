import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { catalogProduct } from "@/lib/poc/catalog";
import { getClubProduct, getDesign, orderCounts, setClubProducts } from "@/lib/poc/store";
import { shopProductView } from "../view";

const Body = z
  .object({
    /** "borttagen" tar bort produkten ur shoppen (den finns kvar för ordrarna som redan har den), "publicerad" lägger tillbaka den. */
    status: z.enum(["publicerad", "borttagen"]).optional(),
    /** Hela kronor; null går tillbaka till katalogpriset. */
    priceSek: z.number().int().positive().max(100_000).nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.priceSek !== undefined);

/** Ändrar en klubbprodukt i shoppen: tar bort den, lägger tillbaka den eller sätter priset. Kräver Crafts inloggning. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ange status eller pris (hela kronor)." }, { status: 400 });
  try {
    const product = await getClubProduct(id);
    if (!product) return Response.json({ error: "Produkten finns inte." }, { status: 404 });
    const { status, priceSek } = parsed.data;
    const price = priceSek === undefined ? {} : priceSek === null ? { priceSek: catalogProduct(product.sku)?.priceSek ?? product.priceSek, customPrice: false } : { priceSek, customPrice: true };
    const [changed] = await setClubProducts({ ids: [id] }, { ...(status ? { status } : {}), ...price });
    const [design, orders] = await Promise.all([getDesign(changed.designId), orderCounts([id])]);
    return Response.json({ product: shopProductView(changed, design ?? undefined, orders[id] ?? 0) });
  } catch (e) {
    console.error("craft/products/patch", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte ändra produkten." }, { status: 500 });
  }
}
