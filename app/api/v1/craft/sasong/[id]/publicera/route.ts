import { roleFromRequest } from "@/lib/poc/auth";
import { ContentError, shopOrigin } from "@/lib/poc/content";
import { runPlan } from "@/lib/poc/seasons";

export const maxDuration = 300;

/** "Publicera nu": planen publiceras direkt, utan att vänta på dagen. Kräver Crafts inloggning. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft för att publicera." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const plan = await runPlan(id, shopOrigin(req));
    return Response.json({ plan }, { status: plan.status === "fel" ? 500 : 200 });
  } catch (e) {
    if (e instanceof ContentError) return Response.json({ error: e.message }, { status: e.status });
    console.error("craft/sasong/publicera", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte publicera planen." }, { status: 500 });
  }
}
