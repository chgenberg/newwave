import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { ContentError, createDrafts, DRAFTS_MAX_CLUBS, type DraftStatus, listDrafts, shopOrigin } from "@/lib/poc/content";
import { contentSeason, seasonById, seasonOfDesign } from "@/lib/poc/seasons";
import { getDesign } from "@/lib/poc/store";

export const maxDuration = 120;

const Body = z.object({
  designId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Högst 250 klubbar per anrop – klubbkollektionen anropar routen efter varje omgång den publicerat. */
  clubIds: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).min(1).max(DRAFTS_MAX_CLUBS),
  /** Säsongens id (t.ex. "regnperiod-2027"). Utan den hämtas säsongen ur planen eller designens namn. */
  season: z.string().max(60).optional(),
});

/**
 * Skapar ett innehållspaket med mejlutkast per klubb för designens publicerade produkter: texter till Instagram,
 * Facebook och nyhetsbrevet, en story, en affisch med QR-kod och ett mejl till klubbens e-post. Allt sparas som
 * utkast – inget skickas. Kräver Crafts inloggning. Svar: `{ drafts, clubIds, skipped, missingEmail, season }`.
 */
export async function POST(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft för att skapa innehåll." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: `Ange designen och högst ${DRAFTS_MAX_CLUBS} klubbar.` }, { status: 400 });
  try {
    const { designId, clubIds } = parsed.data;
    const design = await getDesign(designId);
    if (!design) return Response.json({ error: "Designen finns inte." }, { status: 404 });
    const chosen = parsed.data.season ? await seasonById(parsed.data.season) : null;
    const season = chosen ? contentSeason(chosen) : await seasonOfDesign(design);
    const out = await createDrafts(designId, clubIds, { origin: shopOrigin(req), season });
    return Response.json({ ...out, season: season?.label ?? null });
  } catch (e) {
    if (e instanceof ContentError) return Response.json({ error: e.message }, { status: e.status });
    console.error("craft/innehall", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte skapa innehållet." }, { status: 500 });
  }
}

/** Utkasten, nyast först: `?design=<id>&status=utkast|skickat`. Kräver Crafts inloggning. */
export async function GET(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const status = (["utkast", "skickat"] as const).find((s) => s === q.get("status")) as DraftStatus | undefined;
  try {
    return Response.json({ drafts: await listDrafts({ designId: q.get("design") ?? undefined, status }) });
  } catch (e) {
    console.error("craft/innehall", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte läsa utkasten." }, { status: 500 });
  }
}
