import { cachedImage, designById, garmentMockup, pocClub, variantFromQuery } from "@/lib/poc/build";
import { catalogProduct } from "@/lib/poc/catalog";

export const maxDuration = 60;

const SIZES = new Set([480, 800, 1200]);
const TEMPLATE = /^[a-z0-9-]{2,40}$/;
const COLOR = /^[0-9A-Fa-f]{6}$/;

/**
 * Plagget i klubbens färg (eller den Craft valt), med designen ritad för den färgen: `t=` en ordmall, `d=` en
 * uppladdad design. `g` är plaggets färg utan #, `m` och `u` ordmallens huvudrad och underrad i en variant. Ritas en
 * gång och sparas.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size = Number(q.get("s") ?? 800);
  const [sku, t, d, g] = [q.get("p") ?? "", q.get("t"), q.get("d"), q.get("g") ?? ""];
  if (!SIZES.has(size) || catalogProduct(sku)?.kind !== "plagg" || !COLOR.test(g) || (!t && !d) || (t && !TEMPLATE.test(t))) return new Response("Ogiltig förfrågan", { status: 400 });
  const garment = `#${g.toUpperCase()}`;
  const variant = t ? variantFromQuery(q) : undefined;
  const [club, design] = await Promise.all([pocClub(q.get("c") ?? ""), d ? designById(d).catch(() => null) : null]);
  if (!club || (d && design?.source.type !== "fil")) return new Response("Hittades inte", { status: 404 });
  try {
    const source = design ? { design } : { template: t! };
    const key = design ? ["fil", design.id, design.createdAt] : ["ordmall", t];
    const jpg = await cachedImage(["plaggfarg", ...key, club.id, club.name, club.logo, club.colors, sku, garment, size, ...(variant ? [variant] : [])], () => garmentMockup(source, club.id, sku, garment, size, variant));
    if (!jpg) return new Response("Hittades inte", { status: 404 });
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" } });
  } catch (e) {
    console.error("craft/mockup", club.id, sku, e instanceof Error ? e.message : e);
    return new Response("Kunde inte rita mockupen", { status: 500 });
  }
}
