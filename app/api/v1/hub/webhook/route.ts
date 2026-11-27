import { notice, receiveEvents } from "@/lib/poc/hub/inbox";
import { MAX_BODY_BYTES, parseEvents, verifySignature, webhookSecrets } from "@/lib/poc/hub/mapping-in";

export const maxDuration = 60;

/**
 * Ingången för New Waves hubb: orderstatus, lager och produkter (docs/hubb-api.yaml). Anropet signeras med
 * `HUB_WEBHOOK_SECRET` (lib/poc/hub/mapping-in.ts). Utan hemlighet är webhooken stängd i produktion (503) och öppen
 * med en varning vid utveckling. Fel signatur ger 401 och ett larm (högst ett i timmen).
 *
 * Svarskoderna och vad hubben ska göra:
 * - 200 – taget om hand; `results` har utfallet per händelse. Försök inte igen.
 * - 422 – inget gick att genomföra (alla avvisade eller ogiltiga). Försök inte igen med samma innehåll.
 * - 503 – tillfälligt fel (en händelse med `retry: true`, eller webhooken är stängd). Skicka om efter `Retry-After`.
 * - 400 – kroppen är inte händelser i rätt format, 401 – signaturen eller tiden stämmer inte, 413 – för stor kropp.
 *   Försök inte igen förrän anropet är rättat. Ett nytt försök ska signeras på nytt, med ny tid.
 */
export async function POST(req: Request) {
  const secrets = webhookSecrets();
  if (!secrets.length && process.env.NODE_ENV === "production") {
    await notice("anrop.stängd", "Ett anrop kom, men HUB_WEBHOOK_SECRET saknas i miljön – webhooken är stängd");
    return Response.json({ error: "Webhooken är inte inställd hos oss än. Försök igen senare." }, { status: 503, headers: { "Retry-After": "600" } });
  }

  const body = await readBody(req, MAX_BODY_BYTES);
  if (!body) {
    await notice("anrop.storlek", `Ett anrop var större än ${MAX_BODY_BYTES / 1_000_000} MB`);
    return Response.json({ error: `Kroppen får vara högst ${MAX_BODY_BYTES / 1_000_000} MB. Dela upp händelserna på flera anrop.` }, { status: 413 });
  }

  if (secrets.length) {
    const check = verifySignature({ body, headers: req.headers, secrets });
    if (!check.ok) {
      await notice("anrop.signatur", check.reason);
      return Response.json({ error: check.reason }, { status: 401 });
    }
  } else warnOpen();

  let raw: unknown;
  try {
    raw = JSON.parse(body.toString("utf8"));
  } catch {
    await notice("anrop.format", "Kroppen var inte JSON");
    return Response.json({ error: "Kroppen ska vara JSON" }, { status: 400 });
  }
  const parsed = parseEvents(raw);
  if ("error" in parsed) {
    await notice("anrop.format", parsed.error);
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { status, body: out } = await receiveEvents(parsed);
  return Response.json(out, { status, headers: status === 503 ? { "Retry-After": "60" } : undefined });
}

/** Läser kroppen som bytes, högst `max`. Ger null om den är större, utan att läsa resten. */
async function readBody(req: Request, max: number): Promise<Buffer | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const g = globalThis as unknown as { pocHubWebhookWarned?: boolean };

function warnOpen() {
  if (g.pocHubWebhookWarned) return;
  g.pocHubWebhookWarned = true;
  console.warn("hub/webhook: HUB_WEBHOOK_SECRET saknas – webhooken tar emot osignerade anrop (bara vid utveckling; i produktion är den stängd)");
}
