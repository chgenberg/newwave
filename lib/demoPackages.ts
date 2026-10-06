import {
  ALL_PRODUCTS,
  CONSUMABLES,
  DEFAULT_PROMOS,
  LEAD_DAYS_BOOTH,
  LEAD_DAYS_MERCH,
  MAX_QTY,
  PROMO_PRODUCTS,
  type Product,
  VISITORS,
  type VisitorsId,
  lineTotal,
  sumSek,
} from "./demoCatalog";

export type PackageId = "bas" | "standard" | "komplett";
/** One product in a package; without a model the product's first (standard) model is priced. */
export type PackLine = { id: string; qty: number; model?: string };

export const PACKAGES: { id: PackageId; name: string; blurb: string }[] = [
  { id: "bas", name: "Bas", blurb: "Det viktigaste för att synas" },
  { id: "standard", name: "Standard", blurb: "Hela montern och era profilprodukter" },
  { id: "komplett", name: "Komplett", blurb: "Allt, med marginal för en stor mässa" },
];

/** Booth items in the order they are kept when the budget is tight. */
export const BOOTH_PRIORITY = ["massvagg", "massdisk", "rollup", "beachflagga", "skyltstall"];

const product = (id: string) => ALL_PRODUCTS.find((p) => p.id === id);
const isBooth = (id: string) => BOOTH_PRIORITY.includes(id);

/** Rounds to the product's order step, never below one step or above the order limit. */
export function roundQty(p: Product, qty: number) {
  return Math.min(MAX_QTY, Math.max(p.step, Math.round(qty / p.step) * p.step));
}

export const visitorsLabel = (id?: string) => VISITORS.find((v) => v.id === id)?.label ?? "";
const visitorFactor = (v?: VisitorsId | null) => VISITORS.find((x) => x.id === v)?.factor ?? 1;

/**
 * Bas: wall, counter, roll-up and the two most fitting merch items.
 * Standard: every booth item plus the recommended merch.
 * Komplett: everything recommended plus the classics, at double quantities.
 * Consumables follow the expected number of visitors.
 */
export function buildPackage(id: PackageId, recommended: string[], visitors?: VisitorsId | null): PackLine[] {
  const known = recommended.filter((r) => PROMO_PRODUCTS.some((p) => p.id === r));
  const merchIds = known.length ? known : DEFAULT_PROMOS;
  const booth = id === "bas" ? ["massvagg", "massdisk", "rollup"] : BOOTH_PRIORITY;
  const merch = id === "bas" ? merchIds.slice(0, 2) : id === "standard" ? merchIds : [...new Set([...merchIds, ...DEFAULT_PROMOS])];
  const mult = id === "komplett" ? 2 : 1;
  const f = visitorFactor(visitors);
  return [
    ...booth.map((b) => ({ id: b, qty: 1 })),
    ...merch.map((m) => {
      const p = product(m)!;
      return { id: m, qty: roundQty(p, p.defaultQty * mult * (CONSUMABLES.includes(m) ? f : 1)) };
    }),
  ];
}

const unitPrice = (l: PackLine) => {
  const p = product(l.id);
  return (p?.models.find((m) => m.id === l.model) ?? p?.models[0])?.priceSek ?? 0;
};

export function packageTotal(lines: PackLine[]) {
  return sumSek(lines.map((l) => lineTotal(l.qty, unitPrice(l))));
}

/**
 * Deterministic budget fit: booth items stay by priority (the wall last of all), then merch is scaled
 * down evenly to whole order steps; if an item would fall below one step, the least important merch
 * item (last in the package) is dropped and the rest is scaled again.
 */
export function fitBudget(lines: PackLine[], budget: number): { lines: PackLine[]; adjusted: boolean } {
  if (packageTotal(lines) <= budget) return { lines, adjusted: false };
  const booth = lines.filter((l) => isBooth(l.id)).sort((a, b) => BOOTH_PRIORITY.indexOf(a.id) - BOOTH_PRIORITY.indexOf(b.id));
  while (booth.length > 1 && packageTotal(booth) > budget) booth.pop();
  let merch = lines.filter((l) => !isBooth(l.id));
  const room = budget - packageTotal(booth);
  while (merch.length) {
    const total = packageTotal(merch);
    if (total <= room) break;
    const f = room / total;
    const scaled = merch.map((l) => {
      const p = product(l.id)!;
      return { ...l, qty: Math.floor((l.qty * f) / p.step) * p.step };
    });
    if (scaled.every((l) => l.qty >= product(l.id)!.step)) {
      merch = topUp(scaled, room, lines);
      break;
    }
    merch = merch.slice(0, -1);
  }
  return { lines: [...booth, ...merch], adjusted: true };
}

/** Flooring leaves money on the table; hand it back one order step at a time, in package order, never above the original quantity. */
function topUp(merch: PackLine[], room: number, original: PackLine[]) {
  const out = merch.map((l) => ({ ...l }));
  for (let grew = true; grew; ) {
    grew = false;
    for (const l of out) {
      const p = product(l.id)!;
      const cap = original.find((o) => o.id === l.id)?.qty ?? l.qty;
      if (l.qty + p.step > cap) continue;
      if (packageTotal(out) + lineTotal(p.step, unitPrice(l)) > room) continue;
      l.qty += p.step;
      grew = true;
    }
  }
  return out;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return iso(d) === s ? d : null;
};

function minusWorkingDays(d: Date, days: number) {
  const out = new Date(d);
  let left = days;
  while (left > 0) {
    out.setDate(out.getDate() - 1);
    if (out.getDay() !== 0 && out.getDay() !== 6) left--;
  }
  return out;
}

export type Delivery = { orderBy: string; late: boolean; leadDays: number };

/** Latest order day for delivery before the event (weekends skipped, holidays not), or null without a valid date. */
export function delivery(eventDate: string, ids: string[], today = new Date()): Delivery | null {
  const event = parseDay(eventDate);
  if (!event || !ids.length) return null;
  const leadDays = ids.some(isBooth) ? LEAD_DAYS_BOOTH : LEAD_DAYS_MERCH;
  const orderBy = minusWorkingDays(event, leadDays);
  return { orderBy: iso(orderBy), late: iso(orderBy) < iso(today), leadDays };
}

export const fmtDay = (s: string) => parseDay(s)?.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" }) ?? s;

export function deliveryText(d: Delivery | null) {
  if (!d) return "";
  return d.late ? "Kort om tid – vi hör av oss om expressleverans." : `Beställ senast ${fmtDay(d.orderBy)} för leverans i tid.`;
}

/** Up to four short lines that describe a package on its card. */
export function packageSummary(lines: PackLine[]) {
  const booth = lines.filter((l) => isBooth(l.id));
  const merch = lines.filter((l) => !isBooth(l.id));
  const names = booth.map((l) => product(l.id)!.name.toLowerCase());
  const out = [booth.length === BOOTH_PRIORITY.length ? "Hela montern, 5 delar" : `${names.slice(0, -1).join(", ")} och ${names.at(-1)}`.replace(/^./, (c) => c.toUpperCase())];
  for (const l of merch.slice(0, 2)) out.push(`${l.qty.toLocaleString("sv-SE").replace(/\u00a0/g, " ")} ${product(l.id)!.unit === "förp" ? "förp " : ""}${product(l.id)!.name.toLowerCase()}`);
  if (merch.length > 2) out.push(`+ ${merch.length - 2} till`);
  return out.slice(0, 4);
}
