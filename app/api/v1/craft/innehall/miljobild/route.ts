import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { ContentError, fetchCtx, scenePhoto, scenesLeft } from "@/lib/poc/content";
import { seasonOfDesign } from "@/lib/poc/seasons";
import { getClubProduct, getDesign } from "@/lib/poc/store";

export const maxDuration = 300;

const Body = z.object({ clubProductId: z.string().regex(/^[a-z0-9-]{1,40}$/) });

/**
 * Miljöbilden för en klubbprodukt: ett foto där en person i klubbens miljö (sporten, årstiden) bär plagget med
 * klubbens tryck. Finns den redan ges den sparade utan nytt anrop; annars gör bildmodellen den. Kostnaden loggas
 * internt men visas inte – modellanropen ingår i det fasta priset. Antalet nya bilder per timme är begränsat.
 * Kräver Crafts inloggning. Svar: `{ url, cached, left }`.
 */
export async function POST(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft för att skapa miljöbilder." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ange klubbprodukten." }, { status: 400 });
  try {
    const product = await getClubProduct(parsed.data.clubProductId);
    if (!product) return Response.json({ error: "Produkten finns inte." }, { status: 404 });
    // Säsongen styr årstiden i fotot: designens säsong om den har en, annars dagens.
    const design = await getDesign(product.designId);
    const season = design ? await seasonOfDesign(design).catch(() => null) : null;
    const { url, cached } = await scenePhoto(product.id, { ctx: fetchCtx(req), season });
    return Response.json({ url, cached, left: await scenesLeft() });
  } catch (e) {
    if (e instanceof ContentError) return Response.json({ error: e.message }, { status: e.status, headers: e.status === 429 ? { "Retry-After": "600" } : undefined });
    console.error("craft/innehall/miljobild", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte skapa miljöbilden." }, { status: 500 });
  }
}
