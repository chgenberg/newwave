import { clubDetail } from "@/lib/newwave/clubRegistry";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const club = await clubDetail((await ctx.params).id);
  if (!club) return Response.json({ error: "Hittades inte" }, { status: 404 });
  return Response.json(club, { headers: { "Cache-Control": "no-store" } });
}
