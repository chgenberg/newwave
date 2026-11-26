import { roleFromRequest } from "@/lib/poc/auth";
import { deletePlan, getPlan, seasonById } from "@/lib/poc/seasons";

/**
 * En säsong på sitt id (t.ex. "regnperiod-2027": namn, datum, förslag – klubbkollektionen visar den överst), eller en
 * plan på sitt id ("plan-…"). Kräver Crafts inloggning.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  if (!id.startsWith("plan-")) {
    const season = await seasonById(id).catch(() => null);
    return season ? Response.json({ season }) : Response.json({ error: "Säsongen finns inte." }, { status: 404 });
  }
  const plan = await getPlan(id).catch(() => null);
  return plan ? Response.json({ plan }) : Response.json({ error: "Planen finns inte." }, { status: 404 });
}

/** Tar bort en plan som inte publicerats. Kräver Crafts inloggning. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    if (!(await deletePlan(id))) return Response.json({ error: "Planen finns inte, eller är redan publicerad." }, { status: 409 });
    return Response.json({ deleted: id });
  } catch (e) {
    console.error("craft/sasong/ta-bort", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte ta bort planen." }, { status: 500 });
  }
}
