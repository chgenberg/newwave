import { readJson } from "@/lib/demoLimit";
import { sellables } from "@/lib/newwave/clubCollection";
import { loadClubShop } from "@/lib/newwave/clubShop";
import { ContentPatch, writeContent } from "@/lib/newwave/clubShopContent";

type Ctx = { params: Promise<{ id: string }> };

/** Klubbens texter, foto och dolda varor i butiken. */
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const shop = await loadClubShop(id);
  if (!shop) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  const parsed = ContentPatch.safeParse(await readJson(req, 20_000));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const error = field === "email" ? "Kontrollera e-postadressen." : field === "phone" ? "Kontrollera telefonnumret – bara siffror, mellanslag, + och -." : "Kontrollera texterna – inga tecken som < eller >, och inte för långa.";
    return Response.json({ error }, { status: 400 });
  }
  const patch = parsed.data;
  if (patch.hidden) {
    const known = new Set((await sellables(shop)).map((s) => s.id));
    patch.hidden = patch.hidden.filter((h) => known.has(h));
  }
  return Response.json({ content: await writeContent(id, patch) });
}
