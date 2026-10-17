import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { errorMessage } from "@/lib/openai";
import { SCENE_IDS, productPhotos } from "@/lib/photos";
import { withBrand } from "@/lib/newwave/store";
import { ConceptSchema, fileUrl } from "@/lib/schemas";

export const maxDuration = 300;

const Body = z.object({
  clubId: z.string(),
  concept: ConceptSchema,
  printFiles: z.object({ light: fileUrl, dark: fileUrl }),
  scenes: z.array(z.enum(SCENE_IDS)).min(1).max(3).optional(),
  garment: z.enum(["light", "dark"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const listed = CLUBS[parsed.data.clubId];
  if (!listed) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const club = await withBrand(listed);
  try {
    return Response.json({ photos: await productPhotos(club, parsed.data.concept, parsed.data.printFiles, parsed.data.scenes, parsed.data.garment) });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
