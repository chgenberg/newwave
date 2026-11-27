/**
 * Larm när något i kopplingen mot hubben behöver en människa: en order som inte kommer fram, en avbokning som nekas,
 * hubben som saknar inställningar. Larmet skrivs alltid i loggen. Med `ALERT_WEBHOOK_URL` (t.ex. en Slack-webhook)
 * skickas `{ text }` dit också, högst en gång per nyckel och timme, så att ett fel som upprepas varje minut inte dränker
 * kanalen. `alert` kastar aldrig: ett larm som inte går fram får inte stoppa det som larmar.
 */

const HOUR_MS = 60 * 60_000;
const TIMEOUT_MS = 5_000;

/** När varje nyckel senast skickades, på globalThis så att räkningen överlever omladdning i dev. Per process. */
const g = globalThis as unknown as { pocAlertsSent?: Map<string, number> };
const sent = (g.pocAlertsSent ??= new Map<string, number>());

/** Nyckeln skiljer larm åt (t.ex. "hubb-misslyckad:IS-100001"); texten är det som visas. */
export async function alert(key: string, text: string): Promise<void> {
  try {
    console.error(`poc/larm [${key}] ${text}`);
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!url) return;
    const now = Date.now();
    if (now - (sent.get(key) ?? 0) < HOUR_MS) return;
    sent.set(key, now);
    if (sent.size > 1000) for (const [k, at] of sent) if (now - at >= HOUR_MS) sent.delete(k);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `Next Wave Commerce Hub: ${text}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return;
    // Gick det inte fram får nästa larm med samma nyckel försöka igen.
    sent.delete(key);
    console.error(`poc/larm [${key}] larmet gick inte fram: HTTP ${res.status}`);
  } catch (e) {
    sent.delete(key);
    console.error(`poc/larm [${key}] larmet gick inte fram:`, e instanceof Error ? e.message : e);
  }
}
