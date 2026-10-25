import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { ASA_IF } from "@/lib/newwave/club";
import { type AgentReply, agentShop, agentSystem, cleanReply, REPLY_SCHEMA } from "@/lib/newwave/klubbagent";
import { TEXT_MODEL, errorMessage, hasOpenAIKey, openai } from "@/lib/openai";

export const maxDuration = 60;

const limiter = createLimiter(() => ({
  perKey: envInt("KLUBBAGENT_PER_IP_HOUR", 60),
  global: envInt("KLUBBAGENT_GLOBAL_HOUR", 600),
  windowMs: 60 * 60 * 1000,
}));

/** Bara demoklubben har en agent i mobilen än; dess Instagramkonto står i demoklubbens uppgifter. */
const HANDLES: Record<string, string> = { [ASA_IF.id]: ASA_IF.handle };

const Body = z.object({
  clubId: z.string(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(16),
});

export async function POST(req: Request) {
  const body = await readJson(req, 100_000);
  if (body === undefined) return Response.json({ error: "Meddelandet är för långt" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  const handle = HANDLES[parsed.data.clubId];
  if (!club || !handle) return Response.json({ error: "Klubben har ingen agent" }, { status: 404 });
  if (!hasOpenAIKey()) return Response.json({ error: "AI är inte påslaget i den här miljön" }, { status: 503 });
  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return Response.json({ error: "Agenten har fått många meddelanden på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });

  const shop = await agentShop(club.id);
  try {
    const res = await openai().responses.create({
      model: TEXT_MODEL,
      input: [{ role: "system", content: agentSystem(club, handle, shop) }, ...parsed.data.messages],
      text: { format: { type: "json_schema", name: "klubbagent", schema: REPLY_SCHEMA, strict: true } },
    });
    return Response.json(cleanReply(JSON.parse(res.output_text) as AgentReply, shop));
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
