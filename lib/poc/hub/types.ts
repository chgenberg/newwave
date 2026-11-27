/**
 * Kontraktet för kopplingen mot New Waves hubb (affärssystemet och dess API). Allt som skickas till hubben och allt som
 * tas emot från den går genom de här typerna. Hubbens egna fältnamn är ännu okända: de översätts på ett ställe
 * (lib/poc/hub/mapping.ts), så att resten av flödet aldrig behöver ändras när API-beskrivningen kommer.
 * Se docs/poc-flode.md, "Steg 4".
 */
import type { Customer, Producer } from "../types";

/** "simulerad" svarar själv (som i dag); "http" pratar med hubben över HTTP enligt miljövariablerna HUB_*. */
export type HubMode = "simulerad" | "http";

/* ---------- Ut: det vi skickar till hubben ---------- */

/**
 * En produktionsfil som en länk som hubben eller producenten hämtar med en vanlig GET, utan nyckel: länken är signerad
 * och gäller till `expiresAt` (HUB_FILE_TTL_H, standard två veckor). Filen byggs när länken hämtas.
 */
export type HubFile = { name: string; label: string; url: string; expiresAt: string };

export type HubOrderLine = {
  /** Vår rads id. Hubben anger det i `lineIds` när den rapporterar status för en del av ordern. */
  lineId: string;
  /** Crafts artikelnummer (katalogens sku). */
  sku: string;
  size?: string;
  color?: { name: string; hex: string };
  qty: number;
  unitSek: number;
  title: string;
  producer: Producer;
  /** Tryckmetoden, eller "stickning". */
  method: string;
  design: { id: string; name: string; variant?: string };
  /** Produktionsfilerna som tidsbegränsade länkar som hubben eller producenten kan hämta. Tom i det simulerade läget. */
  files: HubFile[];
};

export type HubOrder = {
  /** Vårt ordernummer ("IS-100001"); också nyckeln (Idempotency-Key) som gör att ett nytt försök aldrig blir två ordrar. */
  orderNumber: string;
  channel: "intersport";
  /** Butikens eget ordernummer, när butiken skickat ett. */
  externalRef?: string;
  createdAt: string;
  club: { id: string; name: string };
  customer: Customer;
  delivery: { method: string; label: string; priceSek: number };
  lines: HubOrderLine[];
  /** Inklusive frakten. */
  totalSek: number;
  currency: "SEK";
};

/* ---------- In: det hubben skickar till oss ---------- */

export type HubOrderStatus = "bekräftad" | "i produktion" | "skickad" | "levererad" | "avbruten" | "fel";

/**
 * Lagersaldo för en artikel i en storlek och en färg (lib/poc/hub/stock.ts). `size` och `color` saknas när saldot gäller
 * alla storlekar eller alla färger (t.ex. halsduken i one size). `color` är färgens namn som i produktens `colors`, eller
 * färgkoden (#RRGGBB). `available` är det som går att sälja nu (ett negativt saldo räknas som slut), `incoming` det som
 * är på väg och `eta` när det väntas (ISO 8601, datum eller tid).
 */
export type StockItem = { sku: string; size?: string; color?: string; available: number; incoming?: number; eta?: string };

/**
 * En produkt i hubbens katalog (lib/poc/hub/products.ts). Samma regler som Crafts importerade produktdata
 * (CatalogRowSchema i lib/poc/catalog.ts): artikelnummer med bokstäver, siffror, punkt, bindestreck och understreck,
 * pris i hela kronor inklusive moms, minst en storlek och, för plagg, ett basplagg.
 */
export type HubProduct = {
  sku: string;
  name: string;
  kind: "plagg" | "halsduk";
  /** Kronor inklusive moms. Klubbprodukter utan eget pris följer det. */
  priceSek: number;
  sizes: string[];
  colors?: { name: string; hex: string }[];
  /** Hubbens produktbilder. Sparas, men fotot och tryckytorna kommer från basplagget tills vidare. */
  images?: string[];
  /** Basplagget i New Waves katalog som ger foto och tryckytor, tills hubben levererar egna. */
  baseId?: string;
  /** `false`: säljs inte längre (som `product.delete`). Saknas = säljs. */
  active?: boolean;
};

/** Status på en order (eller, med `producer`/`lineIds`, en del av den) från hubben. `orderNumber` är vårt ordernummer. */
export type HubOrderStatusData = { orderNumber: string; erpRef?: string; status: HubOrderStatus; producer?: Producer; lineIds?: string[]; tracking?: string; carrier?: string; note?: string };

/**
 * En händelse från hubben. `id` är unikt per händelse: samma id två gånger behandlas bara en gång. `at` är när det
 * hände hos hubben (ISO 8601); saknas den sätts tiden då vi tog emot händelsen. Hubbens eget format översätts hit i
 * lib/poc/hub/mapping-in.ts, och lib/poc/hub/inbox.ts fördelar händelserna.
 */
export type HubEvent =
  | { id: string; type: "order.status"; at: string; data: HubOrderStatusData }
  | { id: string; type: "stock.updated"; at: string; data: { items: StockItem[]; /** Hela lagret, så att det som saknas räknas som slut. */ full?: boolean } }
  | { id: string; type: "product.upsert"; at: string; data: { products: HubProduct[] } }
  | { id: string; type: "product.delete"; at: string; data: { skus: string[] } };

export type HubEventType = HubEvent["type"];

/* ---------- Klienten ---------- */

/**
 * Hubben sedd från oss (lib/poc/hub/client.ts). Ett anrop som misslyckas kastar `HubError` (client.ts), som säger om
 * felet är värt ett nytt försök. Utkorgen (outbox.ts) är den enda som skickar ordrar och avbokningar.
 */
export interface HubClient {
  mode: HubMode;
  /**
   * Skickar en order. Samma `idempotencyKey` (vårt ordernummer) två gånger ska ge samma svar, aldrig två ordrar. Utan
   * `erpRef` har hubben tagit emot ordern men inte bekräftat den än (t.ex. 202): bekräftelsen kommer som händelsen
   * `order.status` "bekräftad".
   */
  submitOrder(order: HubOrder, idempotencyKey: string): Promise<{ erpRef?: string }>;
  /** Avbokar en order. `found: false` när hubben inte har ordern (då finns inget att avboka). */
  cancelOrder(orderNumber: string, reason: string, idempotencyKey: string): Promise<{ found: boolean }>;
  /** Hämtningsläge: om hubben inte skickar händelser till oss hämtar vi lager och produkter själva. */
  fetchStock?(since?: string): Promise<StockItem[]>;
  fetchProducts?(since?: string): Promise<HubProduct[]>;
}

/* ---------- Utkorgen ---------- */

export type OutboxKind = "order.submit" | "order.cancel";
/**
 * "väntar": skickas vid `nextAttemptAt` (eller skickas just nu, `sending`). "skickad": hubben har tagit emot den.
 * "misslyckad": hubben nekade, eller svarade inte på ett dygn – larm har gått och Craft kan skicka igen. "stoppad":
 * ordern avbröts innan posten skickades, så den skickas aldrig.
 */
export type OutboxStatus = "väntar" | "skickad" | "misslyckad" | "stoppad";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  orderId: string;
  orderNumber: string;
  idempotencyKey: string;
  status: OutboxStatus;
  /** Försöken hittills. Försök medan hubben inte var inställd räknas inte. */
  attempts: number;
  nextAttemptAt: string;
  /** Ett försök pågår just nu. */
  sending: boolean;
  lastError?: string;
  lastErrorAt?: string;
  /** Hubbens ordernummer i svaret, när den gav ett. */
  erpRef?: string;
  createdAt: string;
  sentAt?: string;
  updatedAt: string;
};

/** Utkorgen i siffror, för Crafts integrationssida (outboxSummary i outbox.ts). */
export type OutboxSummary = {
  mode: HubMode;
  /** Hubben går att använda: i http-läget är adressen och nyckeln satta. */
  ready: boolean;
  /** Miljövariablerna som saknas eller är ogiltiga (aldrig deras värden). */
  missing: string[];
  counts: Record<OutboxStatus, number>;
  /** Den post som väntat längst på att skickas. */
  oldestWaiting?: Pick<OutboxItem, "id" | "kind" | "orderNumber" | "createdAt" | "attempts" | "nextAttemptAt" | "lastError">;
  /** Det senaste felet i en post som inte skickats än, eller misslyckats. */
  lastError?: { orderNumber: string; kind: OutboxKind; text: string; at: string };
  /** Ordrar som hubben tagit emot men inte bekräftat (inget ordernummer än), och hur många av dem som väntat över en timme. */
  unconfirmed: number;
  unconfirmedOverAnHour: number;
  /** De senast ändrade posterna, nyast först. */
  recent: OutboxItem[];
};
