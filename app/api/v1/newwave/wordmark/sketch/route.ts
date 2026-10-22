import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { sketchWordmark } from "@/lib/newwave/wordmark/agent";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

export const maxDuration = 300;

const limiter = createLimiter(() => ({ perKey: envInt("NW_WORDMARK_SKETCH_PER_IP_HOUR", 12), global: envInt("NW_WORDMARK_SKETCH_GLOBAL_HOUR", 60), windowMs: 60 * 60 * 1000 }));
const Body = z.object({ image: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(8_000_000), club: z.string().max(40), note: z.string().max(200).optional() });

/** En rasterskiss i referensens stil med klubbens namn och färger – inspiration, inte en tryckfil. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req, 9_000_000));
  if (!parsed.success) return Response.json({ error: "Ladda upp en referensbild (PNG, JPG eller WebP)." }, { status: 400 });
  const club = await wordmarkClub(parsed.data.club);
  if (!club) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  if (!hasOpenAIKey()) return Response.json({ error: "Skisserna går inte att skapa just nu." }, { status: 503 });
  if (!limiter.take(clientIp(req)).ok) return Response.json({ error: "Många skisser på kort tid – försök igen om en stund." }, { status: 429 });
  try {
    const d = parsed.data.image;
    return Response.json({ url: await sketchWordmark(Buffer.from(d.slice(d.indexOf(",") + 1), "base64"), club, parsed.data.note ?? "") });
  } catch (err) {
    console.error("newwave/wordmark/sketch", errorMessage(err));
    return Response.json({ error: "Kunde inte skissa. Försök igen." }, { status: 502 });
  }
}
