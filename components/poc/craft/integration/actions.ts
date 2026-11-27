"use server";

import { refresh } from "next/cache";
import { hasRole } from "@/lib/poc/auth";
import { runHub } from "@/lib/poc/hub/outbox";

/** Knappen på Crafts integrationssida. Kontrollerar Crafts inloggning vid varje anrop. */

export type RunHubState = { error?: string; done?: string };

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Kör det som schemat kör varje minut – utkorgen och, med HUB_PULL=1, hämtningen av lager och produkter – men skickar
 * allt som väntar direkt, inte bara det som är på tur, t.ex. när hubben varit nere och är tillbaka.
 */
export async function runHubAction(): Promise<RunHubState> {
  if (!(await hasRole("craft"))) return { error: "Du är utloggad. Ladda om sidan och logga in som Craft igen." };
  try {
    const r = await runHub({ all: true });
    refresh();
    const o = r.outbox;
    const parts = o.processed
      ? [o.sent ? `${n(o.sent, "skickad", "skickade")}` : "", o.waiting ? `${o.waiting} väntar på nytt försök` : "", o.failed ? `${n(o.failed, "misslyckad", "misslyckade")}` : "", o.stopped ? `${n(o.stopped, "stoppad", "stoppade")}` : ""]
      : ["Inget i utkorgen väntade"];
    if (o.paused) parts.push(`körningen stannade: ${o.paused}`);
    if (r.pull?.error) parts.push(`hämtningen misslyckades: ${r.pull.error}`);
    else if (r.pull?.stock || r.pull?.products) parts.push(`hämtade ${r.pull.stock?.items ?? 0} lagerrader och ${r.pull.products?.items ?? 0} produkter`);
    const text = parts.filter(Boolean).join(", ");
    return o.failed || o.paused || r.pull?.error ? { error: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` } : { done: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` };
  } catch (e) {
    console.error("[craft] integration kör nu", e);
    return { error: "Det gick inte att köra utkorgen just nu. Försök igen." };
  }
}
