import type { Order } from "./types";

/**
 * Crafts affärssystem. I demot simulerat: det bekräftar ordern direkt med ett eget ordernummer. Den riktiga kopplingen
 * implementerar samma gränssnitt och byts in i `erp()`, utan att resten av flödet ändras. Kastar `submitOrder` ett fel
 * försöker plattformen igen (lib/poc/orders.ts).
 */
export interface ErpAdapter {
  /** Visas i tidslinjen och loggen, t.ex. "Crafts affärssystem (simulerat)". */
  name: string;
  /** Lägger ordern i affärssystemet och ger tillbaka dess ordernummer. Ska vara idempotent på butikens ordernummer. */
  submitOrder(order: Order): Promise<{ erpRef: string }>;
}

/** `ERP_SIMULATE_FAIL=1` får det simulerade affärssystemet att fallera, för att prova nya försök. Läses vid varje anrop. */
const simulateFail = () => ["1", "true", "ja"].includes((process.env.ERP_SIMULATE_FAIL ?? "").toLowerCase());

/** Ger ett ordernummer i Crafts format, härlett ur butikens: IS-100001 → CR-SO-2026-100001. */
export const simulatedErp: ErpAdapter = {
  name: "Crafts affärssystem (simulerat)",
  async submitOrder(order) {
    if (simulateFail()) throw new Error("Simulerat fel: affärssystemet svarar inte (ERP_SIMULATE_FAIL)");
    const year = new Date(order.createdAt).getFullYear();
    return { erpRef: `CR-SO-${year}-${order.number.replace(/\D/g, "")}` };
  },
};

export function erp(): ErpAdapter {
  return simulatedErp;
}
