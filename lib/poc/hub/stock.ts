import { randomBytes } from "node:crypto";
import { z } from "zod";
import { catalogProduct, SCARF_SKU, sellable } from "../catalog";
import { iso, query, tx, type Db } from "../db";
import { colorRef, type ColorRef, FEW_LEFT, incomingText, productStock, rowsFor, type SizeStock, sizeKey, sizeStock, type SkuStock, specColor, type StockLabel, type StockRow } from "./stock-rules";
import type { StockItem } from "./types";

export type { ColorRef, ProductStock, SizeStock, SkuStock, StockLabel, StockRow, StockState } from "./stock-rules";

/**
 * Lagret från New Waves hubb: saldot per artikel, storlek och färg, det som är på väg och när det väntas. Hubben skickar
 * det (händelsen `stock.updated`, via lib/poc/hub/inbox.ts) eller så hämtar vi det (HUB_PULL). Reglerna för hur saldot
 * gäller en storlek och en färg ligger i lib/poc/hub/stock-rules.ts, så att shoppen och Crafts sidor räknar likadant.
 *
 * - `applyStock(items, full?, at?)` sparar hubbens saldo. Med `full` är det hela lagret: rader som rapporterats förut men
 *   saknas nu räknas som slut, och artiklarna i det räknas som fullständiga (storlekar och färger utan rad är slut).
 *   Halsduken stickas på beställning: saknas den i ett fullständigt lager är den obegränsad igen.
 * - `checkStock(lines)` säger om raderna går att beställa, med besked som kunden kan läsa. Kärnan anropar den i
 *   `createOrder` och svarar 409.
 * - `reserveStock(lines, ref)` räknar av det som hubben bekräftat, tills hubben skickar ett nytt saldo; `releaseStock(ref)`
 *   lämnar tillbaka det när ordern avbryts.
 * - `stockFor(sku)`, `stockMap(skus)` och `stockSummary()` för shoppen, Crafts sidor och integrationssidan.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stock_levels (
  sku text NOT NULL,
  size text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  available integer NOT NULL,
  incoming integer NOT NULL DEFAULT 0,
  eta date,
  reported_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sku, size, color)
);

CREATE TABLE IF NOT EXISTS stock_skus (
  sku text PRIMARY KEY,
  complete boolean NOT NULL DEFAULT false,
  reported_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_reservations (
  ref text NOT NULL,
  sku text NOT NULL,
  size text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  qty integer NOT NULL CHECK (qty > 0),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ref, sku, size, color)
);
CREATE INDEX IF NOT EXISTS stock_reservations_row ON stock_reservations (sku, size, color, at);

CREATE TABLE IF NOT EXISTS stock_updates (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz NOT NULL,
  full_stock boolean NOT NULL,
  row_count integer NOT NULL,
  sku_count integer NOT NULL,
  message text NOT NULL
);
`;

const g = globalThis as unknown as { pocStockSchema?: { sql: string; ready: Promise<void> } };

/** Skapar tabellerna en gång per process, med ett eget lås i databasen. Ändras schemat i dev körs det igen. */
function ready(): Promise<void> {
  if (g.pocStockSchema?.sql !== SCHEMA) {
    const run = tx(async (db) => {
      await query("SELECT pg_advisory_xact_lock(4711030)", [], db);
      await query(SCHEMA, [], db);
    });
    g.pocStockSchema = { sql: SCHEMA, ready: run };
    run.catch(() => {
      if (g.pocStockSchema?.ready === run) g.pocStockSchema = undefined;
    });
  }
  return g.pocStockSchema!.ready;
}

type Row = Record<string, unknown>;

async function q<T extends Row = Row>(sql: string, params: unknown[] = [], db?: Db): Promise<T[]> {
  if (!db) await ready();
  return query<T>(sql, params, db);
}

// ── In från hubben ──────────────────────────────────────────────────────────

const stockholmDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });

/** Väntat datum som ÅÅÅÅ-MM-DD i svensk tid; ett datum som inte går att läsa blir inget datum (raden tas ändå in). */
function dateOnly(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : stockholmDay.format(new Date(t));
}

const ItemSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  size: z.string().trim().max(40).nullish(),
  color: z.string().trim().max(60).nullish(),
  available: z.number().finite(),
  incoming: z.number().finite().nullish(),
  eta: z.string().max(40).nullish(),
});

type Level = { sku: string; size: string; color: string; available: number; incoming: number; eta: string | null };

const toLevel = (i: z.infer<typeof ItemSchema>): Level => ({
  sku: i.sku,
  size: i.size ?? "",
  color: i.color ?? "",
  // Ett negativt saldo (restorder i affärssystemet) är slut hos oss.
  available: Math.max(0, Math.floor(i.available)),
  incoming: Math.max(0, Math.floor(i.incoming ?? 0)),
  eta: dateOnly(i.eta),
});

/** Halsduken stickas på beställning: obegränsad om inte hubben rapporterar den. */
const isScarf = (sku: string) => sku === SCARF_SKU || catalogProduct(sku)?.kind === "halsduk";

const CHUNK = 5000;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Sparar hubbens lagersaldo. `full`: det är hela lagret, så det som rapporterats förut men saknas nu är slut. `at` är när
 * hubben tog fram saldot (händelsens tid): en rad som redan har ett nyare saldo skrivs inte över, så att händelser som
 * kommer i fel ordning inte ger gamla siffror. Ogiltiga rader hoppas över och räknas i beskedet. Ett fullständigt lager
 * utan rader avvisas – det skulle göra allt slut.
 */
export async function applyStock(items: StockItem[], full = false, at?: string): Promise<{ ok: boolean; message: string; rows: number; skus: number; skipped: number; stale: number; zeroed: number }> {
  const reportedAt = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
  const byKey = new Map<string, Level>();
  let invalid = 0;
  for (const raw of Array.isArray(items) ? items : []) {
    const p = ItemSchema.safeParse(raw);
    if (!p.success) {
      invalid++;
      continue;
    }
    const l = toLevel(p.data);
    byKey.set(`${l.sku}\n${l.size}\n${l.color}`, l);
  }
  const levels = [...byKey.values()];
  const skus = [...new Set(levels.map((l) => l.sku))];
  const empty = { rows: 0, skus: 0, skipped: invalid, stale: 0, zeroed: 0 };
  if (!levels.length) {
    if (full) return { ok: false, message: "Ett fullständigt lager utan giltiga rader avvisas – det skulle göra allt slut", ...empty };
    if (invalid) return { ok: false, message: `Inga giltiga lagerrader (${plural(invalid, "ogiltig", "ogiltiga")})`, ...empty };
    return { ok: true, message: "Inga lagerrader", ...empty };
  }

  await ready();
  const { stale, zeroed, freed } = await tx(async (db) => {
    // Ett lagerbesked åt gången, så att ett fullständigt lager och en ändring inte blandas.
    await query("SELECT pg_advisory_xact_lock(4711031)", [], db);
    let written = 0;
    for (let i = 0; i < levels.length; i += CHUNK) {
      const part = levels.slice(i, i + CHUNK);
      const res = await query(
        `INSERT INTO stock_levels (sku, size, color, available, incoming, eta, reported_at)
         SELECT sku, size, color, available, incoming, eta, $7 FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::int[], $6::date[]) AS t(sku, size, color, available, incoming, eta)
         ON CONFLICT (sku, size, color) DO UPDATE SET available = EXCLUDED.available, incoming = EXCLUDED.incoming, eta = EXCLUDED.eta, reported_at = EXCLUDED.reported_at, updated_at = now()
         WHERE stock_levels.reported_at <= EXCLUDED.reported_at
         RETURNING sku`,
        [part.map((l) => l.sku), part.map((l) => l.size), part.map((l) => l.color), part.map((l) => l.available), part.map((l) => l.incoming), part.map((l) => l.eta), reportedAt],
        db,
      );
      written += res.length;
    }
    await query(
      `INSERT INTO stock_skus (sku, complete, reported_at) SELECT unnest($1::text[]), $2, $3
       ON CONFLICT (sku) DO UPDATE SET complete = stock_skus.complete OR EXCLUDED.complete, reported_at = GREATEST(stock_skus.reported_at, EXCLUDED.reported_at), updated_at = now()`,
      [skus, full, reportedAt],
      db,
    );
    let zeroed = 0;
    let freed: string[] = [];
    if (full) {
      // Halsdukar som saknas i hela lagret stickas på beställning igen: obegränsade.
      const missing = (await query<{ sku: string }>("SELECT sku FROM stock_skus WHERE NOT (sku = ANY($1)) AND reported_at < $2", [skus, reportedAt], db)).map((r) => r.sku);
      freed = missing.filter(isScarf);
      if (freed.length) {
        await query("DELETE FROM stock_levels WHERE sku = ANY($1)", [freed], db);
        await query("DELETE FROM stock_skus WHERE sku = ANY($1)", [freed], db);
      }
      // Det som rapporterats förut men saknas nu är slut.
      const res = await query(
        `UPDATE stock_levels l SET available = 0, incoming = 0, eta = NULL, reported_at = $1, updated_at = now()
         WHERE l.reported_at < $1 AND NOT EXISTS (
           SELECT 1 FROM unnest($2::text[], $3::text[], $4::text[]) AS t(sku, size, color) WHERE t.sku = l.sku AND t.size = l.size AND t.color = l.color)
         RETURNING l.sku`,
        [reportedAt, levels.map((l) => l.sku), levels.map((l) => l.size), levels.map((l) => l.color)],
        db,
      );
      zeroed = res.length;
      await query("UPDATE stock_skus SET complete = true, reported_at = GREATEST(reported_at, $1), updated_at = now() WHERE reported_at <= $1", [reportedAt], db);
    }
    return { stale: levels.length - written, zeroed, freed };
  });

  const out = levels.filter((l) => l.available === 0).length;
  const few = levels.filter((l) => l.available > 0 && l.available <= FEW_LEFT).length;
  const message = [
    `${plural(levels.length, "lagerrad", "lagerrader")} för ${plural(skus.length, "artikel", "artiklar")}${full ? " (hela lagret)" : ""}`,
    out ? `${out} slut` : "",
    few ? `${few} med få kvar` : "",
    zeroed ? `${plural(zeroed, "rad", "rader")} som saknades räknas som slut` : "",
    freed.length ? `${freed.join(", ")} stickas på beställning igen (obegränsat)` : "",
    stale ? `${plural(stale, "rad", "rader")} äldre än det vi redan har hoppades över` : "",
    invalid ? `${plural(invalid, "ogiltig rad", "ogiltiga rader")} hoppades över` : "",
  ]
    .filter(Boolean)
    .join(", ");
  await q("INSERT INTO stock_updates (reported_at, full_stock, row_count, sku_count, message) VALUES ($1, $2, $3, $4, $5)", [reportedAt, full, levels.length, skus.length, message]).catch((e) => console.error("poc/stock logg", e instanceof Error ? e.message : e));
  await q("DELETE FROM stock_updates WHERE id < (SELECT max(id) - 200 FROM stock_updates)").catch(() => {});
  await q("DELETE FROM stock_reservations WHERE at < now() - interval '60 days'").catch(() => {});
  console.log("poc/stock", message);
  return { ok: true, message, rows: levels.length, skus: skus.length, skipped: invalid, stale, zeroed };
}

// ── Läsa lagret ─────────────────────────────────────────────────────────────

/**
 * Lagret för artiklarna (alla som hubben rapporterat, utan `skus`). En artikel som hubben aldrig rapporterat finns inte
 * i svaret: den säljs obegränsat. Det som reserverats för bekräftade ordrar efter hubbens senaste besked är avräknat.
 */
export async function stockMap(skus?: string[]): Promise<Map<string, SkuStock>> {
  if (skus && !skus.length) return new Map();
  const rows = await q(
    `SELECT s.sku, s.complete, l.size, l.color, l.available, l.incoming, to_char(l.eta, 'YYYY-MM-DD') AS eta, l.updated_at,
       COALESCE((SELECT sum(r.qty) FROM stock_reservations r WHERE r.sku = l.sku AND r.size = l.size AND r.color = l.color AND r.at > l.reported_at), 0)::int AS reserved
     FROM stock_skus s LEFT JOIN stock_levels l ON l.sku = s.sku
     WHERE ($1::text[] IS NULL OR s.sku = ANY($1))
     ORDER BY s.sku, l.size, l.color`,
    [skus ? [...new Set(skus)] : null],
  );
  const out = new Map<string, SkuStock>();
  for (const r of rows) {
    const sku = r.sku as string;
    const stock = out.get(sku) ?? { sku, tracked: true, complete: Boolean(r.complete), rows: [] };
    out.set(sku, stock);
    if (r.size === null || r.size === undefined) continue;
    const row: StockRow = {
      size: r.size as string,
      color: r.color as string,
      available: Math.max(0, Number(r.available) - Number(r.reserved)),
      incoming: Number(r.incoming),
      ...(r.eta ? { eta: r.eta as string } : {}),
      updatedAt: iso(r.updated_at as Date)!,
    };
    stock.rows.push(row);
  }
  return out;
}

/** Lagret för en artikel; `tracked: false` om hubben aldrig rapporterat den (då säljs den obegränsat). */
export async function stockFor(sku: string): Promise<SkuStock> {
  return (await stockMap([sku])).get(sku) ?? { sku, tracked: false, complete: false, rows: [] };
}

// ── Kassan och ordrarna ─────────────────────────────────────────────────────

/**
 * En rad att pröva mot lagret. Färgen anges som `color` (färgkoden, namnet eller en `ColorRef`) eller tas ur
 * klubbproduktens `spec` (plaggets färg); halsduken har ingen. `title` är det kunden ser, t.ex. "AIK Hoodie".
 */
export type StockLine = { sku: string; size?: string; qty: number; title?: string; color?: string | { hex?: string; name?: string } | ColorRef; spec?: Record<string, unknown> };

export type StockProblemReason = "slut" | "få kvar" | "säljs inte längre";

/**
 * Ett hinder för ordern. `index` är första raden det gäller (som `lines.<index>` i felsvaret), `lines` alla raderna – två
 * klubbprodukter med samma plagg, storlek och färg delar på samma saldo. `message` kan visas för kunden som det är.
 */
export type StockProblem = { index: number; lines: number[]; sku: string; size?: string; reason: StockProblemReason; available: number; requested: number; message: string };

function refOf(l: StockLine, palette: readonly { name: string; hex: string }[] = []): ColorRef | undefined {
  const c = l.color;
  if (typeof c === "string") return colorRef(/^#?[0-9a-f]{6}$/i.test(c.trim()) ? { hex: c.trim().startsWith("#") ? c.trim() : `#${c.trim()}` } : { name: c }, palette);
  if (c && "names" in c) return c;
  if (c) return colorRef(c, palette);
  return specColor(l.spec, palette);
}

/** Raderna och lagret de drar ur: samma artikel, storlek och färg räknas ihop. */
async function resolveLines(lines: StockLine[]) {
  const stock = await stockMap([...new Set(lines.map((l) => l.sku))]);
  return lines.map((l, index) => {
    const p = catalogProduct(l.sku);
    const s = stock.get(l.sku);
    const ref = p ? refOf(l, p.colors) : undefined;
    const size = l.size ?? (p?.sizes.length === 1 ? p.sizes[0] : undefined);
    const rows = s ? rowsFor(s, size, ref) : [];
    const key = rows.length ? `${l.sku}\n${rows.map((r) => `${r.size}|${r.color}`).join("\n")}` : `${l.sku}\n${sizeKey(size)}\n${ref?.hex ?? ref?.names[0] ?? ""}`;
    return { index, line: l, product: p, stock: s, ref, size, rows, key };
  });
}

/**
 * Om raderna går att beställa: produkten säljs fortfarande och det finns tillräckligt i lagret (en artikel som hubben
 * aldrig rapporterat räknas som obegränsad). `problems` har besked som kunden kan läsa, t.ex. "AIK Hoodie i storlek M är
 * slut. Fler väntas 12 december." eller "Det finns bara 2 kvar av AIK Hoodie i storlek M (du har valt 3)."
 */
export async function checkStock(lines: StockLine[]): Promise<{ ok: boolean; problems: StockProblem[] }> {
  const problems: StockProblem[] = [];
  const resolved = await resolveLines(lines);
  const groups = new Map<string, { items: typeof resolved; qty: number; state: SizeStock }>();
  for (const r of resolved) {
    const name = r.line.title?.trim() || r.product?.name || r.line.sku;
    if (!r.product || !sellable(r.line.sku)) {
      problems.push({ index: r.index, lines: [r.index], sku: r.line.sku, size: r.size, reason: "säljs inte längre", available: 0, requested: r.line.qty, message: `${name} säljs inte längre.` });
      continue;
    }
    if (!r.stock?.tracked) continue;
    const group = groups.get(r.key) ?? { items: [], qty: 0, state: sizeStock(r.stock, r.size ?? "", r.ref) };
    group.items.push(r);
    group.qty += r.line.qty;
    groups.set(r.key, group);
  }
  for (const { items, qty, state } of groups.values()) {
    if (state.available === null) continue;
    const first = items[0];
    const titles = [...new Set(items.map((i) => i.line.title?.trim()).filter(Boolean))];
    const name = titles.length === 1 ? titles[0]! : first.product!.name;
    const sized = first.product!.sizes.length > 1 && first.size ? ` i storlek ${first.size}` : "";
    const base = { index: first.index, lines: items.map((i) => i.index), sku: first.line.sku, size: first.size, available: state.available, requested: qty };
    if (state.available <= 0) {
      const more = incomingText(state);
      problems.push({ ...base, reason: "slut", message: `${name}${sized} är slut.${more ? ` ${more}` : ""}` });
    } else if (qty > state.available) {
      problems.push({ ...base, reason: "få kvar", message: `Det finns bara ${state.available} kvar av ${name}${sized} (du har valt ${qty}).` });
    }
  }
  problems.sort((a, b) => a.index - b.index);
  return { ok: problems.length === 0, problems };
}

/**
 * Räknar av raderna från lagret när hubben bekräftat ordern, tills hubben skickar ett nytt saldo (som redan har ordern
 * med). `ref` är orderns nummer: samma order två gånger räknas bara av en gång. Artiklar som hubben inte rapporterat
 * räknas inte.
 */
export async function reserveStock(lines: StockLine[], ref?: string): Promise<{ ok: true; reserved: number; message: string }> {
  const key = ref?.trim() || `res-${randomBytes(6).toString("hex")}`;
  const want = new Map<string, { sku: string; size: string; color: string; qty: number }>();
  for (const r of await resolveLines(lines)) {
    if (!r.stock?.tracked || !r.rows.length || r.line.qty <= 0) continue;
    // Utan färg (alla färger ihop) tas det ur färgen som har mest.
    const row = [...r.rows].sort((a, b) => b.available - a.available)[0];
    const k = `${r.line.sku}\n${row.size}\n${row.color}`;
    const hit = want.get(k) ?? { sku: r.line.sku, size: row.size, color: row.color, qty: 0 };
    hit.qty += Math.floor(r.line.qty);
    want.set(k, hit);
  }
  const list = [...want.values()];
  if (!list.length) return { ok: true, reserved: 0, message: `Inget att räkna av för ${key}` };
  const res = await q<{ qty: number }>(
    `INSERT INTO stock_reservations (ref, sku, size, color, qty)
     SELECT $1, sku, size, color, qty FROM unnest($2::text[], $3::text[], $4::text[], $5::int[]) AS t(sku, size, color, qty)
     ON CONFLICT (ref, sku, size, color) DO NOTHING RETURNING qty`,
    [key, list.map((l) => l.sku), list.map((l) => l.size), list.map((l) => l.color), list.map((l) => l.qty)],
  );
  const reserved = res.reduce((n, r) => n + Number(r.qty), 0);
  return { ok: true, reserved, message: res.length ? `${reserved} st avräknade från lagret för ${key}` : `${key} var redan avräknad` };
}

/** Lämnar tillbaka det som räknats av för ordern (`ref`), t.ex. när den avbryts. */
export async function releaseStock(ref: string): Promise<{ ok: true; released: number }> {
  const res = await q<{ qty: number }>("DELETE FROM stock_reservations WHERE ref = $1 RETURNING qty", [ref]);
  return { ok: true, released: res.reduce((n, r) => n + Number(r.qty), 0) };
}

// ── Crafts integrationssida ─────────────────────────────────────────────────

export type StockSummary = {
  /** Artiklar som hubben rapporterat, och hur många av dem som funnits i ett fullständigt lager. */
  tracked: number;
  complete: number;
  /** Lagerrader (artikel × storlek × färg), hur många som är slut och hur många som har få kvar. */
  rows: number;
  out: number;
  few: number;
  /** Avräknat för bekräftade ordrar sedan hubbens senaste saldo. */
  reserved: number;
  updatedAt?: string;
  lastFullAt?: string;
  /** De senaste lagerbeskeden, nyast först. */
  updates: { at: string; reportedAt: string; full: boolean; rows: number; skus: number; message: string }[];
  /** Artiklarna, de med slut eller få kvar först. */
  articles: { sku: string; name: string; sellable: boolean; label: StockLabel | null; available: number; updatedAt?: string }[];
};

/** Lagret i siffror och de senaste beskeden från hubben, för Crafts integrationssida. */
export async function stockSummary(): Promise<StockSummary> {
  const [stock, updates, reserved] = await Promise.all([
    stockMap(),
    q("SELECT * FROM stock_updates ORDER BY id DESC LIMIT 10"),
    q<{ n: number }>(
      `SELECT COALESCE(sum(r.qty), 0)::int AS n FROM stock_reservations r JOIN stock_levels l ON l.sku = r.sku AND l.size = r.size AND l.color = r.color WHERE r.at > l.reported_at`,
    ),
  ]);
  const all = [...stock.values()];
  const rows = all.flatMap((s) => s.rows);
  const lastFull = await q<{ at: Date }>("SELECT max(reported_at) AS at FROM stock_updates WHERE full_stock");
  const articles = all
    .map((s) => {
      const p = catalogProduct(s.sku);
      const ps = productStock(s, p?.sizes ?? [...new Set(s.rows.map((r) => r.size).filter(Boolean))]);
      const updatedAt = s.rows.map((r) => r.updatedAt).sort().at(-1);
      return { sku: s.sku, name: p?.name ?? s.sku, sellable: sellable(s.sku), label: ps.label, available: s.rows.reduce((n, r) => n + r.available, 0), ...(updatedAt ? { updatedAt } : {}) };
    })
    .sort((a, b) => rank(a.label) - rank(b.label) || a.name.localeCompare(b.name, "sv"))
    .slice(0, 200);
  return {
    tracked: all.length,
    complete: all.filter((s) => s.complete).length,
    rows: rows.length,
    out: rows.filter((r) => r.available <= 0).length,
    few: rows.filter((r) => r.available > 0 && r.available <= FEW_LEFT).length,
    reserved: Number(reserved[0]?.n ?? 0),
    updatedAt: updates[0] ? iso(updates[0].at as Date) : undefined,
    lastFullAt: lastFull[0]?.at ? iso(lastFull[0].at) : undefined,
    updates: updates.map((u) => ({ at: iso(u.at as Date)!, reportedAt: iso(u.reported_at as Date)!, full: Boolean(u.full_stock), rows: Number(u.row_count), skus: Number(u.sku_count), message: u.message as string })),
    articles,
  };
}

const rank = (l: StockLabel | null) => (l?.tone === "slut" ? 0 : l?.tone === "få" ? 1 : 2);
