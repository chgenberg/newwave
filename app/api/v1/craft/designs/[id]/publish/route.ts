import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { clubProductDrafts, ColorChoices, VariantChoices } from "@/lib/poc/build";
import { catalogProduct } from "@/lib/poc/catalog";
import { getDesign, upsertClubProducts } from "@/lib/poc/store";

export const maxDuration = 120;

const Body = z.object({
  /** Högst några hundra klubbar per anrop: Crafts klubbkollektion skickar dem i omgångar om 250. */
  clubIds: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).min(1).max(6000),
  skus: z.array(z.string().max(40)).min(1).max(20),
  /** Plaggets färg per artikelnummer (se ColorChoices i lib/poc/build.ts). */
  colors: ColorChoices.optional(),
  /** Ordmallens texter per klubb, en produkt per variant (se VariantChoices i lib/poc/build.ts). Saknas = mallens egna. */
  variants: VariantChoices.optional(),
});

/**
 * Gör designen till varje vald klubbs egen och publicerar den i klubbarnas Intersport-shoppar: en klubbprodukt per
 * klubb, variant och artikel. Att publicera igen uppdaterar produkterna i stället för att skapa nya (och lägger
 * tillbaka borttagna), så en avbruten omgång kan skickas om. Ett pris som Craft satt i shoppen behålls. Kräver Crafts
 * inloggning.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft för att publicera." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Välj minst en klubb och en produkt." }, { status: 400 });
  // Ett okänt artikelnummer ska inte bara falla bort – då tror den som publicerar att produkten finns i shopparna.
  const unknown = parsed.data.skus.filter((sku) => !catalogProduct(sku));
  if (unknown.length) return Response.json({ error: `Okända artikelnummer: ${unknown.join(", ")}. Se /api/v1/catalog.` }, { status: 400 });
  try {
    const design = await getDesign(id);
    if (!design) return Response.json({ error: "Designen finns inte." }, { status: 404 });
    const drafts = await clubProductDrafts(design, parsed.data.clubIds, parsed.data.skus, { colors: parsed.data.colors, variants: parsed.data.variants });
    if (!drafts.length) return Response.json({ error: "Inga av klubbarna eller produkterna finns." }, { status: 400 });
    const rows = await upsertClubProducts(drafts.map((d) => ({ ...d, status: "publicerad" as const })));
    const clubIds = [...new Set(rows.map((r) => r.clubId))];
    return Response.json({ design, published: rows.length, clubs: clubIds.length, clubIds, skus: [...new Set(rows.map((r) => r.sku))] });
  } catch (e) {
    console.error("craft/designs/publish", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte publicera designen." }, { status: 500 });
  }
}
