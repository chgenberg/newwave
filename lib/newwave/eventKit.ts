import { type NwProduct, nwProduct } from "./catalog";
import { defaultDesign } from "./marking";
import type { Occasion, PackageLine, Tier } from "./occasions";
import { priceLine, splitSizes } from "./reseller";

/** En rad i ett paket eller kit, prissatt med butikens påslag och produktens standardtryck. */
export type KitLine = { product: NwProduct; qty: number; total: number };

/** Antal för ett antal personer: minst 10, och hela femtal över 20. */
export function packageQty(line: PackageLine, people: number) {
  if (line.fixed) return line.fixed;
  const q = Math.max(10, Math.ceil((line.perPerson ?? 1) * Math.max(1, people)));
  return q > 20 ? Math.ceil(q / 5) * 5 : q;
}

export function kitLine(id: string, qty: number, markup: number): KitLine | null {
  const product = nwProduct(id);
  if (!product) return null;
  const line = priceLine({ productId: id, sizes: splitSizes(product, qty), design: defaultDesign(product), color: product.garmentHex, logo: "" }, markup);
  return line ? { product, qty: line.qty, total: line.total } : null;
}

export const tierLines = (tier: Tier, people: number, markup: number) => tier.lines.flatMap((l) => kitLine(l.id, packageQty(l, people), markup) ?? []);
export const linesTotal = (lines: KitLine[]) => lines.reduce((s, l) => s + l.total, 0);

/** Den största nivån som ryms i budgeten, fylld på med de billigaste produkterna från de andra nivåerna så länge pengarna räcker. */
export function kitForBudget(o: Occasion, people: number, budget: number, markup: number) {
  const all = o.tiers.map((t) => tierLines(t, people, markup));
  const base = all.filter((ls) => linesTotal(ls) <= budget).at(-1) ?? [];
  const chosen = new Map(base.map((l) => [l.product.id, l]));
  let total = linesTotal(base);
  const extras = all
    .flat()
    .filter((l, i, list) => !chosen.has(l.product.id) && list.findIndex((x) => x.product.id === l.product.id) === i)
    .sort((a, b) => a.total - b.total);
  for (const l of extras) {
    if (total + l.total > budget) continue;
    chosen.set(l.product.id, l);
    total += l.total;
  }
  return { lines: [...chosen.values()], total };
}

/** Reglagets spann: från den billigaste raden till en bit över hela premiumnivån. */
export function budgetRange(o: Occasion, people: number, markup: number) {
  const all = o.tiers.flatMap((t) => tierLines(t, people, markup));
  const premium = linesTotal(tierLines(o.tiers.at(-1)!, people, markup));
  const step = premium > 200_000 ? 5000 : premium > 40_000 ? 1000 : 500;
  const round = (n: number, up: boolean) => (up ? Math.ceil(n / step) : Math.floor(n / step)) * step;
  return { min: Math.max(step, round(Math.min(...all.map((l) => l.total)), true)), max: round(premium * 1.35, true), step };
}

/** Hur många personer ett paket räcker till inom en budget. */
export function peopleForBudget(costFor: (people: number) => number, budget: number, max = 5000) {
  let lo = 0;
  let hi = max;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (costFor(mid) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
