import { z } from "zod";
import { ALL_PRODUCTS, BOOTH_FORMATS, MAX_QTY, VISITORS, lineTotal, sumSek } from "./demoCatalog";
import { SITE } from "./demoLimit";
import { EVENTS, EVENT_IDS, EVENT_LIST, type EventId, eventOf } from "./demoEvents";
import { PACKAGE_IDS } from "./demoPackages";

export const BOOTH_URL = /^(\/api\/v1\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg|\/demo\/booth-placeholder(-43)?\.jpg|\/demo\/scene-(konferens|kickoff|event)(-43)?\.jpg)$/;

export const LineInput = z.object({
  id: z.string().max(40),
  model: z.string().max(40).optional(),
  name: z.string().max(80).optional(),
  spec: z.string().max(120).optional(),
  qty: z.number().int().min(1).max(MAX_QTY),
  unitSek: z.number().nonnegative().max(1e6).optional(),
});

export const OfferFields = {
  brand: z.object({ name: z.string().max(80), site: z.union([z.literal(""), z.string().toLowerCase().max(120).regex(SITE)]) }),
  boothUrl: z.string().max(120).regex(BOOTH_URL).optional(),
  format: z.enum(BOOTH_FORMATS).default("3:2"),
  lines: z.array(LineInput).min(1).max(ALL_PRODUCTS.length),
  eventDate: z.union([z.literal(""), z.string().regex(/^20\d\d-\d\d-\d\d$/)]).optional(),
  visitors: z.union([z.literal(""), z.enum(VISITORS.map((v) => v.id) as [string, ...string[]])]).optional(),
  package: z.union([z.literal(""), z.enum(PACKAGE_IDS as [string, ...string[]])]).optional(),
  /** An event id; tabs opened before the event choice existed still send the Swedish label of the trade show. */
  event: z
    .union([z.enum(EVENT_IDS), z.enum(EVENT_LIST.map((e) => e.label) as [string, ...string[]])])
    .default("massa")
    .transform((v) => eventOf(v).id),
};

export type PricedLine = { id: string; model: string; name: string; spec: string; unit: string; qty: number; unitSek: number; totalSek: number };

/** Prices always come from the catalog, never from the client; unknown, duplicate or other-event products reject the whole offer. */
export function priceLines(input: z.infer<typeof LineInput>[], ev: EventId = "massa"): { lines: PricedLine[]; totalSek: number } | null {
  const seen = new Set<string>();
  const lines: PricedLine[] = [];
  const allowed = new Set<string>([...EVENTS[ev].set, ...EVENTS[ev].merch]);
  for (const l of input) {
    const p = ALL_PRODUCTS.find((x) => x.id === l.id);
    const m = p && (l.model ? p.models.find((x) => x.id === l.model) : p.models[0]);
    if (!p || !m || seen.has(p.id) || !allowed.has(p.id)) return null;
    seen.add(p.id);
    lines.push({ id: p.id, model: m.id, name: p.name, spec: m.id === p.models[0].id ? p.spec : m.name, unit: p.unit, qty: l.qty, unitSek: m.priceSek, totalSek: lineTotal(l.qty, m.priceSek) });
  }
  return { lines, totalSek: sumSek(lines.map((l) => l.totalSek)) };
}

