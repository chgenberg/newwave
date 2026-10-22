import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage } from "@/lib/openai";
import { FONT_ROLES } from "@/lib/newwave/wordmark/fonts";
import { matchText } from "@/lib/newwave/wordmark/match";
import { COLOR_SLOTS } from "@/lib/newwave/wordmark/schema";

export const maxDuration = 60;

const limiter = createLimiter(() => ({ perKey: envInt("NW_WORDMARK_MATCH_PER_IP_HOUR", 300), global: envInt("NW_WORDMARK_MATCH_GLOBAL_HOUR", 2000), windowMs: 60 * 60 * 1000 }));
const n = z.number().finite();
const Part = z.object({
  text: z.string().min(1).max(60),
  svg: z.string().max(200_000),
  viewBox: z.tuple([n, n, n.positive(), n.positive()]),
  rotate: n.min(-45).max(45).optional(),
  prefer: z.enum(FONT_ROLES).optional(),
  paint: z.enum(COLOR_SLOTS).optional(),
});
const Body = z.object({ parts: z.array(Part).min(1).max(8) });

/** Originalets bokstäver in, de licensierade typsnitt som liknar dem mest ut – med spärrning, bredd och lutning. Ingen AI. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req, 2_000_000));
  if (!parsed.success) return Response.json({ error: "Kunde inte läsa texterna." }, { status: 400 });
  if (!limiter.take(clientIp(req)).ok) return Response.json({ error: "Många matchningar på kort tid – försök igen om en stund." }, { status: 429 });
  try {
    const matches = [];
    for (const part of parsed.data.parts) matches.push(await matchText(part));
    return Response.json({ matches });
  } catch (err) {
    console.error("newwave/wordmark/match", errorMessage(err));
    return Response.json({ error: "Kunde inte matcha typsnitten." }, { status: 500 });
  }
}
