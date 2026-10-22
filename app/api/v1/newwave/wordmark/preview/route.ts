import { z } from "zod";
import { sanitizeArt } from "@/lib/newwave/wordmark/art";
import { paletteFor, renderWordmark, textFill, type WordmarkClub } from "@/lib/newwave/wordmark/render";
import { COLOR_SLOTS, TemplateSchema, TEXT_SLOTS } from "@/lib/newwave/wordmark/schema";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

/** Originalets egna texter och färger, i stället för en klubbs – så att en import kan läggas ovanpå filen den kom från. */
const Original = z.object({
  name: z.string().max(80),
  texts: z.partialRecord(z.enum(TEXT_SLOTS), z.string().max(60)),
  colors: z.array(z.string().regex(/^#[0-9A-F]{6}$/i)).max(4),
});
const Body = z.object({ template: TemplateSchema, club: z.string().max(40), variant: z.enum(["light", "dark"]).default("light"), canvas: z.boolean().optional(), original: Original.optional() });

/**
 * Ritar en mall som ännu inte är sparad – en import, ett förslag från mallagenten eller det som ändras i designstudion –
 * så att Craft kan se den först. Klubbens färger per färgplats följer med i X-Nw-Palette, för studions färgval, och
 * färgerna bokstäverna faktiskt får i X-Nw-Text-Palette (en för svag andrafärg ger svart eller vitt) och kontrollens
 * anteckningar URL-kodade i X-Nw-Notes.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mallen följer inte formatet." }, { status: 400 });
  const { template, variant, canvas, original } = parsed.data;
  const club: WordmarkClub | null = original ? { id: "original", name: original.name || "Originalet", colors: original.colors } : await wordmarkClub(parsed.data.club);
  if (!club) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  if (template.layers.some((l) => l.kind === "art" && sanitizeArt(l.svg) === null)) return Response.json({ error: "Grafiken innehåller något som inte är tillåtet." }, { status: 400 });
  const r = await renderWordmark(template, club, { icon: true, ornament: true, variant, canvas, texts: original?.texts });
  const palette = paletteFor(club.colors, variant);
  return new Response(r.svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      "X-Nw-Palette": JSON.stringify(palette),
      "X-Nw-Text-Palette": JSON.stringify(Object.fromEntries(COLOR_SLOTS.map((s) => [s, textFill(palette, s)]))),
      "X-Nw-Notes": encodeURIComponent(JSON.stringify(r.notes)),
    },
  });
}
