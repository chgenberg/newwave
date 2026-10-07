import { z } from "zod";
import { BOOTH_ITEMS, BoothError, LOGO_URL, brandedBooth } from "@/lib/demoBooth";
import { BOOTH_FORMATS } from "@/lib/demoCatalog";
import { ANALYSIS_ID } from "@/lib/demoSiteCache";
import { SITE, clientIp, readJson } from "@/lib/demoLimit";
import { errorMessage } from "@/lib/openai";

export const maxDuration = 300;

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  site: z.union([z.literal(""), z.string().trim().toLowerCase().max(120).regex(SITE)]).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1D1D1F"),
  light: z.string().max(80).regex(LOGO_URL),
  products: z.array(z.enum(BOOTH_ITEMS)).max(BOOTH_ITEMS.length).default([...BOOTH_ITEMS]),
  analysisId: z.string().regex(ANALYSIS_ID).optional(),
  format: z.enum(BOOTH_FORMATS).default("3:2"),
});

export async function POST(req: Request) {
  const body = await readJson(req, 4_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  try {
    return Response.json(await brandedBooth({ ...parsed.data, products: [...new Set(parsed.data.products)] }, clientIp(req)));
  } catch (e) {
    if (e instanceof BoothError) {
      const headers = e.retryAfterSec ? { "Retry-After": String(e.retryAfterSec) } : undefined;
      return Response.json({ error: e.message }, { status: e.status, headers });
    }
    console.error("demo/booth", errorMessage(e));
    return Response.json({ error: "Kunde inte bygga montern just nu. Försök igen." }, { status: 502 });
  }
}
