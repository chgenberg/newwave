import { type NwProduct, nwProduct } from "./catalog";
import { MIN_QTY } from "./reseller";

/**
 * Tillfällena som en företagskund kan planera i återförsäljarens butik. Varje tillfälle har en neutral scen med
 * "DIN LOGO"-ytor som brandas med kundens logga, och ett förslag på produkter som passar tillfället.
 */

export const OCCASION_IDS = ["massa", "konferens", "kickoff", "sommar", "event", "julklapp"] as const;
export type OccasionId = (typeof OCCASION_IDS)[number];

export const isOccasion = (v: unknown): v is OccasionId => typeof v === "string" && (OCCASION_IDS as readonly string[]).includes(v);

/** `ratio` är antal per person; personalplagg har låg kvot och landar på minsta upplagan. */
type Suggestion = { id: string; ratio: number };

export type Occasion = {
  id: OccasionId;
  name: string;
  hint: string;
  scene: string;
  /** "Er monter", "Er konferens" … – rubriken över den brandade scenen. */
  title: string;
  people: string;
  stages: string[];
  products: Suggestion[];
};

export const OCCASIONS: Occasion[] = [
  {
    id: "massa",
    name: "Mässa",
    hint: "Monter, personalkläder och giveaways",
    scene: "/newwave/occasions/massa.jpg",
    title: "Er monter",
    people: "besökare",
    stages: ["Bygger montern…", "Trycker mässväggen…", "Klär personalen i profilkläder…", "Ställer fram giveaways…"],
    products: [
      { id: "p003", ratio: 0.03 },
      { id: "p014", ratio: 0.5 },
      { id: "p024", ratio: 1 },
      { id: "p020", ratio: 0.3 },
      { id: "p011", ratio: 0.2 },
      { id: "p028", ratio: 0.05 },
      { id: "p022", ratio: 0.1 },
    ],
  },
  {
    id: "konferens",
    name: "Konferens",
    hint: "Block, pennor och namnband till deltagarna",
    scene: "/newwave/occasions/konferens.jpg",
    title: "Er konferens",
    people: "deltagare",
    stages: ["Bygger scenen…", "Trycker scenväggen…", "Dukar registreringen…", "Lägger fram deltagarnas kit…"],
    products: [
      { id: "p028", ratio: 1 },
      { id: "p026", ratio: 1 },
      { id: "p025", ratio: 1 },
      { id: "p020", ratio: 1 },
      { id: "p014", ratio: 1 },
      { id: "p017", ratio: 0.2 },
      { id: "p003", ratio: 0.05 },
    ],
  },
  {
    id: "kickoff",
    name: "Kick-off",
    hint: "Kläder och prylar som bygger laget",
    scene: "/newwave/occasions/kickoff.jpg",
    title: "Er kick-off",
    people: "kollegor",
    stages: ["Klär lokalen…", "Trycker bannerväggen…", "Klär laget i hoodies…", "Packar ryggsäckarna…"],
    products: [
      { id: "p004", ratio: 1 },
      { id: "p001", ratio: 1 },
      { id: "p011", ratio: 1 },
      { id: "p020", ratio: 1 },
      { id: "p015", ratio: 1 },
      { id: "p021", ratio: 0.5 },
    ],
  },
  {
    id: "sommar",
    name: "Sommarfest",
    hint: "Utomhus, sol och svalka",
    scene: "/newwave/occasions/sommar.jpg",
    title: "Er sommarfest",
    people: "gäster",
    stages: ["Dukar upp vid sjön…", "Trycker fotoväggen…", "Klär laget i sommarkläder…", "Packar kylväskorna…"],
    products: [
      { id: "p001", ratio: 1 },
      { id: "p011", ratio: 1 },
      { id: "p023", ratio: 1 },
      { id: "p018", ratio: 0.1 },
      { id: "p035", ratio: 0.1 },
      { id: "p036", ratio: 0.3 },
      { id: "p034", ratio: 0.05 },
    ],
  },
  {
    id: "event",
    name: "Fest och event",
    hint: "Mingel, bar och det gästerna minns",
    scene: "/newwave/occasions/event.jpg",
    title: "Ert event",
    people: "gäster",
    stages: ["Bygger eventet…", "Trycker fotoväggen…", "Ställer i ordning baren…", "Slår in gåvorna…"],
    products: [
      { id: "p037", ratio: 0.05 },
      { id: "p022", ratio: 0.5 },
      { id: "p014", ratio: 1 },
      { id: "p039", ratio: 1 },
      { id: "p029", ratio: 0.2 },
      { id: "p011", ratio: 0.3 },
    ],
  },
  {
    id: "julklapp",
    name: "Julfest och julklapp",
    hint: "Gåvor att ge bort och ta med hem",
    scene: "/newwave/occasions/julklapp.jpg",
    title: "Er julklapp",
    people: "medarbetare",
    stages: ["Dukar julbordet…", "Slår in paketen…", "Trycker presentaskarna…", "Lägger fram julklapparna…"],
    products: [
      { id: "p038", ratio: 1 },
      { id: "p039", ratio: 1 },
      { id: "p012", ratio: 1 },
      { id: "p021", ratio: 1 },
      { id: "p022", ratio: 0.5 },
      { id: "p005", ratio: 0.5 },
    ],
  },
];

export const occasion = (id: string) => OCCASIONS.find((o) => o.id === id);

/** Tillfällena butiken erbjuder. De tar med sina egna produkter, oavsett vad som ligger i butikens sortiment. */
export const offeredOccasions = (r: { occasions?: OccasionId[] }) => OCCASIONS.filter((o) => !r.occasions || r.occasions.includes(o.id));

/** Det kunderna kan beställa i butiken: sortimentet plus produkterna i tillfällena som erbjuds. */
export const sellableProducts = (r: { products: string[]; occasions?: OccasionId[] }) => new Set([...r.products, ...offeredOccasions(r).flatMap((o) => o.products.map((p) => p.id))]);

export const GROUP_SIZES = [25, 50, 100, 250, 500] as const;

/** Tillfällets produkter med föreslagen upplaga för gruppen. */
export function occasionProducts(o: Occasion, people: number): { product: NwProduct; qty: number }[] {
  return o.products.flatMap((pick) => {
    const product = nwProduct(pick.id);
    return product ? [{ product, qty: Math.max(MIN_QTY, Math.round((people * pick.ratio) / 5) * 5) }] : [];
  });
}
