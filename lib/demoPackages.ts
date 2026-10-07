import { ALL_PRODUCTS, MAX_QTY, type Product, VISITORS, type VisitorsId, lineTotal, sumSek } from "./demoCatalog";
import { EVENTS, type EventId, qtyOf } from "./demoEvents";

export type PackageId = "bas" | "standard" | "komplett";
/** One product in a package; without a model the product's first (standard) model is priced. */
export type PackLine = { id: string; qty: number; model?: string };

export const PACKAGE_IDS: PackageId[] = ["bas", "standard", "komplett"];

export const packagesFor = (ev: EventId = "massa"): { id: PackageId; name: string; blurb: string }[] => [
  { id: "bas", name: "Bas", blurb: "Det viktigaste för att synas" },
  { id: "standard", name: "Standard", blurb: `${EVENTS[ev].whole.replace(/^./, (c) => c.toUpperCase())} och era profilprodukter` },
  { id: "komplett", name: "Komplett", blurb: `Allt, med marginal för ${EVENTS[ev].bigOne}` },
];
export const PACKAGES = packagesFor("massa");

/** Set pieces in the order they are kept when the budget is tight. */
export const BOOTH_PRIORITY = EVENTS.massa.set;

const product = (id: string) => ALL_PRODUCTS.find((p) => p.id === id);
const isBooth = (id: string) => Boolean(product(id)?.booth);

/** Rounds to the product's order step, never below one step or above the order limit. */
export function roundQty(p: Product, qty: number) {
  return Math.min(MAX_QTY, Math.max(p.step, Math.round(qty / p.step) * p.step));
}

const tier = (v?: string | null) => VISITORS.findIndex((x) => x.id === v);
export const visitorsLabel = (id?: string, ev: EventId = "massa") => EVENTS[ev].audience[tier(id)] ?? "";
export const visitorFactor = (v?: VisitorsId | "" | null, ev: EventId = "massa") => EVENTS[ev].factors[tier(v)] ?? 1;
/** Quantity of a product for this event and audience size. */
export const scaledQty = (p: Product, ev: EventId, v?: VisitorsId | "" | null, mult = 1) =>
  roundQty(p, qtyOf(p, ev) * mult * (EVENTS[ev].scales.includes(p.id) ? visitorFactor(v, ev) : 1));

/**
 * Bas: the essential set pieces and the two most fitting merch items.
 * Standard: every set piece plus the recommended merch.
 * Komplett: everything recommended plus the classics, at double quantities.
 * Quantities of the event's consumables follow the expected number of people.
 */
export function buildPackage(id: PackageId, recommended: string[], visitors?: VisitorsId | null, ev: EventId = "massa"): PackLine[] {
  const e = EVENTS[ev];
  const known = recommended.filter((r) => e.merch.includes(r));
  const merchIds = known.length ? known : e.defaults;
  const booth = id === "bas" ? e.basSet : e.set;
  const merch = id === "bas" ? merchIds.slice(0, 2) : id === "standard" ? merchIds : [...new Set([...merchIds, ...e.defaults])];
  const mult = id === "komplett" ? 2 : 1;
  return [...booth.map((b) => ({ id: b, qty: qtyOf(product(b)!, ev) })), ...merch.map((m) => ({ id: m, qty: scaledQty(product(m)!, ev, visitors, mult) }))];
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
export function fitBudget(lines: PackLine[], budget: number, ev: EventId = "massa"): { lines: PackLine[]; adjusted: boolean } {
  if (packageTotal(lines) <= budget) return { lines, adjusted: false };
  const order = EVENTS[ev].set as string[];
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const booth = lines.filter((l) => isBooth(l.id)).sort((a, b) => rank(a.id) - rank(b.id));
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

/** Latest order day for delivery before the event (weekends skipped, holidays not), or null without a valid date. The slowest kind of product sets the pace. */
export function delivery(eventDate: string, ids: string[], today = new Date(), ev: EventId = "massa"): Delivery | null {
  const event = parseDay(eventDate);
  if (!event || !ids.length) return null;
  const { lead } = EVENTS[ev];
  const leadDays = Math.max(ids.some(isBooth) ? lead.set : 0, ids.some((id) => !isBooth(id)) ? lead.merch : 0);
  const orderBy = minusWorkingDays(event, leadDays);
  return { orderBy: iso(orderBy), late: iso(orderBy) < iso(today), leadDays };
}

export const fmtDay = (s: string) => parseDay(s)?.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" }) ?? s;

export function deliveryText(d: Delivery | null) {
  if (!d) return "";
  return d.late ? "Kort om tid – vi hör av oss om expressleverans." : `Beställ senast ${fmtDay(d.orderBy)} för leverans i tid.`;
}

/** Up to four short lines that describe a package on its card. */
export function packageSummary(lines: PackLine[], ev: EventId = "massa") {
  const e = EVENTS[ev];
  const booth = lines.filter((l) => isBooth(l.id));
  const merch = lines.filter((l) => !isBooth(l.id));
  const names = booth.map((l) => product(l.id)!.name.toLowerCase());
  const whole = `${e.whole.replace(/^./, (c) => c.toUpperCase())}, ${e.set.length} delar`;
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} och ${names.at(-1)}` : (names[0] ?? "");
  const out = [booth.length === e.set.length ? whole : list.replace(/^./, (c) => c.toUpperCase())].filter(Boolean);
  for (const l of merch.slice(0, 2)) out.push(`${l.qty.toLocaleString("sv-SE").replace(/\u00a0/g, " ")} ${product(l.id)!.unit === "förp" ? "förp " : ""}${product(l.id)!.name.toLowerCase()}`);
  if (merch.length > 2) out.push(`+ ${merch.length - 2} till`);
  return out.slice(0, 4);
}
