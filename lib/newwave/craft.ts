import { listProducts } from "@/lib/intersport";
import { nwProduct } from "./catalog";
import { colorName } from "./colors";
import type { Customized } from "./marking";
import { genitive } from "./newsletterHtml";
import { isDarkHex } from "./printFiles";
import { ASA_IF } from "./club";
import { type Campaign, type ClubSettings, type CraftRules, type LogItem, DEFAULT_RULES, logItem, readState, updateState } from "./craftState";
import { ONBOARD_STEPS } from "./craftQuery";
import { clubScenes } from "./scenes";
import { serverMockup } from "./serverMockup";
import { addFeed, createApproval, listApprovals, readBrand, type ApprovalStatus } from "./store";
import { wordmarkUrl } from "./wordmark/spec";
import { workspaceId } from "./workspace";

export type CraftClub = {
  id: string;
  name: string;
  city: string;
  region: string;
  sports: string[];
  colors: [string, string];
  logo?: string;
  /** Märket för mörka plagg, när det vanliga försvinner mot svart. */
  logoDark?: string;
  joined: string;
  /** Har varumärkeskit i hubben, så att Craft kan skapa riktigt material åt klubben. */
  live: boolean;
  dashboard?: string;
  /** Klubbens föreningsbutik hos Intersport, när den har en. */
  intersport?: string;
};

export type Review = { score: number; parts: { realism: number; relevance: number; brandFit: number; sales: number }; flags: string[]; summary: string };
export type Gate = "granskas" | "släppt" | "stoppad";

export type CraftMaterial = {
  id: string;
  clubId: string;
  title: string;
  occasion: string;
  kind: string;
  status: ApprovalStatus;
  createdAt: string;
  products: string[];
  image?: string;
  /** Klubbens foto när materialet saknar en egen bild och klubben har ett. */
  photo?: string;
  from: "Klubbens agent" | "Craft";
  campaignId?: string;
  review: Review;
  gate: Gate;
  /** Godkänt av autopiloten utan att kansliet behövde svara. */
  auto?: boolean;
  sold: number;
  /** Produkter som anpassats i designstudion. */
  designs?: Record<string, Customized>;
};

export type ClubStatus = "aktiv" | "lugn" | "inaktiv";

export { ONBOARD_STEPS };

export type ClubRow = CraftClub & {
  status: ClubStatus;
  lastActive: string | null;
  materials: CraftMaterial[];
  onboarding: { steps: boolean[]; done: number; linkSent: boolean };
  settings: ClubSettings;
  stats: {
    created30: number;
    total: number;
    pending: number;
    oldestPending: number;
    queue: number;
    approved: number;
    approvalRate: number;
    avgScore: number;
    inShop: number;
    sold: number;
    revenue: number;
  };
  weekly: number[];
  remindedAt?: string;
};

export type CampaignResult = Campaign & {
  seed: boolean;
  scheduled: boolean;
  clubs: { clubId: string; status: ApprovalStatus | "schemalagd" | "granskas"; sold: number }[];
  approved: number;
  sold: number;
};

const ROSTER: CraftClub[] = [
  { id: "asa-if", name: "Åsa IF", city: "Åsa", region: "Halland", sports: ["Fotboll", "Pingis", "Innebandy"], colors: [ASA_IF.brand.primary, ASA_IF.brand.accent], logo: ASA_IF.logo, joined: "2026-09-01", live: true, dashboard: "/newwave/klubb/oversikt" },
  { id: "ifk-goteborg", name: "IFK Göteborg", city: "Göteborg", region: "Göteborg", sports: ["Fotboll"], colors: ["#234B9A", "#FFFFFF"], logo: "/api/v1/brand/ifk-goteborg/skold-farg.png", joined: "2026-05-12", live: true },
  { id: "kungsbacka-if", name: "Kungsbacka IF", city: "Kungsbacka", region: "Halland", sports: ["Fotboll"], colors: ["#181830", "#FFFFFF"], logo: "/newwave/clubs/kungsbacka-if/logo.png", joined: "2026-03-04", live: false },
  { id: "onsala-bk", name: "Onsala BK", city: "Onsala", region: "Halland", sports: ["Fotboll"], colors: ["#0060A8", "#F0C000"], logo: "/newwave/clubs/onsala-bk/logo.png", joined: "2026-04-18", live: false },
  { id: "fjaras-bk", name: "IFK Fjärås", city: "Fjärås", region: "Halland", sports: ["Fotboll"], colors: ["#D8001A", "#FFFFFF"], logo: "/newwave/clubs/fjaras-bk/logo.png", joined: "2026-02-10", live: false },
  { id: "tolo-if", name: "Tölö IF", city: "Kungsbacka", region: "Halland", sports: ["Fotboll", "Innebandy"], colors: ["#007830", "#FFFFFF"], logo: "/newwave/clubs/tolo-if/logo.png", joined: "2026-06-02", live: false, intersport: "https://team.intersport.se/tolo-if" },
  { id: "varbergs-gif", name: "Varbergs GIF", city: "Varberg", region: "Halland", sports: ["Fotboll", "Friidrott"], colors: ["#004890", "#F2C200"], logo: "/newwave/clubs/varbergs-gif/logo.png", joined: "2026-01-20", live: false },
  { id: "lerums-is", name: "Lerums IS", city: "Lerum", region: "Västra Götaland", sports: ["Fotboll", "Bandy"], colors: ["#43295D", "#FFFFFF"], logo: "/newwave/clubs/lerums-is/logo.png", joined: "2026-03-22", live: false },
  { id: "alingsas-hk", name: "Alingsås HK", city: "Alingsås", region: "Västra Götaland", sports: ["Handboll"], colors: ["#0062A8", "#FFFFFF"], logo: "/newwave/clubs/alingsas-hk/logo.png", joined: "2025-11-08", live: false, intersport: "https://team.intersport.se/alingsas-hk" },
  { id: "stenungsunds-if", name: "Stenungsunds IF", city: "Stenungsund", region: "Västra Götaland", sports: ["Fotboll", "Handboll"], colors: ["#D81830", "#FFFFFF"], logo: "/newwave/clubs/stenungsunds-if/logo.png", joined: "2026-07-15", live: false },
  { id: "partille-if", name: "Partille IF", city: "Partille", region: "Göteborg", sports: ["Fotboll"], colors: ["#B80704", "#FFFFFF"], logo: "/newwave/clubs/partille-if/logo.png", logoDark: "/newwave/clubs/partille-if/logo-vit.png", joined: "2026-04-01", live: false },
  { id: "torslanda-hk", name: "Torslanda HK", city: "Göteborg", region: "Göteborg", sports: ["Handboll"], colors: ["#A81830", "#FFFFFF"], logo: "/newwave/clubs/torslanda-hk/logo.png", joined: "2026-08-19", live: false, intersport: "https://team.intersport.se/torslanda-hk" },
  { id: "hovas-billdal-if", name: "Hovås Billdal IF", city: "Göteborg", region: "Göteborg", sports: ["Fotboll"], colors: ["#183078", "#FFFFFF"], logo: "/newwave/clubs/hovas-billdal-if/logo.png", joined: "2025-12-01", live: false },
  { id: "molndals-ibk", name: "Mölndals IBF", city: "Mölndal", region: "Göteborg", sports: ["Innebandy"], colors: ["#D80000", "#111111"], logo: "/newwave/clubs/molndals-ibk/logo.png", joined: "2026-09-28", live: false },
];

type Pool = { occasion: string; months: number[]; kind: string; products: string[]; slogans: string[] };

const POOL: Pool[] = [
  { occasion: "Säsongsstart", months: [3, 4, 8, 9], kind: "Merch och inlägg", products: ["p008", "p016", "p020"], slogans: ["Nu kör vi igen", "{short} är tillbaka", "Ny säsong, samma hjärta"] },
  { occasion: "Hemmamatch", months: [], kind: "Merch och inlägg", products: ["p001", "p004"], slogans: ["Hemma är bäst", "Hela {city} hejar", "{short} på hemmaplan"] },
  { occasion: "Sommarcup", months: [6, 7], kind: "Merch och inlägg", products: ["p011", "p018", "p035"], slogans: ["Sol, cup och {short}", "Sommar i {city}", "Cupkänsla hela dagen"] },
  { occasion: "Avslutning", months: [6], kind: "Merch och inlägg", products: ["p003", "p034", "p035"], slogans: ["Tack för säsongen", "Vi ses i höst", "Laget före jaget"] },
  { occasion: "Skolstart", months: [8], kind: "Merch och inlägg", products: ["p015", "p026", "p024"], slogans: ["Tillbaka i {city}", "Plugg och träning", "{short} i skolväskan"] },
  { occasion: "Höstlovscupen", months: [10], kind: "Merch och inlägg", products: ["p004", "p012", "p021"], slogans: ["Höstlov med {short}", "Varm på läktaren", "Lovet är vårt"] },
  { occasion: "Halloween", months: [10], kind: "Inlägg", products: ["p001", "p039"], slogans: ["Läskigt bra lag", "Bus eller {short}"] },
  { occasion: "Fars dag", months: [11], kind: "Merch och inlägg", products: ["p004", "p021", "p037"], slogans: ["Pappa på läktaren", "{short}-pappa", "Kaffe och hejarop"] },
  { occasion: "Black Friday", months: [11], kind: "Merch och inlägg", products: ["p002", "p016"], slogans: ["Svart fredag i {city}", "Kläder för hela laget"] },
  { occasion: "Julmarknad", months: [12], kind: "Merch och inlägg", products: ["p012", "p019", "p038", "p039"], slogans: ["Jul i {city}", "En klapp till laget", "God jul från {short}"] },
  { occasion: "Medlemsvärvning", months: [], kind: "Inlägg", products: [], slogans: ["Bli en av oss", "Det finns plats för alla"] },
  { occasion: "Nyhetsbrev", months: [], kind: "Nyhetsbrev", products: [], slogans: ["Veckan i {short}", "Nytt från kansliet"] },
];

/** Crafts tidigare kampanjer till exempelklubbarna, så att historiken och resultaten har något att visa. */
const SEED_CAMPAIGNS: Campaign[] = [
  { id: "s-sasong", title: "Ny säsong, samma hjärta", occasion: "Säsongsstart", brief: "Kicka igång säsongen med träningskläder och vattenflaskor.", products: ["p008", "p016", "p020"], clubIds: ["kungsbacka-if", "fjaras-bk", "varbergs-gif", "alingsas-hk", "hovas-billdal-if"], createdAt: "2026-03-09", delivered: true },
  { id: "s-sommar", title: "Sol, cup och klubbkänsla", occasion: "Sommarcup", brief: "Allt till cupen: keps, kylväska och picknickfilt.", products: ["p011", "p018", "p035", "p028"], clubIds: ["kungsbacka-if", "onsala-bk", "fjaras-bk", "varbergs-gif", "lerums-is", "partille-if", "hovas-billdal-if"], createdAt: "2026-06-01", delivered: true },
  { id: "s-skola", title: "Tillbaka i skolan", occasion: "Skolstart", brief: "Ryggsäck, anteckningsbok och reflex till skolstarten.", products: ["p015", "p026", "p030"], clubIds: ["tolo-if", "stenungsunds-if", "partille-if", "lerums-is", "alingsas-hk", "onsala-bk"], createdAt: "2026-08-10", delivered: true },
  { id: "s-host", title: "Varm på läktaren", occasion: "Höstlovscupen", brief: "Hoodie, mössa och termosmugg till höstlovscuperna.", products: ["p004", "p012", "p021"], clubIds: ["kungsbacka-if", "onsala-bk", "fjaras-bk", "varbergs-gif", "hovas-billdal-if", "torslanda-hk", "stenungsunds-if", "alingsas-hk"], createdAt: "2026-10-05", delivered: true },
];

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const ageDays = (date: string, now: number) => (now - new Date(`${date.slice(0, 10)}T12:00:00Z`).getTime()) / DAY;

/** Slumptal som alltid blir desamma för samma nyckel, så att demodatan inte hoppar mellan sidladdningar. */
export function seeded(key: string) {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const short = (name: string) => name.replace(/^IFK\s+/, "").replace(/\s+(IF|BK|IK|IS|HK|GIF|IBK|IBF|FF)$/, "");

const FLAGS = {
  brand: ["Loggan är beskuren – loggan får aldrig förvrängas.", "Färgerna påminner om en annan klubbs.", "Smeknamnet tillhör en annan förening."],
  print: ["Texten är under 8 mm och blir svår att trycka.", "Trycket ligger för nära sömmen.", "Tunna linjer som riskerar att försvinna i tryck."],
  sales: ["Budskapet är otydligt för den som inte går på matcherna.", "Motivet liknar förra kampanjen för mycket."],
};

/** Granskningsagentens betyg. Riktiga godkännanden saknar sparat betyg, så de får ett stabilt betyg ur id:t. */
function review(key: string, live: boolean): Review {
  const rnd = seeded(`${key}-review`);
  const base = live ? 7.6 + rnd() * 1.9 : 5.3 + rnd() * 4.5;
  const part = () => Math.max(1, Math.min(10, Math.round(base + (rnd() - 0.5) * 2.4)));
  const parts = { realism: part(), relevance: part(), brandFit: part(), sales: part() };
  const score = Math.round(((parts.realism + parts.relevance + parts.brandFit + parts.sales) / 4) * 10) / 10;
  const pick = (list: string[]) => list[Math.floor(rnd() * list.length)];
  const flags = [
    ...(parts.brandFit < 7 ? [pick(FLAGS.brand)] : []),
    ...(parts.realism < 7 ? [pick(FLAGS.print)] : []),
    ...(parts.sales < 6 ? [pick(FLAGS.sales)] : []),
  ];
  const summary = score >= 8.5 ? "Starkt och säljbart, helt i klubbens ton." : score >= 7 ? "Bra och tryckfärdigt med små förbättringar möjliga." : "Behöver ses över innan klubben får se det.";
  return { score, parts, flags, summary };
}

/** Ett av klubbens foton, alltid samma för samma material. */
function photoFor(clubId: string, id: string) {
  const scenes = clubScenes(clubId);
  return scenes.length ? scenes[Math.floor(seeded(`${id}-foto`)() * scenes.length)].src : undefined;
}

function seedMaterials(club: CraftClub, now: number): Omit<CraftMaterial, "gate" | "sold">[] {
  const rnd = seeded(club.id);
  const activity = 0.25 + rnd() * 0.75;
  const q = rnd();
  const quiet = q < 0.15 ? 50 + Math.floor(rnd() * 30) : q < 0.38 ? 16 + Math.floor(rnd() * 24) : 0;
  const start = Math.max(new Date(club.joined).getTime(), now - 150 * DAY);
  const count = Math.round(((now - start) / DAY / 7) * activity * 1.6);
  const out: Omit<CraftMaterial, "gate" | "sold">[] = [];
  for (let i = 0; i < count; i++) {
    const t = now - quiet * DAY - Math.floor(rnd() * Math.max(1, (now - quiet * DAY - start) / DAY)) * DAY;
    if (t < start) continue;
    const month = new Date(t).getUTCMonth() + 1;
    const fits = POOL.filter((p) => !p.months.length || p.months.includes(month));
    const p = fits[Math.floor(rnd() * fits.length)];
    const age = (now - t) / DAY;
    const r = rnd();
    const status: ApprovalStatus = age < 6 ? (r < 0.7 ? "väntar" : "godkänd") : r < 0.82 ? "godkänd" : r < 0.92 ? "ändring" : "väntar";
    const title = p.slogans[Math.floor(rnd() * p.slogans.length)].replace("{short}", short(club.name)).replace("{city}", club.city);
    const id = `${club.id}-${i}`;
    out.push({ id, clubId: club.id, title, occasion: p.occasion, kind: p.kind, status, createdAt: iso(t), products: p.products, image: p.products[0] ? nwProduct(p.products[0])?.photo : undefined, photo: photoFor(club.id, id), from: "Klubbens agent", review: review(id, false) });
  }
  return out;
}

function campaignMaterial(c: Campaign, club: CraftClub, now: number): Omit<CraftMaterial, "gate" | "sold"> {
  const id = `${c.id}-${club.id}`;
  const rnd = seeded(id);
  const sent = c.sendAt ?? c.createdAt;
  const age = ageDays(sent, now);
  const r = rnd();
  const status: ApprovalStatus = age < 3 ? "väntar" : age < 10 ? (r < 0.55 ? "godkänd" : r < 0.68 ? "ändring" : "väntar") : r < 0.74 ? "godkänd" : r < 0.86 ? "ändring" : "väntar";
  const created = iso(new Date(`${sent}T12:00:00Z`).getTime() + Math.min(Math.floor(age), Math.floor(rnd() * 3)) * DAY);
  return { id, clubId: club.id, title: c.title, occasion: c.occasion, kind: "Craft-kampanj", status, createdAt: created, products: c.products, image: c.products[0] ? nwProduct(c.products[0])?.photo : undefined, photo: photoFor(club.id, id), from: "Craft", campaignId: c.id, review: review(id, false) };
}

async function liveMaterials(club: CraftClub, campaigns: Campaign[]): Promise<Omit<CraftMaterial, "gate" | "sold">[]> {
  const approvals = await listApprovals(club.id);
  return approvals.map((a) => ({
    id: a.id,
    clubId: club.id,
    title: a.title,
    occasion: a.occasion,
    kind: a.kind,
    status: a.status,
    createdAt: a.createdAt,
    products: a.products?.map((p) => p.id) ?? [],
    image: a.products?.[0]?.mockupUrl ?? a.previewUrl,
    photo: a.products?.[0]?.mockupUrl || a.previewUrl ? undefined : photoFor(club.id, a.id),
    from: a.from === "Craft" ? "Craft" : "Klubbens agent",
    campaignId: campaigns.find((c) => c.approvals?.[club.id] === a.id)?.id,
    review: review(a.id, true),
  }));
}

async function onboarding(club: CraftClub, now: number, log: LogItem[]) {
  const linkSent = log.some((l) => l.kind === "uppstart" && l.clubIds?.includes(club.id) && ageDays(l.at, now) <= 7);
  let steps: boolean[];
  if (club.id === "asa-if") steps = [true, true, Boolean((await readBrand(club.id)).toneApproved), true, true];
  else if (club.live) steps = [true, true, true, true, true];
  else {
    const days = ageDays(club.joined, now);
    steps = days < 30 ? [true, true, false, false, true] : days < 75 ? [true, true, false, true, true] : [true, true, true, true, true];
  }
  return { steps, done: steps.filter(Boolean).length, linkSent };
}

function defaultSettings(club: CraftClub, rules: CraftRules): ClubSettings {
  if (club.dashboard) return { autopilot: false, threshold: rules.minScore };
  return { autopilot: club.live || seeded(`${club.id}-auto`)() < 0.6, threshold: rules.minScore };
}

const priceOf = (id: string) => nwProduct(id)?.priceSek ?? 299;

// --- Utskick -------------------------------------------------------------------

/**
 * Lägger kampanjen hos varje klubb i hubben och returnerar godkännande-id:n. En kampanj från designstudion får klubbens
 * logga – eller designens ordmärke med klubbens namn, färger och märke – på produkterna och färdiga butiksprodukter,
 * så att ett godkännande lägger ut dem i klubbens butik hos Intersport.
 */
export async function deliverCampaign(c: Campaign, origin = ""): Promise<Record<string, string>> {
  const products = c.products.map(nwProduct).filter((p) => p !== undefined);
  const date = c.date ? ` Kampanjdatum: ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(`${c.date}T12:00:00Z`))}.` : "";
  const deadline = c.deadline ? ` Godkänn senast ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(`${c.deadline}T12:00:00Z`))}.` : "";
  const out: Record<string, string> = {};
  for (const clubId of c.clubIds.filter(isLive)) {
    const club = craftClub(clubId);
    const studio = c.designs && club?.logo ? { light: club.logo, dark: club.logoDark ?? club.logo } : undefined;
    const made = await Promise.all(
      products.map(async (p) => {
        const custom = c.designs?.[p.id];
        const wordmark = custom?.design.wordmark;
        // Tryckfilen följer plaggets valda färg; mockupen ritas på produktfotot i standardfärgen.
        const artFor = (dark: boolean) => (wordmark ? wordmarkUrl(wordmark, clubId, dark ? "dark" : "light", 3543, "png", custom?.design.sizeCm) : dark ? studio?.dark : studio?.light);
        const print = studio && artFor(custom ? isDarkHex(custom.color) : p.dark);
        const shown = studio && artFor(p.dark);
        return { p, custom, print, mockupUrl: (custom && shown && (await serverMockup(p, shown, 1000, custom.design.zone).catch(() => null))) || p.photo };
      }),
    );
    const a = await createApproval(clubId, {
      kind: "Craft-kampanj",
      title: c.title,
      occasion: c.occasion,
      story: `${c.brief}${date}${deadline}`,
      from: "Craft",
      printFiles: studio,
      products: made.map(({ p, custom, mockupUrl }) => ({ id: p.id, name: `${p.name.split(",")[0]} ${p.garmentColor.toLowerCase()}`, priceSek: p.priceSek, mockupUrl, custom })),
      shopProducts:
        studio && club
          ? made.flatMap(({ p, custom, print, mockupUrl }) =>
              custom && print
                ? [
                    {
                      sku: `CRAFT-POD-${p.id.toUpperCase()}-${c.id.toUpperCase()}`,
                      title: `${club.name} – ${c.title} – ${p.name} ${colorName(custom.color).toLowerCase()}`,
                      description: `${p.name} med ${genitive(club.name)} ${custom.design.wordmark ? "ordmärke" : "logga"}, från Crafts kampanj "${c.title}".`,
                      priceSek: p.priceSek,
                      sizes: p.sizes,
                      images: [{ url: mockupUrl, alt: `${p.name} med ${genitive(club.name)} logga`, kind: "mockup" as const }],
                      printFileUrl: `${origin}${print}`,
                      fulfilment: "print-on-demand" as const,
                      dropId: `kampanj-${c.id}`,
                      signal: c.occasion,
                      tags: [club.name, c.title, "Craft"],
                      custom,
                    },
                  ]
                : [],
            )
          : undefined,
    });
    await addFeed(clubId, "Craft", `Skickade kampanjen "${c.title}" med ${products.length} produkter.`);
    out[clubId] = a.id;
  }
  return out;
}

const delivering = new Map<string, Promise<void>>();

/** Skickar schemalagda kampanjer som har nått sitt datum och de automatiska påminnelserna. */
async function deliverDue(now: number) {
  const state = await readState();
  const day = iso(now);
  const due = state.campaigns.filter((c) => !c.delivered && (c.sendAt ?? c.createdAt) <= day);
  const remind = state.campaigns.filter((c) => c.delivered && c.remind && c.deadline && !c.reminded && ageDays(c.deadline, now) >= -3);
  if (!due.length && !remind.length) return;
  await updateState(async (s) => {
    for (const c of s.campaigns) {
      if (due.some((d) => d.id === c.id)) {
        c.approvals = await deliverCampaign(c);
        c.delivered = true;
        s.log.unshift(logItem({ kind: "kampanj", text: `Schemalagda kampanjen "${c.title}" skickades till ${c.clubIds.length} klubbar.`, clubIds: c.clubIds }));
      }
      if (remind.some((r) => r.id === c.id)) {
        c.reminded = true;
        for (const clubId of c.clubIds.filter(isLive)) await addFeed(clubId, "Craft", `Påminnelse: godkänn "${c.title}" senast ${c.deadline}.`);
        s.log.unshift(logItem({ kind: "påminnelse", text: `Automatisk påminnelse om "${c.title}" till klubbarna som inte svarat.`, clubIds: c.clubIds }));
      }
    }
  });
}

// --- Sammanställning -----------------------------------------------------------

export type CraftData = { rows: ClubRow[]; campaigns: CampaignResult[]; rules: CraftRules; log: LogItem[]; dismissed: string[] };

export async function craftData(now = Date.now()): Promise<CraftData> {
  const ws = (await workspaceId()) ?? "";
  let run = delivering.get(ws);
  if (!run) {
    run = deliverDue(now).finally(() => delivering.delete(ws));
    delivering.set(ws, run);
  }
  await run;
  const state = await readState();
  const rules = state.rules ?? DEFAULT_RULES;
  const campaigns = [...SEED_CAMPAIGNS, ...state.campaigns];
  const sentCampaigns = campaigns.filter((c) => c.delivered);

  const rows = await Promise.all(
    ROSTER.map(async (club): Promise<ClubRow> => {
      const settings = { ...defaultSettings(club, rules), ...state.settings[club.id] };
      const ob = await onboarding(club, now, state.log);
      const shopLive = ob.steps[3];
      const assigned = club.live ? [] : sentCampaigns.filter((c) => c.clubIds.includes(club.id) && (c.sendAt ?? c.createdAt) >= club.joined).map((c) => campaignMaterial(c, club, now));
      const own = club.dashboard ? await liveMaterials(club, campaigns) : [...(club.live ? await liveMaterials(club, campaigns) : []), ...seedMaterials(club, now)];

      const sales = seeded(`${club.id}-sales`);
      const materials: CraftMaterial[] = [...assigned, ...own]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((m) => {
          const decided = state.gates[m.id];
          const live = club.live && !m.id.startsWith(`${club.id}-`);
          const gate: Gate = decided ?? (!live && m.review.score < settings.threshold && ageDays(m.createdAt, now) <= 10 ? "granskas" : "släppt");
          const auto = !live && gate === "släppt" && settings.autopilot && m.status === "väntar" && m.review.score >= settings.threshold;
          const status: ApprovalStatus = auto ? "godkänd" : m.status;
          const sold = status === "godkänd" && shopLive ? m.products.reduce((n) => n + Math.round(4 + sales() * 40), 0) : 0;
          return { ...m, gate, status, auto: auto || undefined, sold, designs: state.designs?.[m.id] };
        });

      const released = materials.filter((m) => m.gate === "släppt");
      const approved = released.filter((m) => m.status === "godkänd");
      const pending = released.filter((m) => m.status === "väntar");
      const decided = released.filter((m) => m.status !== "väntar").length;
      const units = approved.flatMap((m) => m.products.map((p) => ({ p, n: m.sold / Math.max(1, m.products.length) })));
      const sold = approved.reduce((n, m) => n + m.sold, 0);
      const shopItems = !shopLive ? 0 : club.dashboard ? (await listProducts(club.id)).length : approved.reduce((n, m) => n + m.products.length, 0) + (club.live ? (await listProducts(club.id)).length : 0);
      const lastActive = materials[0]?.createdAt ?? null;
      const idle = lastActive ? ageDays(lastActive, now) : Infinity;
      const weekly = Array.from({ length: 12 }, (_, w) => {
        const to = now - (11 - w) * 7 * DAY;
        return materials.filter((m) => {
          const t = new Date(m.createdAt).getTime();
          return t > to - 7 * DAY && t <= to;
        }).length;
      });

      return {
        ...club,
        status: idle <= 14 ? "aktiv" : idle <= 45 ? "lugn" : "inaktiv",
        lastActive,
        materials,
        onboarding: ob,
        settings,
        weekly,
        remindedAt: state.log.find((l) => l.kind === "påminnelse" && l.clubIds?.includes(club.id))?.at,
        stats: {
          created30: materials.filter((m) => ageDays(m.createdAt, now) <= 30).length,
          total: materials.length,
          pending: pending.length,
          oldestPending: pending.length ? Math.floor(Math.max(...pending.map((m) => ageDays(m.createdAt, now)))) : 0,
          queue: materials.filter((m) => m.gate === "granskas").length,
          approved: approved.length,
          approvalRate: decided ? Math.round((approved.length / decided) * 100) : 0,
          avgScore: materials.length ? Math.round((materials.reduce((n, m) => n + m.review.score, 0) / materials.length) * 10) / 10 : 0,
          inShop: shopItems,
          sold: Math.round(sold),
          revenue: Math.round(units.reduce((n, u) => n + u.n * priceOf(u.p), 0) * 0.2),
        },
      };
    }),
  );

  const byId = new Map(rows.flatMap((r) => r.materials.filter((m) => m.campaignId).map((m) => [`${m.campaignId}:${m.clubId}`, m] as const)));
  const results: CampaignResult[] = campaigns
    .map((c) => {
      const scheduled = !c.delivered;
      const clubs = c.clubIds
        .filter((id) => rows.some((r) => r.id === id))
        .map((clubId) => {
          const m = byId.get(`${c.id}:${clubId}`);
          return { clubId, status: scheduled ? ("schemalagd" as const) : m ? (m.gate === "granskas" ? ("granskas" as const) : m.status) : ("väntar" as const), sold: m?.sold ?? 0 };
        });
      return { ...c, seed: c.id.startsWith("s-"), scheduled, clubs, approved: clubs.filter((x) => x.status === "godkänd").length, sold: clubs.reduce((n, x) => n + x.sold, 0) };
    })
    .sort((a, b) => (b.sendAt ?? b.createdAt).localeCompare(a.sendAt ?? a.createdAt));

  return { rows, campaigns: results, rules, log: state.log, dismissed: state.dismissed };
}

export async function craftOverview(now = Date.now()) {
  return (await craftData(now)).rows;
}

export const craftClub = (id: string) => ROSTER.find((c) => c.id === id);
export const CRAFT_CLUBS = ROSTER;
export const isLive = (id: string) => Boolean(craftClub(id)?.live);

/** Klubbar som liknar ursprungsklubben – samma sport väger tyngst, sedan region – och som inte redan fått samma tillfälle. */
export function similarClubs(material: CraftMaterial, rows: ClubRow[], limit = 6) {
  const origin = rows.find((r) => r.id === material.clubId);
  if (!origin) return [];
  return rows
    .filter((r) => r.id !== origin.id && !r.materials.some((m) => m.occasion === material.occasion && m.title === material.title))
    .map((r) => ({ r, score: r.sports.filter((s) => origin.sports.includes(s)).length * 2 + (r.region === origin.region ? 1 : 0) + r.stats.sold / 2000 }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}
