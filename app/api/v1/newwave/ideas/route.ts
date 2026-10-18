import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { nwProduct } from "@/lib/newwave/catalog";
import { eventIdeas } from "@/lib/newwave/eventIdeas";
import { OCCASION_IDS, sellableProducts } from "@/lib/newwave/occasions";
import { getResellerBySlug } from "@/lib/newwave/shopState";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";

export const maxDuration = 60;

const limiter = createLimiter(() => ({
  perKey: envInt("NW_IDEAS_PER_IP_HOUR", 20),
  global: envInt("NW_IDEAS_GLOBAL_HOUR", 300),
  windowMs: 60 * 60 * 1000,
}));

const Body = z.object({
  slug: z.string().max(80),
  occasion: z.enum(OCCASION_IDS),
  name: z.string().trim().min(1).max(60),
  industry: z.string().max(80),
  offering: z.string().max(200),
  tone: z.string().max(120),
});

/** Produktagenten: fyra produkter ur butikens utbud för företaget och tillfället. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req, 4_000));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { slug, ...ask } = parsed.data;
  const r = await getResellerBySlug(slug);
  if (!r || r.status !== "publicerad") return Response.json({ error: "Okänd butik" }, { status: 404 });
  if (!hasOpenAIKey()) return Response.json({ ideas: [] });
  const candidates = [...sellableProducts(r)].filter((id) => {
    const p = nwProduct(id);
    return p && p.kind !== "booth";
  });
  const ip = clientIp(req);
  try {
    const ideas = await eventIdeas(ask, candidates, { allow: () => limiter.take(ip).ok });
    return ideas ? Response.json({ ideas }) : Response.json({ error: "Många förslag på kort tid. Försök igen om en stund." }, { status: 429 });
  } catch (err) {
    console.error("newwave/ideas", errorMessage(err));
    return Response.json({ error: "Kunde inte ta fram förslag just nu." }, { status: 502 });
  }
}
