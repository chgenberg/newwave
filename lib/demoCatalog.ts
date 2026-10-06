import type { BoothItem } from "./demoBooth";
import { EXTRA_MERCH, MERCH, type MerchProduct } from "./merch";

export const EVENTS = [
  { id: "massa", label: "Mässa", blurb: "Skapa en monter som fångar uppmärksamhet.", image: "/demo/card-massa.jpg" },
  { id: "konferens", label: "Konferens", blurb: "Stark gemenskapen med rätt profilering.", image: "/demo/card-konferens.jpg" },
  { id: "kickoff", label: "Kick-off", blurb: "Bygg laganda med produkter som engagerar.", image: "/demo/card-kickoff.jpg" },
  { id: "event", label: "Event", blurb: "Gör ditt event oförglömligt.", image: "/demo/card-event.jpg" },
] as const;
export type EventId = (typeof EVENTS)[number]["id"];

export const PLACEHOLDER_BOOTH = "/demo/booth-placeholder.jpg";
export const BOOTH_ASPECT = 1536 / 1024;

export const BRANDS = [
  { id: "volvo", name: "Volvo", url: "volvocars.com" },
  { id: "scania", name: "Scania", url: "scania.com" },
  { id: "ikea", name: "IKEA", url: "ikea.com" },
  { id: "spotify", name: "Spotify", url: "spotify.com" },
] as const;

/** Area of the booth photo (percent of width/height) used as thumbnail for booth items. */
export type Crop = { cx: number; cy: number; w: number };
export type Spot = { x: number; y: number };

export type Model = {
  id: string;
  name: string;
  desc: string;
  priceSek: number;
  /** Product photo with a print area that the logo is composed onto in the browser. */
  mockup?: { product: MerchProduct; blank: string; library: "products" | "demo"; artScale: number };
};

export type Product = {
  id: string;
  name: string;
  /** Short line shown under the name in product rows. */
  blurb: string;
  /** Spec line used in the summary and the offer. */
  spec: string;
  unit: "st" | "förp";
  defaultQty: number;
  step: number;
  booth?: BoothItem;
  crop?: Crop;
  spot?: Spot;
  styles: string[];
  models: Model[];
};

const base = (id: string): MerchProduct => ({ ...[...MERCH, ...EXTRA_MERCH].find((m) => m.id === id)!, finish: "print" });

const existing = (id: string, artScale: number) => ({ product: base(id), blank: `/products/${id}.jpg`, library: "products" as const, artScale });

const own = (id: string, name: string, variant: "light" | "dark", surface: MerchProduct["surface"], artScale: number) => ({
  product: { id, name, priceSek: 0, finish: "print" as const, art: "print" as const, variant, surface, prompt: "" },
  blank: `/demo/products/${id}.jpg`,
  library: "demo" as const,
  artScale,
});

const PRINT = ["Med logotyp", "Broderad", "Tryck"];

export const BOOTH_PRODUCTS: Product[] = [
  {
    id: "massvagg",
    name: "Mässvägg",
    blurb: "Rak vägg, 3 × 3 m",
    spec: "Rak, 3 × 3 m",
    unit: "st",
    defaultQty: 1,
    step: 1,
    booth: "massvagg",
    crop: { cx: 51, cy: 30, w: 62 },
    spot: { x: 30, y: 13 },
    styles: ["Med logotyp", "Helprint", "Tryck"],
    models: [
      { id: "rak", name: "Rak mässvägg", desc: "Textilvägg med aluminiumram och heltäckande tryck. Snabb att montera.", priceSek: 8900 },
      { id: "bojd", name: "Böjd mässvägg", desc: "Svagt böjd vägg för en mjukare monter med samma snabba montering.", priceSek: 10900 },
    ],
  },
  {
    id: "rollup",
    name: "Roll-up",
    blurb: "85 × 200 cm",
    spec: "85 × 200 cm",
    unit: "st",
    defaultQty: 1,
    step: 1,
    booth: "rollup",
    crop: { cx: 22.5, cy: 34, w: 15 },
    spot: { x: 22, y: 36 },
    styles: ["Med logotyp", "Tryck"],
    models: [
      { id: "classic", name: "Roll-up Classic", desc: "Lätt kassett med väska. Tryck på slitstarkt PET-material.", priceSek: 1990 },
      { id: "premium", name: "Roll-up Premium", desc: "Bredare fot och utbytbar kassett för återkommande mässor.", priceSek: 2790 },
    ],
  },
  {
    id: "beachflagga",
    name: "Beachflagga",
    blurb: "Höjd 300 cm",
    spec: "Höjd 300 cm",
    unit: "st",
    defaultQty: 1,
    step: 1,
    booth: "beachflagga",
    crop: { cx: 10, cy: 26, w: 17 },
    spot: { x: 10, y: 26 },
    styles: ["Med logotyp", "Tryck"],
    models: [
      { id: "feather", name: "Beachflagga Feather", desc: "Böjd flagga med kryssfot för inomhus. Tryck på båda sidor.", priceSek: 1490 },
      { id: "drop", name: "Beachflagga Drop", desc: "Droppformad flagga med stabil fot, även för utomhusbruk.", priceSek: 1690 },
    ],
  },
  {
    id: "massdisk",
    name: "Mässdisk",
    blurb: "Med tryck",
    spec: "Med tryck, 100 × 100 cm",
    unit: "st",
    defaultQty: 1,
    step: 1,
    booth: "massdisk",
    crop: { cx: 51, cy: 70, w: 38 },
    spot: { x: 51, y: 76 },
    styles: ["Med logotyp", "Helprint", "Tryck"],
    models: [
      { id: "standard", name: "Mässdisk Standard", desc: "Disk med hylla och utbytbar tryckt front.", priceSek: 5900 },
      { id: "led", name: "Mässdisk LED", desc: "Bakgrundsbelyst front som lyser upp din logga.", priceSek: 7900 },
    ],
  },
  {
    id: "skyltstall",
    name: "Skyltställ",
    blurb: "A4, 5 fack",
    spec: "A4, 5 fack",
    unit: "st",
    defaultQty: 1,
    step: 1,
    booth: "skyltstall",
    crop: { cx: 31, cy: 58, w: 14 },
    spot: { x: 31, y: 56 },
    styles: ["Svart", "Silver"],
    models: [
      { id: "a4", name: "Broschyrställ A4", desc: "Hopfällbart ställ i aluminium med fem fack och väska.", priceSek: 1790 },
    ],
  },
];

export const PROMO_PRODUCTS: Product[] = [
  {
    id: "profilklader",
    name: "Profilkläder",
    blurb: "T-shirts, pikéer, skjortor",
    spec: "Piké med logotyp",
    unit: "st",
    defaultQty: 20,
    step: 5,
    spot: { x: 85, y: 46 },
    styles: ["Broderad", "Med logotyp", "Tryck"],
    models: [
      { id: "pike", name: "Piké", desc: "Klassisk piké i bomullspiké med broderad logga på bröstet.", priceSek: 299, mockup: own("polo", "Piké", "dark", { kind: "fabric", folds: 0.8 }, 0.7) },
      { id: "tee", name: "T-shirt", desc: "Ekologisk bomull, tryck på bröstet.", priceSek: 199, mockup: existing("tee", 0.72) },
      { id: "hoodie", name: "Hoodie", desc: "Tjock collegekvalitet, marinblå.", priceSek: 449, mockup: existing("hoodie", 0.7) },
    ],
  },
  {
    id: "pennor",
    name: "Reklampennor",
    blurb: "Flera modeller",
    spec: "Classic Pen med logotyp",
    unit: "st",
    defaultQty: 300,
    step: 50,
    spot: { x: 55, y: 50 },
    styles: PRINT,
    models: [
      { id: "classic", name: "Classic Pen", desc: "Klassisk reklampenna med din logotyp. Hög kvalitet och lång livslängd.", priceSek: 4.9, mockup: own("pen-classic", "Classic Pen", "dark", { kind: "flat" }, 0.9) },
      { id: "metal", name: "Metal Pen", desc: "Penna i metall med vridmekanism och skarp gravyrkänsla.", priceSek: 12.9, mockup: own("pen-metal", "Metal Pen", "light", { kind: "flat" }, 0.9) },
    ],
  },
  {
    id: "godis",
    name: "Godis",
    blurb: "Egen mix/förpackning",
    spec: "Egen mix, tryckt ask",
    unit: "förp",
    defaultQty: 10,
    step: 1,
    spot: { x: 49, y: 49 },
    styles: ["Tryck", "Etikett"],
    models: [
      { id: "ask", name: "Godisask", desc: "Vit ask med tryckt logga och egen godismix, 1 kg per förpackning.", priceSek: 199, mockup: own("candy", "Godisask", "light", { kind: "flat" }, 0.8) },
    ],
  },
  {
    id: "vattenflaskor",
    name: "Vattenflaskor",
    blurb: "Flera modeller",
    spec: "Termosflaska med logotyp",
    unit: "st",
    defaultQty: 100,
    step: 10,
    spot: { x: 62, y: 47 },
    styles: PRINT,
    models: [
      { id: "termos", name: "Termosflaska", desc: "Stålflaska med bambulock, håller kallt i 24 h.", priceSek: 39, mockup: existing("termos", 0.85) },
      { id: "tumbler", name: "Tumbler", desc: "Isolerad mugg med sugrör, 1,2 l.", priceSek: 119, mockup: existing("yeti", 0.85) },
    ],
  },
  {
    id: "pasar",
    name: "Påsar",
    blurb: "Tyg, papper, non-woven",
    spec: "Tygpåse med logotyp",
    unit: "st",
    defaultQty: 100,
    step: 10,
    spot: { x: 93, y: 40 },
    styles: PRINT,
    models: [
      { id: "tyg", name: "Tygpåse", desc: "Naturvit bomullspåse med långa handtag.", priceSek: 29, mockup: own("tote", "Tygpåse", "light", { kind: "fabric", folds: 0.6 }, 0.75) },
      { id: "papper", name: "Papperspåse", desc: "Vit papperspåse med tvinnade handtag.", priceSek: 19, mockup: own("paperbag", "Papperspåse", "light", { kind: "flat" }, 0.75) },
    ],
  },
  {
    id: "giveaways",
    name: "Giveaways",
    blurb: "Anteckningsböcker, paraplyer m.m.",
    spec: "Anteckningsbok A5 med logotyp",
    unit: "st",
    defaultQty: 50,
    step: 10,
    styles: PRINT,
    models: [
      { id: "bok", name: "Anteckningsbok A5", desc: "Hårda pärmar, linjerade sidor.", priceSek: 89, mockup: existing("anteckningsbok", 0.72) },
      { id: "powerbank", name: "Powerbank", desc: "Slimmad powerbank, 5 000 mAh.", priceSek: 199, mockup: existing("powerbank", 0.62) },
      { id: "paraply", name: "Paraply", desc: "Golfparaply, 130 cm.", priceSek: 249, mockup: existing("paraply", 0.75) },
    ],
  },
  {
    id: "muggar",
    name: "Muggar",
    blurb: "Flera modeller och färger",
    spec: "Keramikmugg med logotyp",
    unit: "st",
    defaultQty: 50,
    step: 10,
    spot: { x: 83, y: 62 },
    styles: PRINT,
    models: [
      { id: "kopp", name: "Keramikmugg", desc: "Matt keramik, 30 cl.", priceSek: 59, mockup: existing("kaffekopp", 0.8) },
      { id: "emalj", name: "Emaljmugg", desc: "Emalj med svart kant.", priceSek: 79, mockup: existing("emaljmugg", 0.8) },
    ],
  },
  {
    id: "kepsar",
    name: "Kepsar",
    blurb: "Brodyr på framsidan",
    spec: "Keps med brodyr",
    unit: "st",
    defaultQty: 50,
    step: 10,
    spot: { x: 86, y: 20 },
    styles: ["Broderad", "Med logotyp"],
    models: [{ id: "keps", name: "Keps", desc: "Sexpanelskeps i bomullstwill med brodyr.", priceSek: 129, mockup: existing("keps", 1) }],
  },
];

export const ALL_PRODUCTS = [...BOOTH_PRODUCTS, ...PROMO_PRODUCTS];

/** Products that start in the booth, as in the summary of the mockup. */
export const DEFAULT_PROMOS = ["profilklader", "pennor", "vattenflaskor", "godis", "pasar"];

export const SWATCHES = ["#1D1D1F", "#FFFFFF", "#9A9AA0", "#1F3B73"];

/** Line and order totals in whole öre, so 7 × 4,90 kr is 34,30 kr and sums never drift. */
export const lineTotal = (qty: number, unitSek: number) => Math.round(qty * unitSek * 100) / 100;
export const sumSek = (amounts: number[]) => amounts.reduce((s, n) => s + Math.round(n * 100), 0) / 100;

export const MAX_QTY = 99_999;

export const sek = (n: number) =>
  `${n.toLocaleString("sv-SE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ")} kr`;
