import { z } from "zod";
import { createConcepts, demoConcepts } from "@/lib/agents";
import { catalogFor } from "@/lib/catalog";
import { CLUBS } from "@/lib/club";
import { readCraftRules } from "@/lib/newwave/craftState";
import { withBrand } from "@/lib/newwave/store";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { checkConcept } from "@/lib/rules";
import { SignalSchema } from "@/lib/schemas";

export const maxDuration = 120;

const Body = z.object({ clubId: z.string(), signals: z.array(SignalSchema).min(1).max(12), count: z.number().int().min(1).max(6).optional(), hub: z.boolean().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Välj minst en signal" }, { status: 400 });
  const listed = CLUBS[parsed.data.clubId];
  if (!listed) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const club = await withBrand(listed);

  const mode = hasOpenAIKey() ? "ai" : "demo";
  try {
    const { signals, count, hub } = parsed.data;
    const allowed = hub ? new Set((await readCraftRules()).products) : null;
    const catalog = catalogFor(club.id, hub).filter((p) => !allowed || allowed.has(p.id));
    const concepts = mode === "ai" ? await createConcepts(club, signals, count, catalog) : demoConcepts(club, signals, count);
    return Response.json({ mode, concepts: concepts.map((c) => ({ ...c, checks: checkConcept(club, c) })) });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
