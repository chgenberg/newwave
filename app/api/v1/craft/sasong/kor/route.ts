import { keyOk, roleFromRequest } from "@/lib/poc/auth";
import { shopOrigin } from "@/lib/poc/content";
import { runDuePlans } from "@/lib/poc/seasons";

export const maxDuration = 300;

/**
 * Publicerar planerna vars dag har kommit. Tänkt att anropas av ett schema på Railway (en cron-tjänst som till
 * exempel varje timme kör `curl -X POST -H "x-api-key: $CRAFT_SEASON_KEY" https://…/api/v1/craft/sasong/kor`).
 * Kräver Crafts inloggning, eller nyckeln i `CRAFT_SEASON_KEY` när den är satt i miljön. Med demots lösenord påslaget
 * (DEMO_PASSWORD) behöver schemat också demots cookie, eller att routen läggs till bland de öppna adresserna i
 * lib/access.ts. Svar: `{ ran, plans }` med planerna som kördes och deras status.
 */
export async function POST(req: Request) {
  const key = process.env.CRAFT_SEASON_KEY;
  const allowed = (await roleFromRequest(req, "craft")) || (key ? keyOk(req.headers.get("x-api-key"), key) : false);
  if (!allowed) return Response.json({ error: "Logga in som Craft, eller ange schemats nyckel." }, { status: 401 });
  try {
    const plans = await runDuePlans(shopOrigin(req));
    return Response.json({ ran: plans.length, plans: plans.map((p) => ({ id: p.id, designName: p.designName, status: p.status, result: p.result, error: p.error })) });
  } catch (e) {
    console.error("craft/sasong/kor", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte köra planerna." }, { status: 500 });
  }
}
