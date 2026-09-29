import { z } from "zod";
import { produceArtwork } from "@/lib/artwork";
import { CLUBS } from "@/lib/club";
import { errorMessage } from "@/lib/openai";
import { checkConcept, passesAll } from "@/lib/rules";
import { ConceptSchema } from "@/lib/schemas";

export const maxDuration = 300;

const Body = z.object({ clubId: z.string(), concept: ConceptSchema, feedback: z.string().max(1500).optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const checks = checkConcept(club, parsed.data.concept);
  if (!passesAll(checks)) {
    return Response.json({ error: "Motivet bryter mot klubbens regelbok", checks }, { status: 422 });
  }
  try {
    return Response.json(await produceArtwork(club, parsed.data.concept, parsed.data.feedback));
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
