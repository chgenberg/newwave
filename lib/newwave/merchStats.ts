import { seeded } from "./craft";
import { MERCH, MERCH_CLUBS, type MerchClub } from "./merch";

/**
 * Trafik och försäljning på merch-sidan, totalt och per klubb. I demot är siffrorna exempeldata som är
 * stabila per dag; i produktion kommer trafiken från sidans statistik och försäljningen från Intersport.
 */

export type MerchTotals = { visits: number; views: number; clicks: number; orders: number; sales: number };
export type MerchDay = MerchTotals & { date: string };
export type MerchClubStat = MerchTotals & { club: MerchClub; prev: MerchTotals; visitsPerDay: number[] };
export type MerchSource = { label: string; share: number };

export const MERCH_PERIOD_DAYS = 30;

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const zero = (): MerchTotals => ({ visits: 0, views: 0, clicks: 0, orders: 0, sales: 0 });
const KEYS = Object.keys(zero()) as (keyof MerchTotals)[];
const add = (a: MerchTotals, b: MerchTotals) => {
  for (const k of KEYS) a[k] += b[k];
  return a;
};

/** Större klubbar och de med egna kollektioner drar mer trafik. */
const PULL: Record<string, number> = { "ifk-goteborg": 2.6, "asa-if": 2.1, "kungsbacka-if": 1.5, "partille-if": 1.3 };

function clubDay(club: MerchClub, avgPrice: number, t: number, index: number): MerchTotals {
  const rnd = seeded(`${club.id}-merch-${iso(t)}`);
  const pull = PULL[club.id] ?? 0.55 + seeded(`${club.id}-pull`)() * 0.7;
  const weekday = new Date(t).getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 1.35 : 1;
  const growth = 1 + index * 0.004;
  const visits = Math.round(30 * pull * weekend * growth * (0.75 + rnd() * 0.5));
  const views = Math.round(visits * (2.2 + rnd() * 0.8));
  const clicks = Math.round(views * (0.14 + rnd() * 0.06));
  const orders = Math.round(clicks * (0.09 + rnd() * 0.05));
  const sales = Math.round(orders * avgPrice * (1.15 + rnd() * 0.45));
  return { visits, views, clicks, orders, sales };
}

/** Dag 0 är den äldsta; `index` räknas från början av den föregående perioden så att tillväxten blir jämn. */
export function merchStats(now: number) {
  const n = MERCH_PERIOD_DAYS;
  const dayAt = (i: number) => now - (2 * n - 1 - i) * DAY;
  const days: MerchDay[] = Array.from({ length: n }, (_, i) => ({ date: iso(dayAt(n + i)), ...zero() }));
  const total = zero();
  const prev = zero();
  const clubs: MerchClubStat[] = MERCH_CLUBS.map((club) => {
    const items = MERCH.filter((x) => x.clubId === club.id);
    const avgPrice = items.reduce((s, x) => s + x.priceSek, 0) / Math.max(1, items.length);
    const cur = zero();
    const before = zero();
    const visitsPerDay: number[] = [];
    for (let i = 0; i < 2 * n; i++) {
      const d = clubDay(club, avgPrice, dayAt(i), i);
      if (i < n) add(before, d);
      else {
        add(cur, d);
        add(days[i - n], d);
        visitsPerDay.push(d.visits);
      }
    }
    add(total, cur);
    add(prev, before);
    return { club, ...cur, prev: before, visitsPerDay };
  }).sort((a, b) => b.sales - a.sales);

  const sources: MerchSource[] = [
    { label: "Klubbarnas kanaler", share: 0.34 },
    { label: "Sök", share: 0.27 },
    { label: "Direkt", share: 0.18 },
    { label: "Sociala medier", share: 0.14 },
    { label: "Nyhetsbrev", share: 0.07 },
  ];

  return { days, total, prev, clubs, sources };
}

export const change = (cur: number, before: number) => (before ? Math.round(((cur - before) / before) * 100) : 0);
