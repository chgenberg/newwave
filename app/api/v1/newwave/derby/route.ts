import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { costSek, DERBY, type Flag, MODELS, moderate, ruleFlag, scoreIdeas, type Stopper, type Theme } from "@/lib/newwave/derby";
import { DERBY_RUN, placeOf } from "@/lib/newwave/derbyData";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";

export const maxDuration = 60;

const limiter = createLimiter(() => ({
  perKey: envInt("DERBY_PER_IP_HOUR", 30),
  global: envInt("DERBY_GLOBAL_HOUR", 1000),
  windowMs: 60 * 60 * 1000,
}));

const Body = z.object({ text: z.string().trim().min(3).max(DERBY.maxChars) });

export type DerbyVerdict = {
  flag: Flag;
  by: Stopper | null;
  score: number;
  theme: Theme | null;
  why: string;
  /** Platsen bland körningens godkända bidrag plus det här. */
  place: number | null;
  of: number;
  ore: number;
};

/** Ett nytt bidrag genom samma filter och samma betygsskala som körningens 5 000; det sparas inte. */
export async function POST(req: Request) {
  const body = await readJson(req, 4000);
  if (body === undefined) return Response.json({ error: "Bidraget är för långt" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: `Skriv mellan 3 och ${DERBY.maxChars} tecken` }, { status: 400 });
  if (!hasOpenAIKey()) return Response.json({ error: "AI är inte påslaget i den här miljön" }, { status: 503 });
  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return Response.json({ error: "Juryn har fått många bidrag på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });

  const { text } = parsed.data;
  const of = DERBY_RUN.approved + 1;
  const stopped = (flag: Flag, by: Stopper, ore = 0): DerbyVerdict => ({ flag, by, score: 0, theme: null, why: "", place: null, of, ore });
  const rule = ruleFlag(text);
  if (rule) return Response.json(stopped(rule, "regler"));
  try {
    if ((await moderate([text]))[0]) return Response.json(stopped("hat", "moderering"));
    const first = await scoreIdeas([text]);
    let v = first.verdicts[0];
    let ore = costSek(MODELS.screen, first.usage) * 100;
    if (v && v.flag !== "ok") {
      const second = await scoreIdeas([text], MODELS.review);
      v = second.verdicts[0];
      ore += costSek(MODELS.review, second.usage) * 100;
    }
    if (!v) return Response.json({ error: "Juryn hann inte läsa bidraget. Försök igen." }, { status: 502 });
    if (v.flag !== "ok") return Response.json({ ...stopped(v.flag, "agent", ore), why: v.why });
    return Response.json({ flag: "ok", by: null, score: v.score, theme: v.theme, why: v.why, place: placeOf(DERBY_RUN.scores, v.score), of, ore } satisfies DerbyVerdict);
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
