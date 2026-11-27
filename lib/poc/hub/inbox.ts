import { createHash } from "node:crypto";
import { applyOrderStatus, PocError } from "../orders";
import { query, tx } from "../db";
import { alert } from "./alert";
import { EVENT_TYPES, type InvalidEvent, type ParsedEvents } from "./mapping-in";
import { applyProducts, deleteProducts } from "./products";
import { applyStock } from "./stock";
import type { HubEvent, HubEventType } from "./types";

/**
 * Inkorgen för hubbens händelser. Varje händelse sparas i `hub_inbox` med sitt id som nyckel, så att samma händelse
 * bara behandlas en gång även när hubben skickar om den. Händelserna fördelas: `order.status` → `applyOrderStatus`,
 * `stock.updated` → `applyStock`, `product.upsert` → `applyProducts`, `product.delete` → `deleteProducts`.
 *
 * Utfallet per händelse, och vad hubben ska göra (se även docs/hubb-api.yaml):
 * - `behandlad` – klar. `dubblett` – samma id är redan behandlat (eller avvisat); inget görs igen.
 * - `avvisad` – går inte att genomföra, t.ex. okänd order eller ett steg som inte är tillåtet. Försök inte igen med samma
 *   id; vi larmar och Craft ser den på integrationssidan.
 * - `ogiltig` – fälten stämmer inte med formatet. Försök inte igen förrän händelsen är rättad (samma id går då bra).
 * - `misslyckad` – tillfälligt fel hos oss (t.ex. databasen). Skicka om; samma id behandlas då igen.
 * - `pågår` – samma id behandlas just nu av ett annat anrop. Skicka om senare; då blir den `dubblett` eller behandlas.
 *
 * Händelserna behandlas i den ordning de kommer. Hanterarna är idempotenta (status sätts, inte räknas upp), så om
 * processen stannar mitt i en händelse och hubben skickar om den blir resultatet detsamma.
 */

export type InboxStatus = "behandlas" | "behandlad" | "avvisad" | "ogiltig" | "misslyckad";

export type EventOutcome = "behandlad" | "dubblett" | "avvisad" | "ogiltig" | "misslyckad" | "pågår";

export type EventResult = {
  /** Händelsens plats i anropet, från 0. */
  index: number;
  id?: string;
  type?: string;
  status: EventOutcome;
  /** Om hubben ska skicka händelsen igen. */
  retry: boolean;
  message?: string;
  /** För en dubblett: hur det gick första gången. */
  previous?: InboxStatus;
  issues?: { path: string; message: string }[];
};

/** Hur länge färdiga händelser sparas. Dubblettskyddet gäller lika länge. */
const KEEP_DAYS = 30;
/** En händelse som stått på "behandlas" så här länge räknas som avbruten (processen stannade) och får tas upp igen. */
const STALE_MIN = 5;
/** Större innehåll än så sparas förkortat; behandlingen använder alltid hela händelsen. */
const PAYLOAD_MAX = 200_000;
/** Ett larm per slag och timme. */
const ALERT_EVERY_MIN = 60;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hub_inbox (
  id text PRIMARY KEY,
  type text NOT NULL,
  at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  deliveries integer NOT NULL DEFAULT 1,
  message text,
  summary text NOT NULL DEFAULT '',
  digest text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_inbox_received ON hub_inbox (received_at DESC);
CREATE INDEX IF NOT EXISTS hub_inbox_status ON hub_inbox (status, updated_at);

-- Anrop som avvisades innan händelserna lästes (fel signatur, för stor kropp …) och problem med händelser: en rad per
-- slag, så att tabellen aldrig växer. alerted_at håller larmen till ett per slag och timme.
CREATE TABLE IF NOT EXISTS hub_inbox_notices (
  key text PRIMARY KEY,
  count bigint NOT NULL DEFAULT 0,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  last_text text NOT NULL DEFAULT '',
  alerted_at timestamptz
);
`;

const g = globalThis as unknown as { pocHubInboxSchema?: { sql: string; ready: Promise<void> }; pocHubInboxPruned?: number };

/** Skapar tabellerna en gång per process, med ett eget lås i databasen. Ändras schemat i dev körs det igen. */
function ready(): Promise<void> {
  if (g.pocHubInboxSchema?.sql !== SCHEMA) {
    const run = tx(async (db) => {
      await query("SELECT pg_advisory_xact_lock(4711040)", [], db);
      await query(SCHEMA, [], db);
    });
    g.pocHubInboxSchema = { sql: SCHEMA, ready: run };
    run.catch(() => {
      if (g.pocHubInboxSchema?.ready === run) g.pocHubInboxSchema = undefined;
    });
  }
  return g.pocHubInboxSchema!.ready;
}

type Row = Record<string, unknown>;

async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  return query<T>(sql, params);
}

/** Rensar färdiga händelser äldre än KEEP_DAYS, högst en gång i timmen per process. */
async function prune() {
  if (g.pocHubInboxPruned && Date.now() - g.pocHubInboxPruned < 60 * 60 * 1000) return;
  g.pocHubInboxPruned = Date.now();
  await q(`DELETE FROM hub_inbox WHERE status IN ('behandlad', 'avvisad', 'ogiltig') AND updated_at < now() - make_interval(days => $1)`, [KEEP_DAYS]).catch((e) =>
    console.error("hub/inbox rensning", e instanceof Error ? e.message : e),
  );
}

// ── Larm och avvisade anrop ─────────────────────────────────────────────────

export type NoticeKey = `anrop.${"signatur" | "storlek" | "format" | "stängd"}` | `händelse.${"avvisad" | "ogiltig" | "misslyckad"}`;

/**
 * Noterar ett problem (räknas per slag) och larmar, högst en gång per slag och timme. Misslyckas databasen larmas det
 * ändå, så att larmet inte försvinner när det behövs som mest.
 */
export async function notice(key: NoticeKey, text: string): Promise<void> {
  const short = text.slice(0, 500);
  let send = true;
  try {
    const rows = await q<{ alert: boolean }>(
      `INSERT INTO hub_inbox_notices AS n (key, count, last_text, alerted_at) VALUES ($1, 1, $2, now())
       ON CONFLICT (key) DO UPDATE SET count = n.count + 1, last_at = now(), last_text = $2,
         alerted_at = CASE WHEN n.alerted_at IS NULL OR n.alerted_at < now() - make_interval(mins => $3) THEN now() ELSE n.alerted_at END
       RETURNING alerted_at = now() AS alert`,
      [key, short, ALERT_EVERY_MIN],
    );
    send = Boolean(rows[0]?.alert);
  } catch (e) {
    console.error("hub/inbox notering", e instanceof Error ? e.message : e);
  }
  // alert() skriver själv i loggen och kastar aldrig.
  if (send) await alert(`hubb-in:${key}`, `Hubbens händelser till oss: ${short}`);
  else console.warn(`hub/inbox ${key}: ${short}`);
}

// ── Behandlingen ────────────────────────────────────────────────────────────

const digestOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v ?? null)).digest("hex").slice(0, 32);

/** Händelsens innehåll för jämförelsen: typen och datan. Tiden räknas inte, så att ett nytt försök med ny tid är samma händelse. */
const contentDigest = (e: { type: string; data: unknown }) => digestOf({ type: e.type, data: e.data });

/** Innehållet som sparas: hela händelsen, eller förkortad om den är stor (t.ex. ett helt lager). */
function stored(event: unknown): unknown {
  const json = JSON.stringify(event ?? null);
  if (json.length <= PAYLOAD_MAX) return event ?? null;
  const e = (event ?? {}) as { id?: unknown; type?: unknown; at?: unknown; data?: Record<string, unknown> };
  const counts = Object.fromEntries(Object.entries(e.data ?? {}).map(([k, v]) => [k, Array.isArray(v) ? `${v.length} rader` : v]));
  return { id: e.id, type: e.type, at: e.at, data: counts, förkortad: `${Math.round(json.length / 1000)} kB` };
}

/** En rad om händelsen för integrationssidan och loggen. */
export function describe(event: HubEvent): string {
  switch (event.type) {
    case "order.status": {
      const d = event.data;
      const who = d.producer ? ` (${d.producer === "stickeri" ? "stickeriet" : "tryckeriet"})` : "";
      const extra = [d.tracking ? `spårning ${d.tracking}${d.carrier ? ` hos ${d.carrier}` : ""}` : "", d.note ?? ""].filter(Boolean).join(" · ");
      return `${d.orderNumber} → ${d.status}${who}${extra ? ` · ${extra}` : ""}`;
    }
    case "stock.updated":
      return `${event.data.items.length} lagerrader${event.data.full ? " (hela lagret)" : ""}`;
    case "product.upsert": {
      // Raderna är oprövade här (products.ts prövar dem), så namnet kan saknas.
      const names = event.data.products.slice(0, 3).map((p) => {
        const o = (p ?? {}) as { name?: unknown; sku?: unknown };
        return typeof o.name === "string" ? o.name : typeof o.sku === "string" ? o.sku : "?";
      });
      return `${event.data.products.length} ${event.data.products.length === 1 ? "produkt" : "produkter"}: ${names.join(", ")}${event.data.products.length > 3 ? " …" : ""}`;
    }
    case "product.delete":
      return `Tar bort ${event.data.skus.slice(0, 5).join(", ")}${event.data.skus.length > 5 ? ` och ${event.data.skus.length - 5} till` : ""}`;
  }
}

type Handled = { ok: true; message?: string } | { ok: false; permanent: boolean; message: string };

/** Hanterarnas svar: `{ ok: false, message }` är ett besked (avvisad); allt annat räknas som klart. */
function fromResult(r: unknown, fallback: string): Handled {
  const o = r && typeof r === "object" ? (r as { ok?: unknown; message?: unknown }) : {};
  const message = typeof o.message === "string" && o.message ? o.message : undefined;
  if (o.ok === false) return { ok: false, permanent: true, message: message ?? "Avvisad utan förklaring" };
  return { ok: true, message: message ?? fallback };
}

async function dispatch(event: HubEvent): Promise<Handled> {
  switch (event.type) {
    case "order.status":
      return fromResult(await applyOrderStatus(event.data), `${event.data.orderNumber}: ${event.data.status}`);
    case "stock.updated":
      // Händelsens tid följer med, så att ett äldre saldo som kommer sent inte skriver över ett nyare.
      return fromResult(await applyStock(event.data.items, event.data.full, event.at), `${event.data.items.length} lagerrader`);
    case "product.upsert":
      return fromResult(await applyProducts(event.data.products), `${event.data.products.length} produkter`);
    case "product.delete":
      return fromResult(await deleteProducts(event.data.skus), `${event.data.skus.length} borttagna`);
  }
}

/** Ett kastat fel: PocError med en 4xx-kod är ett besked (avvisad), allt annat tillfälligt. */
function fromError(e: unknown): Handled {
  if (e instanceof PocError && e.status < 500) return { ok: false, permanent: true, message: e.message };
  return { ok: false, permanent: false, message: e instanceof Error ? e.message.slice(0, 300) : "Okänt fel" };
}

/**
 * Tar emot en händelse: sparar den, behandlar den om den inte redan är behandlad och ger utfallet. Kastar inte; ett
 * fel i databasen blir `misslyckad`, så att hubben skickar om.
 */
export async function recordEvent(event: HubEvent, index = 0): Promise<EventResult> {
  const head = { index, id: event.id, type: event.type };
  const digest = contentDigest(event);
  let claimed: { attempts: number }[];
  try {
    claimed = await q<{ attempts: number }>(
      `INSERT INTO hub_inbox AS i (id, type, at, status, attempts, summary, digest, payload) VALUES ($1, $2, $3, 'behandlas', 1, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET status = 'behandlas', attempts = i.attempts + 1, deliveries = i.deliveries + 1, last_received_at = now(),
         type = EXCLUDED.type, at = EXCLUDED.at, summary = EXCLUDED.summary, digest = EXCLUDED.digest, payload = EXCLUDED.payload, message = NULL, updated_at = now()
       WHERE i.status IN ('misslyckad', 'ogiltig') OR (i.status = 'behandlas' AND i.updated_at < now() - make_interval(mins => $7))
       RETURNING attempts`,
      [event.id, event.type, event.at, describe(event).slice(0, 300), digest, JSON.stringify(stored(event)), STALE_MIN],
    );
  } catch (e) {
    const message = `Kunde inte spara händelsen: ${e instanceof Error ? e.message : e}`;
    await notice("händelse.misslyckad", `${event.type} ${event.id}: ${message}`);
    return { ...head, status: "misslyckad", retry: true, message };
  }

  if (!claimed.length) return duplicate(head, digest);

  let handled: Handled;
  try {
    handled = await dispatch(event);
  } catch (e) {
    handled = fromError(e);
  }
  const status: InboxStatus = handled.ok ? "behandlad" : handled.permanent ? "avvisad" : "misslyckad";
  await q("UPDATE hub_inbox SET status = $2, message = $3, processed_at = CASE WHEN $2 = 'misslyckad' THEN processed_at ELSE now() END, updated_at = now() WHERE id = $1", [
    event.id,
    status,
    handled.message?.slice(0, 1000) ?? null,
  ]).catch((e) => console.error("hub/inbox status", event.id, e instanceof Error ? e.message : e));
  void prune();

  if (handled.ok) {
    console.log("hub/inbox", event.type, event.id, handled.message ?? "");
    return { ...head, status: "behandlad", retry: false, message: handled.message };
  }
  if (handled.permanent) {
    await notice("händelse.avvisad", `${event.type} ${event.id} avvisad: ${handled.message}`);
    return { ...head, status: "avvisad", retry: false, message: handled.message };
  }
  await notice("händelse.misslyckad", `${event.type} ${event.id} misslyckades: ${handled.message}`);
  return { ...head, status: "misslyckad", retry: true, message: "Tillfälligt fel hos oss – skicka händelsen igen om en stund" };
}

/** Samma id har kommit förut: berätta hur det gick, eller att den behandlas just nu. */
async function duplicate(head: Pick<EventResult, "index" | "id" | "type">, digest: string): Promise<EventResult> {
  const [row] = await q<{ status: InboxStatus; message: string | null; digest: string }>(
    "UPDATE hub_inbox SET deliveries = deliveries + 1, last_received_at = now() WHERE id = $1 RETURNING status, message, digest",
    [head.id],
  ).catch(() => []);
  if (!row) return { ...head, status: "misslyckad", retry: true, message: "Kunde inte läsa händelsen – skicka igen" };
  if (row.status === "behandlas") return { ...head, status: "pågår", retry: true, message: "Händelsen behandlas redan – skicka igen om en stund" };
  const changed = row.digest && row.digest !== digest;
  if (changed) console.warn("hub/inbox", head.id, "samma id med annat innehåll – behandlas inte igen");
  return {
    ...head,
    status: "dubblett",
    retry: false,
    previous: row.status,
    message: changed ? "Samma id med annat innehåll – skicka ändringen som en ny händelse med nytt id" : (row.message ?? undefined),
  };
}

/** En händelse som inte gick att tolka sparas som ogiltig, så att den syns. Utan id får den ett id ur innehållet. */
async function recordInvalid(inv: InvalidEvent): Promise<EventResult> {
  const id = inv.id ?? `utan-id-${digestOf(inv.raw).slice(0, 16)}`;
  const message = inv.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
  const type = inv.type && EVENT_TYPES.includes(inv.type as HubEventType) ? inv.type : inv.type ? `okänd: ${inv.type}` : "okänd";
  const saved = await q(
    `INSERT INTO hub_inbox AS i (id, type, at, status, attempts, message, summary, digest, payload, processed_at) VALUES ($1, $2, now(), 'ogiltig', 1, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET status = 'ogiltig', attempts = i.attempts + 1, deliveries = i.deliveries + 1, last_received_at = now(), message = EXCLUDED.message,
       payload = EXCLUDED.payload, digest = EXCLUDED.digest, processed_at = now(), updated_at = now()
     WHERE i.status IN ('ogiltig', 'misslyckad')
     RETURNING id`,
    [id, type.slice(0, 60), message.slice(0, 1000), "Ogiltig händelse", digestOf(inv.raw), JSON.stringify(stored(inv.raw))],
  ).catch((e) => {
    console.error("hub/inbox ogiltig", e instanceof Error ? e.message : e);
    return [{}];
  });
  // Samma id som redan är behandlat: det giltiga utfallet gäller.
  if (!saved.length) return duplicate({ index: inv.index, id, type: inv.type }, digestOf(inv.raw));
  await notice("händelse.ogiltig", `${inv.type ?? "okänd typ"} ${inv.id ?? "(utan id)"}: ${message}`);
  return { index: inv.index, id: inv.id, type: inv.type, status: "ogiltig", retry: false, message: "Händelsen följer inte formatet", issues: inv.issues };
}

/**
 * Behandlar ett helt anrop, en händelse i taget i den ordning de kom. Ger svaret till hubben:
 * - 200 – allt är taget om hand (behandlat, dubbletter, eller avvisat/ogiltigt bland andra som gick bra).
 * - 422 – inget gick att genomföra: alla händelser avvisades eller var ogiltiga. Försök inte igen med samma innehåll.
 * - 503 – minst en händelse fick ett tillfälligt fel (`retry: true`). Skicka om anropet; det som redan är behandlat blir
 *   dubbletter.
 */
export async function receiveEvents(parsed: ParsedEvents): Promise<{ status: 200 | 422 | 503; body: { received: number; results: EventResult[] } }> {
  const items = [...parsed.events.map((e) => ({ index: e.index, event: e.event })), ...parsed.invalid.map((inv) => ({ index: inv.index, inv }))].sort((a, b) => a.index - b.index);
  const results: EventResult[] = [];
  for (const it of items) results.push("event" in it ? await recordEvent(it.event, it.index) : await recordInvalid(it.inv));
  const retry = results.some((r) => r.retry);
  const anyDone = results.some((r) => r.status === "behandlad" || r.status === "dubblett");
  const status = retry ? 503 : results.length && !anyDone ? 422 : 200;
  return { status, body: { received: results.length, results } };
}

// ── För integrationssidan ───────────────────────────────────────────────────

export type InboxEntry = {
  id: string;
  type: string;
  at: string;
  receivedAt: string;
  lastReceivedAt: string;
  processedAt?: string;
  status: InboxStatus;
  attempts: number;
  /** Hur många gånger hubben skickat händelsen (fler än 1: nya försök eller dubbletter). */
  deliveries: number;
  summary: string;
  message?: string;
};

export type EventSummary = {
  total: number;
  last24h: number;
  lastReceivedAt?: string;
  byType: { type: string; count: number; last24h: number; problems: number; lastAt?: string }[];
  byStatus: Record<InboxStatus, number>;
  /** De senaste händelserna. */
  recent: InboxEntry[];
  /** De senaste som avvisades, var ogiltiga eller misslyckades. */
  problems: InboxEntry[];
  /** Anrop som avvisades innan händelserna lästes, och problemen med händelser, per slag. */
  notices: { key: NoticeKey; count: number; firstAt: string; lastAt: string; lastText: string }[];
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : undefined);

const entry = (r: Row): InboxEntry => ({
  id: String(r.id),
  type: String(r.type),
  at: iso(r.at)!,
  receivedAt: iso(r.received_at)!,
  lastReceivedAt: iso(r.last_received_at)!,
  processedAt: iso(r.processed_at),
  status: r.status as InboxStatus,
  attempts: Number(r.attempts),
  deliveries: Number(r.deliveries),
  summary: String(r.summary ?? ""),
  message: (r.message as string | null) ?? undefined,
});

const COLS = "id, type, at, received_at, last_received_at, processed_at, status, attempts, deliveries, summary, message";

/** Senaste händelserna, felen och antalen per typ, för Crafts integrationssida. */
export async function eventSummary(limit = 25): Promise<EventSummary> {
  const [types, statuses, recent, problems, notices] = await Promise.all([
    q(
      `SELECT type, count(*)::int AS count, count(*) FILTER (WHERE received_at > now() - interval '24 hours')::int AS last24h,
         count(*) FILTER (WHERE status IN ('avvisad', 'ogiltig', 'misslyckad'))::int AS problems, max(last_received_at) AS last_at
       FROM hub_inbox GROUP BY type ORDER BY max(last_received_at) DESC`,
    ),
    q("SELECT status, count(*)::int AS count FROM hub_inbox GROUP BY status"),
    q(`SELECT ${COLS} FROM hub_inbox ORDER BY last_received_at DESC LIMIT $1`, [limit]),
    q(`SELECT ${COLS} FROM hub_inbox WHERE status IN ('avvisad', 'ogiltig', 'misslyckad') ORDER BY updated_at DESC LIMIT 10`),
    q("SELECT key, count, first_at, last_at, last_text FROM hub_inbox_notices ORDER BY last_at DESC"),
  ]);
  const byStatus: Record<InboxStatus, number> = { behandlas: 0, behandlad: 0, avvisad: 0, ogiltig: 0, misslyckad: 0 };
  for (const r of statuses) byStatus[r.status as InboxStatus] = Number(r.count);
  const byType = types.map((r) => ({ type: String(r.type), count: Number(r.count), last24h: Number(r.last24h), problems: Number(r.problems), lastAt: iso(r.last_at) }));
  return {
    total: byType.reduce((n, t) => n + t.count, 0),
    last24h: byType.reduce((n, t) => n + t.last24h, 0),
    lastReceivedAt: byType.map((t) => t.lastAt).filter(Boolean).sort().at(-1),
    byType,
    byStatus,
    recent: recent.map(entry),
    problems: problems.map(entry),
    notices: notices.map((r) => ({ key: r.key as NoticeKey, count: Number(r.count), firstAt: iso(r.first_at)!, lastAt: iso(r.last_at)!, lastText: String(r.last_text) })),
  };
}
