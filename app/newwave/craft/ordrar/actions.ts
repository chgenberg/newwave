"use server";

import { refresh } from "next/cache";
import { fmtTime } from "@/components/poc/craft/orderParts";
import { hasRole } from "@/lib/poc/auth";
import { PocError, resendToHub } from "@/lib/poc/orders";

/** Crafts "skicka igen" i ordervyn. Kontrollerar Crafts inloggning vid varje anrop. */

export type HubActionState = { error?: string; done?: string };

/**
 * Skickar en order som affärssystemet inte bekräftat till New Waves hubb igen, genom utkorgen: posten börjar om med nya
 * försök i ett dygn och första försöket görs direkt. Beskedet säger vad hubben svarade.
 */
export async function resendToHubAction(_prev: HubActionState, form: FormData): Promise<HubActionState> {
  if (!(await hasRole("craft"))) return { error: "Du är utloggad. Ladda om sidan och logga in som Craft igen." };
  try {
    const { order, outcome } = await resendToHub(String(form.get("orderId") ?? ""));
    refresh();
    switch (outcome.result) {
      case "skickad":
        return { done: order.erpRef ? `Bekräftad i Crafts affärssystem: ${order.erpRef}.` : "Mottagen i New Waves hubb – bekräftelsen med ordernummer kommer från affärssystemet." };
      case "väntar":
        return { error: `Hubben tog inte emot ordern (${outcome.error}). Den ligger kvar i utkorgen och skickas igen kl. ${fmtTime(outcome.nextAttemptAt)}.` };
      case "misslyckad":
        return { error: `Hubben nekade ordern: ${outcome.error}` };
      case "stoppad":
        return { error: "Ordern avbröts medan den skickades." };
      case "upptagen":
        return { done: "Ordern skickas till hubben just nu." };
    }
  } catch (e) {
    if (e instanceof PocError) return { error: e.message };
    console.error("[craft] skicka igen till hubben", e);
    return { error: "Att skicka ordern igen gick inte. Försök igen." };
  }
}
