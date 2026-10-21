import { cents, FLOCK_PRICE, type PaymentId, type ShippingId, shippingCost, shopProduct, vatOf } from "@/lib/newwave/sportshop/data";
import { store } from "../shop/cart";

/** Sportbutikens varukorg och senaste beställning, bara i webbläsaren. Ingenting skickas till servern. */

export type Flock = { name: string; number: string };
export type SportLine = { key: string; productId: string; size: string; qty: number; flock?: Flock };
export type Address = { salutation: number; first: string; last: string; street: string; zip: string; city: string; email: string; phone: string };
export type SportOrder = { number: string; at: string; lines: SportLine[]; address: Address; shipping: ShippingId; payment: PaymentId; subtotal: number; shippingCost: number; total: number };
export type SportCart = { lines: SportLine[]; address?: Address; order?: SportOrder };

export const MAX_QTY = 10;
const EMPTY: SportCart = { lines: [] };
const valid = (l: SportLine) => Boolean(l && shopProduct(l.productId) && l.qty > 0);

export const useSportCart = store<SportCart>(
  () => "nw-sportshop:cart",
  EMPTY,
  (saved) => ({ ...EMPTY, ...saved, lines: (saved.lines ?? []).filter(valid) }),
);
export const CART = "default";

export const lineKey = (productId: string, size: string, flock?: Flock) => [productId, size, flock?.name ?? "", flock?.number ?? ""].join("|");
export const unitPrice = (l: SportLine) => (shopProduct(l.productId)?.price ?? 0) + (l.flock ? FLOCK_PRICE : 0);

export function addLine(cart: SportCart, line: Omit<SportLine, "key">): SportCart {
  const key = lineKey(line.productId, line.size, line.flock);
  const hit = cart.lines.find((l) => l.key === key);
  const lines = hit ? cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + line.qty) } : l)) : [...cart.lines, { ...line, key }];
  return { ...cart, lines };
}

/** Beställningen sparas som senaste order och korgen töms; adressen finns kvar till nästa gång. */
export function placeOrder(cart: SportCart, address: Address, shipping: ShippingId, payment: PaymentId): SportCart {
  const now = new Date();
  const sum = totals(cart.lines, shipping);
  const number = `SL-${now.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  return { lines: [], address, order: { number, at: now.toISOString(), lines: cart.lines, address, shipping, payment, subtotal: sum.subtotal, shippingCost: sum.shipping, total: sum.total } };
}

/** Leveransdagen räknat i arbetsdagar (måndag–fredag) från beställningen. */
export function eta(from: Date, workdays: number) {
  const d = new Date(from);
  for (let left = workdays; left > 0; ) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** Butikens öppettider för Click & Collect, per veckodag från söndag: måndag–fredag 9.30–19, lördag 9.30–16. */
const OPEN: ([number, number] | null)[] = [null, [9.5, 19], [9.5, 19], [9.5, 19], [9.5, 19], [9.5, 19], [9.5, 16]];
const PREP_HOURS = 2;

/** Första hämttiden: två timmars plock inom öppettiderna, efter eventuella dagar i tryckverkstaden. */
export function pickupAt(from: Date, workdays = 0) {
  const d = workdays ? eta(from, workdays) : new Date(from);
  if (workdays) d.setHours(0, 0, 0, 0);
  for (let day = 0; day < 8; day++) {
    const hours = OPEN[d.getDay()];
    const ready = hours ? Math.ceil((Math.max(d.getHours() + d.getMinutes() / 60, hours[0]) + PREP_HOURS) * 4) / 4 : Infinity;
    if (hours && ready <= hours[1]) {
      d.setHours(Math.floor(ready), (ready % 1) * 60, 0, 0);
      return d;
    }
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

/** Namntryck och fanartiklar görs i verkstaden innan paketet går iväg. */
export const printDays = (lines: SportLine[]) => (lines.some((l) => l.flock || shopProduct(l.productId)?.line === "fan") ? 2 : 0);

export function totals(lines: SportLine[], shipping: ShippingId = "dhl") {
  const subtotal = cents(lines.reduce((s, l) => s + unitPrice(l) * l.qty, 0));
  const ship = lines.length ? shippingCost(shipping, subtotal) : 0;
  const total = cents(subtotal + ship);
  return { subtotal, shipping: ship, total, vat: vatOf(total), count: lines.reduce((s, l) => s + l.qty, 0) };
}
