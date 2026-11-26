"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MAX_QTY } from "@/components/newwave/clubshop/pricing";
import { createLimiter } from "@/lib/demoLimit";
import { intersportClub } from "@/lib/intersport";
import { createOrder, customerStatusPath, findOrderForCustomer, PocError } from "@/lib/poc/orders";
import { isVisitorId, VISITOR_COOKIE } from "@/lib/visits";

/**
 * Kassans väg in i plattformen. Körs på servern och anropar kärnan direkt, så att butikens API-nyckel aldrig når
 * webbläsaren. Priset och frakten räknas av kärnan; webbläsaren skickar bara vilka varor, storlek, antal och
 * leveranssätt.
 */

const Input = z.object({
  clubId: z.string().min(1).max(120),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(200),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(300).optional(),
  }),
  delivery: z.enum(["ombud", "hem", "butik"]),
  lines: z
    .array(z.object({ clubProductId: z.string().min(1).max(80), size: z.string().trim().max(20).optional(), qty: z.number().int().min(1).max(MAX_QTY) }))
    .min(1)
    .max(30),
});

export type ClubOrderInput = z.input<typeof Input>;
/** Plattformens order: numret, statussidan och summan som plattformen räknat, med frakten. */
export type ClubOrderResult = { ok: true; number: string; statusUrl: string; totalSek: number; shipping?: { label: string; priceSek: number } } | { ok: false; error: string };

export async function placeClubOrder(raw: ClubOrderInput): Promise<ClubOrderResult> {
  const input = Input.safeParse(raw);
  if (!input.success) return { ok: false, error: "Kontrollera dina uppgifter och försök igen." };
  const { clubId, customer, delivery, lines } = input.data;
  if (!(await intersportClub(clubId))) return { ok: false, error: "Klubbshoppen finns inte." };
  try {
    const { order, token } = await createOrder({ clubId, customer, delivery, lines });
    const shipping = order.shipping ? { label: order.shipping.label, priceSek: order.shipping.priceSek } : undefined;
    return { ok: true, number: order.number, statusUrl: customerStatusPath(order, token), totalSek: order.totalSek, shipping };
  } catch (e) {
    if (e instanceof PocError && e.status === 400) {
      const why = e.issues?.find((i) => i.path.startsWith("lines."))?.message;
      return { ok: false, error: why ? `En vara i korgen går inte att beställa just nu (${why.toLowerCase()}). Ta bort den och försök igen.` : "Kontrollera dina uppgifter och försök igen." };
    }
    console.error("[kassan] ordern kunde inte skickas", e);
    return { ok: false, error: "Beställningen kunde inte skickas just nu. Försök igen om en stund – ingenting har dragits." };
  }
}

// ── Hitta din order ─────────────────────────────────────────────────────────

/**
 * Försöken att slå upp en order begränsas, eftersom kärnan inte gör det: högst 5 per besökare (besökscookien) och 20 per
 * adress på tio minuter, så att det inte går att pröva sig fram till ordernummer och e-post. Taket per adress gäller
 * även den som slänger cookien, och räcker för flera kunder bakom samma nät.
 */
const LOOKUP_WINDOW = 10 * 60_000;
// På globalThis, så att räkningen överlever när modulen laddas om i dev.
const g = globalThis as unknown as { nwOrderLookups?: { visitor: ReturnType<typeof createLimiter>; ip: ReturnType<typeof createLimiter> } };
const limits = (g.nwOrderLookups ??= {
  visitor: createLimiter(() => ({ perKey: 5, global: 2000, windowMs: LOOKUP_WINDOW })),
  ip: createLimiter(() => ({ perKey: 20, global: 2000, windowMs: LOOKUP_WINDOW })),
});

async function lookupAllowed() {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "okänd";
  const visitor = jar.get(VISITOR_COOKIE)?.value;
  if (!limits.ip.take(ip).ok) return false;
  return isVisitorId(visitor) ? limits.visitor.take(visitor).ok : true;
}

export type FindOrderState = { error?: string; number?: string; email?: string };

/**
 * Kunden slår upp sin order med ordernummer och e-post. Stämmer båda skickas kunden till statussidan; annars ett och
 * samma besked, så att sidan inte avslöjar om ett ordernummer finns.
 */
export async function findOrder(_prev: FindOrderState, form: FormData): Promise<FindOrderState> {
  const number = String(form.get("number") ?? "").trim().slice(0, 40);
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  if (!number || !email) return { error: "Fyll i ordernumret och e-postadressen.", number, email };
  if (!(await lookupAllowed())) return { error: "För många försök. Vänta en stund och försök igen, eller hör av dig till kundservice@intersport.se.", number, email };
  let path: string | null = null;
  try {
    path = await findOrderForCustomer(number, email);
  } catch (e) {
    console.error("[klubbshop] ordern kunde inte sökas", e);
    return { error: "Det gick inte att söka just nu. Försök igen om en stund.", number, email };
  }
  if (!path) return { error: "Vi hittar ingen order med det ordernumret och den e-postadressen. Kontrollera uppgifterna i bekräftelsen och försök igen.", number, email };
  redirect(path);
}
