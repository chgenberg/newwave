import type { NextRequest } from "next/server";
import { readJson } from "@/lib/demoLimit";
import { publicOrigin } from "@/lib/origin";
import { keyOk, loginPath, roleFromRequest, shopKey } from "@/lib/poc/auth";
import { createOrder, customerStatusPath, errorResponse } from "@/lib/poc/orders";
import { listOrders } from "@/lib/poc/store";
import type { NewOrder, OrderStatus } from "@/lib/poc/types";

const STATUSES: OrderStatus[] = ["mottagen", "bekräftad", "i produktion", "delvis skickad", "skickad", "avbruten"];

/** En butik skickar en order: `{ clubId, customer, delivery?, lines }`. Priset och frakten räknas alltid av plattformen. */
export async function POST(req: Request) {
  if (!keyOk(req.headers.get("x-api-key"), shopKey())) return Response.json({ error: "Fel eller saknad API-nyckel (x-api-key)" }, { status: 401 });
  const body = await readJson(req, 100_000);
  if (body === undefined) return Response.json({ error: "Ordern är för stor" }, { status: 413 });
  if (body === null) return Response.json({ error: "Kroppen är inte giltig JSON" }, { status: 400 });
  try {
    const { order, token } = await createOrder(body as NewOrder);
    return Response.json({ order, statusUrl: `${publicOrigin(req)}${customerStatusPath(order, token)}` }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Crafts ordervy: `?clubId=&status=`. Kräver Crafts inloggning eller butikens nyckel, den visar kunduppgifter. */
export async function GET(req: NextRequest) {
  if (!(await roleFromRequest(req, "craft")) && !keyOk(req.headers.get("x-api-key"), shopKey())) {
    return Response.json({ error: `Logga in som Craft (${loginPath("craft")}) eller ange butikens API-nyckel (x-api-key)` }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const status = q.get("status") || undefined;
  if (status && !STATUSES.includes(status as OrderStatus)) return Response.json({ error: `Okänd status. Välj en av: ${STATUSES.join(", ")}` }, { status: 400 });
  try {
    return Response.json({ orders: await listOrders({ clubId: q.get("clubId") || undefined, status: status as OrderStatus | undefined }) });
  } catch (e) {
    return errorResponse(e);
  }
}
