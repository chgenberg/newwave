import type { NextRequest } from "next/server";
import { errorResponse, orderForCustomer } from "@/lib/poc/orders";

/** Kundens order med jobb och tidslinje. Nyckeln `?t=` kommer från ordersvaret (statusUrl). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return Response.json({ error: "Nyckeln saknas (?t=)" }, { status: 401 });
  try {
    const order = await orderForCustomer(id, token);
    if (!order) return Response.json({ error: "Ordern finns inte, eller så stämmer inte nyckeln" }, { status: 404 });
    return Response.json({ order });
  } catch (e) {
    return errorResponse(e);
  }
}
