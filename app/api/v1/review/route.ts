import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { reviewAsset, verdictFor } from "@/lib/reviewer";
import { ConceptSchema, fileUrl } from "@/lib/schemas";
import { loadFile } from "@/lib/store";

export const maxDuration = 120;

const Body = z.object({ clubId: z.string(), concept: ConceptSchema, imageUrl: fileUrl, kind: z.enum(["motiv", "produktfoto"]) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, concept, imageUrl, kind } = parsed.data;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  if (!hasOpenAIKey()) {
    const demo = { realism: 8, relevance: 8, brandFit: 9, sales: 8 };
    return Response.json({ ...demo, verdict: verdictFor(club, demo), strengths: ["Demoläge"], issues: [], summary: "Demobetyg utan AI." });
  }
  const file = await loadFile(imageUrl.split("/").pop()!);
  if (!file) return Response.json({ error: "Bilden hittades inte" }, { status: 404 });
  try {
    return Response.json(await reviewAsset(club, concept, [file.data], kind));
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
