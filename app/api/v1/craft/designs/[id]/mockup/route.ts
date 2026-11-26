import { catalogProduct } from "@/lib/poc/catalog";
import { cachedImage, designById, fileMockup, pocClub } from "@/lib/poc/build";

export const maxDuration = 60;

const SIZES = new Set([480, 800, 1200]);

/** Ett uppladdat konstverk som klubbens eget på plagget: i klubbens färger och med klubbens märke. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const size = Number(q.get("s") ?? 800);
  const sku = q.get("p") ?? "";
  if (!SIZES.has(size) || catalogProduct(sku)?.kind !== "plagg") return new Response("Ogiltig förfrågan", { status: 400 });
  const [design, club] = await Promise.all([designById(id).catch(() => null), pocClub(q.get("c") ?? "")]);
  if (!design || design.source.type !== "fil" || !club) return new Response("Hittades inte", { status: 404 });
  try {
    const jpg = await cachedImage(["fil", design.id, design.createdAt, club.id, club.logo, club.colors, sku, size], () => fileMockup(design, club.id, sku, size));
    if (!jpg) return new Response("Hittades inte", { status: 404 });
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" } });
  } catch (e) {
    console.error("craft/designs/mockup", id, e instanceof Error ? e.message : e);
    return new Response("Kunde inte rita mockupen", { status: 500 });
  }
}
