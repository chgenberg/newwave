import { EXTRA_MERCH, MERCH, type MerchProduct } from "./merch";

/** Every set piece across the four kinds of event; each event uses its own subset. */
export const BOOTH_ITEMS = [
  "massvagg",
  "rollup",
  "beachflagga",
  "massdisk",
  "skyltstall",
  "scenvagg",
  "podium",
  "regdisk",
  "skylt",
  "bannervagg",
  "bordsduk",
  "valkomstskylt",
  "fotovagg",
  "bardisk",
  "cocktailbord",
] as const;
export type BoothItem = (typeof BOOTH_ITEMS)[number];

export const PLACEHOLDER_BOOTH = "/demo/booth-placeholder.jpg";
export const BOOTH_ASPECT = 1536 / 1024;

/** Desktop booths are 3:2; phones get 4:3 so the booth fills the screen width without being tiny. */
export const BOOTH_FORMATS = ["3:2", "4:3"] as const;
export type BoothFormat = (typeof BOOTH_FORMATS)[number];
export const BOOTH_ASPECTS: Record<BoothFormat, number> = { "3:2": BOOTH_ASPECT, "4:3": 4 / 3 };

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
  /** Set pieces (wall, counter, stage …) are shown as crops of the generated image instead of product photos. */
  booth?: BoothItem;
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

/** Set pieces are ordered one at a time; the event decides how many go into a package. */
function set(id: BoothItem, name: string, spec: string, styles: string[], models: [string, string, string, number][]): Product {
  return { id, name, blurb: spec, spec, unit: "st", defaultQty: 1, step: 1, booth: id, styles, models: models.map(([mid, mname, desc, priceSek]) => ({ id: mid, name: mname, desc, priceSek })) };
}

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
    styles: ["Svart", "Silver"],
    models: [
      { id: "a4", name: "Broschyrställ A4", desc: "Hopfällbart ställ i aluminium med fem fack och väska.", priceSek: 1790 },
    ],
  },
  set("scenvagg", "Scenvägg", "Backdrop, 5 × 2,5 m", ["Med logotyp", "Helprint"], [
    ["textil", "Scenvägg 5 × 2,5 m", "Textilvägg med aluminiumram bakom scenen, heltäckande tryck och plats för skärm.", 14900],
    ["bred", "Scenvägg 6 × 3 m", "Större backdrop för breda scener och stora salonger.", 18900],
  ]),
  set("podium", "Talarpodium", "Med tryckt front", ["Med logotyp", "Helprint"], [
    ["standard", "Talarpodium", "Podium i trä och aluminium med utbytbar tryckt front.", 4900],
    ["akryl", "Talarpodium akryl", "Lätt podium i frostad akryl med logga i front.", 6900],
  ]),
  set("regdisk", "Registreringsdisk", "Med tryck, 200 cm", ["Med logotyp", "Helprint"], [
    ["standard", "Registreringsdisk", "Lång disk för incheckning med hylla och tryckt front.", 7900],
    ["led", "Registreringsdisk LED", "Bakgrundsbelyst front som syns i hela foajén.", 9900],
  ]),
  set("skylt", "Vägvisare", "Golvskylt A1, dubbelsidig", ["Med logotyp", "Tryck"], [
    ["a1", "Golvskylt A1", "Dubbelsidig golvskylt med pil och logga, stabil fot.", 1290],
    ["totem", "Skylttotem 200 cm", "Hög tryckt totem som syns över folkmassan.", 2490],
  ]),
  set("bannervagg", "Bannervägg", "Textil, 4 × 2,5 m", ["Med logotyp", "Helprint"], [
    ["rak", "Bannervägg 4 × 2,5 m", "Textilvägg med aluminiumram, tema och logga i fullt tryck.", 11900],
    ["bred", "Bannervägg 6 × 2,5 m", "Bredare vägg för stora gruppbilder.", 15900],
  ]),
  set("bordsduk", "Bordsdukar", "Med tryck, runt bord", ["Med logotyp", "Helprint"], [
    ["rund", "Bordsduk rund", "Tvättbar duk i polyester för runda bord, logga i front.", 690],
    ["spand", "Spänd bordsduk", "Formsydd duk för rektangulära bord.", 890],
  ]),
  set("valkomstskylt", "Välkomstskylt", "70 × 100 cm på staffli", ["Med logotyp", "Tryck"], [
    ["staffli", "Välkomstskylt med staffli", "Styv skylt i 70 × 100 cm på staffli i trä.", 1490],
  ]),
  set("fotovagg", "Fotovägg", "Step-and-repeat, 3 × 2,3 m", ["Med logotyp", "Helprint"], [
    ["standard", "Fotovägg 3 × 2,3 m", "Ljusmatt textil med upprepad logga, perfekt för bilder.", 7900],
    ["bred", "Fotovägg 4 × 2,3 m", "Bredare vägg för större grupper.", 9900],
  ]),
  set("bardisk", "Bardisk", "Med tryckt front, 200 cm", ["Med logotyp", "Helprint"], [
    ["standard", "Bardisk", "Rak bardisk med arbetsyta och tryckt front.", 8900],
    ["led", "Bardisk LED", "Belyst front som lyser upp loggan i kvällsljus.", 11900],
  ]),
  set("cocktailbord", "Cocktailbord", "Ståbord Ø 80 cm, tryckt duk", ["Med logotyp", "Helprint"], [
    ["standard", "Ståbord med tryckt duk", "Ståbord med spänd duk och logga, priset gäller per bord.", 890],
  ]),
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
    styles: ["Broderad", "Med logotyp"],
    models: [{ id: "keps", name: "Keps", desc: "Sexpanelskeps i bomullstwill med brodyr.", priceSek: 129, mockup: existing("keps", 1) }],
  },
  {
    id: "lanyard",
    name: "Namnbrickor med band",
    blurb: "Band med tryck och korthållare",
    spec: "Nyckelband 20 mm med korthållare",
    unit: "st",
    defaultQty: 200,
    step: 50,
    styles: ["Tryck", "Med logotyp"],
    models: [
      { id: "band", name: "Nyckelband 20 mm", desc: "Polyesterband med tryck, säkerhetslås och korthållare för namnbricka.", priceSek: 24, mockup: own("lanyard", "Namnbricka", "light", { kind: "flat" }, 0.75) },
      { id: "pet", name: "Nyckelband återvunnet PET", desc: "Samma band i återvunnen PET med mjuk känsla.", priceSek: 29, mockup: own("lanyard", "Namnbricka", "light", { kind: "flat" }, 0.75) },
    ],
  },
  {
    id: "anteckningsbok",
    name: "Anteckningsböcker",
    blurb: "A5, hårda pärmar",
    spec: "Anteckningsbok A5 med logotyp",
    unit: "st",
    defaultQty: 100,
    step: 10,
    styles: ["Tryck", "Prägling"],
    models: [
      { id: "a5", name: "Anteckningsbok A5", desc: "Hårda pärmar, linjerade sidor och band som bokmärke.", priceSek: 89, mockup: existing("anteckningsbok", 0.72) },
      { id: "a5-mjuk", name: "Anteckningsbok A5 mjuk", desc: "Mjuka pärmar i återvunnet papper.", priceSek: 59, mockup: existing("anteckningsbok", 0.72) },
    ],
  },
  {
    id: "teknik",
    name: "Teknikprylar",
    blurb: "Powerbank och laddare",
    spec: "Powerbank 5 000 mAh med logotyp",
    unit: "st",
    defaultQty: 50,
    step: 10,
    styles: PRINT,
    models: [{ id: "powerbank", name: "Powerbank", desc: "Slimmad powerbank, 5 000 mAh, USB-C.", priceSek: 199, mockup: existing("powerbank", 0.62) }],
  },
  {
    id: "hoodies",
    name: "Hoodies",
    blurb: "Collegekvalitet med tryck",
    spec: "Hoodie med logotyp",
    unit: "st",
    defaultQty: 50,
    step: 5,
    styles: ["Tryck", "Broderad"],
    models: [
      { id: "hoodie", name: "Hoodie", desc: "Tjock collegekvalitet med känguruficka och tryck på bröstet.", priceSek: 449, mockup: existing("hoodie", 0.7) },
      { id: "zip", name: "Zip-hoodie", desc: "Hoodie med dragkedja och broderad logga.", priceSek: 549, mockup: existing("hoodie", 0.7) },
    ],
  },
  {
    id: "tshirts",
    name: "T-shirts",
    blurb: "Ekologisk bomull",
    spec: "T-shirt med tryck",
    unit: "st",
    defaultQty: 50,
    step: 5,
    styles: ["Tryck", "Broderad"],
    models: [{ id: "tee", name: "T-shirt", desc: "Ekologisk bomull, tryck på bröstet.", priceSek: 199, mockup: existing("tee", 0.72) }],
  },
  {
    id: "ryggsackar",
    name: "Ryggsäckar",
    blurb: "Laptopfack, tryck",
    spec: "Ryggsäck med logotyp",
    unit: "st",
    defaultQty: 50,
    step: 5,
    styles: ["Tryck", "Broderad"],
    models: [{ id: "laptop", name: "Ryggsäck", desc: "Vattenavvisande ryggsäck med vadderat laptopfack.", priceSek: 349, mockup: own("backpack", "Ryggsäck", "dark", { kind: "fabric", folds: 0.5 }, 0.7) }],
  },
  {
    id: "termosmuggar",
    name: "Termosmuggar",
    blurb: "Håller värmen i timmar",
    spec: "Termosmugg med logotyp",
    unit: "st",
    defaultQty: 50,
    step: 10,
    styles: PRINT,
    models: [{ id: "termosmugg", name: "Termosmugg", desc: "Dubbelväggig stålmugg med lock, 40 cl.", priceSek: 149, mockup: existing("yeti", 0.85) }],
  },
  {
    id: "glas",
    name: "Glas med gravyr",
    blurb: "Highballglas, gravyr",
    spec: "Highballglas med gravyr",
    unit: "st",
    defaultQty: 120,
    step: 12,
    styles: ["Gravyr"],
    models: [{ id: "highball", name: "Highballglas", desc: "Klart glas, 35 cl, med lasergraverad logga.", priceSek: 89, mockup: existing("dricksglas", 0.85) }],
  },
  {
    id: "servetter",
    name: "Servetter",
    blurb: "Med tryck, 50 st/förp",
    spec: "Servetter med tryck, 50 st",
    unit: "förp",
    defaultQty: 20,
    step: 5,
    styles: ["Tryck"],
    models: [{ id: "cocktail", name: "Cocktailservetter", desc: "Treskiktsservetter 24 × 24 cm med tryck, 50 st per förpackning.", priceSek: 89, mockup: own("napkins", "Servetter", "light", { kind: "flat" }, 0.7) }],
  },
  {
    id: "paraplyer",
    name: "Paraplyer",
    blurb: "Golfparaply 130 cm",
    spec: "Golfparaply med logotyp",
    unit: "st",
    defaultQty: 25,
    step: 5,
    styles: PRINT,
    models: [{ id: "golf", name: "Golfparaply", desc: "Stort paraply, 130 cm, med tryck på två paneler.", priceSek: 249, mockup: existing("paraply", 0.75) }],
  },
];

export const ALL_PRODUCTS = [...BOOTH_PRODUCTS, ...PROMO_PRODUCTS];

/** Products that start in the booth at a trade show, as in the summary of the mockup. */
export const DEFAULT_PROMOS = ["profilklader", "pennor", "vattenflaskor", "godis", "pasar"];

/** Production lead times in working days, counted back from the event date. */
export const LEAD_DAYS_BOOTH = 10;
export const LEAD_DAYS_MERCH = 7;

/** Giveaways that run out with the crowd; their quantities follow the expected number of visitors. */
export const CONSUMABLES = ["pennor", "pasar", "godis", "vattenflaskor", "giveaways"];

export const VISITORS = [
  { id: "lt500", label: "Under 500", factor: 0.5 },
  { id: "500-2000", label: "500–2 000", factor: 1 },
  { id: "2000-10000", label: "2 000–10 000", factor: 2.5 },
  { id: "10000+", label: "10 000+", factor: 5 },
] as const;
export type VisitorsId = (typeof VISITORS)[number]["id"];

export const BUDGET_MIN = 10_000;
export const BUDGET_MAX = 150_000;

export const SWATCHES = ["#1D1D1F", "#FFFFFF", "#9A9AA0", "#1F3B73"];

/** Line and order totals in whole öre, so 7 × 4,90 kr is 34,30 kr and sums never drift. */
export const lineTotal = (qty: number, unitSek: number) => Math.round(qty * unitSek * 100) / 100;
export const sumSek = (amounts: number[]) => amounts.reduce((s, n) => s + Math.round(n * 100), 0) / 100;

export const MAX_QTY = 99_999;

export const sek = (n: number) =>
  `${n.toLocaleString("sv-SE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ")} kr`;
