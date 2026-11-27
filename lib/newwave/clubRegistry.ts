import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { registryAsset } from "./clubAssets";
import { VECTOR_KINDS, vectorRank, type VectorKind, type VectorStatus } from "./clubVector";

/**
 * Klubbregistret: föreningslistan och det `scripts/scrape-clubs.mjs` har hämtat från varje förenings webbplats. Indexet
 * har bara klubbar med webbplats och eget klubbmärke – lag, nedlagda föreningar och föreningar utanför idrotten är
 * bortsorterade där – och bara de klubbarna går att öppna.
 */

const SCRAPED = path.join(process.cwd(), ".data", "newwave", "clubs");
/** Skraparens mapp på datorn; i produktion paketet som Dockerfile hämtar till `registry/clubs`. */
export const CLUBS_DIR = existsSync(path.join(SCRAPED, "index.json")) ? SCRAPED : path.join(process.cwd(), "registry", "clubs");
export const CLUB_ID = /^[a-z0-9-]{1,80}$/;

export type ClubItem = {
  id: string;
  name: string;
  county: string;
  municipality: string;
  sport: string;
  org: string;
  url: string;
  host: string;
  platform?: string;
  confidence?: number;
  onDark?: boolean;
  hero?: boolean;
  colors?: string[];
  socials?: string[];
  founded?: string;
  at?: string;
  /** Hur det gick när märket ritades om som vektor (vektor.json, scripts/club-logos-vector.ts status). */
  vector?: VectorStatus;
};

/** Leadlistans siffror stannar på servern; de används bara för att ordna arbetet, aldrig i svaren. */
type IndexItem = ClubItem & { surplus: number };

export type ClubDetail = ClubItem & {
  orgNr: string;
  title?: string;
  siteName?: string;
  description?: string;
  logoInfo: { source: string; vector: boolean; icon: boolean };
  colorInfo?: { hex: string; source: string }[];
  fonts?: { heading: string; body: string };
  socialLinks?: Record<string, string>;
  shop?: string;
};

type Index = { builtAt: string; items: IndexItem[] };

let cache: { key: string; index: Index; ids: Set<string> } | null = null;
let vectorCache: { mtime: number; items: Record<string, VectorStatus> } | null = null;

/** Vektorstatusen läggs på klubbarna när indexet eller vektor.json ändrats. */
async function loadIndex() {
  const file = path.join(CLUBS_DIR, "index.json");
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  const vectors = await loadVectors();
  const key = `${info.mtimeMs}|${vectors.mtime}`;
  if (cache?.key !== key) {
    const index = JSON.parse(await readFile(file, "utf8")) as Index;
    for (const c of index.items) c.vector = vectors.items[c.id];
    cache = { key, index, ids: new Set(index.items.map((c) => c.id)) };
  }
  return cache;
}

async function loadVectors() {
  const file = path.join(CLUBS_DIR, "vektor.json");
  const info = await stat(file).catch(() => null);
  if (!info) return { mtime: 0, items: {} as Record<string, VectorStatus> };
  if (vectorCache?.mtime !== info.mtimeMs) vectorCache = { mtime: info.mtimeMs, items: (JSON.parse(await readFile(file, "utf8")) as { items: Record<string, VectorStatus> }).items };
  return vectorCache;
}

/** Vektorstatusen för en klubb i registret. */
export async function clubVector(id: string) {
  return (await loadIndex())?.index.items.find((c) => c.id === id)?.vector;
}

const isListed = async (id: string) => CLUB_ID.test(id) && Boolean((await loadIndex())?.ids.has(id));

export const SORTS = ["vector", "size", "name", "recent", "colors"] as const;

export type ClubQuery = { q: string; county: string; sport: string; vector?: VectorKind | ""; sort: (typeof SORTS)[number]; offset: number; limit: number };

export const isVectorKind = (v: unknown): v is VectorKind => VECTOR_KINDS.includes(v as VectorKind);

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function count(items: ClubItem[], key: "county" | "sport") {
  const m = new Map<string, number>();
  for (const c of items) if (c[key]) m.set(c[key], (m.get(c[key]) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
}

/** Grupperna i sidans ordning, de godkända först; tomma grupper visas inte. */
function countVectors(items: ClubItem[]) {
  const m = new Map<VectorKind, number>();
  for (const c of items) m.set(c.vector?.k ?? "ovrigt", (m.get(c.vector?.k ?? "ovrigt") ?? 0) + 1);
  return VECTOR_KINDS.filter((k) => m.has(k)).map((k) => ({ name: k, n: m.get(k)! }));
}

/** Varje facett räknas med alla andra filter, så att siffrorna visar vad ett klick ger. */
export async function queryClubs(q: ClubQuery) {
  const index = (await loadIndex())?.index;
  if (!index) return null;
  const words = fold(q.q).split(/\s+/).filter(Boolean);
  const text = (c: ClubItem) => words.every((w) => fold(`${c.name} ${c.municipality} ${c.county} ${c.sport} ${c.host}`).includes(w));
  const kind = (c: ClubItem) => c.vector?.k ?? "ovrigt";
  const inVector = (c: ClubItem) => !q.vector || kind(c) === q.vector;
  const searched = index.items.filter(text);
  const base = searched.filter(inVector);
  const inCounty = base.filter((c) => !q.county || c.county === q.county);
  const items = inCounty.filter((c) => !q.sport || c.sport === q.sport);
  const byName = (a: ClubItem, b: ClubItem) => a.name.localeCompare(b.name, "sv");
  const order: Record<ClubQuery["sort"], (a: IndexItem, b: IndexItem) => number> = {
    vector: (a, b) => vectorRank(a.vector?.k) - vectorRank(b.vector?.k) || byName(a, b),
    size: (a, b) => b.surplus - a.surplus,
    name: byName,
    recent: (a, b) => (b.at ?? "").localeCompare(a.at ?? ""),
    colors: (a, b) => hue(a.colors?.[0]) - hue(b.colors?.[0]),
  };
  const all = index.items;
  return {
    total: items.length,
    items: [...items]
      .sort(order[q.sort])
      .slice(q.offset, q.offset + q.limit)
      .map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== "surplus")) as ClubItem),
    facets: {
      counties: count(base.filter((c) => !q.sport || c.sport === q.sport), "county"),
      sports: count(inCounty, "sport").slice(0, 40),
      vectors: countVectors(searched.filter((c) => (!q.county || c.county === q.county) && (!q.sport || c.sport === q.sport))),
    },
    stats: { clubs: all.length, counties: new Set(all.map((c) => c.county).filter(Boolean)).size, sports: new Set(all.map((c) => c.sport).filter(Boolean)).size, builtAt: index.builtAt },
  };
}

function hue(hex?: string) {
  if (!hex) return 999;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.12) return 400 + (1 - max) * 100;
  const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
}

/** Bara vanliga webbadresser från skrapade sidor når länkarna. */
const web = (u: unknown) => (typeof u === "string" && /^https?:\/\/[^\s"<>]+$/i.test(u) ? u : undefined);

/** En skrapad klubb som wordmarken kan ritas för: namn, profilfärger, klubbmärke och grundandeår. */
export async function registryWordmarkClub(id: string) {
  if (!(await isListed(id))) return null;
  const s = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));
  if (!s) return null;
  sources ??= await loadSources();
  const c = sources.get(id);
  if (!c) return null;
  const logo = registryAsset(id, s.at, "logo.png");
  return {
    id,
    name: c.name,
    colors: (s.colors as { hex: string }[]).map((x) => x.hex),
    logo,
    logoDark: logo,
    founded: Number(s.founded) || undefined,
    sports: c.sport ? [c.sport] : [],
  };
}

/** Bilden från klubbens webbplats, om skrapningen hittade någon. */
export async function registryPhoto(id: string) {
  if (!(await isListed(id))) return undefined;
  const s = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));
  return s?.hero ? registryAsset(id, s.at, "bild.jpg") : undefined;
}

type Source = { id: string; name: string; county: string; municipality: string; org: string; sport: string; orgNr: string; surplus: number; envelopes: number };
let sources: Map<string, Source> | null = null;
const loadSources = async () => new Map((JSON.parse(await readFile(path.join(CLUBS_DIR, "clubs.json"), "utf8").catch(() => "[]")) as Source[]).map((c) => [c.id, c]));

const CONTACT = /(?:(?:tel(?:efon)?|mobil|e-?post|e-?mail|mail)\.?:?\s*)?(?:[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?:\+\d{2,3}|(?<!\d)0)\s?\d{1,3}(?:[\s-]*\d){5,9}(?!\d))/gi;
/** Webbplatsernas texter utan e-postadresser och telefonnummer; kontaktuppgifterna visas aldrig. */
const noContacts = (text?: string) => text?.replace(CONTACT, "").replace(/\s*([,;|·–-]\s*)+$/, "").replace(/\s{2,}/g, " ").trim() || undefined;

export async function clubDetail(id: string): Promise<ClubDetail | null> {
  if (!(await isListed(id))) return null;
  sources ??= await loadSources();
  const c = sources.get(id);
  const s = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));
  if (!c || !s) return null;
  return {
    id,
    name: c.name,
    county: c.county,
    municipality: c.municipality,
    sport: c.sport,
    org: c.org,
    orgNr: c.orgNr,
    at: s.at,
    url: web(s.url) ?? "",
    host: s.host,
    platform: s.platform,
    confidence: s.confidence,
    title: noContacts(s.title),
    siteName: s.siteName,
    description: noContacts(s.description),
    onDark: Boolean(s.logo?.onDark),
    hero: s.hero,
    colors: s.colors.map((x: { hex: string }) => x.hex),
    colorInfo: s.colors,
    logoInfo: { source: s.logo.source, vector: s.logo.vector, icon: s.logo.icon },
    fonts: s.fonts,
    socialLinks: Object.fromEntries(Object.entries((s.socials ?? {}) as Record<string, unknown>).flatMap(([k, v]) => (web(v) ? [[k, web(v)!]] : []))),
    socials: Object.keys(s.socials ?? {}),
    shop: web(s.shop),
    founded: s.founded,
    vector: await clubVector(id),
  };
}
