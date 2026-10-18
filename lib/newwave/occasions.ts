/**
 * Tillfällena som en företagskund kan planera i återförsäljarens butik. Varje tillfälle har en neutral scen med
 * "DIN LOGO"-ytor som brandas med kundens logga, produkterna som passar, punkterna där produkterna syns i scenen
 * och färdiga paket i tre nivåer.
 */

export const OCCASION_IDS = ["massa", "konferens", "kickoff", "sommar", "event", "julklapp"] as const;
export type OccasionId = (typeof OCCASION_IDS)[number];

export const isOccasion = (v: unknown): v is OccasionId => typeof v === "string" && (OCCASION_IDS as readonly string[]).includes(v);

/** En produkt i scenen, som andelar av bildens bredd och höjd. Scenens layout behålls när den brandas. */
export type Spot = { id: string; x: number; y: number };
/** Antal per person (`perPerson`) eller ett fast antal, t.ex. personalens tröjor. */
export type PackageLine = { id: string; perPerson?: number; fixed?: number };
export type Tier = { id: "bas" | "plus" | "premium"; name: string; pitch: string; lines: PackageLine[] };

export type Occasion = {
  id: OccasionId;
  name: string;
  hint: string;
  scene: string;
  /** "Er monter", "Er konferens" … – rubriken över den brandade scenen. */
  title: string;
  /** Vilka paketen räknas för: "besökare", "deltagare" … */
  people: string;
  defaultPeople: number;
  stages: string[];
  products: string[];
  spots: Spot[];
  tiers: Tier[];
};

const tiers = (bas: [string, PackageLine[]], plus: [string, PackageLine[]], premium: [string, PackageLine[]]): Tier[] => [
  { id: "bas", name: "Bas", pitch: bas[0], lines: bas[1] },
  { id: "plus", name: "Plus", pitch: plus[0], lines: plus[1] },
  { id: "premium", name: "Premium", pitch: premium[0], lines: premium[1] },
];
const each = (...ids: string[]): PackageLine[] => ids.map((id) => ({ id, perPerson: 1 }));

export const OCCASIONS: Occasion[] = [
  {
    id: "massa",
    name: "Mässa",
    hint: "Monter, personalkläder och giveaways",
    scene: "/newwave/occasions/massa.jpg",
    title: "Er monter",
    people: "besökare",
    defaultPeople: 500,
    stages: ["Bygger montern…", "Trycker mässväggen…", "Klär personalen i profilkläder…", "Ställer fram giveaways…"],
    products: ["p003", "p024", "p014", "p028", "p030", "p026", "p011", "p022", "p020"],
    spots: [
      { id: "p003", x: 0.46, y: 0.42 },
      { id: "p024", x: 0.545, y: 0.51 },
      { id: "p020", x: 0.62, y: 0.5 },
      { id: "p011", x: 0.84, y: 0.21 },
      { id: "p014", x: 0.91, y: 0.44 },
      { id: "p022", x: 0.83, y: 0.63 },
    ],
    tiers: tiers(
      ["Det som syns och delas ut", [{ id: "p024", perPerson: 1 }, { id: "p028", perPerson: 0.4 }, { id: "p003", fixed: 6 }]],
      ["Giveaways som följer med hem", [{ id: "p024", perPerson: 1 }, { id: "p014", perPerson: 0.4 }, { id: "p030", perPerson: 0.4 }, { id: "p003", fixed: 6 }]],
      ["Hela montern, klädd och redo", [{ id: "p024", perPerson: 1 }, { id: "p014", perPerson: 0.4 }, { id: "p026", perPerson: 0.2 }, { id: "p011", perPerson: 0.15 }, { id: "p022", perPerson: 0.1 }, { id: "p003", fixed: 6 }]],
    ),
  },
  {
    id: "konferens",
    name: "Konferens",
    hint: "Block, pennor och namnband till deltagarna",
    scene: "/newwave/occasions/konferens.jpg",
    title: "Er konferens",
    people: "deltagare",
    defaultPeople: 150,
    stages: ["Bygger scenen…", "Trycker scenväggen…", "Dukar registreringen…", "Lägger fram deltagarnas kit…"],
    products: ["p028", "p026", "p024", "p025", "p014", "p020", "p031", "p017", "p003"],
    spots: [
      { id: "p028", x: 0.735, y: 0.41 },
      { id: "p026", x: 0.895, y: 0.555 },
      { id: "p020", x: 0.962, y: 0.495 },
    ],
    tiers: tiers(["Det deltagarna behöver", each("p028", "p024", "p026")], ["Välkomstkit i tygkasse", each("p028", "p024", "p026", "p014", "p020")], ["Exklusivt kit med teknik", each("p028", "p025", "p026", "p014", "p031")]),
  },
  {
    id: "kickoff",
    name: "Kick-off",
    hint: "Kläder och prylar som bygger laget",
    scene: "/newwave/occasions/kickoff.jpg",
    title: "Er kick-off",
    people: "kollegor",
    defaultPeople: 80,
    stages: ["Klär lokalen…", "Trycker bannerväggen…", "Klär laget i hoodies…", "Packar ryggsäckarna…"],
    products: ["p004", "p001", "p011", "p020", "p015", "p021"],
    spots: [
      { id: "p004", x: 0.345, y: 0.36 },
      { id: "p011", x: 0.185, y: 0.585 },
      { id: "p020", x: 0.145, y: 0.53 },
      { id: "p021", x: 0.74, y: 0.565 },
      { id: "p015", x: 0.815, y: 0.53 },
    ],
    tiers: tiers(["Samma tröja, samma lag", each("p001", "p020")], ["Hoodie och keps till alla", each("p004", "p011", "p020")], ["Utrustade för hela dagen", each("p004", "p015", "p011", "p020")]),
  },
  {
    id: "sommar",
    name: "Sommarfest",
    hint: "Utomhus, sol och svalka",
    scene: "/newwave/occasions/sommar.jpg",
    title: "Er sommarfest",
    people: "gäster",
    defaultPeople: 60,
    stages: ["Dukar upp vid sjön…", "Trycker fotoväggen…", "Klär laget i sommarkläder…", "Packar kylväskorna…"],
    products: ["p001", "p011", "p020", "p023", "p036", "p035", "p018", "p034"],
    spots: [
      { id: "p001", x: 0.42, y: 0.42 },
      { id: "p011", x: 0.585, y: 0.245 },
      { id: "p018", x: 0.1, y: 0.73 },
      { id: "p023", x: 0.195, y: 0.7 },
      { id: "p035", x: 0.15, y: 0.86 },
      { id: "p036", x: 0.81, y: 0.64 },
    ],
    tiers: tiers(
      ["T-shirt och keps till alla", each("p001", "p011")],
      ["Redo för stranden", each("p001", "p011", "p020", "p036")],
      ["Hela sommarfesten", [...each("p001", "p011", "p020", "p036"), { id: "p035", perPerson: 0.25 }, { id: "p018", perPerson: 0.15 }, { id: "p034", fixed: 2 }]],
    ),
  },
  {
    id: "event",
    name: "Fest och event",
    hint: "Mingel, bar och det gästerna minns",
    scene: "/newwave/occasions/event.jpg",
    title: "Ert event",
    people: "gäster",
    defaultPeople: 120,
    stages: ["Bygger eventet…", "Trycker fotoväggen…", "Ställer i ordning baren…", "Slår in gåvorna…"],
    products: ["p039", "p038", "p022", "p037", "p029", "p014", "p011"],
    spots: [{ id: "p039", x: 0.51, y: 0.53 }],
    tiers: tiers(
      ["Något sött att ta med hem", each("p039")],
      ["Gåva och profilerad bar", [...each("p039", "p022"), { id: "p037", fixed: 4 }]],
      ["Gåvan gästerna minns", [...each("p038", "p039"), { id: "p037", fixed: 4 }, { id: "p029", perPerson: 0.2 }]],
    ),
  },
  {
    id: "julklapp",
    name: "Julfest och julklapp",
    hint: "Gåvor att ge bort och ta med hem",
    scene: "/newwave/occasions/julklapp.jpg",
    title: "Er julklapp",
    people: "medarbetare",
    defaultPeople: 50,
    stages: ["Dukar julbordet…", "Slår in paketen…", "Trycker presentaskarna…", "Lägger fram julklapparna…"],
    products: ["p039", "p021", "p012", "p038", "p022", "p019", "p004", "p005"],
    spots: [
      { id: "p005", x: 0.46, y: 0.4 },
      { id: "p022", x: 0.215, y: 0.575 },
      { id: "p039", x: 0.355, y: 0.565 },
      { id: "p021", x: 0.52, y: 0.56 },
      { id: "p038", x: 0.755, y: 0.585 },
    ],
    tiers: tiers(["Varm dryck och choklad", each("p021", "p039")], ["Mössa, mugg och choklad", each("p012", "p021", "p039")], ["Julklappen man behåller", each("p004", "p019", "p039")]),
  },
];

export const occasion = (id: string) => OCCASIONS.find((o) => o.id === id);

/** Tillfällena butiken erbjuder. De tar med sina egna produkter, oavsett vad som ligger i butikens sortiment. */
export const offeredOccasions = (r: { occasions?: OccasionId[] }) => OCCASIONS.filter((o) => !r.occasions || r.occasions.includes(o.id));

/** Det kunderna kan beställa i butiken: sortimentet plus produkterna i tillfällena som erbjuds. */
export const sellableProducts = (r: { products: string[]; occasions?: OccasionId[] }) => new Set([...r.products, ...offeredOccasions(r).flatMap((o) => o.products)]);
