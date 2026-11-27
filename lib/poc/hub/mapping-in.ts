import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { HubEvent, HubEventType } from "./types";

/**
 * Översättningen in: hur hubbens anrop till oss (webhooken) signeras och hur dess händelser ser ut. Det här är den enda
 * filen som ska ändras när New Waves API-beskrivning kommer – rubrikerna och algoritmen i `verifySignature`, fältnamnen
 * i schemana nedan (eller en översättning från deras format i `parseEvents`). Resten av flödet ser bara `HubEvent`.
 *
 * Tills dess är formatet vårt eget (lib/poc/hub/types.ts), beskrivet i docs/hubb-api.yaml:
 * - `X-Hub-Timestamp`: unix-sekunder när anropet skickades; måste ligga inom ±5 minuter från vår klocka.
 * - `X-Hub-Signature-256`: `sha256=<hex>`, HMAC-SHA256 med hemligheten över `${timestamp}.${kroppen}` (kroppen exakt som
 *   den skickades, byte för byte).
 * - Kroppen: en händelse, en lista med händelser eller `{ "events": [...] }`.
 */

export const TIMESTAMP_HEADER = "x-hub-timestamp";
export const SIGNATURE_HEADER = "x-hub-signature-256";
const SIGNATURE_PREFIX = "sha256=";
/** Hur långt från vår klocka anropets tid får ligga, så att ett uppfångat anrop inte kan skickas om senare. */
export const TOLERANCE_S = 5 * 60;
/** Största kropp vi tar emot. Ett helt lager med några tusen rader får plats med god marginal. */
export const MAX_BODY_BYTES = 1_000_000;
/** Flest händelser i ett anrop. */
export const MAX_EVENTS = 500;

/**
 * Hemligheten (eller hemligheterna) för signaturen, ur `HUB_WEBHOOK_SECRET`. Flera kan anges med komma emellan, så att
 * en ny hemlighet kan läggas in innan hubben byter och den gamla tas bort efteråt.
 */
export function webhookSecrets(): string[] {
  return (process.env.HUB_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

const hmac = (secret: string, timestamp: string, body: Buffer) => createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();

/**
 * Kontrollerar anropets signatur och tid. `now` i millisekunder. Jämförelsen görs i konstant tid. Tiden får anges i
 * sekunder (standard) eller millisekunder.
 */
export function verifySignature({ body, headers, secrets, now = Date.now() }: { body: Buffer; headers: Headers; secrets: string[]; now?: number }): SignatureCheck {
  if (!secrets.length) return { ok: false, reason: "Ingen hemlighet är inställd" };
  const timestamp = headers.get(TIMESTAMP_HEADER)?.trim();
  if (!timestamp) return { ok: false, reason: "X-Hub-Timestamp saknas" };
  if (!/^\d{9,14}$/.test(timestamp)) return { ok: false, reason: "X-Hub-Timestamp ska vara unix-sekunder" };
  const n = Number(timestamp);
  const seconds = n > 1e12 ? n / 1000 : n;
  if (Math.abs(now / 1000 - seconds) > TOLERANCE_S) return { ok: false, reason: "X-Hub-Timestamp ligger mer än 5 minuter från vår klocka (ett gammalt anrop, eller fel klocka hos avsändaren)" };

  const header = headers.get(SIGNATURE_HEADER)?.trim();
  if (!header) return { ok: false, reason: "X-Hub-Signature-256 saknas" };
  const given = header
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.toLowerCase().startsWith(SIGNATURE_PREFIX))
    .map((s) => s.slice(SIGNATURE_PREFIX.length))
    .filter((hex) => /^[0-9a-f]{64}$/i.test(hex))
    .map((hex) => Buffer.from(hex, "hex"));
  if (!given.length) return { ok: false, reason: "X-Hub-Signature-256 ska vara sha256=<64 hextecken>" };

  // Varje kombination prövas utan att avbryta i förtid, så att tiden inte avslöjar vilken som stämde.
  let match = false;
  for (const secret of secrets) {
    const want = hmac(secret, timestamp, body);
    for (const g of given) if (timingSafeEqual(want, g)) match = true;
  }
  return match ? { ok: true } : { ok: false, reason: "Signaturen stämmer inte (fel hemlighet, eller kroppen ändrad på vägen)" };
}

/** Rubrikerna för ett signerat anrop, för våra egna prov. `now` i millisekunder. */
export function signatureHeaders(body: string | Buffer, secret: string, now = Date.now()): Record<string, string> {
  const timestamp = String(Math.floor(now / 1000));
  const sig = hmac(secret, timestamp, Buffer.isBuffer(body) ? body : Buffer.from(body)).toString("hex");
  return { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: `${SIGNATURE_PREFIX}${sig}` };
}

// ── Händelserna ─────────────────────────────────────────────────────────────

/** Tomma texter räknas som att fältet saknas. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const when = z
  .string()
  .trim()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Ska vara en tid i ISO 8601, t.ex. 2026-11-26T14:05:00Z" });

const Producer = z.enum(["tryckeri", "stickeri"]);
const Sku = z.string().trim().min(1).max(80);

const OrderStatusData = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  erpRef: text(80),
  status: z.enum(["bekräftad", "i produktion", "skickad", "levererad", "avbruten", "fel"]),
  producer: Producer.optional(),
  lineIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  tracking: text(100),
  carrier: text(80),
  note: text(500),
});

/**
 * Lagerrader och produkter prövas rad för rad av lib/poc/hub/stock.ts och products.ts, som tar in det som stämmer och
 * redovisar resten. Här krävs bara listan, så att en felaktig rad inte stoppar hela händelsen (t.ex. ett helt lager).
 */
const rows = (max: number, min = 0) => z.array(z.unknown()).min(min, "listan är tom").max(max, `högst ${max} rader`);

const base = { id: z.string().trim().min(1).max(200), at: when.optional() };

const EventSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ ...base, type: z.literal("order.status"), data: OrderStatusData }),
    z.object({ ...base, type: z.literal("stock.updated"), data: z.object({ items: rows(50_000), full: z.boolean().optional() }) }),
    z.object({ ...base, type: z.literal("product.upsert"), data: z.object({ products: rows(5_000, 1) }) }),
    z.object({ ...base, type: z.literal("product.delete"), data: z.object({ skus: z.array(Sku).min(1).max(5_000) }) }),
  ],
  { error: "Okänd händelsetyp: order.status, stock.updated, product.upsert eller product.delete" },
);

export const EVENT_TYPES: HubEventType[] = ["order.status", "stock.updated", "product.upsert", "product.delete"];

/** Felen på svenska i svaret till hubben, utan att ändra zod för resten av processen. */
const SV = z.locales.sv().localeError;

export type Issue = { path: string; message: string };

/** En händelse som inte gick att tolka. `id` och `type` när de fanns, så att svaret och loggen kan peka ut den. */
export type InvalidEvent = { index: number; id?: string; type?: string; issues: Issue[]; raw: unknown };

export type ParsedEvents = { events: { index: number; event: HubEvent }[]; invalid: InvalidEvent[] };

/**
 * Tar bort tecken som Postgres inte kan spara (NUL och ensamma surrogattecken), djupt i hela händelsen. Annars skulle
 * en sådan händelse misslyckas varje gång och skickas om i det oändliga.
 */
function clean(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.replaceAll("\u0000", "").toWellFormed();
  if (depth > 20 || !v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [clean(k, depth + 1) as string, clean(x, depth + 1)]));
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * Tolkar kroppen till händelser. Varje händelse prövas för sig: de som går att tolka behandlas, de andra rapporteras
 * som ogiltiga. Ger `error` om kroppen inte alls är händelser. `receivedAt` blir `at` för händelser utan tid.
 */
export function parseEvents(raw: unknown, receivedAt = new Date().toISOString()): ParsedEvents | { error: string } {
  const list: unknown[] | null = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
      ? (raw as { events: unknown[] }).events
      : raw && typeof raw === "object" && "type" in raw
        ? [raw]
        : null;
  if (!list) return { error: 'Kroppen ska vara en händelse, en lista med händelser eller { "events": [...] }' };
  if (list.length > MAX_EVENTS) return { error: `Högst ${MAX_EVENTS} händelser per anrop (fick ${list.length})` };

  const out: ParsedEvents = { events: [], invalid: [] };
  list.forEach((given, index) => {
    const item = clean(given);
    const r = EventSchema.safeParse(item, { error: SV });
    if (r.success) {
      out.events.push({ index, event: { ...r.data, at: r.data.at ? new Date(r.data.at).toISOString() : receivedAt } as HubEvent });
      return;
    }
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    out.invalid.push({
      index,
      id: str(o.id, 200),
      type: str(o.type, 40),
      issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
      raw: item,
    });
  });
  return out;
}
