import { CLUBS } from "@/lib/club";
import { nwProduct } from "./catalog";
import { APPROVALS, ASA_IF } from "./club";
import { CLUB_CASE } from "./clubCase";
import { CRAFT_CLUBS } from "./craft";
import { defaultDesign, type Design, METHOD_INFO } from "./marking";
import type { ApprovalProduct } from "./store";

/**
 * Merch-listan: alla klubbars produkter på ett ställe, med en undersida per klubb. Här säljs ingenting –
 * varje produkt länkar till klubbens butik hos Intersport. Åsa IF:s två färdiga kollektioner har egna
 * produktbilder; de andra klubbarna visas med märket på produktfotot.
 */

export type MerchItem = {
  id: string;
  clubId: string;
  club: string;
  city: string;
  crest: string;
  clubColor: string;
  motif: string;
  productId: string;
  name: string;
  category: string;
  priceSek: number;
  sizes: string[];
  color: string;
  /** Färdig produktbild; utan den läggs märket på produktfotot. */
  image?: string;
  /** Trycket för ljusa och mörka plagg. */
  art: { light: string; dark: string };
  design: Design;
};

const ASA_CREST = "/api/v1/brand/asa-if/skold-farg.png";
const SETS = [
  ["p004", "p011", "p020", "p001"],
  ["p008", "p012", "p014", "p021"],
  ["p005", "p016", "p022", "p011"],
  ["p001", "p012", "p035", "p026"],
];

function item(base: Omit<MerchItem, "id" | "productId" | "name" | "category" | "priceSek" | "sizes" | "color" | "image" | "design">, p: ApprovalProduct | string, slug: string): MerchItem | null {
  const id = typeof p === "string" ? p : p.id;
  const product = nwProduct(id);
  if (!product) return null;
  const own = typeof p === "string" ? undefined : p;
  return {
    ...base,
    id: `${base.clubId}-${slug}-${id}`,
    productId: id,
    name: product.name,
    category: product.category,
    priceSek: own?.priceSek ?? product.priceSek,
    sizes: product.sizes,
    color: own?.custom?.color ?? product.garmentHex,
    image: own?.mockupUrl || undefined,
    design: own?.custom?.design ?? fullColor(defaultDesign(product)),
  };
}

/** Märket trycks i sina egna färger, så att produkten ser ut som bilden. */
const fullColor = (d: Design): Design => ({ ...d, colors: METHOD_INFO[d.method].fixedColors ?? METHOD_INFO[d.method].maxColors });

function build(): MerchItem[] {
  const asa = { clubId: ASA_IF.id, club: ASA_IF.name, city: "Åsa", crest: ASA_IF.logo, clubColor: ASA_IF.brand.primary };
  const cup = APPROVALS.find((a) => a.id === "a3");
  const own = [
    ...CLUB_CASE.products.map((p) => item({ ...asa, motif: CLUB_CASE.title, art: CLUB_CASE.printFiles }, p, "klubbandan")),
    ...(cup?.products ?? []).map((p) => item({ ...asa, motif: "Åsa Cupen 2026", art: { light: ASA_CREST, dark: ASA_CREST } }, p, "cupen")),
  ];
  const others = CRAFT_CLUBS.filter((c) => c.id !== ASA_IF.id && c.logo).flatMap((c, i) =>
    SETS[i % SETS.length].map((p) => item({ clubId: c.id, club: c.name, city: c.city, crest: c.logo!, clubColor: c.colors[0], motif: "Klubbmärket", art: { light: c.logo!, dark: c.logoDark ?? c.logo! } }, p, "marke")),
  );
  const list = [...own, ...others].filter((x): x is MerchItem => x !== null);
  // Klubbarna blandas så att rutnätet inte blir en klubb i taget; Åsa IF:s veckokollektion först.
  const byClub = new Map<string, MerchItem[]>();
  for (const x of list) byClub.set(`${x.clubId}:${x.motif}`, [...(byClub.get(`${x.clubId}:${x.motif}`) ?? []), x]);
  const queues = [...byClub.values()];
  const mixed: MerchItem[] = [];
  for (let round = 0; mixed.length < list.length; round++) for (const q of queues) if (q[round]) mixed.push(q[round]);
  return mixed;
}

export const MERCH: MerchItem[] = build();

/** Fotografier av produkterna i bruk. Varje bild hör till en produkt och öppnar den; de breda står över hela rutnätet. */
export type MerchScene = {
  id: string;
  itemId: string;
  src: string;
  caption: string;
  /** Hela bredden; `focus` är var bilden beskärs i höjdled. */
  wide?: { focus: string };
};

const scene = (id: string, itemId: string, caption: string, wide?: MerchScene["wide"]): MerchScene => ({ id, itemId, src: `/newwave/merch/scenes/${id}.jpg`, caption, wide });

export const MERCH_SCENES: MerchScene[] = [
  scene("goteborg-hoodie", "ifk-goteborg-marke-p004", "Kvällsmatch på läktaren"),
  scene("fjaras-filt", "fjaras-bk-marke-p035", "Söndag i soffan"),
  scene("lerum-sweat", "lerums-is-marke-p005", "Fika i solen"),
  scene("kungsbacka-mossa", "kungsbacka-if-marke-p012", "Vinterträning"),
  scene("onsala-mugg", "onsala-bk-marke-p022", "Morgonkaffe"),
  scene("partille-tee", "partille-if-marke-p008", "Träning i hallen"),
  scene("tolo-keps", "tolo-if-marke-p011", "Lördag vid sidlinjen"),
  scene("alingsas-filt", "alingsas-hk-marke-p035", "Picknick på cupen"),
  scene("varberg-kasse", "varbergs-gif-marke-p014", "Promenad vid fästningen"),
  scene("molndal-hoodie", "molndals-ibk-marke-p004", "Efter träningen"),
  scene("torslanda-bag", "torslanda-hk-marke-p016", "Packad och klar"),
  scene("stenungsund-flaska", "stenungsunds-if-marke-p020", "I omklädningsrummet"),
  scene("asa-hoodie", "asa-if-klubbandan-p004", "Kväll på klipporna i Åsa", { focus: "50% 62%" }),
  scene("kungsbacka-termos", "kungsbacka-if-marke-p021", "Kvällsmatch i november", { focus: "50% 10%" }),
  scene("asa-cup", "asa-if-cupen-p001", "Mål på Åsa Cupen", { focus: "50% 35%" }),
];

export type MerchClub = {
  id: string;
  name: string;
  /** Namnet i genitiv: "Åsa IF:s", "Lerums IS:s". */
  owner: string;
  crest: string;
  color: string;
  city: string;
  region: string;
  country: string;
  sports: string[];
  count: number;
  motifs: string[];
  about: string;
  /** Klubbens butik hos Intersport, där produkterna säljs. */
  shopUrl: string;
  /** Klubbens egen sida i Next Wave, där klubben själv kan ta fram nya varianter. */
  ownPage?: string;
};

const list = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} och ${words.at(-1)}` : (words[0] ?? ""));

function aboutClub(c: (typeof CRAFT_CLUBS)[number], motifs: string[]) {
  const sports = list(c.sports.map((s, i) => (i ? s.toLowerCase() : s)));
  const since = c.id === ASA_IF.id ? `, sedan ${ASA_IF.founded}` : "";
  const what = motifs.length > 1 ? `Just nu ${list(motifs.map((m) => `”${m}”`))}.` : "Klubbmärket i klubbens färger på kläder och prylar.";
  return `${sports} i ${c.city}${since}. ${what} Allt trycks på beställning och säljs i klubbens butik hos Intersport – varje köp stöttar föreningen.`;
}

export const MERCH_CLUBS: MerchClub[] = CRAFT_CLUBS.flatMap((c) => {
  const items = MERCH.filter((x) => x.clubId === c.id);
  if (!items.length) return [];
  const motifs = [...new Set(items.map((x) => x.motif))];
  return [
    {
      id: c.id,
      name: c.name,
      owner: /[A-ZÅÄÖ]{2,}$/.test(c.name) ? `${c.name}:s` : /[sxz]$/.test(c.name) ? c.name : `${c.name}s`,
      crest: items[0].crest,
      color: items[0].clubColor,
      city: c.city,
      region: c.region,
      country: "Sverige",
      sports: c.sports,
      count: items.length,
      motifs,
      about: aboutClub(c, motifs),
      shopUrl: CLUBS[c.id]?.intersportShopUrl ?? `https://www.intersport.se/klubbshop/${c.id}`,
      ownPage: c.dashboard,
    },
  ];
});

export const merchClub = (id: string) => MERCH_CLUBS.find((c) => c.id === id);
