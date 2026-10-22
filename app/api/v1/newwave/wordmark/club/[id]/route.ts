import { PrefsPatch, readPrefs, writePrefs } from "@/lib/newwave/wordmark/clubPrefs";
import { clubQuality } from "@/lib/newwave/wordmark/quality";
import { allTemplates, baseClub, publishTemplates, TemplateTaken } from "@/lib/newwave/wordmark/store";
import { splitName } from "@/lib/newwave/wordmark/names";

type Ctx = { params: Promise<{ id: string }> };

/** Klubbens egna val för ordmärkena: färgerna från källan, det klubben rättat, favoriter, godkännande och kontrollerna. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const club = await baseClub(id);
  if (!club) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  const [prefs, quality] = await Promise.all([readPrefs(id), clubQuality(id)]);
  return Response.json({ club: { id, name: club.name, logo: club.logo, colors: club.colors, founded: club.founded, names: splitName(club.name) }, prefs, issues: quality?.issues ?? [] });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await baseClub(id))) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  const parsed = PrefsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Kontrollera färgerna och namnen." }, { status: 400 });
  const patch = parsed.data;
  if (patch.favorites) {
    const known = new Set((await allTemplates()).filter((t) => !t.hidden).map((t) => t.id));
    patch.favorites = patch.favorites.filter((f) => known.has(f));
    try {
      await publishTemplates(patch.favorites);
    } catch (e) {
      return Response.json({ error: e instanceof TemplateTaken ? e.message : "Kunde inte publicera designen." }, { status: 409 });
    }
  }
  const prefs = await writePrefs(id, patch);
  const quality = await clubQuality(id);
  return Response.json({ prefs, issues: quality?.issues ?? [] });
}
