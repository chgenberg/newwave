#!/usr/bin/env node
// Hela kretsen mot hubben, över HTTP: en körande server i http-läget mot provhubben (scripts/hub-mock.mjs).
// Order in från butiken → ordern når hubben med fungerande fillänkar → samma butiksorder två gånger blir en order →
// status in (och samma händelse två gånger) → fel signatur avvisas → lagret gör en storlek slut → ny produkt och nytt
// pris syns i katalogen → avbokningen går ut till hubben. Skriver en tabell och avslutar med kod 1 vid fel.
//
//   node scripts/hub-e2e.mjs [--base=http://localhost:3300] [--hub=http://localhost:4400] [--product=<klubbprodukt-id>]
//                            [--timeout=120] [--allow-remote-db] [--keep-products] [--keep-data]
//
// Servern och provhubben ska ha samma HUB_WEBHOOK_SECRET och HUB_API_KEY. Skriptet läser .env.local om den finns (utan
// att skriva ut något) och sedan miljön. Det behöver:
//   INTERSPORT_API_KEY   butikens nyckel (utan den: demonyckeln, som bara gäller vid utveckling)
//   POC_SESSION_SECRET   för Crafts session vid avbokningen (utan den: utvecklingsstandarden)
//   HUB_CRON_KEY         samma som servern, för att köra utkorgen direkt (POST /api/v1/hub/kor); utan den demonyckeln
//   DATABASE_URL         för att hitta en publicerad klubbprodukt när --product saknas, och för att städa efteråt:
//                        provordrarna och provlagret tas bort (bara en databas på den här datorn; --keep-data behåller)
//   DEMO_PASSWORD        om sajten har demots lösenord påslaget

import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const flag = (k) => {
  const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  if (!a) return undefined;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};

const BASE = String(flag("base") ?? "http://localhost:3300").replace(/\/+$/, "");
const HUB = String(flag("hub") ?? "http://localhost:4400").replace(/\/+$/, "");
const TIMEOUT_S = Number(flag("timeout") ?? 120);
const SHOP_KEY = process.env.INTERSPORT_API_KEY || "demo-intersport-key";
const SESSION_SECRET = process.env.POC_SESSION_SECRET || "nw-poc-utveckling-inte-hemlig";
/** Som routen: utan HUB_CRON_KEY gäller utvecklingens demonyckel (bara när servern inte kör i produktion). */
const CRON_KEY = process.env.HUB_CRON_KEY || "demo-hub-cron-key";
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

// ── Hjälpare ────────────────────────────────────────────────────────────────

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cookies för Crafts session (och demots lösenord, om det är påslaget), som sajten själv skulle sätta dem. */
function craftCookie() {
  const body = Buffer.from(JSON.stringify([{ role: "craft", exp: Date.now() + 60 * 60_000 }])).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return [`nw-poc-session=${body}.${sig}`, demoCookie()].filter(Boolean).join("; ");
}

function demoCookie() {
  const pw = process.env.DEMO_PASSWORD;
  return pw ? `nw-access=${createHash("sha256").update(`nw-access:${pw}`).digest("hex")}` : "";
}

async function http(method, url, { body, headers = {}, timeout = 60_000 } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  const dc = demoCookie();
  if (dc && url.startsWith(BASE) && !h.cookie) h.cookie = dc;
  const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { text: text.slice(0, 300) };
  }
  return { status: r.status, json };
}

/** Väntar tills `fn` ger något sant, högst `seconds`. */
async function until(fn, seconds = TIMEOUT_S, every = 1000) {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) return undefined;
    await pause(every);
  }
}

class Skip extends Error {}
const need = (v, what) => {
  if (!v) throw new Skip(`hoppas över: ${what} saknas`);
  return v;
};

const steps = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    steps.push({ name, ok: true, detail: detail ?? "", ms: Date.now() - started });
  } catch (e) {
    steps.push({ name, ok: false, skipped: e instanceof Skip, detail: e instanceof Error ? e.message : String(e), ms: Date.now() - started });
  }
  const s = steps.at(-1);
  console.log(`${s.ok ? "OK  " : s.skipped ? "--  " : "FEL "} ${name}${s.detail ? ` – ${s.detail}` : ""}`);
}

const fail = (msg) => {
  throw new Error(msg);
};

const results = (r) => r?.json?.response?.body?.results ?? r?.json?.results ?? [];
const webhookStatus = (r) => r?.json?.response?.status;

// ── Det som delas mellan stegen ─────────────────────────────────────────────

const ctx = {
  catalog: /** @type {any[]} */ ([]),
  product: /** @type {{ id: string, clubId: string, sku: string } | null} */ (null),
  sizes: /** @type {string[]} */ ([]),
  orderA: /** @type {any} */ (null),
  tokenA: "",
  hubA: /** @type {any} */ (null),
  lastEventId: "",
  orderB: /** @type {any} */ (null),
  hubFlags: /** @type {any} */ ({}),
};

async function catalog() {
  const r = await http("GET", `${BASE}/api/v1/catalog`);
  if (r.status !== 200) fail(`katalogen svarade ${r.status}`);
  return r.json.products ?? [];
}

async function findProduct() {
  const given = flag("product");
  const plagg = (sku) => ctx.catalog.find((p) => p.sku === sku && p.kind === "plagg" && (p.sizes ?? []).length >= 2);
  if (typeof given === "string") {
    const rows = await dbRows("SELECT id, club_id, sku FROM club_products WHERE id = $1", [given]).catch(() => null);
    if (rows?.[0]) return { id: rows[0].id, clubId: rows[0].club_id, sku: rows[0].sku };
    fail("--product hittades inte i databasen (ange en publicerad klubbprodukt)");
  }
  const rows = await dbRows(
    "SELECT id, club_id, sku FROM club_products WHERE status = 'publicerad' AND kind = 'plagg' ORDER BY updated_at DESC LIMIT 200",
  );
  const row = rows.find((r) => plagg(r.sku));
  if (!row) fail("ingen publicerad klubbprodukt (plagg med storlekar) – publicera en klubbkollektion först, eller ange --product");
  return { id: row.id, clubId: row.club_id, sku: row.sku };
}

/** Läser ur den lokala databasen. Vägrar en databas som inte ligger på den här datorn, så att produktionen aldrig rörs. */
async function dbRows(sql, params = []) {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL saknas – ange --product=<klubbprodukt-id>");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && !flag("allow-remote-db")) fail("DATABASE_URL pekar inte på den här datorn – ange --product eller --allow-remote-db");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}

const localDb = () => {
  try {
    return ["localhost", "127.0.0.1", "::1", ""].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
};

/** För städningen: bara en databas på den här datorn (aldrig med --allow-remote-db), och null i stället för fel. */
const dbTry = (sql, params = []) => (localDb() ? dbRows(sql, params).catch(() => null) : Promise.resolve(null));

async function placeOrder({ size, externalRef }) {
  return http("POST", `${BASE}/api/v1/orders`, {
    headers: { "x-api-key": SHOP_KEY },
    body: {
      clubId: ctx.product.clubId,
      externalRef,
      customer: { name: "E2E-test hubben", email: `e2e+${RUN}@example.invalid` },
      delivery: "ombud",
      lines: [{ clubProductId: ctx.product.id, size, qty: 1 }],
    },
  });
}

async function orderView(order, token) {
  const r = await http("GET", `${BASE}/api/v1/orders/${encodeURIComponent(order.id)}?t=${encodeURIComponent(token)}`);
  return r.status === 200 ? r.json.order : null;
}

/** Kör utkorgen direkt om schemats nyckel finns, annars väntar vi på serverns eget schema. */
async function kick() {
  if (!CRON_KEY) return;
  await http("POST", `${BASE}/api/v1/hub/kor`, { headers: { "x-api-key": CRON_KEY } }).catch(() => {});
}

async function hubOrder(number) {
  const r = await http("GET", `${HUB}/_admin/orders/${encodeURIComponent(number)}`);
  return r.status === 200 ? r.json : null;
}

/** Väntar tills ordern finns hos provhubben; knuffar utkorgen efter några sekunder. */
async function reachHub(number) {
  let kicked = 0;
  return until(async () => {
    const rec = await hubOrder(number);
    if (rec) return rec;
    if (++kicked % 5 === 0) await kick();
    return null;
  });
}

const tokenOf = (statusUrl) => new URL(statusUrl, BASE).searchParams.get("t") ?? "";

// ── Stegen ──────────────────────────────────────────────────────────────────

console.log(`Kretsen mot hubben: servern ${BASE}, provhubben ${HUB}, körning ${RUN}\n`);

await step("Servern och katalogen svarar", async () => {
  ctx.catalog = await catalog();
  return `${ctx.catalog.length} produkter i katalogen`;
});

await step("Provhubben svarar och signerar", async () => {
  const r = await http("GET", `${HUB}/_admin/state`);
  if (r.status !== 200) fail(`provhubben svarade ${r.status} – starta node scripts/hub-mock.mjs`);
  const f = r.json.flags;
  ctx.hubFlags = f;
  if (!f.signed) fail("provhubben saknar HUB_WEBHOOK_SECRET och skickar osignerat");
  const modes = [f.acceptOnly && "--accept-only", f.fail && `--fail=${f.fail}`, f.loseFirst && "--lose-first", f.slow && `--slow=${f.slow}`].filter(Boolean);
  if (modes.length) return `obs: ${modes.join(", ")} (nya försök tar minuter – höj --timeout)`;
  return `händelser till ${f.target}`;
});

await step("Publicerad klubbprodukt att handla", async () => {
  need(ctx.catalog.length, "katalogen");
  ctx.product = await findProduct();
  ctx.sizes = ctx.catalog.find((p) => p.sku === ctx.product.sku)?.sizes ?? [];
  return `${ctx.product.id} (${ctx.product.sku}, ${ctx.product.clubId}), storlekar ${ctx.sizes.join(" ")}`;
});

const sizeOk = () => ctx.sizes[Math.min(ctx.sizes.length - 1, Math.floor(ctx.sizes.length / 2))];
const sizeOut = () => ctx.sizes[0];

await step("Order in från butiken", async () => {
  need(ctx.product, "klubbprodukten");
  const r = await placeOrder({ size: sizeOk(), externalRef: `E2E-${RUN}-A` });
  if (r.status !== 201 && r.status !== 200) fail(`POST /api/v1/orders svarade ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  ctx.orderA = r.json.order;
  ctx.tokenA = tokenOf(r.json.statusUrl);
  return `${ctx.orderA.number}, ${ctx.orderA.totalSek} kr, status ${ctx.orderA.status}`;
});

await step("Samma butiksorder (externalRef) två gånger blir en order", async () => {
  need(ctx.orderA, "ordern");
  const r = await placeOrder({ size: sizeOk(), externalRef: `E2E-${RUN}-A` });
  if (r.status >= 300) fail(`andra anropet svarade ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  if (r.json.order?.id !== ctx.orderA.id) fail(`fick en ny order ${r.json.order?.number} i stället för ${ctx.orderA.number}`);
  return `samma order ${ctx.orderA.number} (svar ${r.status})`;
});

await step("Ordern når hubben", async () => {
  need(ctx.orderA, "ordern");
  const rec = await reachHub(ctx.orderA.number);
  if (!rec) fail(`provhubben fick inte ${ctx.orderA.number} inom ${TIMEOUT_S} s`);
  ctx.hubA = rec;
  const state = await http("GET", `${HUB}/_admin/state`);
  const same = (state.json.orders ?? []).filter((o) => o.externalRef === `E2E-${RUN}-A` || o.orderNumber === ctx.orderA.number);
  if (same.length !== 1) fail(`provhubben har ${same.length} ordrar för butiksordern`);
  return `${rec.lines.length} rader, ${rec.files.length} fillänkar, skickad ${rec.submits} gång(er)`;
});

await step("Fillänkarna i ordern fungerar", async () => {
  need(ctx.hubA, "ordern hos hubben");
  const rec = await until(async () => {
    const r = await hubOrder(ctx.orderA.number);
    return r?.filesChecked ? r : null;
  }, Math.max(TIMEOUT_S, 180));
  if (!rec) fail("provhubben blev inte klar med filerna");
  if (!rec.files.length) fail("ordern har inga fillänkar");
  const bad = rec.files.filter((f) => !f.ok);
  if (bad.length) fail(`${bad.length} av ${rec.files.length} gick inte att hämta: ${bad.map((f) => `${f.name} (${f.status ?? f.error})`).join(", ")}`);
  if (rec.tamperedRejected === false) fail(`en ändrad länk gav ${rec.tamperedStatus} – länkarna ska vara signerade`);
  const kb = Math.round(rec.files.reduce((n, f) => n + (f.bytes ?? 0), 0) / 1024);
  return `${rec.files.length} filer, ${kb} kB, ändrad länk nekas (${rec.tamperedStatus})`;
});

await step("Bekräftad med hubbens ordernummer", async () => {
  need(ctx.hubA, "ordern hos hubben");
  // Med --accept-only svarade hubben 202 utan nummer: bekräftelsen kommer som händelsen order.status "bekräftad".
  if (ctx.hubFlags.acceptOnly) {
    const r = await http("POST", `${HUB}/_admin/orders/${encodeURIComponent(ctx.orderA.number)}/advance`, { body: { to: "bekräftad" } });
    const res = r.json.events?.[0]?.response?.body?.results?.[0];
    if (res?.status !== "behandlad") fail(`bekräftelsen: ${JSON.stringify(r.json).slice(0, 200)}`);
  }
  let kicked = 0;
  const v = await until(async () => {
    const o = await orderView(ctx.orderA, ctx.tokenA);
    if (o?.erpRef) return o;
    // Tappade hubbens svar (--fail) skickar utkorgen ordern igen efter en minut, med samma Idempotency-Key.
    if (++kicked % 5 === 0) await kick();
    return null;
  });
  if (!v) fail("ordern fick inget ordernummer från hubben");
  if (v.erpRef !== ctx.hubA.erpRef) fail(`ordernumret ${v.erpRef} är inte hubbens ${ctx.hubA.erpRef}`);
  return `${v.erpRef}, status ${v.status}`;
});

await step("Status in: i produktion", async () => {
  need(ctx.hubA, "ordern hos hubben");
  const r = await http("POST", `${HUB}/_admin/orders/${encodeURIComponent(ctx.orderA.number)}/advance`, { body: { to: "i produktion" } });
  const evs = r.json.events ?? [];
  if (!evs.length) fail(`provhubben skickade ingen händelse (${r.status}: ${JSON.stringify(r.json).slice(0, 200)})`);
  for (const e of evs) {
    const res = e.response?.body?.results?.[0];
    if (e.response?.status !== 200 || res?.status !== "behandlad") fail(`webhooken svarade ${e.response?.status} ${res?.status ?? ""} ${res?.message ?? e.response?.body?.error ?? ""}`);
  }
  ctx.lastEventId = evs.at(-1).event.id;
  const v = await until(async () => {
    const o = await orderView(ctx.orderA, ctx.tokenA);
    return o?.status === "i produktion" ? o : null;
  }, 15);
  if (!v) fail(`ordern står på ${(await orderView(ctx.orderA, ctx.tokenA))?.status}`);
  return `${evs.length} händelse(r) behandlade, ordern i produktion`;
});

await step("Samma händelse två gånger behandlas en gång", async () => {
  need(ctx.lastEventId, "en händelse");
  const before = await orderView(ctx.orderA, ctx.tokenA);
  const r = await http("POST", `${HUB}/_admin/resend/${encodeURIComponent(ctx.lastEventId)}`);
  const res = results(r)[0];
  if (webhookStatus(r) !== 200 || res?.status !== "dubblett") fail(`webhooken svarade ${webhookStatus(r)} ${res?.status ?? ""}`);
  const after = await orderView(ctx.orderA, ctx.tokenA);
  if ((after?.events?.length ?? 0) !== (before?.events?.length ?? 0)) fail("tidslinjen fick en ny händelse av dubbletten");
  return `dubblett (tidigare ${res.previous})`;
});

await step("Status in: skickad med spårningsnummer", async () => {
  need(ctx.hubA, "ordern hos hubben");
  const r = await http("POST", `${HUB}/_admin/orders/${encodeURIComponent(ctx.orderA.number)}/advance`, { body: { to: "skickad" } });
  const evs = r.json.events ?? [];
  if (!evs.length) fail("provhubben skickade ingen händelse");
  for (const e of evs) if (e.response?.body?.results?.[0]?.status !== "behandlad") fail(`webhooken: ${JSON.stringify(e.response?.body).slice(0, 200)}`);
  const v = await until(async () => {
    const o = await orderView(ctx.orderA, ctx.tokenA);
    return o?.status === "skickad" ? o : null;
  }, 15);
  if (!v) fail(`ordern står på ${(await orderView(ctx.orderA, ctx.tokenA))?.status}`);
  const tracking = v.jobs.map((j) => j.tracking).filter(Boolean);
  const want = evs.map((e) => e.event.data.tracking);
  if (!want.every((t) => tracking.includes(t))) fail(`spårningsnumren ${want.join(", ")} syns inte i ordern (${tracking.join(", ") || "inga"})`);
  return `skickad, spårning ${tracking.join(", ")}`;
});

await step("Fel signatur och osignerat anrop avvisas", async () => {
  need(ctx.orderA, "ordern");
  const event = { id: `e2e-${RUN}-falsk`, type: "order.status", at: new Date().toISOString(), data: { orderNumber: ctx.orderA.number, status: "avbruten", note: "falsk" } };
  const wrong = await http("POST", `${HUB}/_admin/send?signatur=fel`, { body: event });
  const none = await http("POST", `${HUB}/_admin/send?signatur=ingen`, { body: { ...event, id: `${event.id}-2` } });
  if (webhookStatus(wrong) !== 401) fail(`fel signatur gav ${webhookStatus(wrong)} (servern saknar HUB_WEBHOOK_SECRET?)`);
  if (webhookStatus(none) !== 401) fail(`osignerat gav ${webhookStatus(none)}`);
  const v = await orderView(ctx.orderA, ctx.tokenA);
  if (v?.status === "avbruten") fail("den falska händelsen ändrade ordern");
  return `401 och 401, ordern orörd (${v?.status})`;
});

// Lagerraden som provet skriver över, så att den kan läggas tillbaka efteråt (bara med den lokala databasen).
let stockBefore = null;
let stockUpdatesBefore = null;

await step("Lagret gör en storlek slut, och en order på den avvisas", async () => {
  need(ctx.product, "klubbprodukten");
  stockBefore = await dbTry("SELECT * FROM stock_levels WHERE sku = $1 AND size = $2", [ctx.product.sku, sizeOut()]);
  stockUpdatesBefore = (await dbTry("SELECT COALESCE(max(id), 0)::bigint AS id FROM stock_updates"))?.[0]?.id ?? null;
  const r = await http("POST", `${HUB}/_admin/stock`, { body: { items: [{ sku: ctx.product.sku, size: sizeOut(), available: 0 }] } });
  const res = results(r)[0];
  if (webhookStatus(r) !== 200 || res?.status !== "behandlad") fail(`lagerhändelsen: ${webhookStatus(r)} ${res?.status ?? ""} ${res?.message ?? ""}`);
  const o = await placeOrder({ size: sizeOut(), externalRef: `E2E-${RUN}-slut` });
  if (o.status < 400) fail(`ordern på ${sizeOut()} togs emot (${o.status}, ${o.json.order?.number})`);
  const why = o.json.issues?.map((i) => i.message).join("; ") || o.json.error;
  return `${ctx.product.sku} ${sizeOut()} slut → ${o.status}: ${why}`;
});

await step("Lagret fylls på igen", async () => {
  need(ctx.product, "klubbprodukten");
  const r = await http("POST", `${HUB}/_admin/stock`, { body: { items: [{ sku: ctx.product.sku, size: sizeOut(), available: 1000 }] } });
  if (results(r)[0]?.status !== "behandlad") fail(`lagerhändelsen: ${webhookStatus(r)} ${results(r)[0]?.message ?? ""}`);
  return `${ctx.product.sku} ${sizeOut()}: 1000`;
});

await step("Avbokning går ut till hubben", async () => {
  need(ctx.product, "klubbprodukten");
  const r = await placeOrder({ size: sizeOk(), externalRef: `E2E-${RUN}-B` });
  if (r.status >= 300) fail(`order B: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  ctx.orderB = r.json.order;
  if (!(await reachHub(ctx.orderB.number))) fail(`provhubben fick inte ${ctx.orderB.number}`);
  const c = await http("POST", `${BASE}/api/v1/orders/${encodeURIComponent(ctx.orderB.id)}/cancel`, { headers: { cookie: craftCookie() }, body: { reason: "E2E: avbokning" } });
  if (c.status !== 200) fail(`avbokningen svarade ${c.status}: ${c.json.error ?? ""}`);
  let kicked = 0;
  const rec = await until(async () => {
    const h = await hubOrder(ctx.orderB.number);
    if (h?.cancel) return h;
    if (++kicked % 5 === 0) await kick();
    return null;
  });
  if (!rec) fail("provhubben fick ingen avbokning");
  return `${ctx.orderB.number} avbokad hos hubben (${rec.cancel.reason || "utan orsak"})`;
});

// Hubbens produkter blir hela katalogen så snart hubben skickat en (lib/poc/catalog.ts). Provet med en testprodukt
// görs därför sist, och hubbens produktfil läggs tillbaka efteråt som den var – servern läser om den av sig själv.
const testSku = `e2e-${RUN}`;
const HUB_FILE = path.join(".data", "poc", "hub-products.json");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(BASE).hostname) && existsSync(path.join("lib", "poc", "catalog.ts"));
const backup = local ? (existsSync(HUB_FILE) ? readFileSync(HUB_FILE) : null) : undefined;
if (local && backup) writeFileSync(`${HUB_FILE}.e2e-backup`, backup);
try {
  await step("Ny produkt och nytt pris syns i katalogen", async () => {
    need(ctx.catalog.length, "katalogen");
    const base = ctx.catalog.find((p) => p.baseId && p.kind === "plagg");
    const product = { sku: testSku, name: `E2E-testplagg ${RUN}`, kind: "plagg", priceSek: 123, sizes: ["S", "M", "L"], baseId: base?.baseId, active: true };
    const first = await http("POST", `${HUB}/_admin/products`, { body: { products: [product] } });
    if (results(first)[0]?.status !== "behandlad") fail(`produkthändelsen: ${webhookStatus(first)} ${results(first)[0]?.message ?? ""}`);
    const seen = await until(async () => (await catalog()).find((p) => p.sku === testSku && p.priceSek === 123), 15);
    if (!seen) fail("den nya produkten syns inte i /api/v1/catalog");
    const second = await http("POST", `${HUB}/_admin/products`, { body: { products: [{ ...product, priceSek: 149 }] } });
    if (results(second)[0]?.status !== "behandlad") fail(`prisändringen: ${webhookStatus(second)} ${results(second)[0]?.message ?? ""}`);
    const repriced = await until(async () => (await catalog()).find((p) => p.sku === testSku && p.priceSek === 149), 15);
    if (!repriced) fail("det nya priset syns inte i /api/v1/catalog");
    return `${testSku}: 123 kr, sedan 149 kr`;
  });

  await step("Borttagen produkt försvinner ur katalogen", async () => {
    const r = await http("POST", `${HUB}/_admin/products/delete`, { body: { skus: [testSku] } });
    if (results(r)[0]?.status !== "behandlad") fail(`borttagningen: ${webhookStatus(r)} ${results(r)[0]?.message ?? ""}`);
    const gone = await until(async () => !(await catalog()).some((p) => p.sku === testSku), 15);
    if (!gone) fail(`${testSku} finns kvar i /api/v1/catalog`);
    return `${testSku} borta`;
  });
} finally {
  if (local && !flag("keep-products")) {
    if (backup) {
      writeFileSync(HUB_FILE, backup);
      rmSync(`${HUB_FILE}.e2e-backup`, { force: true });
    } else rmSync(HUB_FILE, { force: true });
    console.log(`     (hubbens produktfil ${backup ? "återställd" : "borttagen igen, som före provet"})`);
  } else if (!local) console.log("     (obs: servern är inte lokal – hubbens produkter är nu katalogens källa där)");
}

// ── Städningen (bara lokalt) ────────────────────────────────────────────────

if (!flag("keep-data")) {
  const done = [];
  const orders = await dbTry("DELETE FROM orders WHERE customer->>'email' = $1 RETURNING number", [`e2e+${RUN}@example.invalid`]);
  if (orders) done.push(`${orders.length} provordrar`);
  if (ctx.product && stockBefore) {
    const restored = await dbTry("DELETE FROM stock_levels WHERE sku = $1 AND size = $2 RETURNING sku", [ctx.product.sku, sizeOut()]);
    for (const r of stockBefore) {
      await dbTry("INSERT INTO stock_levels (sku, size, color, available, incoming, eta, reported_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
        r.sku, r.size, r.color, r.available, r.incoming, r.eta, r.reported_at, r.updated_at,
      ]);
    }
    if (restored) done.push(stockBefore.length ? "lagerraden återställd" : "provlagret borttaget");
  }
  if (stockUpdatesBefore !== null) {
    const u = await dbTry("DELETE FROM stock_updates WHERE id > $1 AND NOT full_stock AND sku_count = 1 AND row_count = 1 RETURNING id", [stockUpdatesBefore]);
    if (u) done.push(`${u.length} lagerbesked`);
  }
  console.log(done.length ? `\nStädat: ${done.join(", ")} (--keep-data behåller dem)` : "\nStädningen hoppades över: ingen lokal databas (DATABASE_URL)");
}

// ── Tabellen ────────────────────────────────────────────────────────────────

const passed = steps.filter((s) => s.ok).length;
const width = Math.max(...steps.map((s) => s.name.length));
console.log(`\n${"Steg".padEnd(width)}  Resultat     Tid`);
console.log(`${"-".repeat(width)}  -----------  ------`);
for (const s of steps) console.log(`${s.name.padEnd(width)}  ${(s.ok ? "godkänt" : s.skipped ? "hoppat över" : "underkänt").padEnd(11)}  ${(s.ms / 1000).toFixed(1).padStart(5)} s`);
console.log(`\n${passed} av ${steps.length} godkända${ctx.orderA ? ` · provordrar ${[ctx.orderA?.number, ctx.orderB?.number].filter(Boolean).join(", ")} (kunden "E2E-test hubben")` : ""}`);
process.exit(passed === steps.length ? 0 : 1);
