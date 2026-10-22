import { z } from "zod";
import { sanitizeArt } from "@/lib/newwave/wordmark/art";
import { renderWordmark } from "@/lib/newwave/wordmark/render";
import { TemplateSchema } from "@/lib/newwave/wordmark/schema";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

const Body = z.object({ template: TemplateSchema, club: z.string().max(40), variant: z.enum(["light", "dark"]).default("light") });

/** Ritar en mall som ännu inte är sparad – en import eller ett förslag från mallagenten – så att Craft kan se den först. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mallen följer inte formatet." }, { status: 400 });
  const { template, variant } = parsed.data;
  const club = await wordmarkClub(parsed.data.club);
  if (!club) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  if (template.layers.some((l) => l.kind === "art" && sanitizeArt(l.svg) === null)) return Response.json({ error: "Grafiken innehåller något som inte är tillåtet." }, { status: 400 });
  const r = await renderWordmark(template, club, { icon: true, ornament: true, variant });
  return new Response(r.svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'" } });
}
