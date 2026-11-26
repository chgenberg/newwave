import { loginPath, roleFromRequest } from "@/lib/poc/auth";
import { errorResponse, retryErp } from "@/lib/poc/orders";

/** Craft skickar en order som affärssystemet inte bekräftat till det igen. 502 om det fortfarande inte svarar. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: `Logga in som Craft (${loginPath("craft")})` }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return Response.json({ order: await retryErp(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
