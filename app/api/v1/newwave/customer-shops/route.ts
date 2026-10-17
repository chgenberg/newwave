import { z } from "zod";
import { ART_URL } from "@/lib/newwave/marking";
import { SHOP_CATALOG } from "@/lib/newwave/reseller";
import { changeCustomerShop, createCustomerShop, CURRENT_RESELLER, orderFromCustomerShop } from "@/lib/newwave/shopState";

const text = (max: number) => z.string().trim().max(max);
const asset = z.string().regex(ART_URL);
const productId = z.enum(SHOP_CATALOG.map((p) => p.id) as [string, ...string[]]);

const Create = z.object({
  action: z.literal("create"),
  company: z.object({ name: text(80).min(2), contact: text(80), email: z.union([z.email().max(120), z.literal("")]) }),
  logo: asset,
  logoDark: asset.optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  products: z.array(productId).min(1).max(SHOP_CATALOG.length),
  markup: z.number().min(-20).max(60),
  welcome: text(400),
});

const Change = z.object({ action: z.enum(["open", "close", "delete"]), id: z.string().max(60) });

const Order = z.object({
  action: z.literal("order"),
  token: z.string().max(40),
  contact: text(80).min(2),
  email: z.email().max(120),
  message: text(600).optional(),
  lines: z.array(z.object({ productId, sizes: z.record(z.string().max(12), z.number().int().min(0).max(9999)) })).min(1).max(20),
});

const Body = z.discriminatedUnion("action", [Create, Change, Order]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Kontrollera uppgifterna och försök igen." }, { status: 400 });
  const d = parsed.data;

  if (d.action === "create") {
    const { company, logo, logoDark, color, products, markup, welcome } = d;
    return Response.json({ shop: await createCustomerShop(CURRENT_RESELLER, { company, logo, logoDark, color, products, markup, welcome }) });
  }

  if (d.action === "order") {
    const out = await orderFromCustomerShop(d.token, { contact: d.contact, email: d.email, message: d.message }, d.lines);
    if ("error" in out) return Response.json({ error: out.error }, { status: out.status });
    return Response.json({ id: out.order.id, token: out.order.token, totalSek: out.order.totalSek });
  }

  const shop = await changeCustomerShop(CURRENT_RESELLER, d.id, (c) => {
    if (d.action === "delete") return false;
    c.open = d.action === "open";
  });
  if (!shop) return Response.json({ error: "Kundbutiken finns inte" }, { status: 404 });
  return Response.json({ shop: d.action === "delete" ? null : shop });
}
