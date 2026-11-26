import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { AUTO_COLOR, clubProductDrafts, ColorChoices, pocClub, VariantChoiceSchema } from "@/lib/poc/build";
import { catalogProduct } from "@/lib/poc/catalog";
import { getDesign, listClubProducts, listDesigns, orderCounts, upsertClubProducts } from "@/lib/poc/store";
import { shopProductView } from "./view";

export const maxDuration = 60;

const CLUB = z.string().regex(/^[a-z0-9-]{1,80}$/);

/**
 * En klubbs alla klubbprodukter, från alla designer och med alla statusar, för Crafts shopvy: bild, titel, pris,
 * status och hur många ordrar som har produkten. Kräver Crafts inloggning.
 */
export async function GET(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const clubId = CLUB.safeParse(new URL(req.url).searchParams.get("clubId"));
  if (!clubId.success) return Response.json({ error: "Ange klubben (clubId)." }, { status: 400 });
  try {
    const [products, designs] = await Promise.all([listClubProducts({ clubId: clubId.data }), listDesigns()]);
    const byId = new Map(designs.map((d) => [d.id, d]));
    const orders = await orderCounts(products.map((p) => p.id));
    return Response.json({ products: products.map((p) => shopProductView(p, byId.get(p.designId), orders[p.id] ?? 0)) });
  } catch (e) {
    console.error("craft/products", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte läsa klubbens produkter." }, { status: 500 });
  }
}

const Body = z.object({
  clubId: CLUB,
  designId: z.string().min(1).max(40),
  sku: z.string().min(1).max(40),
  /** Ordmallens texter i produkten; saknas = mallens egna. */
  variant: VariantChoiceSchema.optional(),
  /** Plaggets färg: "auto", "klubb" eller #RRGGBB (se ColorChoices i lib/poc/build.ts). */
  color: z.string().max(10).optional(),
});

/**
 * Lägger till en produkt i en klubbs shop: designen, varianten, artikeln och färgen, publicerad direkt. Finns samma
 * design, variant och artikel redan hos klubben uppdateras den (och läggs tillbaka om den var borttagen); `existed`
 * säger då vilken status den hade. Kräver Crafts inloggning.
 */
export async function POST(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Välj design, artikel och färg." }, { status: 400 });
  const { clubId, designId, sku, variant, color } = parsed.data;
  if (!catalogProduct(sku)) return Response.json({ error: `Okänt artikelnummer: ${sku}.` }, { status: 400 });
  const colors = color && color !== AUTO_COLOR ? ColorChoices.safeParse({ [sku]: color }) : null;
  if (colors && !colors.success) return Response.json({ error: "Okänd färg." }, { status: 400 });
  try {
    const [design, club] = await Promise.all([getDesign(designId), pocClub(clubId)]);
    if (!design) return Response.json({ error: "Designen finns inte." }, { status: 404 });
    if (!club) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
    const [draft] = await clubProductDrafts(design, [clubId], [sku], { colors: colors?.data, variants: variant ? { [clubId]: [variant] } : undefined });
    if (!draft) return Response.json({ error: "Produkten gick inte att göra för klubben." }, { status: 400 });
    const before = (await listClubProducts({ clubId, designId })).find((p) => p.sku === draft.sku && (p.variant ?? "") === (draft.variant ?? ""));
    const [product] = await upsertClubProducts([{ ...draft, status: "publicerad" }]);
    return Response.json({ product: shopProductView(product, design), existed: before?.status ?? null });
  } catch (e) {
    console.error("craft/products", clubId, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte lägga till produkten." }, { status: 500 });
  }
}
