import { NW_CATALOG, nwProduct, type NwProduct } from "./catalog";
import { defaultDesign, type Design, markingPrice, sanitizeColor, sanitizeDesign } from "./marking";
import type { OccasionId } from "./occasions";

/** Återförsäljarens webbshop och offerter. Ren modul: används både i webbläsaren och på servern. */

export type ShopTheme = { primary: string; accent: string; background: string };

export type ResellerBrandbook = { file: string; colors: { name: string; hex: string }[]; fonts: string[]; tone: string; rules: string[] };

export type ShopTexts = {
  shopName: string;
  tagline: string;
  heroTitle: string;
  heroText: string;
  /** Rubriken på Om oss; tom ger "Om oss". */
  aboutTitle?: string;
  /** Om oss, med stycken åtskilda av tomma rader. */
  about: string;
  email: string;
  phone: string;
  address?: string;
  hours?: string;
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
  /** Den grafiska profilen (PDF) som AI:n läst; följer med in i designstudion. */
  brandbook?: ResellerBrandbook;
  texts: ShopTexts;
  products: string[];
  /** Tillfällena kunderna kan planera i butiken; saknas listan erbjuds alla. */
  occasions?: OccasionId[];
  /** Påslag i procent på New Waves cirkapris. */
  markup: number;
  status: "utkast" | "publicerad";
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  importedFrom?: string;
  /** Adresser butiken hade innan den byggdes om från en annan webbplats, så att utskickade länkar och QR-koder fortsätter att fungera. */
  formerSlugs?: string[];
};

export const answersTo = (r: Pick<Reseller, "slug" | "formerSlugs">, slug: string) => r.slug === slug || Boolean(r.formerSlugs?.includes(slug));

export type QuoteStatus = "ny" | "skickad" | "godkänd" | "produktion" | "levererad" | "nekad";

export const QUOTE_FLOW: { id: QuoteStatus; label: string; who: string }[] = [
  { id: "ny", label: "Förfrågan", who: "Kunden" },
  { id: "skickad", label: "Offert skickad", who: "Återförsäljaren" },
  { id: "godkänd", label: "Godkänd", who: "Kunden" },
  { id: "produktion", label: "I produktion", who: "New Wave" },
  { id: "levererad", label: "Levererad", who: "New Wave" },
];

export const ORDER_FLOW: typeof QUOTE_FLOW = [{ id: "godkänd", label: "Beställd", who: "Kunden" }, ...QUOTE_FLOW.slice(3)];

/** Återförsäljaren kan ändra och skicka om offerten tills kunden har godkänt den. */
export const canEdit = (s: QuoteStatus) => s === "ny" || s === "skickad" || s === "nekad";

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
  /** Senaste utskicket; `error` när e-post inte är inkopplad eller mejlet inte gick fram. */
  mailed?: { to: string; at: string; error?: "not_configured" | "failed" };
  /** Kundens svar när offerten nekades. */
  declined?: { at: string; reason?: string };
  events: QuoteEvent[];
  /** Beställd direkt i webbshoppen till butikens pris, utan offert. */
  direct?: boolean;
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

const SIZE_CURVE: Record<string, number> = { XS: 0.05, S: 0.15, M: 0.3, L: 0.3, XL: 0.15, XXL: 0.05 };

/** Antalet fördelat på vuxenstorlekarna som en vanlig beställning, innan kunden valt själv. Produkter utan storlek får allt på första. */
export function splitSizes(p: NwProduct, qty: number): Record<string, number> {
  const adult = p.sizes.filter((s) => s in SIZE_CURVE);
  if (!adult.includes("M")) return { [p.sizes[0]]: qty };
  const out = Object.fromEntries(adult.map((s) => [s, Math.floor(qty * SIZE_CURVE[s])]));
  out.M += qty - Object.values(out).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}

/** "Från"-pris per styck: 100 st med produktens standardtryck. */
export function fromPrice(p: NwProduct, markup: number) {
  const line = priceLine({ productId: p.id, sizes: { [p.sizes[0]]: 100 }, design: defaultDesign(p), color: p.garmentHex, logo: "" }, markup);
  return line ? line.unit : exVat(p);
}

/** Vad återförsäljaren betalar New Wave per styck vid 100 st, samma räkning som i `priceLine`. */
export function costPrice(p: NwProduct) {
  const line = priceLine({ productId: p.id, sizes: { [p.sizes[0]]: 100 }, design: defaultDesign(p), color: p.garmentHex, logo: "" }, 0);
  return line ? Math.round(exVat(p) * 0.55 + line.unitPrint * 0.7) : exVat(p);
}
const kund = (slug: string) => ({ logo: `/newwave/resellers/kunder/${slug}.png`, logoDark: `/newwave/resellers/kunder/${slug}-vit.png` });

/** Återförsäljarens befintliga kunder i demon, med loggor att visa produkterna med. */
export const DEMO_CUSTOMERS = [
  { name: "Hamnkrogen i Varberg", contact: "Sara Lind", email: "sara@hamnkrogen.se", color: "#14365E", ...kund("hamnkrogen") },
  { name: "KB Bygg & Mark", contact: "Johan Ek", email: "johan@kbbygg.se", color: "#E07020", ...kund("kb-bygg") },
  { name: "Solvikens förskola", contact: "Maria Holm", email: "maria@solviken.se", color: "#E0A800", ...kund("solviken") },
  { name: "Brf Strandängen", contact: "Eva Nord", email: "styrelsen@strandangen.se", color: "#2E7D5B", ...kund("strandangen") },
  { name: "Kaffebaren Lyktan", contact: "Leo Berg", email: "leo@lyktan.se", color: "#6E3F1F", ...kund("lyktan") },
  { name: "TechVäst AB", contact: "Ali Reza", email: "ali@techvast.se", color: "#5B3FD0", ...kund("techvast") },
];

/** Demokundernas påhittade adresser, som inte ska få riktiga mejl. */
export const isDemoEmail = (email: string) => DEMO_CUSTOMERS.some((c) => c.email === email.toLowerCase());

export type ShopPack = { id: string; name: string; text: string; products: string[]; markup: number };

/** Färdiga sortiment att börja från, med ett påslag som brukar fungera för kundgruppen. */
export const SHOP_PACKS: ShopPack[] = [
  { id: "foretag", name: "Företagsprofil", text: "Kläder och kontor till personal och kunder", products: ["p001", "p002", "p003", "p004", "p005", "p006", "p011", "p021", "p024", "p026", "p031", "p015"], markup: 15 },
  { id: "event", name: "Event och mässa", text: "Giveaways som delas ut i stora antal", products: ["p001", "p011", "p014", "p020", "p024", "p028", "p030", "p031", "p039", "p022"], markup: 10 },
  { id: "arbete", name: "Arbetskläder", text: "Tåliga plagg till hantverk och bygg", products: ["p003", "p004", "p006", "p007", "p008", "p009", "p010", "p011", "p012", "p019"], markup: 20 },
  { id: "forening", name: "Förening och lag", text: "Lagkläder, fans och kiosken", products: ["p001", "p004", "p008", "p011", "p012", "p013", "p016", "p019", "p020", "p030"], markup: 5 },
];

const TZ = "Europe/Stockholm";
export const fmtDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
export const fmtWhen = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

/** Ordrar är godkända offerter; de ligger hos New Wave. */
export const isOrder = (q: Pick<Quote, "status">) => q.status === "godkänd" || q.status === "produktion" || q.status === "levererad";

export const withinDays = (iso: string, days: number, now = Date.now()) => now - Date.parse(iso) < days * 86_400_000;

export const ordersSince = (quotes: Quote[], days: number, now = Date.now()) => quotes.filter((q) => isOrder(q) && withinDays(q.createdAt, days, now));

export const sek = (n: number) => `${Math.round(n).toLocaleString("sv-SE").replace(/\u00a0/g, " ")} kr`;

/** Produkterna som en återförsäljare kan sälja: allt tryckbart utom mässdisken. */
export const SHOP_CATALOG = NW_CATALOG.filter((p) => p.kind !== "booth");

export const logoFor = (p: NwProduct, line: { logo?: string; logoDark?: string }) => (p.dark && line.logoDark) || line.logo;

export const shopUrl = (r: Pick<Reseller, "slug">) => `/newwave/s/${r.slug}`;

export const BUILDER_STEPS = [
  { id: "varumarke", label: "Varumärke", hint: "Logga och webbplats" },
  { id: "hemsidan", label: "Hemsidan", hint: "Texter, Om oss och kontakt" },
  { id: "sortiment", label: "Sortiment", hint: "Produkter, pris och event" },
  { id: "publicera", label: "Publicera och dela", hint: "Gå live och bjud in kunder" },
] as const;

export type BuilderStep = (typeof BUILDER_STEPS)[number]["id"];

export function stepsDone(r: Reseller): Record<BuilderStep, boolean> {
  return {
    varumarke: Boolean(r.logo),
    hemsidan: Boolean(r.texts.heroTitle && r.texts.shopName),
    sortiment: r.products.length > 0,
    publicera: r.status === "publicerad",
  };
}
