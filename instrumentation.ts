/**
 * Körs en gång när servern startar (Next.js, docs: instrumentation.md). Startar timern som varje minut kör utkorgen mot
 * New Waves hubb – nya ordrar och avbokningar som väntar på ett nytt försök, larmet om obekräftade ordrar och, med
 * HUB_PULL=1, hämtningen av lager och produkter (`runHub` i lib/poc/hub/outbox.ts, samma som POST /api/v1/hub/kor).
 *
 * Bara i Node-runtime och en gång per process. Utan DATABASE_URL startar den inte, och ett fel (t.ex. att databasen inte
 * svarar) skrivs i loggen en gång tills det ändras, utan att stoppa servern. Två processer, eller timern och schemat,
 * skickar aldrig samma sak (utkorgen låser posterna). `HUB_TIMER=0` stänger av timern, t.ex. när bara schemat ska köra.
 */

const EVERY_MS = 60_000;
/** Första körningen en stund efter starten, så att servern hinner bli klar. */
const FIRST_MS = 15_000;

const g = globalThis as unknown as { pocHubTimer?: ReturnType<typeof setInterval> };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (g.pocHubTimer || process.env.HUB_TIMER === "0") return;
  if (!process.env.DATABASE_URL) {
    console.warn("poc/hubb: DATABASE_URL saknas – timern för utkorgen mot hubben startar inte");
    return;
  }

  let running = false;
  let lastError = "";
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { runHub } = await import("./lib/poc/hub/outbox");
      const r = await runHub();
      const o = r.outbox;
      if (o.processed) console.log(`poc/hubb timern: ${o.sent} skickade, ${o.waiting} väntar, ${o.failed} misslyckade, ${o.stopped} stoppade${o.paused ? ` (paus: ${o.paused})` : ""}`);
      if (r.pull?.error) console.error(`poc/hubb timern: hämtningen från hubben: ${r.pull.error}`);
      lastError = "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== lastError) console.error("poc/hubb timern:", msg);
      lastError = msg;
    } finally {
      running = false;
    }
  };

  g.pocHubTimer = setInterval(tick, EVERY_MS);
  g.pocHubTimer.unref?.();
  setTimeout(tick, FIRST_MS).unref?.();
}
