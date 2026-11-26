"use server";

import { refresh } from "next/cache";
import { hasRole } from "@/lib/poc/auth";
import { cancelOrder, PocError, retryErp } from "@/lib/poc/orders";

/** Knapparna i Crafts ordervy. Varje anrop kontrollerar Crafts inloggning på nytt. */

export type OrderActionState = { error?: string; done?: string };

const REASON_MAX = 300;

async function craft(): Promise<OrderActionState | null> {
  return (await hasRole("craft")) ? null : { error: "Du är utloggad. Ladda om sidan och logga in som Craft igen." };
}

function failed(e: unknown, what: string): OrderActionState {
  if (!(e instanceof PocError)) console.error(`[craft] ${what}`, e);
  return { error: e instanceof PocError ? e.message : `${what.charAt(0).toUpperCase()}${what.slice(1)} gick inte. Försök igen.` };
}

/** Avbryter ordern med Crafts orsak, så länge inget jobb börjat tillverkas (annars förklarar felet varför). */
export async function cancelOrderAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const denied = await craft();
  if (denied) return denied;
  const id = String(form.get("orderId") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, REASON_MAX);
  if (!reason) return { error: "Skriv varför ordern avbryts – kunden och producenterna ser orsaken." };
  try {
    const order = await cancelOrder(id, reason);
    refresh();
    return { done: `Order ${order.number} är avbruten.` };
  } catch (e) {
    return failed(e, "att avbryta ordern");
  }
}

/** Skickar en order som affärssystemet inte bekräftat (status "mottagen") till affärssystemet igen. */
export async function retryErpAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const denied = await craft();
  if (denied) return denied;
  try {
    const order = await retryErp(String(form.get("orderId") ?? ""));
    refresh();
    return { done: `Bekräftad i Crafts affärssystem: ${order.erpRef ?? "utan ordernummer"}.` };
  } catch (e) {
    return failed(e, "att skicka ordern igen");
  }
}
