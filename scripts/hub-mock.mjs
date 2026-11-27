#!/usr/bin/env node
// Provhubben: New Waves hubb i standardformatet (docs/hubb-api.yaml), för att prova kopplingen innan den riktiga finns.
// Node utan beroenden. Tar emot ordrar (idempotent på Idempotency-Key) och avbokningar, svarar på lager och produkter,
// hämtar fillänkarna i varje order och noterar om de fungerar, och skickar signerade händelser till vår webhook.
//
//   node scripts/hub-mock.mjs [--port=4400] [--target=http://localhost:3300/api/v1/hub/webhook] [--auto[=sekunder]]
//                             [--fail=0.3] [--lose-first] [--slow=ms] [--accept-only] [--no-files] [--quiet]
//
// --auto        flyttar varje order ett steg framåt med jämna mellanrum (bekräftad → i produktion → skickad)
// --fail=0.3    30 % av anropen till hubbens API får 503; hälften av dem efter att ordern tagits emot ("svaret tappades"),
//               så att nya försök med samma Idempotency-Key provas på riktigt
// --lose-first  första svaret per Idempotency-Key tappas (503 efter att ordern eller avbokningen tagits emot); nya
//               försök får samma svar som första gången borde ha gett
// --slow=ms     väntar så länge innan varje svar från hubbens API
// --accept-only svarar 202 utan ordernummer; ordernumret kommer senare i händelsen order.status "bekräftad"
// --no-files    hämtar inte fillänkarna
//
// Miljön: HUB_WEBHOOK_SECRET signerar händelserna (utan den skickas de osignerade). HUB_API_KEY krävs i anropen om den är
// satt, i rubriken HUB_AUTH_HEADER (standard "Authorization: Bearer <nyckel>"; annan rubrik bär nyckeln som den är).
//
// Hubbens API (det vår klient anropar):
//   POST /orders                    order (HubOrder) med Idempotency-Key → 201 { erpRef } (202 { status } med --accept-only)
//   POST /orders/{nummer}/cancel    { reason } med Idempotency-Key → 200 { status: "avbruten" }, 409 om den redan tillverkas
//   GET  /orders/{nummer}           orderns läge hos hubben
//   GET  /stock[?since=]            { items, full, at }
//   GET  /products[?since=]         { products, at }
//   GET  /health
// Provhubbens egna anrop (utan nyckel):
//   GET  /_admin/state                         allt: ordrar, filkontroller, lager, produkter, skickade händelser
//   GET  /_admin/orders/{nummer}               en order
//   POST /_admin/orders/{nummer}/advance       { to?, producer?, tracking?, carrier?, note? } → händelser till webhooken
//   POST /_admin/stock                         { items, full? } → sparar och skickar stock.updated (?skicka=nej: bara spara)
//   POST /_admin/products                      { products } → sparar och skickar product.upsert
//   POST /_admin/products/delete               { skus } → tar bort och skickar product.delete
//   POST /_admin/send[?signatur=fel|ingen]     en eller flera råa händelser, signerade (eller med fel/utan signatur)
//   POST /_admin/resend/{händelse-id}          samma händelse igen, med samma id
//   POST /_admin/reset                         tömmer allt

import { createHmac, randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const flag = (k) => {
  const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  if (!a) return undefined;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};

const PORT = Number(flag("port") ?? 4400);
const TARGET = String(flag("target") ?? "http://localhost:3300/api/v1/hub/webhook");
const AUTO = flag("auto") === undefined ? 0 : Number(flag("auto") === true ? 5 : flag("auto"));
const FAIL = Number(flag("fail") ?? 0);
const LOSE_FIRST = Boolean(flag("lose-first"));
const SLOW = Number(flag("slow") ?? 0);
const ACCEPT_ONLY = Boolean(flag("accept-only"));
const CHECK_FILES = !flag("no-files");
const QUIET = Boolean(flag("quiet"));
const SECRET = (process.env.HUB_WEBHOOK_SECRET ?? "").split(",")[0].trim();
const API_KEY = process.env.HUB_API_KEY ?? "";
const AUTH_HEADER = (process.env.HUB_AUTH_HEADER || "Authorization").toLowerCase();

const log = (...m) => QUIET || console.log(new Date().toLocaleTimeString("sv-SE"), ...m);

// ── Läget ───────────────────────────────────────────────────────────────────

/** @type {Map<string, any>} ordernummer → ordern hos hubben */
const orders = new Map();
/** @type {Map<string, { orderNumber: string, status: number, body: any }>} åtgärd + Idempotency-Key → första svaret. Nyckeln
 * gäller per åtgärd, så att en avbokning får ha samma nyckel som ordern (vårt ordernummer). */
const idem = new Map();
/** @type {Map<string, any>} sku|storlek|färg → lagerrad */
const stock = new Map();
/** @type {Map<string, any>} sku → produkt */
const products = new Map();
/** @type {any[]} de senaste händelserna vi skickat, nyast sist */
const sent = [];
/** @type {Map<string, any>} händelse-id → händelsen, för nya försök */
const events = new Map();
/** @type {Set<string>} anropen vars första svar redan tappats (--lose-first) */
const lost = new Set();

const STEPS = ["bekräftad", "i produktion", "skickad", "levererad"];
const PRODUCERS = ["stickeri", "tryckeri"];

function reset() {
  for (const m of [orders, idem, stock, products, events, lost]) m.clear();
  sent.length = 0;
}

const now = () => new Date().toISOString();
const digits = (n) => Array.from(randomBytes(n), (b) => String(b % 10)).join("");
const erpRefFor = (orderNumber) => `NW-SO-${String(orderNumber).replace(/\D/g, "") || digits(6)}`;
const stockKey = (i) => [i.sku, i.size ?? "", i.color ?? ""].join("|");

// ── HTTP ────────────────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(json);
}

async function readJson(req, max = 5_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error("För stor kropp"), { status: 413 });
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Kroppen är inte JSON"), { status: 400 });
  }
}

function authorized(req) {
  if (!API_KEY) return true;
  const v = req.headers[AUTH_HEADER];
  const want = AUTH_HEADER === "authorization" ? `Bearer ${API_KEY}` : API_KEY;
  return typeof v === "string" && v === want;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Händelser till vår webhook ──────────────────────────────────────────────

function signed(body, secret = SECRET) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return { "x-hub-timestamp": ts, "x-hub-signature-256": `sha256=${sig}` };
}

const newEvent = (type, data) => ({ id: `evt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`, type, at: now(), data });

/**
 * Skickar händelser till webhooken, signerade på nytt vid varje försök. Nya försök vid nätverksfel, 5xx och 429, som
 * den riktiga hubben bör göra. `signature`: "rätt", "fel" eller "ingen".
 */
async function deliver(payload, { signature = "rätt", retries = 3 } = {}) {
  const body = JSON.stringify(payload);
  const list = Array.isArray(payload) ? payload : payload.events ?? [payload];
  for (const e of list) if (e?.id) events.set(e.id, e);
  const pauses = [500, 2000, 5000];
  let last;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const headers = { "content-type": "application/json" };
    if (signature === "rätt" && SECRET) Object.assign(headers, signed(body));
    if (signature === "fel") Object.assign(headers, signed(body, `fel-${randomBytes(8).toString("hex")}`));
    try {
      const r = await fetch(TARGET, { method: "POST", headers, body, signal: AbortSignal.timeout(30_000) });
      const text = await r.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { text: text.slice(0, 300) };
      }
      last = { status: r.status, body: json, attempt };
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) {
      last = { status: 0, body: { error: e instanceof Error ? e.message : String(e) }, attempt };
    }
    if (attempt <= retries && signature === "rätt") await pause(pauses[attempt - 1] ?? 5000);
    else break;
  }
  const record = { at: now(), events: list.map((e) => ({ id: e?.id, type: e?.type })), signature, response: last };
  sent.push(record);
  if (sent.length > 200) sent.shift();
  log("→ webhook", list.map((e) => `${e?.type} ${e?.id}`).join(", "), "→", last.status, summarize(last.body));
  return last;
}

function summarize(body) {
  if (body?.results) return body.results.map((r) => `${r.status}${r.message ? ` (${r.message})` : ""}`).join(", ");
  return body?.error ?? "";
}

// ── Ordrarna ────────────────────────────────────────────────────────────────

function validOrder(o) {
  const problems = [];
  if (!o || typeof o !== "object") return ["Kroppen ska vara en order"];
  if (typeof o.orderNumber !== "string" || !o.orderNumber) problems.push("orderNumber saknas");
  if (!Array.isArray(o.lines) || !o.lines.length) problems.push("lines saknas");
  for (const [i, l] of (o.lines ?? []).entries()) {
    if (!l?.lineId) problems.push(`lines.${i}.lineId saknas`);
    if (!l?.sku) problems.push(`lines.${i}.sku saknas`);
    if (!Number.isInteger(l?.qty) || l.qty < 1) problems.push(`lines.${i}.qty ska vara ett heltal ≥ 1`);
    if (!PRODUCERS.includes(l?.producer)) problems.push(`lines.${i}.producer ska vara tryckeri eller stickeri`);
    if (!Array.isArray(l?.files)) problems.push(`lines.${i}.files saknas`);
  }
  if (typeof o.totalSek !== "number") problems.push("totalSek saknas");
  return problems;
}

function receiveOrder(o, key) {
  const groups = {};
  for (const p of PRODUCERS) {
    const lineIds = o.lines.filter((l) => l.producer === p).map((l) => l.lineId);
    if (lineIds.length) groups[p] = { status: ACCEPT_ONLY ? "mottagen" : "bekräftad", lineIds, tracking: undefined };
  }
  const rec = {
    orderNumber: o.orderNumber,
    externalRef: o.externalRef,
    erpRef: erpRefFor(o.orderNumber),
    confirmed: !ACCEPT_ONLY,
    idempotencyKey: key,
    receivedAt: now(),
    submits: 1,
    status: ACCEPT_ONLY ? "mottagen" : "bekräftad",
    groups,
    cancel: null,
    order: o,
    files: o.lines.flatMap((l) => (l.files ?? []).map((f) => ({ lineId: l.lineId, name: f.name, label: f.label, url: f.url, expiresAt: f.expiresAt, checked: false }))),
    filesChecked: !CHECK_FILES,
  };
  orders.set(o.orderNumber, rec);
  log("← order", o.orderNumber, `${o.lines.length} rader`, `${rec.files.length} filer`, o.externalRef ? `(butikens ${o.externalRef})` : "");
  if (CHECK_FILES) void checkFiles(rec);
  return rec;
}

/** Hämtar varje fillänk och noterar svaret. Prövar också att en ändrad länk nekas, så att länkarna inte går att gissa. */
async function checkFiles(rec) {
  for (const f of rec.files) {
    const started = Date.now();
    try {
      const r = await fetch(f.url, { signal: AbortSignal.timeout(120_000) });
      const buf = Buffer.from(await r.arrayBuffer());
      Object.assign(f, {
        checked: true,
        ok: r.ok && buf.length > 0,
        status: r.status,
        type: r.headers.get("content-type") ?? undefined,
        bytes: buf.length,
        sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16),
        ms: Date.now() - started,
      });
    } catch (e) {
      Object.assign(f, { checked: true, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started });
    }
    log(f.ok ? "  fil ok" : "  FIL FEL", rec.orderNumber, f.name, f.status ?? f.error ?? "", f.bytes != null ? `${Math.round(f.bytes / 1024)} kB` : "");
  }
  const first = rec.files[0];
  if (first?.url) {
    try {
      const u = new URL(first.url);
      const params = [...u.searchParams.keys()];
      const k = params.find((p) => /sig|token|signature|t$/i.test(p)) ?? params.at(-1);
      if (k) {
        const v = u.searchParams.get(k) ?? "";
        u.searchParams.set(k, v.slice(0, -2) + (v.endsWith("AA") ? "BB" : "AA"));
      } else u.pathname = u.pathname.replace(/.$/, (c) => (c === "x" ? "y" : "x"));
      const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
      await r.arrayBuffer().catch(() => {});
      rec.tamperedStatus = r.status;
      rec.tamperedRejected = r.status >= 400 && r.status < 500;
      log(rec.tamperedRejected ? "  ändrad länk nekas" : "  ÄNDRAD LÄNK GICK IGENOM", rec.orderNumber, r.status);
    } catch (e) {
      rec.tamperedStatus = 0;
      rec.tamperedRejected = false;
      rec.tamperedError = e instanceof Error ? e.message : String(e);
    }
  }
  rec.filesChecked = true;
}

const trackingNumber = () => `PN${digits(9)}SE`;

/**
 * Flyttar ordern framåt hos hubben och skickar händelserna. Utan `to` tar varje del (producent) ett steg. Med
 * --accept-only bekräftas ordern först, med ordernumret.
 */
async function advance(rec, { to, producer, tracking, carrier, note } = {}) {
  if (rec.cancel) return { error: "Ordern är avbokad", status: 409 };
  const out = [];
  if (!rec.confirmed) {
    rec.confirmed = true;
    rec.status = "bekräftad";
    for (const g of Object.values(rec.groups)) g.status = "bekräftad";
    const e = newEvent("order.status", { orderNumber: rec.orderNumber, erpRef: rec.erpRef, status: "bekräftad" });
    out.push({ event: e, response: await deliver(e) });
    if (!to || to === "bekräftad") return { events: out };
  }
  const targets = producer ? [producer] : Object.keys(rec.groups);
  for (const p of targets) {
    const g = rec.groups[p];
    if (!g) continue;
    const at = STEPS.indexOf(g.status);
    const want = to ? STEPS.indexOf(to) : at + 1;
    if (want < 0 || want >= STEPS.length || want <= at) continue;
    if (!to && STEPS[want] === "levererad" && !flag("deliver")) continue;
    g.status = STEPS[want];
    if (g.status === "skickad") {
      g.tracking = tracking ?? g.tracking ?? trackingNumber();
      g.carrier = carrier ?? "PostNord";
    }
    const data = { orderNumber: rec.orderNumber, erpRef: rec.erpRef, status: g.status, producer: p, lineIds: g.lineIds };
    if (g.status === "skickad" || g.status === "levererad") Object.assign(data, { tracking: g.tracking, carrier: g.carrier });
    if (note) data.note = note;
    const e = newEvent("order.status", data);
    out.push({ event: e, response: await deliver(e) });
  }
  const statuses = Object.values(rec.groups).map((g) => g.status);
  rec.status = statuses.every((s) => s === statuses[0]) ? statuses[0] : "delvis " + statuses.join("/");
  return { events: out };
}

// ── Routerna ────────────────────────────────────────────────────────────────

async function hubApi(req, res, url, parts) {
  if (!authorized(req)) return send(res, 401, { error: "Fel eller saknad nyckel" });
  if (SLOW) await pause(SLOW);
  const failing = FAIL > 0 && Math.random() < FAIL;
  const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : "";
  // --lose-first: första svaret för varje adress och nyckel tappas, efter att anropet behandlats.
  const lostKey = `${parts.join("/")}:${key}`;
  const loseThis = LOSE_FIRST && req.method === "POST" && Boolean(key) && !lost.has(lostKey);
  if (loseThis) lost.add(lostKey);
  const lostReply = (failing && Math.random() < 0.5) || loseThis;
  if (failing && !lostReply) {
    log("  simulerat fel (503) före behandling", req.method, url.pathname);
    return send(res, 503, { error: "Provhubben: simulerat fel" }, { "retry-after": "1" });
  }

  // POST /orders
  if (req.method === "POST" && parts.length === 1 && parts[0] === "orders") {
    if (!key) return send(res, 400, { error: "Idempotency-Key saknas" });
    const o = await readJson(req);
    const seen = idem.get(`order:${key}`);
    if (seen) {
      if (seen.orderNumber !== o?.orderNumber) return send(res, 409, { error: "Samma Idempotency-Key användes för en annan order" });
      const rec = orders.get(seen.orderNumber);
      if (rec) rec.submits += 1;
      log("← order igen (samma nyckel)", seen.orderNumber, "→ samma svar");
      if (lostReply) return send(res, 503, { error: "Provhubben: simulerat fel efter behandling" });
      return send(res, seen.status, seen.body, { "idempotent-replayed": "true" });
    }
    const problems = validOrder(o);
    if (problems.length) return send(res, 422, { error: "Ordern är ogiltig", problems });
    let rec = orders.get(o.orderNumber);
    if (rec) {
      // Samma ordernummer med en ny nyckel: hubben känner igen ordern och skapar ingen ny.
      rec.submits += 1;
      log("← order igen (ny nyckel, samma nummer)", o.orderNumber);
    } else rec = receiveOrder(o, key);
    const reply = ACCEPT_ONLY ? { status: 202, body: { status: "mottagen", orderNumber: o.orderNumber } } : { status: 201, body: { erpRef: rec.erpRef, status: "bekräftad", orderNumber: o.orderNumber } };
    idem.set(`order:${key}`, { orderNumber: o.orderNumber, ...reply });
    if (lostReply) {
      log("  simulerat fel (503) efter behandling", o.orderNumber);
      return send(res, 503, { error: "Provhubben: simulerat fel efter behandling" });
    }
    return send(res, reply.status, reply.body);
  }

  // POST /orders/{nummer}/cancel
  if (req.method === "POST" && parts.length === 3 && parts[0] === "orders" && parts[2] === "cancel") {
    if (!key) return send(res, 400, { error: "Idempotency-Key saknas" });
    const number = decodeURIComponent(parts[1]);
    const body = await readJson(req);
    const seen = idem.get(`cancel:${key}`);
    if (seen) {
      if (seen.orderNumber !== number) return send(res, 409, { error: "Samma Idempotency-Key användes för en annan avbokning" });
      return send(res, seen.status, seen.body, { "idempotent-replayed": "true" });
    }
    const rec = orders.get(number);
    if (!rec) return send(res, 404, { error: `Ordern ${number} finns inte hos hubben` });
    const started = Object.values(rec.groups).some((g) => STEPS.indexOf(g.status) >= STEPS.indexOf("i produktion"));
    let reply;
    if (rec.cancel) reply = { status: 200, body: { status: "avbruten", orderNumber: number } };
    else if (started) reply = { status: 409, body: { error: "Ordern tillverkas redan och kan inte avbokas" } };
    else {
      rec.cancel = { reason: typeof body?.reason === "string" ? body.reason : "", at: now() };
      rec.status = "avbruten";
      for (const g of Object.values(rec.groups)) g.status = "avbruten";
      log("← avbokning", number, rec.cancel.reason ? `(${rec.cancel.reason})` : "");
      reply = { status: 200, body: { status: "avbruten", orderNumber: number } };
    }
    idem.set(`cancel:${key}`, { orderNumber: number, ...reply });
    if (lostReply) return send(res, 503, { error: "Provhubben: simulerat fel efter behandling" });
    return send(res, reply.status, reply.body);
  }

  // GET /orders/{nummer}
  if (req.method === "GET" && parts.length === 2 && parts[0] === "orders") {
    const rec = orders.get(decodeURIComponent(parts[1]));
    if (!rec) return send(res, 404, { error: "Ordern finns inte" });
    return send(res, 200, { orderNumber: rec.orderNumber, erpRef: rec.confirmed ? rec.erpRef : undefined, status: rec.status, groups: rec.groups });
  }

  // GET /stock, GET /products
  if (req.method === "GET" && parts.length === 1 && (parts[0] === "stock" || parts[0] === "products")) {
    const since = url.searchParams.get("since");
    const after = since ? Date.parse(since) : NaN;
    const pick = (m) => [...m.values()].filter((x) => Number.isNaN(after) || Date.parse(x.updatedAt) > after).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "updatedAt")));
    if (parts[0] === "stock") return send(res, 200, { items: pick(stock), full: Number.isNaN(after), at: now() });
    return send(res, 200, { products: pick(products), at: now() });
  }

  return send(res, 404, { error: "Okänd adress hos hubben" });
}

async function admin(req, res, url, parts) {
  // parts[0] === "_admin"
  const [, what, id, action] = parts;
  if (req.method === "GET" && what === "state") {
    return send(res, 200, {
      flags: { port: PORT, target: TARGET, auto: AUTO, fail: FAIL, loseFirst: LOSE_FIRST, slow: SLOW, acceptOnly: ACCEPT_ONLY, checkFiles: CHECK_FILES, signed: Boolean(SECRET), keyRequired: Boolean(API_KEY) },
      orders: [...orders.values()].map(view),
      stock: [...stock.values()],
      products: [...products.values()],
      sent: sent.slice(-50),
    });
  }
  if (req.method === "POST" && what === "reset") {
    reset();
    return send(res, 200, { ok: true });
  }
  if (what === "orders" && id) {
    const rec = orders.get(decodeURIComponent(id));
    if (!rec) return send(res, 404, { error: "Ordern finns inte hos provhubben" });
    if (req.method === "GET" && !action) return send(res, 200, view(rec));
    if (req.method === "POST" && action === "advance") {
      const r = await advance(rec, await readJson(req));
      return send(res, r.status ?? 200, r);
    }
  }
  if (req.method === "POST" && what === "stock") {
    const body = await readJson(req);
    const items = Array.isArray(body?.items) ? body.items : [];
    if (body?.full) stock.clear();
    for (const i of items) stock.set(stockKey(i), { ...i, updatedAt: now() });
    if (url.searchParams.get("skicka") === "nej") return send(res, 200, { saved: items.length });
    const e = newEvent("stock.updated", { items, ...(body?.full ? { full: true } : {}) });
    return send(res, 200, { event: e, response: await deliver(e) });
  }
  if (req.method === "POST" && what === "products" && id === "delete") {
    const body = await readJson(req);
    const skus = Array.isArray(body?.skus) ? body.skus : [];
    for (const s of skus) products.delete(s);
    const e = newEvent("product.delete", { skus });
    return send(res, 200, { event: e, response: await deliver(e) });
  }
  if (req.method === "POST" && what === "products" && !id) {
    const body = await readJson(req);
    const list = Array.isArray(body?.products) ? body.products : [];
    for (const p of list) products.set(p.sku, { ...p, updatedAt: now() });
    if (url.searchParams.get("skicka") === "nej") return send(res, 200, { saved: list.length });
    const e = newEvent("product.upsert", { products: list });
    return send(res, 200, { event: e, response: await deliver(e) });
  }
  if (req.method === "POST" && what === "send") {
    const body = await readJson(req);
    const sig = url.searchParams.get("signatur");
    const signature = sig === "fel" ? "fel" : sig === "ingen" ? "ingen" : "rätt";
    return send(res, 200, { response: await deliver(body, { signature, retries: signature === "rätt" ? 3 : 0 }) });
  }
  if (req.method === "POST" && what === "resend" && id) {
    const e = events.get(decodeURIComponent(id));
    if (!e) return send(res, 404, { error: "Händelsen finns inte hos provhubben" });
    return send(res, 200, { event: e, response: await deliver(e) });
  }
  return send(res, 404, { error: "Okänt adminanrop" });
}

function view(rec) {
  const { order, ...rest } = rec;
  return { ...rest, lines: order.lines.map((l) => ({ lineId: l.lineId, sku: l.sku, size: l.size, qty: l.qty, producer: l.producer, files: (l.files ?? []).length })), totalSek: order.totalSek, customer: order.customer?.name };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, orders: orders.size });
    if (parts[0] === "_admin") return await admin(req, res, url, parts);
    return await hubApi(req, res, url, parts);
  } catch (e) {
    const status = e?.status ?? 500;
    if (status === 500) console.error(e);
    return send(res, status, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  log(`Provhubben på http://localhost:${PORT} → händelser till ${TARGET}`);
  log(
    [
      SECRET ? "signerar händelserna" : "OSIGNERAT (HUB_WEBHOOK_SECRET saknas)",
      API_KEY ? `kräver nyckeln i ${AUTH_HEADER}` : "kräver ingen nyckel",
      AUTO ? `--auto var ${AUTO} s` : "",
      FAIL ? `--fail=${FAIL}` : "",
      LOSE_FIRST ? "--lose-first" : "",
      SLOW ? `--slow=${SLOW}` : "",
      ACCEPT_ONLY ? "--accept-only" : "",
      CHECK_FILES ? "" : "--no-files",
    ]
      .filter(Boolean)
      .join(" · "),
  );
});

let ticking = false;
if (AUTO > 0) {
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      for (const rec of orders.values()) {
        if (rec.cancel) continue;
        const done = rec.confirmed && Object.values(rec.groups).every((g) => STEPS.indexOf(g.status) >= STEPS.indexOf("skickad"));
        if (!done) await advance(rec);
      }
    } finally {
      ticking = false;
    }
  }, AUTO * 1000).unref();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
