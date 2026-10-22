import { z } from "zod";
import { FONT_ROLES } from "@/lib/newwave/wordmark/fonts";
import { READ_ROLES } from "@/lib/newwave/wordmark/importSvg";
import { correct } from "@/lib/newwave/wordmark/memory";
import { COLOR_SLOTS } from "@/lib/newwave/wordmark/schema";

const Index = z.string().regex(/^\d{1,3}$/);
const Body = z.object({
  key: z.string().regex(/^[0-9a-f]{32}$/),
  reading: z.object({
    roles: z.record(Index, z.enum(READ_ROLES)),
    colors: z.record(z.string().regex(/^#[0-9A-F]{6}$/), z.enum(COLOR_SLOTS)),
    styles: z.record(Index, z.object({ font: z.enum(FONT_ROLES), upper: z.boolean(), picked: z.boolean().optional() })).optional(),
    texts: z.record(Index, z.string().max(60)).optional(),
    club: z.string().max(80),
    notes: z.array(z.string().max(200)).max(3).default([]),
  }),
});

/** Crafts rättelser av en läsning: sparas med filen och blir exempel för agenten nästa gång. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Rättelsen följer inte formatet." }, { status: 400 });
  const learned = await correct(parsed.data.key, parsed.data.reading);
  if (learned === null) return Response.json({ error: "Läsningen finns inte." }, { status: 404 });
  return Response.json({ learned });
}
