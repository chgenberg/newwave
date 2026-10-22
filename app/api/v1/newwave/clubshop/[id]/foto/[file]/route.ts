import { readPhoto } from "@/lib/newwave/clubShopContent";

type Ctx = { params: Promise<{ id: string; file: string }> };

/** Ett nytt foto får ett nytt filnamn, så det gamla kan cachas länge. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id, file } = await ctx.params;
  const data = await readPhoto(id, file);
  if (!data) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
}
