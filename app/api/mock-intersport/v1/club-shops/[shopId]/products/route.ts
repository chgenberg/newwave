import { z } from "zod";
import { MOCK_API_KEY, ProductSchema, addProducts, listProducts } from "@/lib/intersport";

const Body = z.object({ products: z.array(ProductSchema).min(1).max(20) });

export async function GET(_req: Request, ctx: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await ctx.params;
  return Response.json({ products: await listProducts(shopId) });
}

export async function POST(req: Request, ctx: { params: Promise<{ shopId: string }> }) {
  if (req.headers.get("authorization") !== `Bearer ${MOCK_API_KEY}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { shopId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_payload", details: parsed.error.issues.slice(0, 5) }, { status: 422 });
  const added = await addProducts(shopId, parsed.data.products);
  return Response.json({ created: added.map((p) => ({ id: p.id, sku: p.sku, url: `/intersport/${shopId}/${p.id}` })) }, { status: 201 });
}
