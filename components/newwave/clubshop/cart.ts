import { store } from "../shop/cart";
import { type DeliveryId, FLOCK_PRICE, MAX_QTY, type PaymentId, shipping, vatOf } from "./pricing";

/** Varukorgen och senaste beställningen i klubbens butik, bara i webbläsaren. Inget skickas och inget dras. */

export type Flock = { name: string; number: string };
/** Raden bär med sig namn, bild och pris, så att korgen kan visas utan att fråga servern. */
export type ShopLine = { key: string; item: string; name: string; image: string; href: string; priceSek: number; size: string; qty: number; flock?: Flock };
export type Contact = { name: string; email: string; phone: string; street: string; zip: string; city: string };
export type ShopOrder = { number: string; at: string; lines: ShopLine[]; contact: Contact; delivery: DeliveryId; payment: PaymentId; subtotal: number; shipping: number; total: number };
export type ClubCart = { lines: ShopLine[]; contact?: Contact; order?: ShopOrder };

const EMPTY: ClubCart = { lines: [] };
const valid = (l: ShopLine) => Boolean(l && typeof l.item === "string" && typeof l.priceSek === "number" && l.qty > 0);

export const useClubCart = store<ClubCart>(
  (club) => `nw-klubbshop:${club}`,
  EMPTY,
  (saved) => ({ ...EMPTY, ...saved, lines: (saved.lines ?? []).filter(valid) }),
);

export const unitPrice = (l: Pick<ShopLine, "priceSek" | "flock">) => l.priceSek + (l.flock ? FLOCK_PRICE : 0);
const lineKey = (item: string, size: string, flock?: Flock) => [item, size, flock?.name ?? "", flock?.number ?? ""].join("|");

export function addLine(cart: ClubCart, line: Omit<ShopLine, "key">): ClubCart {
  const key = lineKey(line.item, line.size, line.flock);
  const hit = cart.lines.find((l) => l.key === key);
  const lines = hit ? cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + line.qty) } : l)) : [...cart.lines, { ...line, key }];
  return { ...cart, lines };
}

export const setQty = (cart: ClubCart, key: string, qty: number): ClubCart => ({
  ...cart,
  lines: qty <= 0 ? cart.lines.filter((l) => l.key !== key) : cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
});

export function totals(lines: ShopLine[], delivery: DeliveryId) {
  const subtotal = lines.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
  const ship = lines.length ? shipping(delivery, subtotal) : 0;
  const total = subtotal + ship;
  return { subtotal, shipping: ship, total, vat: vatOf(total), count: lines.reduce((s, l) => s + l.qty, 0) };
}

/** Beställningen blir senaste order och korgen töms; kontaktuppgifterna finns kvar till nästa gång. */
export function placeOrder(cart: ClubCart, contact: Contact, delivery: DeliveryId, payment: PaymentId, prefix: string): ClubCart {
  const sum = totals(cart.lines, delivery);
  const number = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
  return { lines: [], contact, order: { number, at: new Date().toISOString(), lines: cart.lines, contact, delivery, payment, subtotal: sum.subtotal, shipping: sum.shipping, total: sum.total } };
}
