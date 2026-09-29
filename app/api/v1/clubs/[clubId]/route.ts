import { CATALOG } from "@/lib/catalog";
import { CLUBS } from "@/lib/club";
import { IMAGE_MODEL, TEXT_MODEL, hasOpenAIKey } from "@/lib/openai";

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  return Response.json({
    club,
    catalog: CATALOG,
    ai: { enabled: hasOpenAIKey(), textModel: TEXT_MODEL, imageModel: IMAGE_MODEL },
  });
}
