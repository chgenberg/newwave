import { randomBytes } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Postgres för POC-flödet. Poolen och schemat cachas på globalThis, så att de överlever omladdning i dev. Tabellerna
 * skapas av koden själv vid första anropet (idempotent), så inget extra steg behövs vid driftsättning. Se
 * docs/poc-flode.md.
 */

const SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 100001;

CREATE TABLE IF NOT EXISTS designs (
  id text PRIMARY KEY,
  name text NOT NULL,
  source jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_products (
  id text PRIMARY KEY,
  design_id text NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  club_id text NOT NULL,
  sku text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  price_sek numeric(12, 2) NOT NULL,
  mockup_url text NOT NULL DEFAULT '',
  spec jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'utkast',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_products_club ON club_products (club_id, status);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  number text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'intersport',
  club_id text NOT NULL,
  customer jsonb NOT NULL,
  total_sek numeric(12, 2) NOT NULL,
  status text NOT NULL,
  erp_ref text,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_club ON orders (club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_lines (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pos integer NOT NULL,
  club_product_id text NOT NULL REFERENCES club_products(id),
  sku text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  size text,
  qty integer NOT NULL,
  unit_sek numeric(12, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS order_lines_order ON order_lines (order_id, pos);

CREATE TABLE IF NOT EXISTS production_jobs (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  producer text NOT NULL,
  status text NOT NULL DEFAULT 'ny',
  line_ids text[] NOT NULL,
  files jsonb NOT NULL DEFAULT '[]',
  tracking text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_jobs_queue ON production_jobs (producer, status, created_at);
CREATE INDEX IF NOT EXISTS production_jobs_order ON production_jobs (order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  job_id text REFERENCES production_jobs(id) ON DELETE CASCADE,
  actor text NOT NULL,
  text text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS order_events_order ON order_events (order_id, id);

-- Steg 2: frakten, varför ordern avbröts och producentens anteckning. Läggs till i befintliga tabeller.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE production_jobs ADD COLUMN IF NOT EXISTS note text;

-- Steg 3: varianter av ordmallens texter (t.ex. "AIK" + "SOLNA") är egna produkter, så att unikheten blir design ×
-- klubb × artikel × variant ('' för mallens egna texter). Priset som Craft satt själv behålls vid ny publicering.
ALTER TABLE club_products ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT '';
ALTER TABLE club_products ADD COLUMN IF NOT EXISTS custom_price boolean NOT NULL DEFAULT false;
ALTER TABLE club_products DROP CONSTRAINT IF EXISTS club_products_design_id_club_id_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS club_products_unique ON club_products (design_id, club_id, sku, variant);
CREATE INDEX IF NOT EXISTS club_products_design ON club_products (design_id, status);

-- Steg 4: butikens eget ordernummer, unikt per kanal, och ett fingeravtryck av beställningen, så att samma order
-- skickad två gånger blir en (och samma nummer med annat innehåll avvisas).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_external_ref ON orders (channel, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_erp_ref ON orders (erp_ref) WHERE erp_ref IS NOT NULL;
-- Raderna i jobbet som hubben rapporterat som skickade, när den skickar en del av jobbet i taget.
ALTER TABLE production_jobs ADD COLUMN IF NOT EXISTS shipped_line_ids text[] NOT NULL DEFAULT '{}';

-- Utkorgen mot New Waves hubb: en post per order och slag (order.submit, order.cancel), som skickas med nya försök tills
-- hubben tagit emot den. claim_id och locked_until är den körning som skickar posten just nu. Ingen kopia av ordern
-- sparas här: den byggs ur ordern när posten skickas.
CREATE TABLE IF NOT EXISTS hub_outbox (
  id text PRIMARY KEY,
  kind text NOT NULL,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'väntar',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_id text,
  locked_until timestamptz,
  last_error text,
  last_error_at timestamptz,
  erp_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);
CREATE INDEX IF NOT EXISTS hub_outbox_due ON hub_outbox (next_attempt_at) WHERE status = 'väntar';
CREATE INDEX IF NOT EXISTS hub_outbox_recent ON hub_outbox (updated_at DESC);

-- Små värden som kopplingen mot hubben minns mellan körningarna, t.ex. när lagret senast hämtades.
CREATE TABLE IF NOT EXISTS hub_state (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const g = globalThis as unknown as { pocPool?: Pool; pocSchema?: { sql: string; ready: Promise<void> } };

export function pool(): Pool {
  if (!g.pocPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL saknas: POC-flödet behöver Postgres");
    g.pocPool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
    g.pocPool.on("error", (e) => console.error("poc/db", e.message));
  }
  return g.pocPool;
}

/** Skapar tabellerna en gång per process. Ett lås i databasen hindrar två processer från att krocka. Ändras schemat i
 * dev körs det igen. */
function ready(): Promise<void> {
  if (g.pocSchema?.sql !== SCHEMA) {
    const run = (async () => {
      const c = await pool().connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(4711001)");
        await c.query(SCHEMA);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    })();
    g.pocSchema = { sql: SCHEMA, ready: run };
    run.catch(() => {
      if (g.pocSchema?.ready === run) g.pocSchema = undefined;
    });
  }
  return g.pocSchema!.ready;
}

export type Db = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db?: Db): Promise<T[]> {
  if (!db) await ready();
  return (await (db ?? pool()).query<T>(sql, params)).rows;
}

/** Kör `fn` i en transaktion. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Kort slumpat id med prefix, t.ex. "ord-3f9a0c1b7e42". */
export const newId = (prefix: string) => `${prefix}-${randomBytes(6).toString("hex")}`;

/** Slumpad nyckel, t.ex. för kundens statussida. */
export const newToken = () => randomBytes(18).toString("base64url");

export const iso = (d: Date | string | null | undefined) => (d == null ? undefined : (d instanceof Date ? d : new Date(d)).toISOString());
