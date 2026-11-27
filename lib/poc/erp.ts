/**
 * Crafts affärssystem, simulerat. Det riktiga nås genom New Waves hubb (lib/poc/hub/client.ts, `HUB_MODE=http`); så
 * länge `HUB_MODE` är `simulerad` (standard) svarar hubbklienten med det här: ordern bekräftas direkt med ett eget
 * ordernummer, och en avbokning går alltid igenom.
 */

export const SIMULATED_ERP_NAME = "Crafts affärssystem (simulerat)";

/** `ERP_SIMULATE_FAIL=1` får det simulerade affärssystemet att fallera, för att prova nya försök. Läses vid varje anrop. */
export const simulateFail = () => ["1", "true", "ja"].includes((process.env.ERP_SIMULATE_FAIL ?? "").toLowerCase());

/** Ett ordernummer i Crafts format, härlett ur butikens: IS-100001 → CR-SO-2026-100001. */
export function simulatedErpRef(order: { orderNumber: string; createdAt: string }): string {
  const year = new Date(order.createdAt).getFullYear();
  return `CR-SO-${year}-${order.orderNumber.replace(/\D/g, "")}`;
}
