import { envInt } from "@/lib/demoLimit";
import { keyOk } from "./auth";
import { query, tx, type Db } from "./db";
import type { Customer } from "./types";

/**
 * Kundens personuppgifter i ordrarna tas bort när de inte behövs längre: namn, e-post, telefon och adress i
 * `orders.customer`. Ordern, raderna, beloppen och klubben finns kvar för statistiken (Crafts bokföring sker i deras
 * eget affärssystem). Samma uppgifter tas bort ur det som kan ha fått en kopia: tidslinjens texter, orsaken till att
 * ordern avbröts, producenternas anteckningar och spårningsnumren (som hos fraktbolaget leder till adressen).
 * Producenternas kö läser kunden ur ordern, så den visar inte heller något efteråt.
 *
 * - Med tiden: en order som är skickad eller avbruten rensas när den inte ändrats på `POC_KUNDUPPGIFTER_MANADER`
 *   månader (standard 12). En order som aldrig blev klar rensas efter dubbelt så lång tid utan ändringar.
 * - På begäran: alla avslutade ordrar med kundens e-post. En pågående order rensas inte, eftersom adressen behövs
 *   för leveransen; den ges tillbaka i `kept`, så att begäran kan göras om när ordern är skickad eller avbruten.
 *
 * Körs av schemat med `POST /api/v1/poc/rensa` (nyckeln i `POC_RENSA_KEY`), eller av Craft. Se docs/drift.md.
 */

/** Miljövariabeln för hur många månader kunduppgifterna sparas efter att ordern skickats eller avbrutits. */
export const RETENTION_ENV = "POC_KUNDUPPGIFTER_MANADER";

/** Månaderna, minst en. */
export const retentionMonths = () => Math.max(1, envInt(RETENTION_ENV, 12));

/** Ordrarnas slutlägen: då behövs adressen inte längre för leveransen. */
const FINISHED = ["skickad", "avbruten", "levererad"];

/** Det som står i texterna i stället för det som tagits bort. */
export const REMOVED = "[borttaget]";

/** Kundens namn i ordern efteråt. */
export const REMOVED_NAME = "Kunduppgifterna är borttagna";

export type RemovalReason = "tid" | "begäran";

/** Kunden i en rensad order: `removedAt` och `removedBy` ligger i samma fält som uppgifterna låg i. */
export type RemovedCustomer = Customer & { removedAt: string; removedBy: RemovalReason };

/** Är kundens uppgifter borttagna? För sidor som vill visa det i stället för namnet. */
export const customerRemoved = (c: Customer | null | undefined): c is RemovedCustomer => typeof (c as Partial<RemovedCustomer> | null)?.removedAt === "string";

const PROD = process.env.NODE_ENV === "production";

/** Schemats nyckel (`POC_RENSA_KEY`). Demonyckeln bara vid utveckling: i produktion utan nyckel är vägen stängd. */
export const purgeKey = (): string | null => process.env.POC_RENSA_KEY || (PROD ? null : "demo-rensa-key");

export const purgeKeyOk = (key: string | null | undefined) => keyOk(key, purgeKey());

// ── Att hitta uppgifterna i texterna ────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Ett helt ord eller en hel följd, inte en bit av ett längre ord. */
const whole = (pattern: string) => `(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`;

/** Ett telefonnummer med eller utan mellanslag och bindestreck, med 0 eller +46 först. */
function phonePattern(raw: string): string | null {
  let digits = raw.replace(/\(0\)/g, "").replace(/\D/g, "");
  if (digits.startsWith("0046")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("46") && raw.trim().startsWith("+")) digits = `0${digits.slice(2)}`;
  if (digits.length < 6) return null;
  const sep = "[\\s-]*";
  const rest = digits.replace(/^0/, "").split("").join(sep);
  return digits.startsWith("0") ? `(?:(?:\\+|00)46${sep}(?:\\(0\\)${sep})?|0)${rest}` : digits.split("").join(sep);
}

/**
 * Mönstren för det som ska bort ur texterna: e-posten, telefonnumret, hela adressen och dess delar (gatan, postnumret,
 * orten och adressens ord), namnet och namnets delar, och spårningsnumren. Korta delar (under tre tecken) tas inte,
 * så att vanliga ord får stå kvar.
 */
export function removalPatterns(c: Partial<Customer>, tracking: string[] = []): RegExp | null {
  const words = new Set<string>();
  const add = (s: string | undefined, min = 3) => {
    const t = s?.trim();
    if (t && t.length >= min) words.add(escape(t));
  };
  add(c.email);
  add(c.name);
  for (const part of c.name?.split(/[\s-]+/) ?? []) add(part);
  add(c.address);
  for (const part of c.address?.split(/\s*,\s*|\n/) ?? []) {
    add(part, 4);
    for (const word of part.split(/\s+/)) if (/\p{L}{4,}/u.test(word)) add(word, 4);
    const zip = /\b(\d{3})\s?(\d{2})\b/.exec(part);
    if (zip) words.add(`${zip[1]}\\s?${zip[2]}`);
  }
  for (const t of tracking) add(t, 4);
  const phone = c.phone ? phonePattern(c.phone) : null;
  const list = [...words].sort((a, b) => b.length - a.length);
  if (phone) list.unshift(phone);
  return list.length ? new RegExp(whole(list.join("|")), "giu") : null;
}

/** Texten med uppgifterna utbytta mot "[borttaget]". */
export const scrub = (text: string, re: RegExp | null) => (re && text ? text.replace(re, REMOVED) : text);

/** Spårningsnumren som står i tidslinjen, t.ex. "spårningsnummer SE123456789", om de inte finns kvar i jobben. */
const trackingIn = (texts: string[]) => texts.flatMap((t) => [...t.matchAll(/spårningsnummer:?\s+([\p{L}\p{N}-]{4,})/giu)].map((m) => m[1]));

// ── Att ta bort ─────────────────────────────────────────────────────────────

type Candidate = { id: string; number: string; status: string };

/** Hur mycket som tas bort åt gången; resten tas nästa gång schemat kör. */
const BATCH = 500;

const notRemoved = "NOT (o.customer ? 'removedAt')";

/** Ordrarna vars tid har gått ut: avslutade efter `months`, de som aldrig blev klara efter dubbelt så lång tid. */
async function dueOrders(months: number, limit: number): Promise<{ list: Candidate[]; more: boolean }> {
  const rows = await query<Candidate>(
    `WITH last AS (
       SELECT o.id, o.number, o.status, GREATEST(
         o.updated_at,
         coalesce((SELECT max(e.at) FROM order_events e WHERE e.order_id = o.id), o.updated_at),
         coalesce((SELECT max(j.updated_at) FROM production_jobs j WHERE j.order_id = o.id), o.updated_at)
       ) AS at
       FROM orders o WHERE ${notRemoved}
     )
     SELECT id, number, status FROM last
     WHERE (status = ANY($1::text[]) AND at < now() - make_interval(months => $2::int)) OR at < now() - make_interval(months => $2::int * 2)
     ORDER BY at LIMIT $3::int`,
    [FINISHED, months, limit + 1],
  );
  return { list: rows.slice(0, limit), more: rows.length > limit };
}

/** Kundens ordrar på e-post, utan hänsyn till stora och små bokstäver. */
async function ordersOf(email: string): Promise<Candidate[]> {
  return query<Candidate>(`SELECT o.id, o.number, o.status FROM orders o WHERE ${notRemoved} AND lower(o.customer->>'email') = lower($1) ORDER BY o.created_at`, [email.trim()]);
}

const WHY: Record<RemovalReason, (months: number) => string> = {
  tid: (months) => `Kundens personuppgifter är borttagna, ${months} månader efter att ordern avslutades`,
  begäran: () => "Kundens personuppgifter är borttagna på kundens begäran",
};

/**
 * Tar bort kundens uppgifter ur en order och ur det som kan ha fått en kopia, i en transaktion. Ger false om ordern
 * redan var rensad, eller om den är pågående och `finishedOnly` är satt (då har den ändrats sedan den valdes).
 */
async function removeFromOrder(db: Db, orderId: string, by: RemovalReason, months: number, finishedOnly: boolean): Promise<boolean> {
  const [o] = await query<{ id: string; status: string; customer: Customer & { removedAt?: string }; cancel_reason: string | null }>(
    "SELECT id, status, customer, cancel_reason FROM orders WHERE id = $1 FOR UPDATE",
    [orderId],
    db,
  );
  if (!o || o.customer?.removedAt) return false;
  if (finishedOnly && !FINISHED.includes(o.status)) return false;
  const jobs = await query<{ id: string; note: string | null; tracking: string | null }>("SELECT id, note, tracking FROM production_jobs WHERE order_id = $1 FOR UPDATE", [o.id], db);
  const events = await query<{ id: string; text: string }>("SELECT id, text FROM order_events WHERE order_id = $1", [o.id], db);
  const tracking = [...jobs.flatMap((j) => (j.tracking ? [j.tracking] : [])), ...trackingIn(events.map((e) => e.text))];
  const re = removalPatterns(o.customer ?? {}, tracking);

  for (const e of events) {
    const text = scrub(e.text, re);
    if (text !== e.text) await query("UPDATE order_events SET text = $2 WHERE id = $1", [e.id, text], db);
  }
  for (const j of jobs) {
    const note = j.note == null ? null : scrub(j.note, re);
    if (note !== j.note || j.tracking) await query("UPDATE production_jobs SET note = $2, tracking = NULL WHERE id = $1", [j.id, note], db);
  }
  const removed: RemovedCustomer = { name: REMOVED_NAME, email: "", removedAt: new Date().toISOString(), removedBy: by };
  // updated_at lämnas: den visar när ordern senast ändrades i flödet.
  await query("UPDATE orders SET customer = $2, cancel_reason = $3 WHERE id = $1", [o.id, JSON.stringify(removed), o.cancel_reason == null ? null : scrub(o.cancel_reason, re)], db);
  await query("INSERT INTO order_events (order_id, actor, text) VALUES ($1, 'plattform', $2)", [o.id, WHY[by](months)], db);
  return true;
}

export type PurgeResult = {
  dryRun: boolean;
  /** Hur många månader uppgifterna sparas. */
  months: number;
  /** Ordrarna som rensades, eller som skulle rensas i en torrkörning. */
  orders: number;
  numbers: string[];
  /** Fler väntar: de tas nästa gång. */
  more: boolean;
  /** På begäran: kundens pågående ordrar, som rensas först när de är skickade eller avbrutna. */
  kept?: { number: string; status: string }[];
};

/**
 * Tar bort kunduppgifterna i ordrarna vars tid har gått ut (högst 500 åt gången). Med `dryRun` räknas de bara.
 */
export async function purgeExpired(opts: { dryRun?: boolean; months?: number; limit?: number } = {}): Promise<PurgeResult> {
  const months = Math.max(1, Math.floor(opts.months ?? retentionMonths()));
  const { list, more } = await dueOrders(months, Math.min(Math.max(opts.limit ?? BATCH, 1), BATCH));
  if (opts.dryRun) return { dryRun: true, months, orders: list.length, numbers: list.map((o) => o.number), more };
  const done: string[] = [];
  for (const o of list) if (await tx((db) => removeFromOrder(db, o.id, "tid", months, false))) done.push(o.number);
  if (done.length) console.info(`poc/privacy: kunduppgifterna borttagna ur ${done.length} ordrar (${months} månader)`);
  return { dryRun: false, months, orders: done.length, numbers: done, more };
}

/**
 * Kundens begäran: tar bort uppgifterna ur alla kundens avslutade ordrar, på e-post. Pågående ordrar ges i `kept`.
 * Med `dryRun` räknas de bara. E-posten skrivs aldrig i loggen.
 */
export async function purgeCustomer(email: string, opts: { dryRun?: boolean } = {}): Promise<PurgeResult> {
  const months = retentionMonths();
  const all = await ordersOf(email);
  const finished = all.filter((o) => FINISHED.includes(o.status));
  const kept = all.filter((o) => !FINISHED.includes(o.status)).map((o) => ({ number: o.number, status: o.status }));
  if (opts.dryRun) return { dryRun: true, months, orders: finished.length, numbers: finished.map((o) => o.number), more: false, kept };
  const done: string[] = [];
  for (const o of finished) if (await tx((db) => removeFromOrder(db, o.id, "begäran", months, true))) done.push(o.number);
  console.info(`poc/privacy: kunduppgifterna borttagna på begäran ur ${done.length} ordrar${kept.length ? `, ${kept.length} pågående väntar` : ""}`);
  return { dryRun: false, months, orders: done.length, numbers: done, more: false, kept };
}
