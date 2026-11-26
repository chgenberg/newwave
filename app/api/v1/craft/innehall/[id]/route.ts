import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { draftUrls, getDraft, setDraftStatus } from "@/lib/poc/content";

/** Ett utkast med bildernas och paketets adresser. Kräver Crafts inloggning. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  const draft = await getDraft(id).catch(() => null);
  if (!draft) return Response.json({ error: "Utkastet finns inte." }, { status: 404 });
  return Response.json({ draft, files: draftUrls(id) });
}

const Body = z.object({ status: z.enum(["utkast", "skickat"]) });

/** "Markera som skickat" när Craft skickat mejlet själv, eller tillbaka till utkast. Inget mejl skickas härifrån. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ange status: utkast eller skickat." }, { status: 400 });
  try {
    const draft = await setDraftStatus(id, parsed.data.status);
    if (!draft) return Response.json({ error: "Utkastet finns inte." }, { status: 404 });
    return Response.json({ draft });
  } catch (e) {
    console.error("craft/innehall/status", id, e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte spara." }, { status: 500 });
  }
}
