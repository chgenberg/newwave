import { NextResponse } from "next/server";
import { z } from "zod";
import { DELIVERY, MAX_QTY } from "@/components/newwave/clubshop/pricing";
import { clientIp, createLimiter, readJson } from "@/lib/demoLimit";
import { loadClubShop } from "@/lib/newwave/clubShop";
import { EVENTS, recordEvent, recordOrder } from "@/lib/newwave/clubShopStats";

type Ctx = { params: Promise<{ id: string }> };

const hits = createLimiter(() => ({ perKey: 90, global: 6000, windowMs: 60_000 }));
const Item = z.string().regex(/^[a-z0-9-]{1,120}$/);

const Body = z.discriminatedUnion("type", [
  z.object({ type: z.enum(EVENTS), item: Item.optional() }),
  z.object({
    type: z.literal("order"),
    number: z.string().regex(/^[A-Z]{2,4}-\d{6}$/),
    delivery: z.enum(DELIVERY.map((d) => d.id) as [string, ...string[]]),
    lines: z.array(z.object({ item: Item, qty: z.number().int().min(1).max(MAX_QTY), flock: z.boolean() })).min(1).max(30),
  }),
]);

/** Händelserna i klubbens butik och klubbshoppen hos Intersport, till klubbens statistik. */
export async function POST(req: Request, ctx: Ctx) {
  const none = new NextResponse(null, { status: 204 });
  if (!hits.take(clientIp(req)).ok) return none;
  const { id } = await ctx.params;
  const body = Body.safeParse(await readJson(req, 8000));
  if (!body.success) return NextResponse.json({ error: "Ogiltig händelse." }, { status: 400 });
  const shop = await loadClubShop(id);
  if (!shop) return none;
  const e = body.data;
  if (e.type === "order") {
    await recordOrder(id, shop.assortment, { ...e, delivery: e.delivery as (typeof DELIVERY)[number]["id"] });
    return none;
  }
  const known = e.item && shop.assortment.some((g) => g.items.some((i) => i.id === e.item));
  await recordEvent(id, e.type, known ? e.item : undefined);
  return none;
}
