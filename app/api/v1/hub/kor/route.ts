import { keyOk, roleFromRequest } from "@/lib/poc/auth";
import { runHub } from "@/lib/poc/hub/outbox";

export const maxDuration = 300;

/** Schemats nyckel. Vid utveckling finns en demonyckel; i produktion bara den i miljön. */
const cronKey = () => process.env.HUB_CRON_KEY?.trim() || (process.env.NODE_ENV === "production" ? null : "demo-hub-cron-key");

/**
 * Kör utkorgen mot New Waves hubb (nya ordrar och avbokningar som väntar på ett nytt försök), larmar om ordrar som
 * hubben inte bekräftat och hämtar, med HUB_PULL=1, lager och produkter. Samma sak körs varje minut av timern i
 * instrumentation.ts; den här routen är för ett schema utanför processen (t.ex. en cron-tjänst på Railway:
 * `curl -X POST -H "x-api-key: $HUB_CRON_KEY" https://…/api/v1/hub/kor`) och för Crafts integrationssida. Två
 * körningar samtidigt skickar aldrig samma sak.
 *
 * Nyckeln `HUB_CRON_KEY` i `x-api-key` eller som `Authorization: Bearer <nyckel>`, eller Crafts inloggning. Med
 * `?alla=1` skickas allt som väntar direkt, även det vars nästa försök inte är på tur (efter att hubben varit nere).
 * Svar: `{ mode, ready, outbox: { processed, sent, waiting, failed, stopped, paused? }, pull? }`.
 */
export async function POST(req: Request) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  const key = cronKey();
  const allowed = (key && (keyOk(req.headers.get("x-api-key"), key) || keyOk(bearer, key))) || (await roleFromRequest(req, "craft"));
  if (!allowed) return Response.json({ error: "Ange schemats nyckel (HUB_CRON_KEY) i x-api-key eller som Bearer, eller logga in som Craft." }, { status: 401 });
  try {
    const all = ["1", "true", "ja"].includes(new URL(req.url).searchParams.get("alla") ?? "");
    return Response.json(await runHub({ all }));
  } catch (e) {
    console.error("hub/kor", e instanceof Error ? e.message : e);
    return Response.json({ error: "Utkorgen kunde inte köras just nu." }, { status: 503 });
  }
}
