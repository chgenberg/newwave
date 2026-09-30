import { z } from "zod";
import { createConcepts, demoConcepts } from "@/lib/agents";
import { CLUBS } from "@/lib/club";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { checkConcept } from "@/lib/rules";
import { SignalSchema } from "@/lib/schemas";

export const maxDuration = 120;

const Body = z.object({ clubId: z.string(), signals: z.array(SignalSchema).min(1).max(12), count: z.number().int().min(1).max(6).optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Välj minst en signal" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const mode = hasOpenAIKey() ? "ai" : "demo";
  try {
    const { signals, count } = parsed.data;
    const concepts = mode === "ai" ? await createConcepts(club, signals, count) : demoConcepts(club, signals, count);
    return Response.json({ mode, concepts: concepts.map((c) => ({ ...c, checks: checkConcept(club, c) })) });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
