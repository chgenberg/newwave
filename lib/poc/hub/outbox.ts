import { randomBytes } from "node:crypto";
import { after } from "next/server";
import type { GarmentSpec, ScarfSpec } from "../build";
import { iso, newId, pool, query, tx, type Db } from "../db";
import { customerRemoved } from "../privacy";
import { addEvent, getOrderView, listClubProducts } from "../store";
import { PRODUCER_OF, type ClubProduct, type OrderLine, type OrderView } from "../types";
import { alert } from "./alert";
import { hub, HubError, hubConfig, setupError } from "./client";
import { hubOrderFiles } from "./files";
import type { HubFile, HubMode, HubOrder, HubOrderLine, OutboxItem, OutboxKind, OutboxStatus, OutboxSummary } from "./types";

/**
 * Utkorgen mot New Waves hubb: allt vi skickar till hubben (nya ordrar och avbokningar) går härifrån, med nya försök
 * tills hubben tagit emot det. Posten läggs i samma transaktion som ordern (lib/poc/orders.ts), så att en order aldrig
 * finns utan sin post. Första försöket görs direkt efter svaret till butiken; sedan efter 1, 5, 15, 30 och 60 minuter och
 * därefter varje timme i ett dygn. Kommer posten inte fram blir den "misslyckad", ett larm går och Craft kan skicka igen
 * från ordervyn.
 *
 * Fel som är värda nya försök: nätet, tidsgränsen, 5xx, 408 och 429 (med hubbens Retry-After). Övriga 4xx betyder att
 * hubben nekat posten: den blir "misslyckad" direkt. Är hubben inte inställd (adress eller nyckel saknas, eller nyckeln
 * nekas) väntar allt i utkorgen utan att försöken räknas, och ett larm går.
 *
 * Två körningar skickar aldrig samma post: en körning tar posten med `FOR UPDATE SKIP LOCKED` och håller den i fem
 * minuter (claim_id, locked_until). Dör processen mitt i tar nästa körning över, och hubben känner igen ordern på
 * Idempotency-Key (vårt ordernummer), så att den inte blir två.
 */

/** Pauserna efter varje misslyckat försök, i minuter. Efter det sista blir posten "misslyckad". */
export const RETRY_MINUTES: readonly number[] = [1, 5, 15, 30, 60, ...Array<number>(24).fill(60)];
export const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
/** Hur länge en körning håller en post. Längre än filbygget och hubbens tidsgräns (15 s) tillsammans. */
const LEASE_MS = 5 * 60_000;
/** Medan hubben inte är inställd provas posterna så här ofta, utan att försöken räknas. */
const SETUP_WAIT_MS = 60_000;
/** Efter så många försök (en knapp timme) larmar vi att hubben inte svarar, innan posten ger upp. */
const ALERT_AFTER_ATTEMPTS = 5;

// ── Raderna ─────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  kind: OutboxKind;
  order_id: string;
  order_number: string;
  idempotency_key: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: Date;
  claim_id: string | null;
  locked_until: Date | null;
  last_error: string | null;
  last_error_at: Date | null;
  erp_ref: string | null;
  created_at: Date;
  sent_at: Date | null;
  updated_at: Date;
};

const toItem = (r: Row): OutboxItem => ({
  id: r.id,
  kind: r.kind,
  orderId: r.order_id,
  orderNumber: r.order_number,
  idempotencyKey: r.idempotency_key,
  status: r.status,
  attempts: Number(r.attempts),
  nextAttemptAt: iso(r.next_attempt_at)!,
  sending: Boolean(r.claim_id && r.locked_until && new Date(r.locked_until).getTime() > Date.now()),
  ...(r.last_error ? { lastError: r.last_error } : {}),
  ...(r.last_error_at ? { lastErrorAt: iso(r.last_error_at) } : {}),
  ...(r.erp_ref ? { erpRef: r.erp_ref } : {}),
  createdAt: iso(r.created_at)!,
  ...(r.sent_at ? { sentAt: iso(r.sent_at) } : {}),
  updatedAt: iso(r.updated_at)!,
});

const SELECT = "SELECT h.*, o.number AS order_number FROM hub_outbox h JOIN orders o ON o.id = h.order_id";

/** Nyckeln som gör att hubben känner igen ett nytt försök: ordernumret, och för avbokningen ordernumret med "-avbokning". */
const idempotencyKey = (orderNumber: string, kind: OutboxKind) => (kind === "order.submit" ? orderNumber : `${orderNumber}-avbokning`);

const KIND_TEXT: Record<OutboxKind, { the: string; The: string }> = {
  "order.submit": { the: "ordern", The: "Ordern" },
  "order.cancel": { the: "avbokningen", The: "Avbokningen" },
};

// ── Att lägga i utkorgen (i orderns transaktion) ────────────────────────────

/** Lägger en post i utkorgen, i anroparens transaktion. Finns posten redan ges den. */
export async function enqueue(db: Db, order: { id: string; number: string }, kind: OutboxKind, delayMs = 0): Promise<string> {
  const [r] = await query<{ id: string }>(
    `INSERT INTO hub_outbox (id, kind, order_id, idempotency_key, next_attempt_at) VALUES ($1, $2, $3, $4, now() + $5 * interval '1 millisecond')
     ON CONFLICT (order_id, kind) DO NOTHING RETURNING id`,
    [newId("hub"), kind, order.id, idempotencyKey(order.number, kind), delayMs],
    db,
  );
  if (r) return r.id;
  const [old] = await query<{ id: string }>("SELECT id FROM hub_outbox WHERE order_id = $1 AND kind = $2", [order.id, kind], db);
  return old.id;
}

/** Orderns post av slaget, låst för resten av transaktionen. */
export async function lockItem(db: Db, orderId: string, kind: OutboxKind): Promise<OutboxItem | null> {
  const [r] = await query<Row>(`${SELECT} WHERE h.order_id = $1 AND h.kind = $2 FOR UPDATE OF h`, [orderId, kind], db);
  return r ? toItem(r) : null;
}

/**
 * Lägger posten i kön igen från början (nya försök i ett dygn), eller skapar den. Ger null om den skickas just nu.
 * För Crafts "skicka igen" och för en avbokning som behöver gå en gång till.
 */
export async function requeue(db: Db, order: { id: string; number: string }, kind: OutboxKind, delayMs = 0): Promise<string | null> {
  const item = await lockItem(db, order.id, kind);
  if (!item) return enqueue(db, order, kind, delayMs);
  if (item.sending) return null;
  await query(
    `UPDATE hub_outbox SET status = 'väntar', attempts = 0, next_attempt_at = now() + $2 * interval '1 millisecond', claim_id = NULL, locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [item.id, delayMs],
    db,
  );
  return item.id;
}

/** Stoppar en post som inte skickats: ordern avbröts. Posten skickas aldrig. */
export async function stopItem(db: Db, id: string, why: string) {
  await query("UPDATE hub_outbox SET status = 'stoppad', last_error = $2, claim_id = NULL, locked_until = NULL, updated_at = now() WHERE id = $1", [id, why], db);
}

/**
 * Hubben har ordern (den bekräftade den, med svaret eller med en händelse): orderns post är klar, vad som än hänt med
 * den – ett försök som tog för lång tid, eller bekräftelsen som kom före svaret. En pågående körning skriver inte över det.
 */
export async function markSubmitDone(db: Db, orderId: string, erpRef?: string) {
  await query(
    `UPDATE hub_outbox SET status = 'skickad', sent_at = COALESCE(sent_at, now()), erp_ref = COALESCE($2, erp_ref), claim_id = NULL, locked_until = NULL, updated_at = now()
     WHERE order_id = $1 AND kind = 'order.submit' AND status IN ('väntar', 'misslyckad', 'skickad')`,
    [orderId, erpRef ?? null],
    db,
  );
}

// ── Att skicka ──────────────────────────────────────────────────────────────

/** Kör efter svaret när det finns ett anrop att hänga på, annars direkt i bakgrunden (t.ex. i schemat och i skript). */
export function later(fn: () => Promise<unknown>) {
  const run = () => fn().catch((e) => console.error("poc/hubb i bakgrunden", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Första försöket för en post, direkt efter svaret till butiken (eller Craft). */
export function sendSoon(id: string) {
  later(() => processOutboxItem(id));
}

/**
 * Tar en post som ska skickas (eller just den med `id`), så att ingen annan körning tar den samtidigt. Med `all` tas
 * även poster vars nästa försök inte är på tur än.
 */
async function claim(id?: string, all = false): Promise<Row | null> {
  const claimId = randomBytes(9).toString("base64url");
  const [r] = await query<Row>(
    `UPDATE hub_outbox h SET claim_id = $1, locked_until = now() + $2 * interval '1 millisecond', attempts = h.attempts + 1, updated_at = now()
     FROM orders o
     WHERE o.id = h.order_id AND h.id = (
       SELECT i.id FROM hub_outbox i
       WHERE i.status = 'väntar' AND ($4::boolean OR i.next_attempt_at <= now()) AND (i.claim_id IS NULL OR i.locked_until < now())
         AND ($3::text IS NULL OR i.id = $3)
         -- En avbokning väntar tills ordern inte längre är på väg till hubben.
         AND (i.kind <> 'order.cancel' OR NOT EXISTS (
           SELECT 1 FROM hub_outbox s WHERE s.order_id = i.order_id AND s.kind = 'order.submit' AND s.claim_id IS NOT NULL AND s.locked_until >= now()))
       ORDER BY i.next_attempt_at, i.created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED)
     RETURNING h.*, o.number AS order_number`,
    [claimId, LEASE_MS, id ?? null, all],
  );
  return r ?? null;
}

/** Utfallet av ett försök. "upptagen": posten var redan skickad, skickas av någon annan just nu eller är inte på tur. */
export type OutboxOutcome =
  | { result: "skickad"; erpRef?: string; note?: string }
  | { result: "väntar"; error: string; nextAttemptAt: string; hubWide: boolean }
  | { result: "misslyckad"; error: string }
  | { result: "stoppad"; reason: string }
  | { result: "upptagen" };

/** Skickar en post nu, om den väntar och ingen annan skickar den. För första försöket och Crafts "skicka igen". */
export async function processOutboxItem(id: string): Promise<OutboxOutcome> {
  const row = await claim(id);
  return row ? send(row) : { result: "upptagen" };
}

/** Uppdaterar posten bara om den här körningen fortfarande håller den. */
async function finish(row: Row, set: string, params: unknown[], db?: Db): Promise<boolean> {
  const r = await query(`UPDATE hub_outbox SET ${set}, claim_id = NULL, locked_until = NULL, updated_at = now() WHERE id = $1 AND claim_id = $2 RETURNING id`, [row.id, row.claim_id, ...params], db);
  return r.length > 0;
}

/** Fel i vår egen ände som gäller just den här posten (t.ex. filerna som inte gick att bygga). Värda nya försök. */
class ItemError extends Error {}

async function send(row: Row): Promise<OutboxOutcome> {
  try {
    const order = await getOrderView(row.order_id);
    if (!order) {
      await finish(row, "status = 'stoppad', last_error = $3", ["Ordern finns inte längre"]);
      return { result: "stoppad", reason: "Ordern finns inte längre" };
    }
    const client = hub();
    // Går hubben inte att anropa byggs inget (filerna är tunga): posten väntar tills inställningen är rättad.
    const notReady = setupError();
    if (notReady) throw notReady;

    if (row.kind === "order.cancel") {
      const r = await client.cancelOrder(order.number, order.cancelReason ?? "Avbruten av Craft", row.idempotency_key);
      const note = r.found ? "Avbokningen är mottagen i Crafts affärssystem" : "Crafts affärssystem hade inte ordern – det fanns inget att avboka";
      await tx(async (db) => {
        if (await finish(row, "status = 'skickad', sent_at = now(), last_error = NULL", [], db)) await addEvent({ orderId: order.id, actor: "affärssystem", text: note }, db);
      });
      return { result: "skickad", note };
    }

    if (order.status === "avbruten") {
      await finish(row, "status = 'stoppad', last_error = $3", ["Ordern avbröts innan den skickades"]);
      return { result: "stoppad", reason: "Ordern avbröts innan den skickades" };
    }
    if (customerRemoved(order.customer)) {
      // Kunduppgifterna är rensade (lib/poc/privacy.ts): ordern går inte att leverera och skickas inte.
      await finish(row, "status = 'stoppad', last_error = $3", ["Kunduppgifterna är borttagna"]);
      return { result: "stoppad", reason: "Kunduppgifterna är borttagna" };
    }
    if (order.status !== "mottagen") {
      // Redan bekräftad, t.ex. med en händelse från hubben medan posten väntade.
      await finish(row, "status = 'skickad', sent_at = COALESCE(sent_at, now()), erp_ref = COALESCE(erp_ref, $3)", [order.erpRef ?? null]);
      return { result: "skickad", erpRef: order.erpRef };
    }

    const hubOrder = await buildHubOrder(order, { files: client.mode === "http" });
    const res = await client.submitOrder(hubOrder, row.idempotency_key);
    if (res.erpRef) {
      // Bekräftelsen markerar posten som skickad i samma transaktion som ordern och jobben.
      const { confirmOrder } = await import("../orders");
      await confirmOrder(order.id, res.erpRef);
      return { result: "skickad", erpRef: res.erpRef };
    }
    await tx(async (db) => {
      if (await finish(row, "status = 'skickad', sent_at = now(), last_error = NULL", [], db)) {
        await addEvent({ orderId: order.id, actor: "plattform", text: "Ordern är skickad till New Waves hubb – väntar på bekräftelse från Crafts affärssystem" }, db);
      }
    });
    return { result: "skickad" };
  } catch (e) {
    return failed(row, e);
  }
}

/** Ett försök som inte gick: nytt försök senare, eller "misslyckad" och larm. */
async function failed(row: Row, e: unknown): Promise<OutboxOutcome> {
  const he = e instanceof HubError ? e : null;
  if (!he && !(e instanceof ItemError)) console.error("poc/hubb utkorgen", row.id, e);
  const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  const setup = he?.kind === "inställning";
  // Försök medan hubben inte är inställd räknas inte: det rättas i miljön, inte genom att ge upp ordern.
  const attempts = setup ? Math.max(0, row.attempts - 1) : row.attempts;
  const retry = he ? he.retry : true;
  const hubWide = Boolean(he?.hubWide);
  const what = KIND_TEXT[row.kind];
  const first = !row.last_error;

  try {
    if (!retry || attempts >= MAX_ATTEMPTS) {
      const ok = await tx(async (db) => {
        if (!(await finish(row, "status = 'misslyckad', attempts = $3, last_error = $4, last_error_at = now()", [attempts, error], db))) return false;
        const text = retry ? `${what.The} kom inte fram till New Waves hubb efter ${attempts} försök: ${error}` : `New Waves hubb nekade ${what.the}: ${error}`;
        await addEvent({ orderId: row.order_id, actor: "plattform", text: `${text}. Craft behöver skicka ${what.the} igen.` }, db);
        return true;
      });
      if (ok) await alert(`hubb-misslyckad:${row.order_number}:${row.kind}`, `${what.The} för ${row.order_number} kom inte fram till hubben (${retry ? `${attempts} försök` : "nekad"}): ${error}. Skicka igen från Crafts ordervy.`);
      return { result: "misslyckad", error };
    }

    const pauseMs = setup ? SETUP_WAIT_MS : Math.max(RETRY_MINUTES[attempts - 1] * 60_000, he?.retryAfterMs ?? 0);
    const next = new Date(Date.now() + pauseMs);
    await tx(async (db) => {
      if (!(await finish(row, "status = 'väntar', attempts = $3, next_attempt_at = $4, last_error = $5, last_error_at = now()", [attempts, next, error], db))) return;
      if (first) await addEvent({ orderId: row.order_id, actor: "plattform", text: `${what.The} har inte kommit fram till New Waves hubb än (${error}) – den ligger i utkorgen och skickas igen automatiskt` }, db);
    });
    if (setup) await alert("hubb-installning", `Hubben går inte att anropa: ${error}. Ordrar och avbokningar väntar i utkorgen tills det är rättat.`);
    else if (attempts >= ALERT_AFTER_ATTEMPTS) await alert("hubb-svarar-inte", `Hubben har inte tagit emot ${what.the} för ${row.order_number} på ${attempts} försök: ${error}. Utkorgen fortsätter försöka.`);
    return { result: "väntar", error, nextAttemptAt: next.toISOString(), hubWide };
  } catch (dbError) {
    // Databasen svarar inte: posten släpps när tiden går ut och tas då av nästa körning.
    console.error("poc/hubb utkorgen kunde inte spara försöket", row.id, dbError instanceof Error ? dbError.message : dbError);
    return { result: "väntar", error, nextAttemptAt: new Date(Date.now() + LEASE_MS).toISOString(), hubWide: true };
  }
}

export type OutboxRun = { processed: number; sent: number; waiting: number; failed: number; stopped: number; paused?: string };

/**
 * Skickar posterna som är på tur, en i taget, tills inga fler väntar eller tiden (45 s) eller antalet (100) är slut. Är
 * hubben nere eller inte inställd stannar körningen efter första posten, så att resten inte bränner försök i onödan.
 * Med `all` skickas allt som väntar direkt, även det vars nästa försök inte är på tur – för "Kör nu" när hubben varit
 * nere. Misslyckade poster skickas bara om Craft ber om det (`resendToHub`).
 */
export async function processOutbox(opts: { max?: number; budgetMs?: number; all?: boolean } = {}): Promise<OutboxRun> {
  const max = opts.max ?? 100;
  const budget = opts.budgetMs ?? 45_000;
  const started = Date.now();
  const run: OutboxRun = { processed: 0, sent: 0, waiting: 0, failed: 0, stopped: 0 };
  while (run.processed < max && Date.now() - started < budget) {
    const row = await claim(undefined, opts.all);
    if (!row) break;
    const r = await send(row);
    run.processed++;
    if (r.result === "skickad") run.sent++;
    else if (r.result === "misslyckad") run.failed++;
    else if (r.result === "stoppad") run.stopped++;
    else if (r.result === "väntar") {
      run.waiting++;
      if (r.hubWide) {
        run.paused = r.error;
        break;
      }
    }
  }
  return run;
}

// ── Ordern i hubbens format ─────────────────────────────────────────────────

const specOf = (p: ClubProduct | undefined) => (p?.spec ?? {}) as Record<string, unknown>;

function hubLine(l: OrderLine, p: ClubProduct | undefined, files: HubFile[]): HubOrderLine {
  const producer = PRODUCER_OF[l.kind];
  let color: HubOrderLine["color"];
  let method = "stickning";
  let design: { id?: string; name?: string } | undefined;
  if (l.kind === "plagg") {
    const g = specOf(p) as Partial<GarmentSpec>;
    const hex = g.color?.hex ?? g.product?.garment;
    if (hex) color = { name: g.color?.name ?? hex, hex };
    method = g.print?.method ?? "tryck";
    design = g.design;
  } else {
    design = (specOf(p) as Partial<ScarfSpec>).design;
  }
  return {
    lineId: l.id,
    sku: l.sku,
    ...(l.size ? { size: l.size } : {}),
    ...(color ? { color } : {}),
    qty: l.qty,
    unitSek: l.unitSek,
    title: l.title,
    producer,
    method,
    design: { id: design?.id ?? p?.designId ?? "", name: design?.name ?? "", ...(p?.variant ? { variant: p.variant } : {}) },
    files,
  };
}

/**
 * Ordern som hubben får den. Med `files` byggs produktionsfilerna först (för länkarnas namn); går en produkts filer inte
 * att bygga skickas ordern inte än, så att den aldrig når produktionen utan sina filer. I det simulerade läget byggs inga
 * filer (det simulerade affärssystemet läser dem inte), så att demot inte bygger dem två gånger.
 */
export async function buildHubOrder(order: OrderView, opts: { files: boolean }): Promise<HubOrder> {
  const products = new Map((await listClubProducts({ ids: [...new Set(order.lines.map((l) => l.clubProductId))] })).map((p) => [p.id, p]));
  let files: Map<string, HubFile[]> | undefined;
  if (opts.files) {
    const built = await hubOrderFiles(order);
    if (built.missing.length) {
      const rows = built.missing.map((l) => `rad ${order.lines.indexOf(l) + 1} (${l.title})`);
      throw new ItemError(`Produktionsfilerna gick inte att bygga för ${rows.join(" och ")}`);
    }
    files = built.byLine;
  }
  const club = (specOf(products.get(order.lines[0]?.clubProductId)).club as { name?: string } | undefined)?.name;
  return {
    orderNumber: order.number,
    channel: order.channel,
    ...(order.externalRef ? { externalRef: order.externalRef } : {}),
    createdAt: order.createdAt,
    club: { id: order.clubId, name: club ?? order.clubId },
    customer: order.customer,
    delivery: order.shipping ?? { method: "okänt", label: "Okänt leveranssätt", priceSek: 0 },
    lines: order.lines.map((l) => hubLine(l, products.get(l.clubProductId), files?.get(l.id) ?? [])),
    totalSek: order.totalSek,
    currency: "SEK",
  };
}

// ── För Crafts vyer ─────────────────────────────────────────────────────────

/** Orderns poster i utkorgen, ordern först och avbokningen sedan. */
export async function outboxForOrder(orderId: string): Promise<OutboxItem[]> {
  const rows = await query<Row>(`${SELECT} WHERE h.order_id = $1 ORDER BY h.kind DESC`, [orderId]);
  return rows.map(toItem);
}

/** Orderposternas läge för en lista med ordrar (Crafts orderlista). */
export async function submitStates(orderIds: string[]): Promise<Map<string, OutboxItem>> {
  if (!orderIds.length) return new Map();
  const rows = await query<Row>(`${SELECT} WHERE h.order_id = ANY($1) AND h.kind = 'order.submit'`, [orderIds]);
  return new Map(rows.map((r) => [r.order_id, toItem(r)]));
}

/** Utkorgen i siffror, för Crafts integrationssida. */
export async function outboxSummary(recentLimit = 20): Promise<OutboxSummary> {
  const cfg = hubConfig();
  const [counts, oldest, lastError, unconfirmed, recent] = await Promise.all([
    query<{ status: OutboxStatus; n: string }>("SELECT status, count(*) AS n FROM hub_outbox GROUP BY status"),
    query<Row>(`${SELECT} WHERE h.status = 'väntar' ORDER BY h.created_at LIMIT 1`),
    query<Row>(`${SELECT} WHERE h.last_error IS NOT NULL AND h.status IN ('väntar', 'misslyckad') ORDER BY h.last_error_at DESC NULLS LAST LIMIT 1`),
    query<{ n: string; old: string }>(
      `SELECT count(*) AS n, count(*) FILTER (WHERE h.sent_at < now() - interval '1 hour') AS old
       FROM hub_outbox h JOIN orders o ON o.id = h.order_id WHERE h.kind = 'order.submit' AND h.status = 'skickad' AND o.status = 'mottagen'`,
    ),
    query<Row>(`${SELECT} ORDER BY h.updated_at DESC LIMIT $1`, [Math.min(Math.max(recentLimit, 1), 200)]),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  const o = oldest[0] ? toItem(oldest[0]) : undefined;
  const e = lastError[0];
  return {
    mode: cfg.mode,
    ready: cfg.ready,
    missing: cfg.missing,
    counts: { väntar: by["väntar"] ?? 0, skickad: by["skickad"] ?? 0, misslyckad: by["misslyckad"] ?? 0, stoppad: by["stoppad"] ?? 0 },
    ...(o ? { oldestWaiting: { id: o.id, kind: o.kind, orderNumber: o.orderNumber, createdAt: o.createdAt, attempts: o.attempts, nextAttemptAt: o.nextAttemptAt, lastError: o.lastError } } : {}),
    ...(e?.last_error ? { lastError: { orderNumber: e.order_number, kind: e.kind, text: e.last_error, at: iso(e.last_error_at ?? e.updated_at)! } } : {}),
    unconfirmed: Number(unconfirmed[0]?.n ?? 0),
    unconfirmedOverAnHour: Number(unconfirmed[0]?.old ?? 0),
    recent: recent.map(toItem),
  };
}

// ── Schemat ─────────────────────────────────────────────────────────────────

/** Larmar om ordrar som hubben tagit emot men inte bekräftat på över en timme. */
async function checkUnconfirmed() {
  const rows = await query<{ number: string }>(
    `SELECT o.number FROM hub_outbox h JOIN orders o ON o.id = h.order_id
     WHERE h.kind = 'order.submit' AND h.status = 'skickad' AND o.status = 'mottagen' AND h.sent_at < now() - interval '1 hour'
     ORDER BY h.sent_at LIMIT 20`,
  );
  if (rows.length) await alert("hubb-obekraftad", `${rows.length === 20 ? "Minst 20" : rows.length} ${rows.length === 1 ? "order är" : "ordrar är"} mottagna i hubben men inte bekräftade efter en timme: ${rows.map((r) => r.number).join(", ")}.`);
}

const state = {
  async get(key: string): Promise<string | undefined> {
    const [r] = await query<{ value: string }>("SELECT value FROM hub_state WHERE key = $1", [key]);
    return r?.value;
  },
  async set(key: string, value: string) {
    await query("INSERT INTO hub_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [key, value]);
  },
};

const DAY_MS = 24 * 60 * 60_000;
/** Hämtningen tar med en minut bakåt från förra gången, så att inget som ändrades precis då missas (att läsa en rad två gånger gör inget). */
const PULL_OVERLAP_MS = 60_000;

export type PullRun = { stock?: { items: number; full: boolean }; products?: { items: number }; error?: string; skipped?: string };

/**
 * Hämtningsläget (HUB_PULL=1): lager och produkter som ändrats sedan förra hämtningen. Lagret hämtas helt (och det som
 * saknas räknas som slut) första gången och sedan en gång per dygn. Bara en process hämtar åt gången.
 */
export async function pullFromHub(): Promise<PullRun> {
  const client = hub();
  if (!client.fetchStock || !client.fetchProducts) return { skipped: "Hubben är simulerad: inget att hämta" };
  const c = await pool().connect();
  try {
    const [{ locked }] = (await c.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(4711401) AS locked")).rows;
    if (!locked) return { skipped: "En annan körning hämtar redan" };
    try {
      const out: PullRun = {};
      const { applyStock } = await import("./stock");
      const { applyProducts } = await import("./products");

      const startedStock = Date.now();
      const lastFull = Number((await state.get("pull.stock.full")) ?? 0);
      const since = await state.get("pull.stock.since");
      const full = !since || startedStock - lastFull > DAY_MS;
      const items = await client.fetchStock(full ? undefined : since);
      if (full && !items.length) {
        // Ett tomt helt lager är troligare ett fel hos hubben än att allt är slut: inget ändras, och nästa körning försöker igen.
        await alert("hubb-tomt-lager", "Hubben gav ett tomt lager vid den fullständiga hämtningen. Lagret lämnades orört.");
        out.stock = { items: 0, full };
      } else {
        await applyStock(items, full);
        await state.set("pull.stock.since", new Date(startedStock - PULL_OVERLAP_MS).toISOString());
        if (full) await state.set("pull.stock.full", String(startedStock));
        out.stock = { items: items.length, full };
      }

      const startedProducts = Date.now();
      const productsSince = await state.get("pull.products.since");
      const products = await client.fetchProducts(productsSince);
      if (products.length) await applyProducts(products);
      await state.set("pull.products.since", new Date(startedProducts - PULL_OVERLAP_MS).toISOString());
      out.products = { items: products.length };
      return out;
    } finally {
      await c.query("SELECT pg_advisory_unlock(4711401)").catch(() => {});
    }
  } finally {
    c.release();
  }
}

export type HubRun = { mode: HubMode; ready: boolean; outbox: OutboxRun; pull?: PullRun };

/**
 * Det som schemat kör (POST /api/v1/hub/kor och timern i instrumentation.ts, varje minut): utkorgen, larmet om
 * obekräftade ordrar och, med HUB_PULL=1, hämtningen av lager och produkter. Med `all` skickas allt som väntar i
 * utkorgen direkt (se `processOutbox`).
 */
export async function runHub(opts: { all?: boolean } = {}): Promise<HubRun> {
  const cfg = hubConfig();
  const outbox = await processOutbox({ all: opts.all });
  await checkUnconfirmed().catch((e) => console.error("poc/hubb obekräftade", e instanceof Error ? e.message : e));
  let pull: PullRun | undefined;
  if (cfg.pull) {
    try {
      pull = await pullFromHub();
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      pull = { error };
      if (e instanceof HubError && e.kind === "inställning") await alert("hubb-installning", `Hubben går inte att anropa: ${error}.`);
      else await alert("hubb-hamtning", `Lager och produkter gick inte att hämta från hubben: ${error}`);
    }
  }
  return { mode: cfg.mode, ready: cfg.ready, outbox, ...(pull ? { pull } : {}) };
}
