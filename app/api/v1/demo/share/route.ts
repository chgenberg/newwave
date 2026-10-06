import { z } from "zod";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { OfferFields, priceLines } from "@/lib/demoOffer";
import { countShares, createShare, newShareId } from "@/lib/demoShare";

const limiter = createLimiter(() => ({
  perKey: envInt("DEMO_SHARE_PER_IP_HOUR", 20),
  global: envInt("DEMO_SHARE_GLOBAL_HOUR", 500),
  windowMs: 60 * 60 * 1000,
}));
const MAX_STORED = () => envInt("DEMO_SHARE_MAX_STORED", 5000);

const Body = z.object({
  brand: OfferFields.brand,
  boothUrl: OfferFields.boothUrl,
  lines: OfferFields.lines,
  eventDate: OfferFields.eventDate,
  visitors: OfferFields.visitors,
  reference: z.union([z.literal(""), z.string().regex(/^MF-\d{4}-\d{4}-\d{3}$/)]).optional(),
});

export async function POST(req: Request) {
  const body = await readJson(req, 16_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const priced = priceLines(parsed.data.lines);
  if (!priced) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });

  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return Response.json({ error: "Du har delat många offerter på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });
  if ((await countShares()) >= MAX_STORED()) return Response.json({ error: "Det går inte att dela fler offerter just nu." }, { status: 503 });

  const id = newShareId();
  await createShare({
    id,
    createdAt: new Date().toISOString(),
    brand: { name: cleanText(parsed.data.brand.name, 80) || "Okänt varumärke", site: parsed.data.brand.site },
    boothUrl: parsed.data.boothUrl,
    ...priced,
    eventDate: parsed.data.eventDate ?? "",
    visitors: parsed.data.visitors ?? "",
    reference: parsed.data.reference ?? "",
    status: "pending",
    events: [],
  });
  return Response.json({ id, path: `/demo/godkann/${id}` });
}
