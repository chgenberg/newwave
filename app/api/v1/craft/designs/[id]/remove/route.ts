import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { getDesign, setClubProducts } from "@/lib/poc/store";

const Body = z.object({ restore: z.array(z.string().max(40)).max(20_000).optional() }).nullable();

/**
 * Tar bort designen ur alla klubbars shoppar: varje publicerad klubbprodukt med designen får status "borttagen" och
 * syns inte längre, men finns kvar för ordrarna som redan har den. Med `{ restore: ids }` läggs de tillbaka (ångra).
 * Kräver Crafts inloggning.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  try {
    if (!(await getDesign(id))) return Response.json({ error: "Designen finns inte." }, { status: 404 });
    const restore = parsed.data?.restore;
    const rows = restore
      ? await setClubProducts({ ids: restore, designId: id, from: ["borttagen"] }, { status: "publicerad" })
      : await setClubProducts({ designId: id, from: ["publicerad"] }, { status: "borttagen" });
    return Response.json({ [restore ? "restored" : "removed"]: rows.length, ids: rows.map((r) => r.id), clubs: new Set(rows.map((r) => r.clubId)).size });
  } catch (e) {
    console.error("craft/designs/remove", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte ta bort designen ur shopparna." }, { status: 500 });
  }
}
