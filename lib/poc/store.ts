import { iso, newId, query, type Db } from "./db";
import type {
  ClubProduct,
  ClubProductStatus,
  Customer,
  Design,
  JobFile,
  JobStatus,
  Order,
  OrderEvent,
  OrderLine,
  OrderStatus,
  OrderView,
  Producer,
  ProductionJob,
  ProductKind,
} from "./types";

/**
 * Läsning och skrivning av POC-flödets data i Postgres: designer, klubbprodukter, ordrar, produktionsjobb och
 * händelser. Allt ges tillbaka som typerna i lib/poc/types.ts, med ISO-strängar för datum. Orderflödet (skapa order,
 * status från producenterna) ligger i lib/poc/orders.ts.
 */

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);

// ── Designer ────────────────────────────────────────────────────────────────

const toDesign = (r: Row): Design => ({ id: r.id as string, name: r.name as string, source: r.source as Design["source"], createdAt: iso(r.created_at as Date)! });

export async function insertDesign(d: { name: string; source: Design["source"]; id?: string }): Promise<Design> {
  const [r] = await query("INSERT INTO designs (id, name, source) VALUES ($1, $2, $3) RETURNING *", [d.id ?? newId("ds"), d.name, JSON.stringify(d.source)]);
  return toDesign(r);
}

export async function getDesign(id: string): Promise<Design | null> {
  const [r] = await query("SELECT * FROM designs WHERE id = $1", [id]);
  return r ? toDesign(r) : null;
}

export async function listDesigns(): Promise<Design[]> {
  return (await query("SELECT * FROM designs ORDER BY created_at DESC")).map(toDesign);
}

// ── Klubbprodukter ──────────────────────────────────────────────────────────

const toClubProduct = (r: Row): ClubProduct => ({
  id: r.id as string,
  designId: r.design_id as string,
  clubId: r.club_id as string,
  sku: r.sku as string,
  kind: r.kind as ProductKind,
  title: r.title as string,
  priceSek: num(r.price_sek),
  mockupUrl: r.mockup_url as string,
  spec: (r.spec ?? {}) as Record<string, unknown>,
  status: r.status as ClubProductStatus,
  createdAt: iso(r.created_at as Date)!,
  ...(r.variant ? { variant: r.variant as string } : {}),
  ...(r.custom_price ? { customPrice: true } : {}),
});

/** En rad till `upsertClubProducts`. Utan status blir en ny rad ett utkast och en befintlig behåller sin. */
export type ClubProductDraft = Omit<ClubProduct, "id" | "createdAt" | "status" | "customPrice"> & { status?: ClubProductStatus };

/**
 * Skapar eller uppdaterar klubbprodukter, unika på design × klubb × artikel × variant (ordmallens texter, "" för
 * mallens egna). Ett pris som Craft satt själv behålls. Tar tusentals rader åt gången.
 */
export async function upsertClubProducts(rows: ClubProductDraft[]): Promise<ClubProduct[]> {
  const unique = [...new Map(rows.map((r) => [`${r.designId}\n${r.clubId}\n${r.sku}\n${r.variant ?? ""}`, r])).values()];
  const out: ClubProduct[] = [];
  // Rader med status sätter den, rader utan behåller den befintliga.
  const groups = [unique.filter((r) => r.status), unique.filter((r) => !r.status)];
  for (const [g, group] of groups.entries())
    for (let i = 0; i < group.length; i += 1000) {
      const part = group.slice(i, i + 1000);
      const res = await query(
        `INSERT INTO club_products (id, design_id, club_id, sku, kind, title, price_sek, mockup_url, spec, status, variant)
       SELECT id, design_id, club_id, sku, kind, title, price_sek, mockup_url, spec::jsonb, COALESCE(status, 'utkast'), variant
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::numeric[], $8::text[], $9::text[], $10::text[], $11::text[])
         AS t(id, design_id, club_id, sku, kind, title, price_sek, mockup_url, spec, status, variant)
       ON CONFLICT (design_id, club_id, sku, variant) DO UPDATE SET
         kind = EXCLUDED.kind, title = EXCLUDED.title,
         price_sek = CASE WHEN club_products.custom_price THEN club_products.price_sek ELSE EXCLUDED.price_sek END,
         mockup_url = EXCLUDED.mockup_url, spec = EXCLUDED.spec, ${g === 0 ? "status = EXCLUDED.status," : ""} updated_at = now()
       RETURNING *`,
        [
          part.map(() => newId("cp")),
          part.map((r) => r.designId),
          part.map((r) => r.clubId),
          part.map((r) => r.sku),
          part.map((r) => r.kind),
          part.map((r) => r.title),
          part.map((r) => r.priceSek),
          part.map((r) => r.mockupUrl ?? ""),
          part.map((r) => JSON.stringify(r.spec ?? {})),
          part.map((r) => r.status ?? null),
          part.map((r) => r.variant ?? ""),
        ],
      );
      out.push(...res.map(toClubProduct));
    }
  return out;
}

export async function getClubProduct(id: string): Promise<ClubProduct | null> {
  const [r] = await query("SELECT * FROM club_products WHERE id = $1", [id]);
  return r ? toClubProduct(r) : null;
}

export async function listClubProducts(f: { clubId?: string; designId?: string; status?: ClubProductStatus; ids?: string[] } = {}, db?: Db): Promise<ClubProduct[]> {
  const rows = await query(
    `SELECT * FROM club_products
     WHERE ($1::text IS NULL OR club_id = $1) AND ($2::text IS NULL OR design_id = $2) AND ($3::text IS NULL OR status = $3)
       AND ($4::text[] IS NULL OR id = ANY($4))
     ORDER BY created_at DESC, club_id, sku`,
    [f.clubId ?? null, f.designId ?? null, f.status ?? null, f.ids ?? null],
    db,
  );
  return rows.map(toClubProduct);
}

/**
 * Ändrar status eller pris på klubbprodukter: de med `ids`, eller alla med designen (`designId`), och bara de med
 * status `from` om den anges. Ger de ändrade. Utan `ids` och `designId` ändras inget.
 */
export async function setClubProducts(
  where: { ids?: string[]; designId?: string; clubId?: string; from?: ClubProductStatus[] },
  set: { status?: ClubProductStatus; priceSek?: number; customPrice?: boolean },
): Promise<ClubProduct[]> {
  if (!where.ids?.length && !where.designId) return [];
  const rows = await query(
    `UPDATE club_products SET
       status = COALESCE($5::text, status), price_sek = COALESCE($6::numeric, price_sek), custom_price = COALESCE($7::boolean, custom_price),
       updated_at = now()
     WHERE ($1::text[] IS NULL OR id = ANY($1)) AND ($2::text IS NULL OR design_id = $2) AND ($3::text IS NULL OR club_id = $3)
       AND ($4::text[] IS NULL OR status = ANY($4))
     RETURNING *`,
    [where.ids ?? null, where.designId ?? null, where.clubId ?? null, where.from ?? null, set.status ?? null, set.priceSek ?? null, set.customPrice ?? null],
  );
  return rows.map(toClubProduct);
}

/** Hur mycket av varje design som ligger i shopparna: publicerade produkter och klubbar, och borttagna produkter. */
export async function designUsage(): Promise<Record<string, { published: number; clubs: number; removed: number }>> {
  const rows = await query(
    `SELECT design_id, count(*) FILTER (WHERE status = 'publicerad') AS published,
       count(DISTINCT club_id) FILTER (WHERE status = 'publicerad') AS clubs, count(*) FILTER (WHERE status = 'borttagen') AS removed
     FROM club_products GROUP BY design_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.design_id as string, { published: num(r.published), clubs: num(r.clubs), removed: num(r.removed) }]));
}

/** Antalet ordrar (inte avbrutna) som har klubbprodukten, för de klubbprodukter som finns i någon. */
export async function orderCounts(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const rows = await query(
    `SELECT l.club_product_id, count(DISTINCT l.order_id) AS n FROM order_lines l JOIN orders o ON o.id = l.order_id
     WHERE l.club_product_id = ANY($1) AND o.status <> 'avbruten' GROUP BY l.club_product_id`,
    [ids],
  );
  return Object.fromEntries(rows.map((r) => [r.club_product_id as string, num(r.n)]));
}

// ── Ordrar, jobb och händelser ──────────────────────────────────────────────

const toOrder = (r: Row, lines: OrderLine[]): Order => ({
  id: r.id as string,
  number: r.number as string,
  channel: r.channel as Order["channel"],
  clubId: r.club_id as string,
  customer: r.customer as Customer,
  lines,
  totalSek: num(r.total_sek),
  status: r.status as OrderStatus,
  erpRef: (r.erp_ref as string | null) ?? undefined,
  shipping: (r.shipping as Order["shipping"] | null) ?? undefined,
  cancelReason: (r.cancel_reason as string | null) ?? undefined,
  createdAt: iso(r.created_at as Date)!,
  updatedAt: iso(r.updated_at as Date)!,
});

const toLine = (r: Row): OrderLine => ({
  id: r.id as string,
  clubProductId: r.club_product_id as string,
  sku: r.sku as string,
  kind: r.kind as ProductKind,
  title: r.title as string,
  size: (r.size as string | null) ?? undefined,
  qty: num(r.qty),
  unitSek: num(r.unit_sek),
});

const toJob = (r: Row): ProductionJob => ({
  id: r.id as string,
  orderId: r.order_id as string,
  orderNumber: r.order_number as string,
  producer: r.producer as Producer,
  status: r.status as JobStatus,
  lineIds: (r.line_ids as string[]) ?? [],
  files: (r.files as JobFile[]) ?? [],
  tracking: (r.tracking as string | null) ?? undefined,
  note: (r.note as string | null) ?? undefined,
  createdAt: iso(r.created_at as Date)!,
  updatedAt: iso(r.updated_at as Date)!,
});

const toEvent = (r: Row): OrderEvent => ({
  id: String(r.id),
  orderId: r.order_id as string,
  jobId: (r.job_id as string | null) ?? undefined,
  actor: r.actor as OrderEvent["actor"],
  text: r.text as string,
  at: iso(r.at as Date)!,
});

const JOB_SELECT = "SELECT j.*, o.number AS order_number, o.club_id, o.customer, o.status AS order_status FROM production_jobs j JOIN orders o ON o.id = j.order_id";

/** Ordrarna med rader, jobb och händelser, i samma ordning som `rows`. */
async function views(rows: Row[], db?: Db): Promise<OrderView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const [lines, jobs, events] = await Promise.all([
    query("SELECT * FROM order_lines WHERE order_id = ANY($1) ORDER BY order_id, pos", [ids], db),
    query(`${JOB_SELECT} WHERE j.order_id = ANY($1) ORDER BY j.created_at, j.producer`, [ids], db),
    query("SELECT * FROM order_events WHERE order_id = ANY($1) ORDER BY at, id", [ids], db),
  ]);
  const by = <T>(list: Row[], map: (r: Row) => T) => {
    const m = new Map<string, T[]>();
    for (const r of list) m.set(r.order_id as string, [...(m.get(r.order_id as string) ?? []), map(r)]);
    return m;
  };
  const l = by(lines, toLine);
  const j = by(jobs, toJob);
  const e = by(events, toEvent);
  return rows.map((r) => ({ ...toOrder(r, l.get(r.id as string) ?? []), jobs: j.get(r.id as string) ?? [], events: e.get(r.id as string) ?? [] }));
}

/** Crafts ordervy: de senaste ordrarna med jobb och tidslinje. */
export async function listOrders(f: { clubId?: string; status?: OrderStatus; limit?: number } = {}): Promise<OrderView[]> {
  const rows = await query(
    `SELECT * FROM orders WHERE ($1::text IS NULL OR club_id = $1) AND ($2::text IS NULL OR status = $2)
     ORDER BY created_at DESC LIMIT $3`,
    [f.clubId ?? null, f.status ?? null, Math.min(Math.max(f.limit ?? 200, 1), 1000)],
  );
  return views(rows);
}

/** En order med jobb och tidslinje, på id eller ordernummer (t.ex. "IS-100001"). */
export async function getOrderView(id: string, db?: Db): Promise<OrderView | null> {
  const rows = await query("SELECT * FROM orders WHERE id = $1 OR number = $1", [id], db);
  return (await views(rows, db))[0] ?? null;
}

/** Ett jobb med det producenten behöver: raderna som ska tillverkas, klubben och kunden som paketet skickas till, och
 * orderns status (en avbruten order ska inte tillverkas). */
export type JobView = ProductionJob & { clubId: string; customer: Customer; lines: OrderLine[]; orderStatus: OrderStatus };

async function jobViews(rows: Row[], db?: Db): Promise<JobView[]> {
  if (!rows.length) return [];
  const lineIds = rows.flatMap((r) => (r.line_ids as string[]) ?? []);
  const lines = new Map((await query("SELECT * FROM order_lines WHERE id = ANY($1)", [lineIds], db)).map((r) => [r.id as string, toLine(r)]));
  return rows.map((r) => {
    const job = toJob(r);
    return {
      ...job,
      clubId: r.club_id as string,
      customer: r.customer as Customer,
      lines: job.lineIds.map((id) => lines.get(id)).filter((x): x is OrderLine => !!x),
      orderStatus: r.order_status as OrderStatus,
    };
  });
}

/** Producentens kö, äldst först. */
export async function listJobs(producer: Producer, status?: JobStatus): Promise<JobView[]> {
  const rows = await query(`${JOB_SELECT} WHERE j.producer = $1 AND ($2::text IS NULL OR j.status = $2) ORDER BY j.created_at`, [producer, status ?? null]);
  return jobViews(rows);
}

export async function getJob(id: string, db?: Db): Promise<JobView | null> {
  const rows = await query(`${JOB_SELECT} WHERE j.id = $1`, [id], db);
  return (await jobViews(rows, db))[0] ?? null;
}

export async function addEvent(e: Omit<OrderEvent, "id" | "at">, db?: Db) {
  await query("INSERT INTO order_events (order_id, job_id, actor, text) VALUES ($1, $2, $3, $4)", [e.orderId, e.jobId ?? null, e.actor, e.text], db);
}
