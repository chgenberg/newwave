import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { proposeTemplates } from "@/lib/newwave/wordmark/agent";
import { popularTemplates } from "@/lib/newwave/wordmark/stats";

export const maxDuration = 180;

const limiter = createLimiter(() => ({ perKey: envInt("NW_WORDMARK_AGENT_PER_IP_HOUR", 20), global: envInt("NW_WORDMARK_AGENT_GLOBAL_HOUR", 80), windowMs: 60 * 60 * 1000 }));
const DataUrl = z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(8_000_000);
const Body = z
  .object({ images: z.array(DataUrl).max(3), note: z.string().max(300).optional(), popular: z.boolean().optional() })
  .refine((b) => b.popular || b.images.length > 0);

/**
 * Referensbilder in, förslag på mallar ut – eller, med `popular`, nya varianter av de mest valda mallarna.
 * Förslagen sparas inte: Craft ser dem på tre klubbar och godkänner först.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req, 25_000_000));
  if (!parsed.success) return Response.json({ error: "Ladda upp 1–3 bilder (PNG, JPG eller WebP)." }, { status: 400 });
  if (!hasOpenAIKey()) return Response.json({ error: "Mallagenten är inte tillgänglig just nu." }, { status: 503 });
  if (!limiter.take(clientIp(req)).ok) return Response.json({ error: "Många förslag på kort tid – försök igen om en stund." }, { status: 429 });
  try {
    const images = parsed.data.images.map((d) => Buffer.from(d.slice(d.indexOf(",") + 1), "base64"));
    const { templates, dropped } = await proposeTemplates(images, parsed.data.note ?? "", parsed.data.popular ? await popularTemplates(3) : []);
    if (!templates.length) return Response.json({ error: "Agenten hittade inget ordmärke att bygga en mall av. Prova en tydligare bild." }, { status: 422 });
    return Response.json({ templates, dropped });
  } catch (err) {
    console.error("newwave/wordmark/agent", errorMessage(err));
    return Response.json({ error: "Kunde inte ta fram förslag. Försök igen." }, { status: 502 });
  }
}
