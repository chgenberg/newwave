import { clientIp, createLimiter, readJson } from "@/lib/demoLimit";
import { publicOrigin } from "@/lib/origin";
import { keyOk, shopKey } from "@/lib/poc/auth";
import { errorResponse, findOrderForCustomer } from "@/lib/poc/orders";

const tries = createLimiter(() => ({ perKey: 30, global: 600, windowMs: 10 * 60_000 }));

/**
 * Butiken slår upp kundens order: `{ number, email }` → `{ statusUrl }`. Huvud `x-api-key` med butikens nyckel. Svaret
 * är 404 både när numret saknas och när e-posten inte stämmer.
 */
export async function POST(req: Request) {
  if (!keyOk(req.headers.get("x-api-key"), shopKey())) return Response.json({ error: "Fel eller saknad API-nyckel (x-api-key)" }, { status: 401 });
  const limit = tries.take(clientIp(req));
  if (!limit.ok) return Response.json({ error: "För många försök. Vänta en stund." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const body = (await readJson(req, 2_000)) as { number?: unknown; email?: unknown } | null | undefined;
  if (!body || typeof body.number !== "string" || typeof body.email !== "string") return Response.json({ error: "Ange { number, email }" }, { status: 400 });
  try {
    const path = await findOrderForCustomer(body.number, body.email);
    if (!path) return Response.json({ error: "Hittade ingen order med det ordernumret och den e-postadressen" }, { status: 404 });
    return Response.json({ statusUrl: `${publicOrigin(req)}${path}` });
  } catch (e) {
    return errorResponse(e);
  }
}
