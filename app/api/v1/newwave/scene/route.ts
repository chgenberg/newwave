import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { OCCASION_IDS } from "@/lib/newwave/occasions";
import { LOGO_SRC, SceneError, brandedScene } from "@/lib/newwave/occasionScene";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";

export const maxDuration = 300;

const limiter = createLimiter(() => ({
  perKey: envInt("NW_SCENE_PER_IP_HOUR", 6),
  global: envInt("NW_SCENE_GLOBAL_HOUR", 80),
  windowMs: 60 * 60 * 1000,
}));

const Body = z.object({
  occasion: z.enum(OCCASION_IDS),
  logo: z.string().max(200).regex(LOGO_SRC),
  name: z.string().max(80),
  color: z.string().max(9),
  cachedOnly: z.boolean().optional(),
});

/** Tillfällets scen brandad med kundens logga; samma logga och tillfälle ritas bara en gång. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req, 4_000));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { cachedOnly, ...scene } = parsed.data;
  if (!cachedOnly && !hasOpenAIKey()) return Response.json({ error: "Scenerna går inte att skapa just nu." }, { status: 503 });
  const ip = clientIp(req);
  try {
    const image = await brandedScene(scene, { cachedOnly, allow: () => limiter.take(ip).ok });
    return Response.json({ image });
  } catch (err) {
    if (err instanceof SceneError) return Response.json({ error: err.message }, { status: err.status });
    console.error("newwave/scene", errorMessage(err));
    return Response.json({ error: "Kunde inte skapa scenen. Försök igen." }, { status: 502 });
  }
}
