/**
 * Kontraktet för POC-flödet: Crafts design → klubbprodukter → Intersports order → Crafts affärssystem → stickeriet
 * och tryckeriet → status tillbaka. Alla delar (kärnan, Crafts sidor, butiken och producenternas köer) bygger mot de
 * här typerna. Se docs/poc-flode.md.
 */

/** Vad som tillverkas: plagg trycks hos tryckeriet, halsdukar stickas hos stickeriet. */
export type ProductKind = "plagg" | "halsduk";

export type Producer = "tryckeri" | "stickeri";

export const PRODUCER_OF: Record<ProductKind, Producer> = { plagg: "tryckeri", halsduk: "stickeri" };

/** En produkt i katalogen. Plaggen är platshållare tills Craft skickat sin produktdata. */
export type CatalogProduct = {
  sku: string;
  name: string;
  kind: ProductKind;
  priceSek: number;
  sizes: string[];
  /** Produkten i den befintliga katalogen (lib/newwave/catalog.ts) som ger foto, tryckyta och tryckmetod. Saknas för halsduken. */
  baseId?: string;
  placeholder: boolean;
  /** Plaggets färger ur Crafts produktdata (lib/poc/catalog-data.json). Saknas för platshållarna. */
  colors?: { name: string; hex: string }[];
};

/** Crafts design, innan den gjorts till klubbarnas egen. */
export type Design = {
  id: string;
  name: string;
  /** Uppladdad fil, eller en av ordmallarna där klubbens namn sätts in. */
  source: { type: "fil"; artUrl: string } | { type: "ordmall"; template: string };
  createdAt: string;
};

/** "borttagen": Craft har tagit bort produkten ur shoppen. Den syns inte där längre men finns kvar för ordrarna som redan har den. */
export type ClubProductStatus = "utkast" | "publicerad" | "borttagen";

/** En design gjord till en klubbs egen, för ett plagg. Det som säljs i klubbshoppen. */
export type ClubProduct = {
  id: string;
  designId: string;
  clubId: string;
  sku: string;
  kind: ProductKind;
  title: string;
  priceSek: number;
  mockupUrl: string;
  /** Det som behövs för att bygga produktionsfilerna: klubbens färger och märke, tryckets placering, halsdukens mönster. */
  spec: Record<string, unknown>;
  status: ClubProductStatus;
  createdAt: string;
  /** Variantens nyckel när ordmallens texter ändrats för klubben, t.ex. "aik~solna"; saknas för mallens egna texter. */
  variant?: string;
  /** Craft har satt priset själv; det behålls när designen publiceras igen. */
  customPrice?: boolean;
};

export type OrderStatus = "mottagen" | "bekräftad" | "i produktion" | "delvis skickad" | "skickad" | "avbruten";

export type JobStatus = "ny" | "accepterad" | "i produktion" | "skickad" | "fel";

export type Customer = { name: string; email: string; phone?: string; address?: string };

export type OrderLine = {
  id: string;
  clubProductId: string;
  sku: string;
  kind: ProductKind;
  title: string;
  size?: string;
  qty: number;
  unitSek: number;
};

export type Order = {
  id: string;
  /** Butikens ordernummer, t.ex. "IS-100001". */
  number: string;
  channel: "intersport";
  clubId: string;
  customer: Customer;
  lines: OrderLine[];
  totalSek: number;
  status: OrderStatus;
  /** Crafts ordernummer från affärssystemet, när det bekräftat ordern. */
  erpRef?: string;
  /** Leveranssättet och dess pris, räknat på servern ur butikens fraktregler. Ingår i totalSek. */
  shipping?: { method: string; label: string; priceSek: number };
  /** Varför ordern avbröts, när status är "avbruten". */
  cancelReason?: string;
  /** Butikens eget ordernummer (eller Idempotency-Key), när butiken skickat ett. Unikt per kanal. */
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
};

export type JobFile = { name: string; label: string; url: string };

export type ProductionJob = {
  id: string;
  orderId: string;
  orderNumber: string;
  producer: Producer;
  status: JobStatus;
  lineIds: string[];
  files: JobFile[];
  tracking?: string;
  /** Producentens senaste kommentar, t.ex. varför jobbet fick status "fel". */
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type EventActor = "butik" | "affärssystem" | "tryckeri" | "stickeri" | "craft" | "plattform";

export type OrderEvent = { id: string; orderId: string; jobId?: string; actor: EventActor; text: string; at: string };

/** En order med allt som hör till, som statussidan och Crafts ordervy visar den. */
export type OrderView = Order & { jobs: ProductionJob[]; events: OrderEvent[] };

/**
 * Kroppen i POST /api/v1/orders. `delivery` är ett av butikens leveranssätt (DeliveryId); priset räknas på servern.
 * `externalRef` är butikens eget ordernummer: samma nummer igen ger den befintliga ordern i stället för en ny.
 */
export type NewOrder = { clubId: string; customer: Customer; delivery?: string; externalRef?: string; lines: { clubProductId: string; size?: string; qty: number }[] };

/** Vem som är inloggad i POC-flödet: Craft, eller en av producenterna. */
export type Role = "craft" | Producer;

export type Session = { role: Role; exp: number };
