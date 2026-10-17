import { randomUUID } from "node:crypto";
import { nwProduct } from "./catalog";
import { defaultDesign, METHOD_INFO, type Method } from "./marking";
import { agreedLine, type CustomerShop, priceQuote, type Quote, type QuoteEvent, type QuoteLine, type QuoteLineInput, type QuoteStatus, type Reseller } from "./reseller";
import { readData, writeData } from "./workspace";

/** Återförsäljarnas butiker, kundbutiker och offerter. Demodata skapas första gången. */

type State = { resellers: Reseller[]; quotes: Quote[]; customerShops: CustomerShop[] };

const FILE = "newwave/shop/state.json";

/** Återförsäljaren som är inloggad i demon. */
export const CURRENT_RESELLER = "vastkust-profil";

const DAY = 86_400_000;
const iso = (offsetDays: number, now = Date.now()) => new Date(now + offsetDays * DAY).toISOString();
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);

export const newToken = () => randomUUID().replace(/-/g, "").slice(0, 20);

function seedResellers(): Reseller[] {
  return [
    {
      id: "vastkust-profil",
      slug: "vastkust-profil",
      name: "Västkust Profil",
      city: "Kungsbacka",
      website: "vastkustprofil.se",
      logo: "/newwave/resellers/vastkust-profil/logo.png",
      logoDark: "/newwave/resellers/vastkust-profil/logo-vit.png",
      theme: { primary: "#0E3B43", accent: "#F2B23E", background: "#F6F4EF" },
      texts: {
        shopName: "Västkust Profil",
        tagline: "Profilkläder och merch till företag i Halland",
        heroTitle: "Er logga på allt ni bär och delar ut",
        heroText: "Ladda upp loggan, se den på produkten i 3D och få en offert direkt. Vi trycker i Sverige och levererar på två veckor.",
        about: "Vi har klätt företag, föreningar och event på västkusten sedan 2009. Ni får en kontaktperson, ett provtryck innan vi kör och leverans till dörren.",
        email: "order@vastkustprofil.se",
        phone: "0300-12 34 56",
      },
      products: ["p001", "p002", "p004", "p005", "p007", "p009", "p011", "p013", "p016", "p019", "p021", "p024", "p026", "p029", "p031", "p034", "p037"],
      markup: 10,
      status: "publicerad",
      createdAt: iso(-62),
      updatedAt: iso(-3),
      publishedAt: iso(-58),
    },
    {
      id: "norrsken-reklam",
      slug: "norrsken-reklam",
      name: "Norrsken Reklam",
      city: "Luleå",
      website: "norrskenreklam.se",
      logo: "/newwave/resellers/norrsken-reklam/logo.png",
      logoDark: "/newwave/resellers/norrsken-reklam/logo-vit.png",
      theme: { primary: "#1B1F3B", accent: "#7FD1B9", background: "#F3F5F8" },
      texts: {
        shopName: "Norrsken Reklam",
        tagline: "Profil och merch från norr",
        heroTitle: "Merch som klarar vintern",
        heroText: "Varma plagg och tåliga produkter med ert tryck. Välj, designa och be om offert på några minuter.",
        about: "Reklambyrå och profilleverantör i Luleå sedan 1998.",
        email: "hej@norrskenreklam.se",
        phone: "0920-55 44 33",
      },
      products: ["p001", "p004", "p007", "p011", "p012", "p016", "p021", "p026", "p031"],
      markup: 15,
      status: "publicerad",
      createdAt: iso(-40),
      updatedAt: iso(-12),
      publishedAt: iso(-38),
    },
    {
      id: "profilmakarna",
      slug: "profilmakarna",
      name: "Profilmakarna",
      city: "Malmö",
      website: "profilmakarna.se",
      logo: "/newwave/resellers/profilmakarna/logo.png",
      logoDark: "/newwave/resellers/profilmakarna/logo-vit.png",
      theme: { primary: "#8C1C13", accent: "#F4D35E", background: "#FBF7F2" },
      texts: { shopName: "Profilmakarna", tagline: "", heroTitle: "", heroText: "", about: "", email: "", phone: "" },
      products: [],
      markup: 0,
      status: "utkast",
      createdAt: iso(-2),
      updatedAt: iso(-1),
    },
  ];
}

type SeedQuote = {
  resellerId: string;
  company: Quote["company"];
  logo: string;
  status: QuoteStatus;
  ageDays: number;
  needBy: number;
  message?: string;
  lines: { productId: string; method: Method; colors?: number; sizes: Record<string, number> }[];
};

const K = (slug: string) => `/newwave/resellers/kunder/${slug}.png`;

const SEED_QUOTES: SeedQuote[] = [
  {
    resellerId: "vastkust-profil",
    company: { name: "Hamnkrogen i Varberg", contact: "Sara Lind", email: "sara@hamnkrogen.se", phone: "070-111 22 33" },
    logo: K("hamnkrogen"),
    status: "ny",
    ageDays: 0,
    needBy: 21,
    message: "Personalkläder inför sommarsäsongen. Gärna förklädet i samma ton som tröjorna.",
    lines: [
      { productId: "p001", method: "screentryck", colors: 1, sizes: { S: 6, M: 10, L: 8, XL: 4 } },
      { productId: "p037", method: "transfer", colors: 1, sizes: { "One size": 20 } },
    ],
  },
  {
    resellerId: "vastkust-profil",
    company: { name: "KB Bygg & Mark", contact: "Johan Ek", email: "johan@kbbygg.se" },
    logo: K("kb-bygg"),
    status: "ny",
    ageDays: 1,
    needBy: 30,
    lines: [
      { productId: "p004", method: "brodyr", colors: 2, sizes: { M: 8, L: 14, XL: 10, XXL: 4 } },
      { productId: "p011", method: "brodyr", colors: 2, sizes: { "One size": 36 } },
    ],
  },
  {
    resellerId: "vastkust-profil",
    company: { name: "Solvikens förskola", contact: "Maria Holm", email: "maria@solviken.se" },
    logo: K("solviken"),
    status: "skickad",
    ageDays: 4,
    needBy: 18,
    message: "T-shirts till barnen och sweatshirts till personalen.",
    lines: [
      { productId: "p001", method: "dtg", colors: 1, sizes: { "110/116": 12, "122/128": 14, "134/140": 8 } },
      { productId: "p005", method: "dtg", colors: 1, sizes: { S: 4, M: 6, L: 2 } },
    ],
  },
  {
    resellerId: "vastkust-profil",
    company: { name: "TechVäst AB", contact: "Ali Reza", email: "ali@techvast.se", phone: "073-444 55 66" },
    logo: K("techvast"),
    status: "godkänd",
    ageDays: 9,
    needBy: 12,
    message: "Till vår mässa i november.",
    lines: [
      { productId: "p005", method: "screentryck", colors: 2, sizes: { S: 10, M: 30, L: 30, XL: 10 } },
      { productId: "p021", method: "gravyr", colors: 1, sizes: { "One size": 150 } },
      { productId: "p024", method: "gravyr", colors: 1, sizes: { "One size": 150 } },
    ],
  },
  {
    resellerId: "vastkust-profil",
    company: { name: "Brf Strandängen", contact: "Eva Nord", email: "styrelsen@strandangen.se" },
    logo: K("strandangen"),
    status: "produktion",
    ageDays: 16,
    needBy: 5,
    lines: [{ productId: "p019", method: "gravyr", colors: 1, sizes: { "One size": 120 } }],
  },
  {
    resellerId: "vastkust-profil",
    company: { name: "Kaffebaren Lyktan", contact: "Leo Berg", email: "leo@lyktan.se" },
    logo: K("lyktan"),
    status: "levererad",
    ageDays: 34,
    needBy: -6,
    lines: [
      { productId: "p009", method: "transfer", colors: 1, sizes: { S: 4, M: 6, L: 4 } },
      { productId: "p031", method: "digitaltryck", colors: 1, sizes: { "One size": 60 } },
    ],
  },
  {
    resellerId: "norrsken-reklam",
    company: { name: "Arctic Rafting", contact: "Nils Sarri", email: "nils@arcticrafting.se" },
    logo: K("arctic-rafting"),
    status: "produktion",
    ageDays: 11,
    needBy: 8,
    lines: [
      { productId: "p007", method: "brodyr", colors: 1, sizes: { S: 6, M: 12, L: 12, XL: 6 } },
      { productId: "p012", method: "brodyr", colors: 1, sizes: { "One size": 40 } },
    ],
  },
  {
    resellerId: "norrsken-reklam",
    company: { name: "Luleå Elservice", contact: "Karin Öhman", email: "karin@luleael.se" },
    logo: K("lulea-el"),
    status: "godkänd",
    ageDays: 3,
    needBy: 20,
    lines: [{ productId: "p004", method: "screentryck", colors: 2, sizes: { M: 10, L: 16, XL: 10, XXL: 4 } }],
  },
];

const EVENTS: Record<QuoteStatus, (q: SeedQuote) => QuoteEvent[]> = {
  ny: (q) => [{ at: iso(-q.ageDays), who: q.company.contact, text: "Skickade en förfrågan från webbshoppen." }],
  skickad: (q) => [...EVENTS.ny(q), { at: iso(-q.ageDays + 1), who: "Västkust Profil", text: "Skickade offerten till kunden." }],
  godkänd: (q) => [...EVENTS.skickad(q), { at: iso(-q.ageDays + 2), who: q.company.contact, text: "Godkände offerten. Ordern gick till New Wave." }],
  produktion: (q) => [...EVENTS.godkänd(q), { at: iso(-q.ageDays + 3), who: "New Wave", text: "Provtryck godkänt, ordern ligger i produktion." }],
  levererad: (q) => [...EVENTS.produktion(q), { at: iso(-q.ageDays + 12), who: "New Wave", text: "Levererad till kunden." }],
  nekad: (q) => [...EVENTS.skickad(q), { at: iso(-q.ageDays + 2), who: q.company.contact, text: "Tackade nej till offerten." }],
};

function seedQuotes(resellers: Reseller[]): Quote[] {
  return SEED_QUOTES.map((s, i) => {
    const r = resellers.find((x) => x.id === s.resellerId)!;
    const priced = priceQuote(
      s.lines.map(({ productId, method, colors, sizes }) => {
        const p = nwProduct(productId)!;
        return { productId, sizes, design: { ...defaultDesign(p, method), ...(colors && !METHOD_INFO[method].fixedColors ? { colors } : {}) }, color: p.garmentHex, logo: s.logo, logoDark: s.logo.replace(/\.png$/, "-vit.png") };
      }),
      r.markup,
    );
    const events = EVENTS[s.status](s).map((e) => (e.who === "Västkust Profil" ? { ...e, who: r.name } : e));
    return {
      id: `Q-${2041 + i}`,
      token: newToken(),
      resellerId: s.resellerId,
      company: s.company,
      needBy: date(s.needBy),
      message: s.message,
      ...priced,
      status: s.status,
      createdAt: iso(-s.ageDays),
      validUntil: s.status === "ny" ? undefined : date(-s.ageDays + 31),
      reply: s.status === "ny" ? undefined : `Hej ${s.company.contact.split(" ")[0]}! Här är offerten. Hör av er om ni vill ändra något.`,
      events,
    };
  });
}

let chain: Promise<unknown> = Promise.resolve();

async function load(): Promise<State> {
  let state: State | null = null;
  try {
    const raw = await readData(FILE);
    if (raw) state = JSON.parse(raw) as State;
  } catch {}
  if (state?.customerShops) return state;
  if (!state) {
    const resellers = seedResellers();
    state = { resellers, quotes: seedQuotes(resellers), customerShops: [] };
  }
  seedCustomerShops(state);
  await save(state);
  return state;
}

const save = (state: State) => writeData(FILE, JSON.stringify(state, null, 2));

export const readShop = () => load();

/** Läs, ändra och spara i tur och ordning, så att samtidiga anrop inte skriver över varandra. */
export function updateShop<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const state = await load();
    const out = await fn(state);
    await save(state);
    return out;
  });
  chain = run.catch(() => undefined);
  return run;
}

export async function getReseller(id: string) {
  return (await load()).resellers.find((r) => r.id === id) ?? null;
}

export async function getResellerBySlug(slug: string) {
  return (await load()).resellers.find((r) => r.slug === slug) ?? null;
}

export async function quotesFor(resellerId: string) {
  return (await load()).quotes.filter((q) => q.resellerId === resellerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function quoteByToken(token: string) {
  const s = await load();
  const quote = s.quotes.find((q) => q.token === token);
  if (!quote) return null;
  return { quote, reseller: s.resellers.find((r) => r.id === quote.resellerId)! };
}

export const event = (who: string, text: string): QuoteEvent => ({ at: new Date().toISOString(), who, text });

/** `studio` när återförsäljaren själv gjort offerten i designstudion, annars kom förfrågan från webbshoppen. */
export async function createQuote(resellerId: string, input: Pick<Quote, "company" | "needBy" | "message"> & { lines: QuoteLineInput[]; source?: "studio" }) {
  return updateShop((s) => {
    const r = s.resellers.find((x) => x.id === resellerId);
    if (!r) return null;
    const priced = priceQuote(input.lines, r.markup);
    if (!priced.lines.length) return null;
    const quote: Quote = {
      id: nextQuoteId(s),
      token: newToken(),
      resellerId,
      company: input.company,
      needBy: input.needBy,
      message: input.message,
      ...priced,
      status: "ny",
      createdAt: new Date().toISOString(),
      events: [input.source === "studio" ? event(r.name, `Gjorde offerten åt ${input.company.name} i designstudion.`) : event(input.company.contact, "Skickade en förfrågan från webbshoppen.")],
    };
    s.quotes.unshift(quote);
    return quote;
  });
}

// --- Kundbutiker -------------------------------------------------------------

function seedCustomerShops(s: State) {
  const r = s.resellers.find((x) => x.id === CURRENT_RESELLER)!;
  const shop: CustomerShop = {
    id: "ks-techvast",
    token: newToken(),
    resellerId: r.id,
    company: { name: "TechVäst AB", contact: "Ali Reza", email: "ali@techvast.se" },
    logo: K("techvast"),
    logoDark: K("techvast-vit"),
    color: "#5B3FD0",
    products: ["p001", "p005", "p004", "p021", "p024", "p031"],
    markup: r.markup,
    welcome: "Här beställer ni TechVästs kläder och profilprodukter till avtalat pris. Loggan ligger redan på allt.",
    open: true,
    createdAt: iso(-8),
  };
  s.customerShops = [shop];
  s.quotes.unshift(
    shopOrder(s, shop, { contact: "Lina Persson", email: "lina@techvast.se", message: "Till de nyanställda i december." }, [
      { productId: "p005", sizes: { S: 3, M: 5, L: 4 } },
      { productId: "p021", sizes: { "One size": 12 } },
    ], iso(-2))!,
  );
}

const nextQuoteId = (s: State) => `Q-${Math.max(2040, ...s.quotes.map((q) => Number(q.id.slice(2)) || 0)) + 1}`;

type OrderBy = { contact: string; email: string; message?: string };

function shopOrder(s: State, shop: CustomerShop, by: OrderBy, lines: { productId: string; sizes: Record<string, number> }[], at = new Date().toISOString()): Quote | null {
  const priced = lines
    .filter((l) => shop.products.includes(l.productId))
    .map((l) => {
      const p = nwProduct(l.productId);
      return p ? agreedLine({ productId: p.id, sizes: l.sizes, design: defaultDesign(p), color: p.garmentHex, logo: shop.logo, logoDark: shop.logoDark }, shop.markup) : null;
    })
    .filter((l): l is QuoteLine => l !== null && l.qty > 0);
  if (!priced.length) return null;
  return {
    id: nextQuoteId(s),
    token: newToken(),
    resellerId: shop.resellerId,
    company: { name: shop.company.name, contact: by.contact, email: by.email },
    message: by.message,
    lines: priced,
    totalSek: priced.reduce((sum, l) => sum + l.total, 0),
    costSek: priced.reduce((sum, l) => sum + l.cost, 0),
    status: "godkänd",
    createdAt: at,
    customerShopId: shop.id,
    events: [{ at, who: by.contact, text: "Beställde i kundbutiken till avtalat pris. Ordern gick direkt till New Wave." }],
  };
}

export async function customerShopsFor(resellerId: string) {
  return (await load()).customerShops.filter((c) => c.resellerId === resellerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function customerShop(id: string) {
  return (await load()).customerShops.find((c) => c.id === id) ?? null;
}

export async function customerShopByToken(token: string) {
  const s = await load();
  const shop = s.customerShops.find((c) => c.token === token);
  if (!shop) return null;
  return { shop, reseller: s.resellers.find((r) => r.id === shop.resellerId)! };
}

export type CustomerShopInput = Pick<CustomerShop, "company" | "logo" | "logoDark" | "color" | "products" | "markup" | "welcome">;

export function createCustomerShop(resellerId: string, input: CustomerShopInput) {
  return updateShop((s) => {
    const base = `ks-${input.company.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) || "kund"}`;
    let id = base;
    for (let n = 2; s.customerShops.some((c) => c.id === id); n++) id = `${base}-${n}`;
    const shop: CustomerShop = { ...input, id, token: newToken(), resellerId, open: true, createdAt: new Date().toISOString() };
    s.customerShops.unshift(shop);
    return shop;
  });
}

export function changeCustomerShop(resellerId: string, id: string, fn: (c: CustomerShop, s: State) => boolean | void) {
  return updateShop((s) => {
    const shop = s.customerShops.find((c) => c.id === id && c.resellerId === resellerId);
    if (!shop) return null;
    if (fn(shop, s) === false) s.customerShops = s.customerShops.filter((c) => c !== shop);
    return shop;
  });
}

export function orderFromCustomerShop(token: string, by: OrderBy, lines: { productId: string; sizes: Record<string, number> }[]) {
  return updateShop((s) => {
    const shop = s.customerShops.find((c) => c.token === token);
    if (!shop) return { error: "Butiken finns inte", status: 404 } as const;
    if (!shop.open) return { error: "Butiken är stängd", status: 400 } as const;
    const order = shopOrder(s, shop, by, lines);
    if (!order) return { error: "Välj storlek och antal för minst en produkt.", status: 400 } as const;
    s.quotes.unshift(order);
    return { order };
  });
}
