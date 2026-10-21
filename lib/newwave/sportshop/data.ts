import { type NwProduct, nwProduct } from "../catalog";

/**
 * Sport Lindner: en påhittad lokal sportbutik i Bielefeld som klär fyra klubbar. Varje klubb har två linjer: matchställ från
 * Craft med Crafts logga (egna produktfoton) och fanartiklar utan Craft-logga (katalogens foton med klubbmärket tryckt).
 */

export const SHOP = {
  name: "Sport Lindner",
  since: 1964,
  street: "Hauptstraße 112",
  city: "33647 Bielefeld",
  phone: "0521 448 12 30",
  email: "service@sport-lindner.de",
};

export const BASE = "/newwave/sportshop";

export type Sport = "fussball" | "handball" | "volleyball";
export type Line = "teamwear" | "fan";

export type ShopClub = {
  id: string;
  name: string;
  short: string;
  district: string;
  founded: number;
  members: number;
  sports: Sport[];
  /** Huvudfärgen, andrafärgen och textfärgen på huvudfärgen. */
  colors: { main: string; second: string; on: string };
  crest: string;
};

const crest = (id: string) => `${BASE}/wappen/${id}.png`;

/** Samma id och färger som scripts/sportshop-assets.mjs. */
export const CLUBS: ShopClub[] = [
  { id: "tus-brackwede", name: "TuS Grün-Weiß Brackwede", short: "TuS Brackwede", district: "Brackwede", founded: 1911, members: 640, sports: ["fussball"], colors: { main: "#0B6B3A", second: "#FFFFFF", on: "#FFFFFF" }, crest: crest("tus-brackwede") },
  { id: "sc-sennestadt", name: "SC Blau-Gelb Sennestadt", short: "SC Sennestadt", district: "Sennestadt", founded: 1958, members: 820, sports: ["fussball", "handball"], colors: { main: "#1747A6", second: "#F5C400", on: "#FFFFFF" }, crest: crest("sc-sennestadt") },
  { id: "fc-heepen", name: "FC Rot-Weiß Heepen", short: "FC Heepen", district: "Heepen", founded: 1921, members: 410, sports: ["fussball"], colors: { main: "#C8102E", second: "#FFFFFF", on: "#FFFFFF" }, crest: crest("fc-heepen") },
  { id: "vfb-joellenbeck", name: "VfB Schwarz-Gold Jöllenbeck", short: "VfB Jöllenbeck", district: "Jöllenbeck", founded: 1905, members: 530, sports: ["fussball", "volleyball"], colors: { main: "#141414", second: "#D4A017", on: "#D4A017" }, crest: crest("vfb-joellenbeck") },
];

export const shopClub = (id: string) => CLUBS.find((c) => c.id === id);

export type Kind = "home" | "away" | "shorts" | "socks" | "training" | "rain" | "tee" | "hoodie" | "beanie" | "cap" | "mug" | "bottle" | "bag" | "umbrella";
export type Badge = "bestseller" | "new" | "sale";

export type ShopProduct = {
  id: string;
  clubId: string;
  line: Line;
  kind: Kind;
  price: number;
  /** Ordinarie pris när varan är nedsatt. */
  was?: number;
  sizes: string[];
  /** Tröjor kan få namn och nummer på ryggen. */
  flock: boolean;
  /** Craft-plaggets foto; fanartiklarna ritas från katalogfotot med klubbmärket. */
  image?: string;
  catalog?: NwProduct;
  rating: number;
  reviews: number;
  sold: number;
  badges: Badge[];
};

export const FLOCK_PRICE = 12.95;
export const FLOCK_NAME_MAX = 12;
export const ONE_SIZE = "one";

const KIDS = ["116", "128", "140", "152", "164"];
const ADULT = ["XS", "S", "M", "L", "XL", "XXL"];
const SOCKS = ["27–30", "31–34", "35–38", "39–42", "43–46"];
const FAN_WEAR = ["S", "M", "L", "XL", "XXL"];

type Spec = { line: Line; price: number; was?: number; sizes: string[]; popularity: number; flock?: boolean; catalog?: string; isNew?: boolean };

export const KINDS: Record<Kind, Spec> = {
  home: { line: "teamwear", price: 54.95, sizes: [...KIDS, ...ADULT], popularity: 420, flock: true, isNew: true },
  away: { line: "teamwear", price: 54.95, sizes: [...KIDS, ...ADULT], popularity: 260, flock: true, isNew: true },
  shorts: { line: "teamwear", price: 24.95, sizes: [...KIDS, ...ADULT], popularity: 210 },
  socks: { line: "teamwear", price: 12.95, sizes: SOCKS, popularity: 230 },
  training: { line: "teamwear", price: 59.95, sizes: [...KIDS, ...ADULT], popularity: 240 },
  rain: { line: "teamwear", price: 39.95, was: 49.95, sizes: [...KIDS, ...ADULT], popularity: 150 },
  tee: { line: "fan", price: 19.95, sizes: FAN_WEAR, popularity: 380, catalog: "p001" },
  hoodie: { line: "fan", price: 44.95, sizes: FAN_WEAR, popularity: 300, catalog: "p004" },
  beanie: { line: "fan", price: 17.95, sizes: [ONE_SIZE], popularity: 220, catalog: "p012" },
  cap: { line: "fan", price: 19.95, sizes: [ONE_SIZE], popularity: 170, catalog: "p011" },
  mug: { line: "fan", price: 12.95, sizes: [ONE_SIZE], popularity: 190, catalog: "p022" },
  bottle: { line: "fan", price: 14.95, sizes: [ONE_SIZE], popularity: 160, catalog: "p020" },
  bag: { line: "fan", price: 34.95, sizes: [ONE_SIZE], popularity: 120, catalog: "p016" },
  umbrella: { line: "fan", price: 19.95, was: 24.95, sizes: [ONE_SIZE], popularity: 90, catalog: "p029" },
};

/** Fast spridning per produkt, så att betyg och försäljning ser levande ut men är desamma vid varje besök. */
function jitter(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const CLUB_REACH: Record<string, number> = { "tus-brackwede": 1.2, "sc-sennestadt": 1.05, "fc-heepen": 0.9, "vfb-joellenbeck": 0.85 };
const BESTSELLERS = 8;

function build(): ShopProduct[] {
  const list = CLUBS.flatMap((c) =>
    (Object.keys(KINDS) as Kind[]).map((kind): ShopProduct => {
      const k = KINDS[kind];
      const id = `${c.id}-${kind}`;
      const r = jitter(id);
      return {
        id,
        clubId: c.id,
        line: k.line,
        kind,
        price: k.price,
        was: k.was,
        sizes: k.sizes,
        flock: Boolean(k.flock),
        image: k.line === "teamwear" ? `${BASE}/kit/${id}.jpg` : undefined,
        catalog: k.catalog ? nwProduct(k.catalog) : undefined,
        rating: Math.round((4.2 + r * 0.7) * 10) / 10,
        reviews: Math.round(12 + r * k.popularity * 0.5),
        sold: Math.round(k.popularity * (CLUB_REACH[c.id] ?? 1) * (0.8 + r * 0.4)),
        badges: [...(k.isNew ? (["new"] as const) : []), ...(k.was ? (["sale"] as const) : [])],
      };
    }),
  );
  const top = new Set([...list].sort((a, b) => b.sold - a.sold).slice(0, BESTSELLERS).map((p) => p.id));
  return list.map((p) => (top.has(p.id) ? { ...p, badges: ["bestseller", ...p.badges] } : p));
}

export const PRODUCTS: ShopProduct[] = build();

export const shopProduct = (id: string) => PRODUCTS.find((p) => p.id === id);
export const clubProducts = (clubId: string, line?: Line) => PRODUCTS.filter((p) => p.clubId === clubId && (!line || p.line === line));
export const bestsellers = (n = BESTSELLERS) => [...PRODUCTS].sort((a, b) => b.sold - a.sold).slice(0, n);

export type Filter = "all" | "teamwear" | "fan" | "jerseys" | "jackets" | "bestseller" | "sale";
export const FILTERS: Record<Filter, (p: ShopProduct) => boolean> = {
  all: () => true,
  teamwear: (p) => p.line === "teamwear",
  fan: (p) => p.line === "fan",
  jerseys: (p) => p.kind === "home" || p.kind === "away",
  jackets: (p) => p.kind === "training" || p.kind === "rain",
  bestseller: (p) => p.badges.includes("bestseller"),
  sale: (p) => Boolean(p.was),
};
export const isFilter = (v: string | undefined): v is Filter => Boolean(v && Object.hasOwn(FILTERS, v));

export const FREE_SHIPPING_FROM = 50;
export type ShippingId = "dhl" | "express" | "hermes" | "collect";
/** `days` är arbetsdagar till leverans; Click & Collect hämtas samma dag. */
export const SHIPPING: { id: ShippingId; price: number; free: boolean; days: number }[] = [
  { id: "dhl", price: 4.95, free: true, days: 3 },
  { id: "express", price: 12.9, free: false, days: 1 },
  { id: "hermes", price: 3.95, free: true, days: 4 },
  { id: "collect", price: 0, free: true, days: 0 },
];
export const shippingCost = (id: ShippingId, subtotal: number) => {
  const s = SHIPPING.find((x) => x.id === id) ?? SHIPPING[0];
  return s.free && subtotal >= FREE_SHIPPING_FROM ? 0 : s.price;
};

export type PaymentId = "paypal" | "invoice" | "installments" | "card" | "sepa" | "applepay" | "prepay";
export const PAYMENTS: PaymentId[] = ["paypal", "invoice", "installments", "card", "sepa", "applepay", "prepay"];

/** Ett pris med två decimaler, utan flyttalsrester. */
export const cents = (n: number) => Math.round(n * 100) / 100;
/** Momsen som ingår i ett bruttopris, 19 % i Tyskland. */
export const VAT = 0.19;
export const vatOf = (gross: number) => cents(gross - gross / (1 + VAT));
