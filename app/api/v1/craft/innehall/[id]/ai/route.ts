import { roleFromRequest } from "@/lib/poc/auth";
import { ContentError, rewriteDraft } from "@/lib/poc/content";

export const maxDuration = 120;

/**
 * "Skriv om med AI": utkastets texter till Instagram, Facebook och nyhetsbrevet skrivs om av gpt-5-mini. Bara på
 * knapptryck; kostnaden loggas internt men visas inte (den ingår i det fasta priset). Mejlet till klubben rörs inte. Kräver Crafts inloggning.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const { draft } = await rewriteDraft(id);
    return Response.json({ draft: { ...draft, ai: draft.ai ? { model: draft.ai.model, at: draft.ai.at } : undefined } });
  } catch (e) {
    if (e instanceof ContentError) return Response.json({ error: e.message }, { status: e.status });
    console.error("craft/innehall/ai", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte skriva om texterna." }, { status: 500 });
  }
}
