/** Klubbshoppens priser i kronor inklusive moms; delas av servern och webbläsaren. */

export const FLOCK_PRICE = 99;
export const FLOCK_NAME_MAX = 12;
export const MAX_QTY = 10;
export const VAT = 0.25;
export const FREE_SHIPPING_FROM = 599;

export type DeliveryId = "ombud" | "hem" | "butik";
export const DELIVERY: { id: DeliveryId; label: string; text: string; price: number; free: boolean }[] = [
  { id: "ombud", label: "Ombud", text: "Hämtas hos närmaste ombud", price: 49, free: true },
  { id: "hem", label: "Hemleverans", text: "Till dörren, kvällstid", price: 89, free: false },
  { id: "butik", label: "Hämta i butik", text: "I närmaste Intersport-butik", price: 0, free: true },
];

export type PaymentId = "swish" | "kort" | "faktura";
export const PAYMENTS: { id: PaymentId; label: string }[] = [
  { id: "swish", label: "Swish" },
  { id: "kort", label: "Kort" },
  { id: "faktura", label: "Faktura inom 30 dagar" },
];

/** Tryck på beställning: arbetsdagar från order till leverans. */
export const DELIVERY_DAYS: [number, number] = [5, 8];

export function shipping(id: DeliveryId, subtotal: number) {
  const d = DELIVERY.find((x) => x.id === id) ?? DELIVERY[0];
  return d.free && subtotal >= FREE_SHIPPING_FROM ? 0 : d.price;
}

export const vatOf = (gross: number) => Math.round(gross - gross / (1 + VAT));

export const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;

/** Datumet så många arbetsdagar (måndag–fredag) efter `from`. */
export function workdaysAfter(from: Date, days: number) {
  const d = new Date(from);
  for (let left = days; left > 0; ) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}
