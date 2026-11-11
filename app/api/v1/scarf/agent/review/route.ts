import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { reviewScarf } from "@/lib/scarfAgent";
import { ART_FILE, IdeaSchema, knitIdea, proof } from "@/lib/scarfFlow";

export const maxDuration = 120;

const Body = z.object({ clubId: z.string(), idea: IdeaSchema, artFile: z.string().regex(ART_FILE).nullable().optional() });

/** Steg 6: granskaren ser korrekturet och sätter betyg. Halsduken stickas om på servern, så att ingen bild behöver skickas upp. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig idé" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  if (!hasOpenAIKey()) return Response.json({ review: null });
  try {
    const { knit } = await knitIdea(club, parsed.data.idea, { artFile: parsed.data.artFile });
    return Response.json({ review: await reviewScarf(club, parsed.data.idea, await proof(knit)) });
  } catch (err) {
    console.error("scarf/agent/review", errorMessage(err));
    return Response.json({ error: "Granskaren svarade inte." }, { status: 502 });
  }
}
