import { z } from "zod";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { reviewScarf } from "@/lib/scarfAgent";
import { scarfClub } from "@/lib/scarfClub";
import { FilesShape, IdeaSchema, knitIdea, proof } from "@/lib/scarfFlow";
import { scarfLimit } from "@/lib/scarfLimit";

export const maxDuration = 120;

const Body = z.object({ clubId: z.string().max(120), idea: IdeaSchema, ...FilesShape });

/** Steg 6: granskaren ser korrekturet och sätter betyg. Halsduken stickas om på servern, så att ingen bild behöver skickas upp. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig idé" }, { status: 400 });
  if (!hasOpenAIKey()) return Response.json({ review: null });
  const limited = scarfLimit(req, "review");
  if (limited) return limited;
  const found = await scarfClub(parsed.data.clubId);
  if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { idea, artFile, photoFile, signFile } = parsed.data;
  try {
    const { knit } = await knitIdea(found.club, idea, { artFile, photoFile, signFile, crest: found.crest });
    return Response.json({ review: await reviewScarf(found.club, idea, await proof(knit)) });
  } catch (err) {
    console.error("scarf/agent/review", errorMessage(err));
    return Response.json({ error: "Granskaren svarade inte." }, { status: 502 });
  }
}
