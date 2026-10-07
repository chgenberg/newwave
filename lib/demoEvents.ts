import type { BoothFormat, BoothItem, Crop, Product, Spot } from "./demoCatalog";

export const EVENT_IDS = ["massa", "konferens", "kickoff", "event"] as const;
export type EventId = (typeof EVENT_IDS)[number];

/** Where a product sits in an event's fixed image, measured on the neutral reference of each format. */
type Place = { spot?: Spot; crop?: Crop; spot43?: Spot; crop43?: Crop };

type Copy = {
  label: string;
  /** Card text on the first step. */
  blurb: string;
  image: string;
  /** "montern", "konferensen" … */
  the: string;
  /** "Mässmonter", "Konferens" … – title of the visualisation and the offer. */
  title: string;
  startTitle: string;
  startSub: string;
  cta: string;
  creating: string;
  /** Ready title, e.g. "Montern för Scania är klar". */
  ready: (name: string) => string;
  /** "en ny monter" – used in "Skapa …". */
  again: string;
  /** "hela montern" – the set as a whole. */
  whole: string;
  setTitle: string;
  orderAll: string;
  orderShort: string;
  /** Question and short label for the event date. */
  dateQuestion: string;
  dateLabel: string;
  pdfDateLabel: string;
  /** "besökare", "deltagare", "gäster". */
  people: string;
  bigOne: string;
  pitch: string;
  shareText: string;
  themeLabel: string;
  loading: { title: string; sub: (name: string) => string; tailoring: string; stages: [number, string][] };
  details: [string, string];
};

export type EventConfig = Copy & {
  id: EventId;
  /** Set pieces in budget priority order: the first is kept longest. */
  set: BoothItem[];
  basSet: BoothItem[];
  merch: string[];
  defaults: string[];
  /** Products whose quantities follow the number of people. */
  scales: string[];
  qty: Record<string, number>;
  /** Labels and quantity factors for the four audience sizes (ids are shared, see VISITORS). */
  audience: [string, string, string, string];
  factors: [number, number, number, number];
  lead: { set: number; merch: number };
  places: Record<string, Place>;
  /** Detail crops for page 2 of the printed offer. */
  detailCrops: Record<BoothFormat, [Crop, Crop]>;
  placeholders: Record<BoothFormat, string>;
};

/** The 4:3 reference is the 3:2 one scaled to 944 px wide at x 40, y 198 of a 1024 square, cropped from y 112 to 880. */
const x43 = (x: number) => +(3.906 + 0.9219 * x).toFixed(1);
const y43 = (y: number) => +(11.2 + 0.819 * y).toFixed(1);
const spot43 = (s: Spot): Spot => ({ x: x43(s.x), y: y43(s.y) });
const crop43 = (c: Crop): Crop => ({ cx: x43(c.cx), cy: y43(c.cy), w: +(c.w * 0.9219).toFixed(1) });
/** A place measured on the 3:2 reference, with 4:3 values derived unless measured separately. */
const at = (spot?: Spot, crop?: Crop, m43: Place = {}): Place => ({
  spot,
  crop,
  spot43: m43.spot43 ?? (spot && spot43(spot)),
  crop43: m43.crop43 ?? (crop && crop43(crop)),
});

const BOOTH_STAGES: [number, string][] = [
  [0, "Bygger montern…"],
  [4, "Trycker mässväggen…"],
  [8, "Ställer fram era produkter…"],
  [12, "Klär personalen i profilkläder…"],
  [16, "Kvalitetsgranskar bilden…"],
  [23, "Gör om en detalj…"],
  [38, "Kvalitetsgranskar igen…"],
  [45, "Gör om en detalj…"],
  [60, "Sista detaljerna…"],
];
const review = (s: [number, string][]): [number, string][] => [...s, [16, "Kvalitetsgranskar bilden…"], [23, "Gör om en detalj…"], [38, "Kvalitetsgranskar igen…"], [45, "Gör om en detalj…"], [60, "Sista detaljerna…"]];

export const EVENTS: Record<EventId, EventConfig> = {
  massa: {
    id: "massa",
    label: "Mässa",
    blurb: "Monter som fångar uppmärksamhet",
    image: "/demo/card-massa.jpg",
    the: "montern",
    title: "Mässmonter",
    startTitle: "Skapa din mässmonter",
    startSub: "Ange företagets webbadress så bygger vi en monter med er logga, era färger och produkter som passar er bransch.",
    cta: "Skapa min monter",
    creating: "Skapar monter för",
    ready: (n) => `Montern för ${n} är klar`,
    again: "en ny monter",
    whole: "hela montern",
    setTitle: "Montern",
    orderAll: "Beställ montern som den ser ut",
    orderShort: "Beställ montern",
    dateQuestion: "När är mässan?",
    dateLabel: "Mässan",
    pdfDateLabel: "Mässdatum",
    people: "besökare",
    bigOne: "en stor mässa",
    pitch: "mässmonter",
    shareText: "Kan du godkänna offerten för mässmontern?",
    themeLabel: "På mässväggen",
    loading: { title: "Bygger montern…", sub: (n) => `Vi bygger en unik monter för ${n}.`, tailoring: "Anpassar montern för", stages: BOOTH_STAGES },
    details: ["Detalj: produktdisplay", "Detalj: mässdisk och profilprodukter"],
    set: ["massvagg", "massdisk", "rollup", "beachflagga", "skyltstall"],
    basSet: ["massvagg", "massdisk", "rollup"],
    merch: ["profilklader", "pennor", "godis", "vattenflaskor", "pasar", "giveaways", "muggar", "kepsar"],
    defaults: ["profilklader", "pennor", "vattenflaskor", "godis", "pasar"],
    scales: ["pennor", "pasar", "godis", "vattenflaskor", "giveaways"],
    qty: {},
    audience: ["Under 500", "500–2 000", "2 000–10 000", "10 000+"],
    factors: [0.5, 1, 2.5, 5],
    lead: { set: 10, merch: 7 },
    places: {
      massvagg: { crop: { cx: 51, cy: 30, w: 62 }, spot: { x: 30, y: 13 }, crop43: { cx: 51, cy: 40, w: 57 }, spot43: { x: 32, y: 22 } },
      rollup: { crop: { cx: 22.5, cy: 34, w: 15 }, spot: { x: 22, y: 36 }, crop43: { cx: 24.5, cy: 39, w: 14 }, spot43: { x: 24, y: 41 } },
      beachflagga: { crop: { cx: 10, cy: 26, w: 17 }, spot: { x: 10, y: 26 }, crop43: { cx: 13, cy: 32.5, w: 16 }, spot43: { x: 13, y: 32.5 } },
      massdisk: { crop: { cx: 51, cy: 70, w: 38 }, spot: { x: 51, y: 76 }, crop43: { cx: 51, cy: 68.5, w: 35 }, spot43: { x: 51, y: 73 } },
      skyltstall: { crop: { cx: 31, cy: 58, w: 14 }, spot: { x: 31, y: 56 }, crop43: { cx: 32.5, cy: 58.5, w: 13 }, spot43: { x: 32.5, y: 57 } },
      profilklader: { spot: { x: 85, y: 46 }, spot43: { x: 82, y: 49 } },
      pennor: { spot: { x: 55, y: 50 }, spot43: { x: 54.5, y: 52 } },
      godis: { spot: { x: 49, y: 49 }, spot43: { x: 49, y: 51 } },
      vattenflaskor: { spot: { x: 62, y: 47 }, spot43: { x: 61, y: 50 } },
      pasar: { spot: { x: 93, y: 40 }, spot43: { x: 89.5, y: 44 } },
      muggar: { spot: { x: 83, y: 62 }, spot43: { x: 80.5, y: 62 } },
      kepsar: { spot: { x: 86, y: 20 }, spot43: { x: 83, y: 27.5 } },
    },
    detailCrops: {
      "3:2": [
        { cx: 84, cy: 45, w: 30 },
        { cx: 50, cy: 62, w: 40 },
      ],
      "4:3": [
        { cx: 81, cy: 48, w: 28 },
        { cx: 50, cy: 62, w: 37 },
      ],
    },
    placeholders: { "3:2": "/demo/booth-placeholder.jpg", "4:3": "/demo/booth-placeholder-43.jpg" },
  },
  konferens: {
    id: "konferens",
    label: "Konferens",
    blurb: "Scen, registrering och profilering",
    image: "/demo/card-konferens.jpg",
    the: "konferensen",
    title: "Konferens",
    startTitle: "Skapa er konferens",
    startSub: "Ange företagets webbadress så bygger vi scen, registrering och profilprodukter med er logga och era färger.",
    cta: "Skapa min konferens",
    creating: "Skapar konferens för",
    ready: (n) => `Konferensen för ${n} är klar`,
    again: "en ny konferens",
    whole: "hela scenen och foajén",
    setTitle: "Scen och foajé",
    orderAll: "Beställ konferensen som den ser ut",
    orderShort: "Beställ konferensen",
    dateQuestion: "När är konferensen?",
    dateLabel: "Konferensen",
    pdfDateLabel: "Konferensdatum",
    people: "deltagare",
    bigOne: "en stor konferens",
    pitch: "konferensprofilering",
    shareText: "Kan du godkänna offerten för konferensen?",
    themeLabel: "På scenväggen",
    loading: {
      title: "Bygger scenen…",
      sub: (n) => `Vi bygger en unik konferens för ${n}.`,
      tailoring: "Anpassar konferensen för",
      stages: review([
        [0, "Bygger scenen…"],
        [4, "Trycker scenväggen…"],
        [8, "Dukar registreringen…"],
        [12, "Lägger fram namnbrickor…"],
      ]),
    },
    details: ["Detalj: scen och skärm", "Detalj: registrering och namnbrickor"],
    set: ["scenvagg", "regdisk", "podium", "rollup", "skylt"],
    basSet: ["scenvagg", "regdisk", "rollup"],
    merch: ["lanyard", "anteckningsbok", "pennor", "vattenflaskor", "pasar", "muggar", "teknik", "profilklader"],
    defaults: ["lanyard", "anteckningsbok", "pennor", "vattenflaskor", "pasar"],
    scales: ["lanyard", "anteckningsbok", "pennor", "vattenflaskor", "pasar", "teknik"],
    qty: { pennor: 200, vattenflaskor: 200, pasar: 200, anteckningsbok: 200, profilklader: 10 },
    audience: ["Under 100", "100–300", "300–1 000", "1 000+"],
    factors: [0.5, 1, 2.5, 5],
    lead: { set: 10, merch: 7 },
    places: {
      scenvagg: at({ x: 37, y: 22 }, { cx: 52, cy: 28, w: 58 }, { spot43: { x: 39, y: 29 }, crop43: { cx: 52, cy: 36, w: 56 } }),
      podium: at({ x: 35, y: 37 }, { cx: 35, cy: 37, w: 14 }, { spot43: { x: 36, y: 41 }, crop43: { cx: 36, cy: 41, w: 13 } }),
      regdisk: at({ x: 72, y: 70 }, { cx: 72, cy: 70, w: 50 }, { spot43: { x: 70, y: 69 }, crop43: { cx: 72, cy: 70, w: 48 } }),
      rollup: at({ x: 8, y: 36 }, { cx: 8, cy: 40, w: 16 }, { spot43: { x: 11, y: 41 }, crop43: { cx: 11, cy: 44, w: 16 } }),
      skylt: at({ x: 22, y: 45 }, { cx: 22, cy: 48, w: 14 }, { spot43: { x: 24, y: 48 }, crop43: { cx: 24, cy: 50, w: 13 } }),
      lanyard: at({ x: 73, y: 41 }, undefined, { spot43: { x: 71, y: 47 } }),
      anteckningsbok: at({ x: 90, y: 56 }, undefined, { spot43: { x: 86, y: 57 } }),
      vattenflaskor: at({ x: 95, y: 52 }, undefined, { spot43: { x: 92, y: 55 } }),
    },
    detailCrops: { "3:2": [{ cx: 54, cy: 26, w: 44 }, { cx: 74, cy: 56, w: 40 }], "4:3": [{ cx: 54, cy: 34, w: 44 }, { cx: 74, cy: 62, w: 40 }] },
    placeholders: { "3:2": "/demo/scene-konferens.jpg", "4:3": "/demo/scene-konferens-43.jpg" },
  },
  kickoff: {
    id: "kickoff",
    label: "Kick-off",
    blurb: "Bygg laganda med produkter som engagerar",
    image: "/demo/card-kickoff.jpg",
    the: "kick-offen",
    title: "Kick-off",
    startTitle: "Skapa er kick-off",
    startSub: "Ange företagets webbadress så klär vi lokalen och laget i er logga och era färger, med produkter som engagerar.",
    cta: "Skapa min kick-off",
    creating: "Skapar kick-off för",
    ready: (n) => `Kick-offen för ${n} är klar`,
    again: "en ny kick-off",
    whole: "hela lokalen",
    setTitle: "Lokalen",
    orderAll: "Beställ kick-offen som den ser ut",
    orderShort: "Beställ kick-offen",
    dateQuestion: "När är kick-offen?",
    dateLabel: "Kick-offen",
    pdfDateLabel: "Datum för kick-offen",
    people: "deltagare",
    bigOne: "en stor kick-off",
    pitch: "kick-off-profilering",
    shareText: "Kan du godkänna offerten för kick-offen?",
    themeLabel: "Tema på bannerväggen",
    loading: {
      title: "Klär lokalen…",
      sub: (n) => `Vi bygger en unik kick-off för ${n}.`,
      tailoring: "Anpassar kick-offen för",
      stages: review([
        [0, "Klär lokalen…"],
        [4, "Trycker bannerväggen…"],
        [8, "Dukar borden…"],
        [12, "Klär laget i profilkläder…"],
      ]),
    },
    details: ["Detalj: laget i profilkläder", "Detalj: dukat bord och välkomstpåsar"],
    set: ["bannervagg", "bordsduk", "beachflagga", "valkomstskylt"],
    basSet: ["bannervagg", "bordsduk"],
    merch: ["hoodies", "tshirts", "kepsar", "vattenflaskor", "ryggsackar", "termosmuggar", "godis", "giveaways"],
    defaults: ["hoodies", "kepsar", "vattenflaskor", "ryggsackar", "godis"],
    scales: ["hoodies", "tshirts", "kepsar", "vattenflaskor", "ryggsackar", "termosmuggar", "giveaways", "godis"],
    qty: { bordsduk: 4, vattenflaskor: 50, giveaways: 50 },
    audience: ["Under 30", "30–100", "100–300", "300+"],
    factors: [0.4, 1, 3, 6],
    lead: { set: 8, merch: 10 },
    places: {
      bannervagg: at({ x: 50, y: 17 }, { cx: 50, cy: 30, w: 56 }, { spot43: { x: 50, y: 26 }, crop43: { cx: 50, cy: 40, w: 52 } }),
      bordsduk: at({ x: 18, y: 72 }, { cx: 18, cy: 72, w: 26 }, { spot43: { x: 21, y: 70 }, crop43: { cx: 21, cy: 72, w: 26 } }),
      beachflagga: at({ x: 7, y: 25 }, { cx: 7, cy: 30, w: 13 }, { spot43: { x: 11, y: 34 }, crop43: { cx: 11, cy: 35, w: 12 } }),
      valkomstskylt: at({ x: 93, y: 43 }, { cx: 93, cy: 44, w: 14 }, { spot43: { x: 90, y: 46 }, crop43: { cx: 90, cy: 47, w: 13 } }),
      hoodies: at({ x: 36, y: 38 }, undefined, { spot43: { x: 37, y: 43 } }),
      kepsar: at({ x: 17, y: 58 }, undefined, { spot43: { x: 21, y: 58 } }),
      vattenflaskor: at({ x: 14, y: 54 }, undefined, { spot43: { x: 17, y: 55 } }),
      ryggsackar: at({ x: 82, y: 55 }, undefined, { spot43: { x: 79, y: 56 } }),
      termosmuggar: at({ x: 74, y: 57 }, undefined, { spot43: { x: 73, y: 57 } }),
    },
    detailCrops: { "3:2": [{ cx: 50, cy: 45, w: 40 }, { cx: 80, cy: 68, w: 34 }], "4:3": [{ cx: 50, cy: 47, w: 44 }, { cx: 76, cy: 68, w: 34 }] },
    placeholders: { "3:2": "/demo/scene-kickoff.jpg", "4:3": "/demo/scene-kickoff-43.jpg" },
  },
  event: {
    id: "event",
    label: "Event",
    blurb: "Gör ert event oförglömligt",
    image: "/demo/card-event.jpg",
    the: "eventet",
    title: "Event",
    startTitle: "Skapa ert event",
    startSub: "Ange företagets webbadress så bygger vi fotovägg, bar och mingel med er logga, era färger och produkter som gästerna minns.",
    cta: "Skapa mitt event",
    creating: "Skapar event för",
    ready: (n) => `Eventet för ${n} är klart`,
    again: "ett nytt event",
    whole: "hela eventmiljön",
    setTitle: "Eventmiljön",
    orderAll: "Beställ eventet som det ser ut",
    orderShort: "Beställ eventet",
    dateQuestion: "När är eventet?",
    dateLabel: "Eventet",
    pdfDateLabel: "Eventdatum",
    people: "gäster",
    bigOne: "ett stort event",
    pitch: "eventprofilering",
    shareText: "Kan du godkänna offerten för eventet?",
    themeLabel: "Kvällens tema",
    loading: {
      title: "Bygger eventet…",
      sub: (n) => `Vi bygger ett unikt event för ${n}.`,
      tailoring: "Anpassar eventet för",
      stages: review([
        [0, "Bygger eventet…"],
        [4, "Trycker fotoväggen…"],
        [8, "Ställer i ordning baren…"],
        [12, "Dukar cocktailborden…"],
      ]),
    },
    details: ["Detalj: fotovägg", "Detalj: bar och glas med gravyr"],
    set: ["fotovagg", "bardisk", "cocktailbord", "beachflagga", "skylt"],
    basSet: ["fotovagg", "bardisk"],
    merch: ["glas", "servetter", "pasar", "godis", "muggar", "kepsar", "paraplyer", "giveaways"],
    defaults: ["glas", "servetter", "pasar", "godis"],
    scales: ["glas", "servetter", "pasar", "godis", "giveaways"],
    qty: { cocktailbord: 4, pasar: 150, godis: 10 },
    audience: ["Under 100", "100–300", "300–1 000", "1 000+"],
    factors: [0.5, 1, 2.5, 5],
    lead: { set: 10, merch: 7 },
    places: {
      fotovagg: at({ x: 25, y: 32 }, { cx: 30, cy: 40, w: 34 }, { spot43: { x: 27, y: 40 }, crop43: { cx: 32, cy: 46, w: 32 } }),
      bardisk: at({ x: 80, y: 60 }, { cx: 80, cy: 62, w: 38 }, { spot43: { x: 77, y: 61 }, crop43: { cx: 80, cy: 64, w: 40 } }),
      cocktailbord: at({ x: 48, y: 67 }, { cx: 48, cy: 72, w: 18 }, { spot43: { x: 48, y: 66 }, crop43: { cx: 48, cy: 69, w: 18 } }),
      beachflagga: at({ x: 5, y: 33 }, { cx: 5, cy: 33, w: 13 }, { spot43: { x: 11, y: 40 }, crop43: { cx: 11, cy: 39, w: 12 } }),
      skylt: at({ x: 12, y: 49 }, { cx: 12, cy: 50, w: 12 }, { spot43: { x: 16, y: 51 }, crop43: { cx: 16, cy: 52, w: 11 } }),
      glas: at({ x: 71, y: 45 }, undefined, { spot43: { x: 68, y: 48 } }),
      servetter: at({ x: 94, y: 49 }, undefined, { spot43: { x: 92, y: 52 } }),
    },
    detailCrops: { "3:2": [{ cx: 30, cy: 42, w: 36 }, { cx: 80, cy: 50, w: 38 }], "4:3": [{ cx: 32, cy: 45, w: 34 }, { cx: 80, cy: 55, w: 38 }] },
    placeholders: { "3:2": "/demo/scene-event.jpg", "4:3": "/demo/scene-event-43.jpg" },
  },
};

export const EVENT_LIST = EVENT_IDS.map((id) => EVENTS[id]);

export const isEventId = (v: unknown): v is EventId => typeof v === "string" && (EVENT_IDS as readonly string[]).includes(v);
/** Older quotes and links stored the Swedish label ("Mässa") or nothing at all. */
export const eventOf = (v: unknown): EventConfig => (isEventId(v) ? EVENTS[v] : (EVENT_LIST.find((e) => e.label === v) ?? EVENTS.massa));

export const placeOf = (p: Product, f: BoothFormat, ev: EventId) => {
  const pl = EVENTS[ev].places[p.id];
  return pl ? (f === "4:3" ? { spot: pl.spot43, crop: pl.crop43 } : { spot: pl.spot, crop: pl.crop }) : {};
};
export const cropOf = (p: Product, f: BoothFormat, ev: EventId) => placeOf(p, f, ev).crop;
export const spotOf = (p: Product, f: BoothFormat, ev: EventId) => placeOf(p, f, ev).spot;
export const qtyOf = (p: Product, ev: EventId) => EVENTS[ev].qty[p.id] ?? p.defaultQty;

export { at as placeAt };
