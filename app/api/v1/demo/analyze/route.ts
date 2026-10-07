import { z } from "zod";
import { analyzeSite } from "@/lib/demoAnalyze";
import { BoothError, LOGO_URL } from "@/lib/demoBooth";
import { EVENT_IDS } from "@/lib/demoEvents";
import { SITE, clientIp, readJson } from "@/lib/demoLimit";
import { errorMessage } from "@/lib/openai";

export const maxDuration = 120;

const Body = z.object({
  site: z.string().trim().toLowerCase().max(120).regex(SITE),
  light: z.string().max(80).regex(LOGO_URL),
  event: z.enum(EVENT_IDS).default("massa"),
});

export async function POST(req: Request) {
  const body = await readJson(req, 2_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  try {
    return Response.json(await analyzeSite(parsed.data.site, parsed.data.light, clientIp(req), parsed.data.event));
  } catch (e) {
    if (e instanceof BoothError) {
      const headers = e.retryAfterSec ? { "Retry-After": String(e.retryAfterSec) } : undefined;
      return Response.json({ error: e.message }, { status: e.status, headers });
    }
    console.error("demo/analyze", errorMessage(e));
    return Response.json({ error: "Kunde inte läsa webbplatsen just nu." }, { status: 502 });
  }
}
