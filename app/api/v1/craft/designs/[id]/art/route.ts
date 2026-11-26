import { clubArtwork, designArt, designById, pocClub } from "@/lib/poc/build";

/** Designens uppladdade konstverk, eller med `?c=` klubbens version av det: i klubbens färger och med klubbens märke. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const clubId = new URL(req.url).searchParams.get("c");
  const design = await designById(id).catch(() => null);
  const art = design ? await designArt(design) : null;
  if (!art) return new Response("Hittades inte", { status: 404 });
  const club = clubId ? await pocClub(clubId) : null;
  if (clubId && !club) return new Response("Hittades inte", { status: 404 });
  const png = club ? await clubArtwork(art, club, "#F4F3EF", 800) : art;
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
