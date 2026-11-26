import { readJson } from "@/lib/demoLimit";
import { loginPath, roleFromRequest } from "@/lib/poc/auth";
import { cancelOrder, errorResponse } from "@/lib/poc/orders";

/** Craft avbryter en order som inte börjat tillverkas: `{ reason? }`. 409 om ett jobb redan är i produktion eller skickat. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: `Logga in som Craft (${loginPath("craft")})` }, { status: 401 });
  const { id } = await ctx.params;
  const body = req.headers.get("content-length") === "0" ? {} : await readJson(req, 5_000);
  if (body === undefined) return Response.json({ error: "Kroppen är för stor" }, { status: 413 });
  const reason = body && typeof body === "object" && "reason" in body && typeof body.reason === "string" ? body.reason : undefined;
  try {
    return Response.json({ order: await cancelOrder(id, reason) });
  } catch (e) {
    return errorResponse(e);
  }
}
