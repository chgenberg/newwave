import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { errorMessage } from "@/lib/openai";
import { productPhotos } from "@/lib/photos";
import { ConceptSchema, fileUrl } from "@/lib/schemas";

export const maxDuration = 300;

const Body = z.object({
  clubId: z.string(),
  concept: ConceptSchema,
  printFiles: z.object({ light: fileUrl, dark: fileUrl }),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  try {
    return Response.json({ photos: await productPhotos(club, parsed.data.concept, parsed.data.printFiles) });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
