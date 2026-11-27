import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { purgeCustomer, purgeExpired, purgeKey, purgeKeyOk } from "@/lib/poc/privacy";

export const maxDuration = 300;

const Body = z.object({
  /** Torrkörning: räknar bara. */
  torr: z.boolean().optional(),
  /** Kundens begäran: rensa kundens ordrar på e-post i stället för de vars tid har gått ut. */
  email: z.email().max(200).optional(),
});

/**
 * Tar bort kundens personuppgifter ur ordrarna (lib/poc/privacy.ts). Tänkt att anropas av ett schema på Railway en
 * gång om dygnet (`curl -X POST -H "x-api-key: $POC_RENSA_KEY" https://…/api/v1/poc/rensa`), och av Craft när en kund
 * ber om det (`{ "email": "…" }`). `{ "torr": true }` eller `?torr=1` räknar bara. Kräver Crafts inloggning eller
 * nyckeln i `POC_RENSA_KEY`; i produktion utan nyckeln går det bara med Crafts inloggning. Med demots lösenord påslaget
 * (DEMO_PASSWORD) måste routen finnas bland de öppna adresserna i lib/access.ts för att schemat ska nå den.
 * Svar: `{ dryRun, months, orders, numbers, more, kept? }`.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-api-key");
  if (!(await roleFromRequest(req, "craft")) && !purgeKeyOk(key)) {
    if (key && !purgeKey()) console.warn("poc/rensa: POC_RENSA_KEY saknas i miljön – schemat kan inte rensa förrän den är satt.");
    return Response.json({ error: "Logga in som Craft, eller ange schemats nyckel (x-api-key)." }, { status: 401 });
  }
  // Utan kropp körs rensningen med tiden, som schemat gör.
  const text = (await req.text().catch(() => "")).replace(/^﻿/, "").trim();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = null;
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig begäran: { torr?: boolean, email?: string }." }, { status: 400 });
  const q = new URL(req.url).searchParams.get("torr");
  const dryRun = parsed.data.torr ?? (q === "1" || q === "true");
  try {
    const out = parsed.data.email ? await purgeCustomer(parsed.data.email, { dryRun }) : await purgeExpired({ dryRun });
    return Response.json(out);
  } catch (e) {
    console.error("poc/rensa", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte rensa kunduppgifterna." }, { status: 500 });
  }
}
