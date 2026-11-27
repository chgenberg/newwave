import { loginPath, roleFromRequest } from "@/lib/poc/auth";
import { errorResponse, retryErp } from "@/lib/poc/orders";

/**
 * Craft skickar en order som affärssystemet inte bekräftat till det igen, genom utkorgen mot New Waves hubb: posten
 * börjar om med nya försök i ett dygn och första försöket görs direkt. 502 om hubben fortfarande inte tar emot ordern
 * (den ligger då kvar i utkorgen och skickas igen av sig själv).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: `Logga in som Craft (${loginPath("craft")})` }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return Response.json({ order: await retryErp(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
