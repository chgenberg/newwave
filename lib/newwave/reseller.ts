import { NW_CATALOG, nwProduct, type NwProduct } from "./catalog";
import { defaultDesign, type Design, markingPrice, sanitizeColor, sanitizeDesign } from "./marking";

/** Återförsäljarens webbshop och offerter. Ren modul: används både i webbläsaren och på servern. */

export type ShopTheme = { primary: string; accent: string; background: string };

export type ShopTexts = {
  shopName: string;
  tagline: string;
  heroTitle: string;
  heroText: string;
  about: string;
  email: string;
  phone: string;
};

export type Reseller = {
  id: string;
  slug: string;
  name: string;
  city: string;
  website?: string;
  logo?: string;
  /** Loggan i ljust utförande, till mörka ytor. */
  logoDark?: string;
  theme: ShopTheme;
  texts: ShopTexts;
  products: string[];
  /** Påslag i procent på New Waves cirkapris. */
  markup: number;
  status: "utkast" | "publicerad";
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  importedFrom?: string;
};

export type QuoteStatus = "ny" | "skickad" | "godkänd" | "produktion" | "levererad" | "nekad";

export const QUOTE_FLOW: { id: QuoteStatus; label: string; who: string }[] = [
  { id: "ny", label: "Förfrågan", who: "Kunden" },
  { id: "skickad", label: "Offert skickad", who: "Återförsäljaren" },
  { id: "godkänd", label: "Godkänd", who: "Kunden" },
  { id: "produktion", label: "I produktion", who: "New Wave" },
  { id: "levererad", label: "Levererad", who: "New Wave" },
];

export const STATUS_LABEL: Record<QuoteStatus, string> = { ny: "Ny förfrågan", skickad: "Skickad", godkänd: "Godkänd", produktion: "I produktion", levererad: "Levererad", nekad: "Nekad" };

/** Ett korrektur per tryckposition, fotat i designstudion. */
export type Proof = { label: string; image: string };

export type QuoteLineInput = {
  productId: string;
  sizes: Record<string, number>;
  design: Design;
  /** Produktfärgen som valdes i designstudion. */
  color: string;
  /** Kundens logga för ljusa produkter, som fil-URL; designen kan ha en egen. */
  logo: string;
  /** Samma logga för mörka produkter. */
  logoDark?: string;
  /** Bilden från designstudion; saknas om produkten lades i korgen utan att öppna studion. */
  preview?: string;
  proofs?: Proof[];
  note?: string;
};

export type QuoteLine = QuoteLineInput & {
  name: string;
  qty: number;
  unitProduct: number;
  unitPrint: number;
  unit: number;
  setup: number;
  total: number;
  /** New Waves pris till återförsäljaren för raden. */
  cost: number;
};

export type QuoteEvent = { at: string; who: string; text: string };

export type Quote = {
  id: string;
  /** Kundens hemliga länk till offerten. */
  token: string;
  resellerId: string;
  company: { name: string; contact: string; email: string; phone?: string };
  needBy?: string;
  message?: string;
  lines: QuoteLine[];
  totalSek: number;
  costSek: number;
  status: QuoteStatus;
  createdAt: string;
  validUntil?: string;
  /** Återförsäljarens hälsning när offerten skickas. */
  reply?: string;
  events: QuoteEvent[];
};

export const MIN_QTY = 10;

const productTier = (qty: number) => (qty >= 250 ? 0.88 : qty >= 100 ? 0.93 : qty >= 50 ? 0.97 : 1);

/** Cirkapriset exkl. moms; katalogpriset är konsumentpris inkl. moms. */
export const exVat = (p: NwProduct) => Math.round(p.priceSek / 1.25);

/** Pris för en rad. Räknas alltid om på servern från katalogen och designen, aldrig från klientens siffror. */
export function priceLine(input: QuoteLineInput, markup: number): QuoteLine | null {
  const p = nwProduct(input.productId);
  if (!p) return null;
  const sizes = Object.fromEntries(Object.entries(input.sizes).filter(([s, n]) => p.sizes.includes(s) && n > 0).map(([s, n]) => [s, Math.min(9999, Math.round(n))]));
  const qty = Object.values(sizes).reduce((a, b) => a + b, 0);
  const design = sanitizeDesign(p, input.design) ?? defaultDesign(p);
  const print = markingPrice(design, qty);
  const unitProduct = Math.round(exVat(p) * (1 + markup / 100) * productTier(qty));
  const unit = unitProduct + print.perUnit;
  const cost = Math.round((exVat(p) * 0.55 + print.perUnit * 0.7) * qty + print.setup * 0.6);
  return { ...input, design, color: sanitizeColor(p, input.color), sizes, name: p.name, qty, unitProduct, unitPrint: print.perUnit, unit, setup: print.setup, total: unit * qty + print.setup, cost };
}

export function priceQuote(lines: QuoteLineInput[], markup: number) {
  const priced = lines.map((l) => priceLine(l, markup)).filter((l): l is QuoteLine => l !== null && l.qty > 0);
  return { lines: priced, totalSek: priced.reduce((s, l) => s + l.total, 0), costSek: priced.reduce((s, l) => s + l.cost, 0) };
}

/** "Från"-pris per styck: 100 st med produktens standardtryck. */
export function fromPrice(p: NwProduct, markup: number) {
  const line = priceLine({ productId: p.id, sizes: { [p.sizes[0]]: 100 }, design: defaultDesign(p), color: p.garmentHex, logo: "" }, markup);
  return line ? line.unit : exVat(p);
}

const TZ = "Europe/Stockholm";
export const fmtDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
export const fmtWhen = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

/** Ordrar är godkända offerter; de ligger hos New Wave. */
export const isOrder = (q: Pick<Quote, "status">) => q.status === "godkänd" || q.status === "produktion" || q.status === "levererad";

export const ordersSince = (quotes: Quote[], days: number, now = Date.now()) => quotes.filter((q) => isOrder(q) && now - Date.parse(q.createdAt) < days * 86_400_000);

export const sek = (n: number) => `${Math.round(n).toLocaleString("sv-SE").replace(/\u00a0/g, " ")} kr`;

/** Produkterna som en återförsäljare kan sälja: allt tryckbart utom mässdisken. */
export const SHOP_CATALOG = NW_CATALOG.filter((p) => p.kind !== "booth");

const pct = (x: number, y: number, w: number, h: number) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });

/** Var loggan hamnar på produktfotot, som CSS: stor mitt på eller liten på vänster bröst. */
export function markBox(p: NwProduct, chest = false) {
  const b = p.box;
  if (chest && p.kind === "top" && p.zone.offset[0] === 0) {
    const w = b.w * 0.3;
    return pct(b.x + b.w * 0.66 - w / 2, b.y + b.h * 0.06, w, b.h * 0.3);
  }
  const w = b.w * 0.7;
  return pct(b.x + (b.w - w) / 2, b.y + b.h * 0.04, w, b.h * 0.7);
}

export const logoFor = (p: NwProduct, line: { logo?: string; logoDark?: string }) => (p.dark && line.logoDark) || line.logo;

export const shopUrl = (r: Pick<Reseller, "slug">) => `/newwave/s/${r.slug}`;

export const BUILDER_STEPS = [
  { id: "varumarke", label: "Varumärke", hint: "Logga och webbplats" },
  { id: "utseende", label: "Texter och färger", hint: "Finjustera allt" },
  { id: "sortiment", label: "Sortiment", hint: "Välj produkter" },
  { id: "publicera", label: "Publicera", hint: "Granska och gå live" },
] as const;

export type BuilderStep = (typeof BUILDER_STEPS)[number]["id"];

export function stepsDone(r: Reseller): Record<BuilderStep, boolean> {
  return {
    varumarke: Boolean(r.logo),
    utseende: Boolean(r.texts.heroTitle && r.texts.shopName),
    sortiment: r.products.length > 0,
    publicera: r.status === "publicerad",
  };
}
