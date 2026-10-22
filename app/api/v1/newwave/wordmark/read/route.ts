import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey, TEXT_MODEL } from "@/lib/openai";
import { lessons, readKey, type ReadResult, recall, remember } from "@/lib/newwave/wordmark/memory";
import { readDesign } from "@/lib/newwave/wordmark/reader";

export const maxDuration = 120;

const limiter = createLimiter(() => ({ perKey: envInt("NW_WORDMARK_READ_PER_IP_HOUR", 30), global: envInt("NW_WORDMARK_READ_GLOBAL_HOUR", 120), windowMs: 60 * 60 * 1000 }));
const Png = z.string().regex(/^data:image\/png;base64,/).max(6_000_000);
const Candidate = z.object({
  i: z.number().int().min(0).max(200),
  kind: z.enum(["text", "group", "shape", "image"]),
  text: z.string().max(80),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  colors: z.array(z.string().regex(/^#[0-9A-F]{6}$/)).max(4),
  shapes: z.number().int().min(0).max(100_000),
});
const Body = z.object({ name: z.string().max(80), candidates: z.array(Candidate).min(1).max(60), image: Png, annotated: Png, fonts: z.array(z.string().max(80)).max(20).optional(), fresh: z.boolean().optional() });

/**
 * En färdig design in, agentens tolkning ut: vilken del som är namnet, märket och dekoren, och vilka färger som är
 * klubbens. En fil som redan lästs kommer ur minnet, med Crafts rättelser, utan nytt AI-anrop – utom med `fresh`, som
 * testbänken använder för att mäta agenten på nytt.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req, 14_000_000));
  if (!parsed.success) return Response.json({ error: "Kunde inte läsa designen." }, { status: 400 });
  const key = readKey(parsed.data.candidates, parsed.data.image);
  const saved = await recall(key);
  // Varumärket är agentens bedömning – Craft rättar roller och färger, inte den.
  if (saved && !parsed.data.fresh) return Response.json({ ...(saved.corrected ?? saved.agent), mark: saved.agent.mark, key, memory: saved.corrected ? "corrected" : "read", at: saved.correctedAt ?? saved.at, model: saved.model, lessons: 0 } satisfies ReadResult);
  if (!hasOpenAIKey()) return Response.json({ error: "Läsagenten är inte tillgänglig just nu." }, { status: 503 });
  if (!limiter.take(clientIp(req)).ok) return Response.json({ error: "Många designer på kort tid – försök igen om en stund." }, { status: 429 });
  try {
    const learned = await lessons();
    const reading = await readDesign({ ...parsed.data, lessons: learned });
    if (!Object.values(reading.roles).some((r) => r !== "ignore" && r !== "ornament")) return Response.json({ error: "Agenten hittade varken klubbnamn eller klubbmärke i designen." }, { status: 422 });
    const at = new Date().toISOString();
    // Crafts rättelser står kvar när agenten läser om filen.
    await remember({ ...saved, key, at, name: parsed.data.name, model: TEXT_MODEL, candidates: parsed.data.candidates, agent: reading });
    return Response.json({ ...reading, key, memory: "new", at, model: TEXT_MODEL, lessons: learned.length } satisfies ReadResult);
  } catch (err) {
    console.error("newwave/wordmark/read", errorMessage(err));
    return Response.json({ error: "Kunde inte läsa designen. Försök igen." }, { status: 502 });
  }
}
