import { type DeliveryId, FLOCK_PRICE, shipping } from "@/components/newwave/clubshop/pricing";
import type { Sellable } from "./clubCollection";
import { readData, updateJson } from "./workspace";

/**
 * Klubbens butiksstatistik: besök, visade varor, klick till Intersport, varor i varukorgen och beställningar, per dag
 * och per vara. Räknas i webbläsaren och sparas för alla, så att klubben ser samma siffror som Craft. Beställningarna
 * sparas utan kundens uppgifter: bara varor, antal och belopp.
 */
const FILE = "newwave/clubshop/stats.json";
const KEEP_DAYS = 120;
const MAX_ITEMS = 300;
const MAX_ORDERS = 50;

export const EVENTS = ["visit", "item", "click", "cart"] as const;
export type ShopEvent = (typeof EVENTS)[number];

export type Counts = { visits: number; views: number; clicks: number; carts: number; orders: number; sales: number };
type ItemCounts = { views: number; clicks: number; carts: number; orders: number };
export type OrderLine = { item: string; name: string; qty: number; flock: boolean; priceSek: number };
export type OrderSummary = { number: string; at: string; lines: OrderLine[]; delivery: DeliveryId; total: number };
type ClubStats = { days: Record<string, Counts>; items: Record<string, ItemCounts>; orders: OrderSummary[] };
type All = Record<string, ClubStats>;

const zero = (): Counts => ({ visits: 0, views: 0, clicks: 0, carts: 0, orders: 0, sales: 0 });
const zeroItem = (): ItemCounts => ({ views: 0, clicks: 0, carts: 0, orders: 0 });
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const FIELD: Record<ShopEvent, keyof Counts & keyof ItemCounts | "visits"> = { visit: "visits", item: "views", click: "clicks", cart: "carts" };

function bump(id: string, change: (s: ClubStats, today: Counts) => void) {
  return updateJson<All>(
    FILE,
    {},
    (all) => {
      const s: ClubStats = all[id] ?? { days: {}, items: {}, orders: [] };
      const today = day(Date.now());
      s.days[today] ??= zero();
      change(s, s.days[today]);
      const oldest = day(Date.now() - KEEP_DAYS * 86_400_000);
      for (const d of Object.keys(s.days)) if (d < oldest) delete s.days[d];
      const items = Object.entries(s.items);
      if (items.length > MAX_ITEMS) s.items = Object.fromEntries(items.sort((a, b) => b[1].views - a[1].views).slice(0, MAX_ITEMS));
      return { ...all, [id]: s };
    },
    { shared: true },
  );
}

/** `item` räknas bara för varor klubben säljer. */
export function recordEvent(id: string, type: ShopEvent, item?: string) {
  return bump(id, (s, today) => {
    const f = FIELD[type];
    today[f] += 1;
    if (item && f !== "visits") (s.items[item] ??= zeroItem())[f] += 1;
  });
}

/** Priserna räknas här av det klubben säljer, inte av det webbläsaren skickar. */
export async function recordOrder(id: string, items: Map<string, Sellable>, order: { number: string; delivery: DeliveryId; lines: { item: string; qty: number; flock: boolean }[] }) {
  const lines: OrderLine[] = order.lines.flatMap((l) => {
    const it = items.get(l.item);
    if (!it) return [];
    const flock = l.flock && it.flock;
    return [{ item: it.id, name: it.name, qty: l.qty, flock, priceSek: it.priceSek + (flock ? FLOCK_PRICE : 0) }];
  });
  if (!lines.length) return null;
  const subtotal = lines.reduce((n, l) => n + l.priceSek * l.qty, 0);
  const summary: OrderSummary = { number: order.number, at: new Date().toISOString(), lines, delivery: order.delivery, total: subtotal + shipping(order.delivery, subtotal) };
  await bump(id, (s, today) => {
    if (s.orders.some((o) => o.number === summary.number)) return;
    today.orders += 1;
    today.sales += subtotal;
    for (const l of lines) (s.items[l.item] ??= zeroItem()).orders += l.qty;
    s.orders = [summary, ...s.orders].slice(0, MAX_ORDERS);
  });
  return summary;
}

export type ClubShopStats = { days: (Counts & { date: string })[]; totals: Counts; prev: Counts; items: Record<string, ItemCounts>; orders: OrderSummary[] };

/** De senaste `n` dagarna, dag för dag, och perioden innan för jämförelsen. */
export async function clubShopStats(id: string, n = 30): Promise<ClubShopStats> {
  let s: ClubStats | undefined;
  try {
    s = (JSON.parse((await readData(FILE, { shared: true })) ?? "{}") as All)[id];
  } catch {}
  const now = Date.now();
  const days = Array.from({ length: n }, (_, i) => {
    const date = day(now - (n - 1 - i) * 86_400_000);
    return { date, ...(s?.days[date] ?? zero()) };
  });
  const sum = (list: Counts[]) => list.reduce((a, c) => ({ visits: a.visits + c.visits, views: a.views + c.views, clicks: a.clicks + c.clicks, carts: a.carts + c.carts, orders: a.orders + c.orders, sales: a.sales + c.sales }), zero());
  const prev = Array.from({ length: n }, (_, i) => s?.days[day(now - (2 * n - 1 - i) * 86_400_000)] ?? zero());
  return { days, totals: sum(days), prev: sum(prev), items: s?.items ?? {}, orders: s?.orders ?? [] };
}
