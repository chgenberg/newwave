import type { HubOrder, HubProduct, StockItem } from "./types";

/**
 * Översättningen ut: hur våra anrop till New Waves hubb ser ut och hur hubbens svar läses. Det här är den enda filen som
 * ska ändras när API-beskrivningen kommer – ändpunkterna, fältnamnen i kropparna och var svaren har sina fält. Allt
 * annat (nyckeln i rubriken, Idempotency-Key, tidsgränsen, nya försök, larm) sköter klienten (client.ts) och utkorgen
 * (outbox.ts). Händelserna som hubben skickar till oss översätts i mapping-in.ts.
 *
 * Tills dess är hubbens format detsamma som våra typer (lib/poc/hub/types.ts):
 * - `POST {HUB_API_URL}/orders` med `HubOrder` → `{ erpRef }` (201/200), eller 202 utan nummer: hubben bekräftar senare
 *   med händelsen `order.status` "bekräftad".
 * - `POST {HUB_API_URL}/orders/{ordernummer}/cancel` med `{ reason }` → 200/202/204. 404 eller 410: hubben har inte ordern.
 * - `GET {HUB_API_URL}/stock?since=<ISO-tid>` → `StockItem[]` eller `{ items, next? }`.
 * - `GET {HUB_API_URL}/products?since=<ISO-tid>` → `HubProduct[]` eller `{ products, next? }`.
 * `next` är en sida till (hubbens markör); den skickas tillbaka som `?page=`.
 */

export type HubRequest = { method: "GET" | "POST"; path: string; body?: unknown };

const enc = encodeURIComponent;
const qs = (q: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return s ? `?${s}` : "";
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : undefined);

// ── Ordrar ──────────────────────────────────────────────────────────────────

export function submitOrderRequest(order: HubOrder): HubRequest {
  return { method: "POST", path: "/orders", body: order };
}

/** Hubbens ordernummer ur svaret på en ny order. Utan nummer har hubben tagit emot ordern men inte bekräftat den än. */
export function readSubmitResponse(_status: number, body: unknown): { erpRef?: string } {
  // Bara hubbens eget nummer: `orderNumber` i svaret är vårt, som hubben ekar tillbaka.
  const erpRef = str(obj(body)?.erpRef, 80);
  return erpRef ? { erpRef } : {};
}

export function cancelOrderRequest(orderNumber: string, reason: string): HubRequest {
  return { method: "POST", path: `/orders/${enc(orderNumber)}/cancel`, body: { reason } };
}

/** Svarskoderna som betyder att hubben inte har ordern: då finns inget att avboka, och avbokningen räknas som klar. */
export const CANCEL_NOT_FOUND = [404, 410];

// ── Lager och produkter (hämtningsläget, HUB_PULL=1) ────────────────────────

export function stockRequest(since?: string, page?: string): HubRequest {
  return { method: "GET", path: `/stock${qs({ since, page })}` };
}

export function productsRequest(since?: string, page?: string): HubRequest {
  return { method: "GET", path: `/products${qs({ since, page })}` };
}

/** Raderna ur svaret och markören till nästa sida. Rader som inte går att läsa hoppas över och räknas i `skipped`. */
export type Page<T> = { items: T[]; next?: string; skipped: number };

function listOf(body: unknown, field: string): { list: unknown[]; next?: string } {
  if (Array.isArray(body)) return { list: body };
  const b = obj(body);
  const list = b?.[field] ?? b?.items ?? b?.data;
  return { list: Array.isArray(list) ? list : [], next: str(b?.next, 2000) };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function readStock(body: unknown): Page<StockItem> {
  const { list, next } = listOf(body, "items");
  const items: StockItem[] = [];
  for (const raw of list) {
    const r = obj(raw);
    const sku = str(r?.sku, 80);
    const available = num(r?.available);
    if (!r || !sku || available === undefined) continue;
    const incoming = num(r.incoming);
    items.push({
      sku,
      ...(str(r.size, 20) ? { size: str(r.size, 20) } : {}),
      ...(str(r.color, 60) ? { color: str(r.color, 60) } : {}),
      available: Math.max(0, Math.floor(available)),
      ...(incoming !== undefined ? { incoming: Math.max(0, Math.floor(incoming)) } : {}),
      ...(str(r.eta, 40) && !Number.isNaN(Date.parse(str(r.eta, 40)!)) ? { eta: new Date(str(r.eta, 40)!).toISOString() } : {}),
    });
  }
  return { items, next, skipped: list.length - items.length };
}

export function readProducts(body: unknown): Page<HubProduct> {
  const { list, next } = listOf(body, "products");
  const items: HubProduct[] = [];
  for (const raw of list) {
    const r = obj(raw);
    const sku = str(r?.sku, 80);
    const name = str(r?.name, 200);
    const priceSek = num(r?.priceSek);
    const kind = r?.kind === "halsduk" ? "halsduk" : r?.kind === "plagg" ? "plagg" : undefined;
    if (!r || !sku || !name || priceSek === undefined || priceSek < 0 || !kind) continue;
    const sizes = Array.isArray(r.sizes) ? r.sizes.map((s) => str(s, 20)).filter((s): s is string => Boolean(s)) : [];
    const colors = Array.isArray(r.colors)
      ? r.colors.flatMap((c) => {
          const o = obj(c);
          const hex = str(o?.hex, 7);
          const cname = str(o?.name, 60);
          return o && cname && hex && /^#[0-9a-f]{6}$/i.test(hex) ? [{ name: cname, hex }] : [];
        })
      : undefined;
    const images = Array.isArray(r.images) ? r.images.map((u) => str(u, 1000)).filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u))) : undefined;
    items.push({
      sku,
      name,
      kind,
      priceSek,
      sizes,
      ...(colors?.length ? { colors } : {}),
      ...(images?.length ? { images } : {}),
      ...(str(r.baseId, 80) ? { baseId: str(r.baseId, 80) } : {}),
      ...(typeof r.active === "boolean" ? { active: r.active } : {}),
    });
  }
  return { items, next, skipped: list.length - items.length };
}

// ── Fel ─────────────────────────────────────────────────────────────────────

/** Hubbens felbeskrivning ur ett felsvar, för loggen, larmet och Crafts ordervy. */
export function readError(body: unknown): string | undefined {
  if (typeof body === "string") return body.trim().slice(0, 300) || undefined;
  const b = obj(body);
  const e = b?.error;
  return str(obj(e)?.message ?? e ?? b?.message ?? b?.detail ?? b?.title, 300);
}
