import { z } from "zod";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { MAX_EVENTS, cleanComment, readShare, saveShare } from "@/lib/demoShare";

const limiter = createLimiter(() => ({
  perKey: envInt("DEMO_SHARE_ACTION_PER_IP_HOUR", 30),
  global: envInt("DEMO_SHARE_ACTION_GLOBAL_HOUR", 1000),
  windowMs: 60 * 60 * 1000,
}));

const Body = z.object({
  action: z.enum(["approve", "comment"]),
  name: z.string().max(80).default(""),
  comment: z.string().max(1000).default(""),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const share = await readShare((await ctx.params).id);
  if (!share) return Response.json({ error: "Hittades inte" }, { status: 404 });
  return Response.json(share, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const share = await readShare((await ctx.params).id);
  if (!share) return Response.json({ error: "Hittades inte" }, { status: 404 });
  const body = await readJson(req, 4_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const comment = cleanComment(parsed.data.comment, 1000);
  if (parsed.data.action === "comment" && !comment) return Response.json({ error: "Skriv en kommentar först." }, { status: 400 });
  if (share.events.length >= MAX_EVENTS) return Response.json({ error: "Offerten har fått många svar redan. Kontakta oss direkt." }, { status: 409 });

  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return Response.json({ error: "För många svar på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });

  share.events.push({ at: new Date().toISOString(), action: parsed.data.action, name: cleanText(parsed.data.name, 80), comment });
  share.status = share.events.some((e) => e.action === "approve") ? "approved" : "commented";
  await saveShare(share);
  return Response.json(share);
}
