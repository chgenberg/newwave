import { roleFromRequest } from "@/lib/poc/auth";
import { draftImage, draftNewsletter, draftZip, fetchCtx, getDraft, mailText, zipName } from "@/lib/poc/content";

export const maxDuration = 120;

/**
 * Innehållspaketets filer: `story.jpg` (1080 × 1920), `affisch.jpg` (A4 med QR-kod), `nyhetsbrev.html`, `mejl.txt`
 * och hela paketet som `paket.zip`. Bilderna ritas första gången de hämtas och sparas. Kräver Crafts inloggning.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; fil: string }> }) {
  if (!(await roleFromRequest(req, "craft"))) return new Response("Logga in som Craft.", { status: 401 });
  const { id, fil } = await ctx.params;
  const draft = await getDraft(id).catch(() => null);
  if (!draft) return new Response("Hittades inte", { status: 404 });
  try {
    const at = fetchCtx(req);
    if (fil === "story.jpg" || fil === "affisch.jpg") {
      const jpg = await draftImage(draft, fil === "story.jpg" ? "story" : "affisch", at);
      const download = new URL(req.url).searchParams.has("ladda");
      return new Response(new Uint8Array(jpg), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=300",
          ...(download ? { "Content-Disposition": `attachment; filename="${fil === "story.jpg" ? "story-1080x1920.jpg" : "affisch-A4.jpg"}"` } : {}),
        },
      });
    }
    if (fil === "nyhetsbrev.html") return new Response(await draftNewsletter(draft), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
    if (fil === "mejl.txt") return new Response(mailText(draft.mail), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
    if (fil === "paket.zip") {
      const zip = await draftZip(draft, at);
      return new Response(new Uint8Array(zip), {
        headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${zipName(draft)}"`, "Cache-Control": "private, no-store" },
      });
    }
    return new Response("Hittades inte", { status: 404 });
  } catch (e) {
    console.error("craft/innehall/filer", id, fil, e instanceof Error ? e.message : e);
    return new Response("Kunde inte göra filen", { status: 500 });
  }
}
