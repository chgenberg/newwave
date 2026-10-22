import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { registryAsset } from "./clubAssets";

/** Klubbregistret: föreningslistan och det `scripts/scrape-clubs.mjs` har hämtat från varje förenings webbplats. */

export const CLUBS_DIR = path.join(process.cwd(), ".data", "newwave", "clubs");
export const CLUB_ID = /^[a-z0-9-]{1,80}$/;

export type ClubStatus = "queued" | "found" | "missing" | "error";

export type ClubItem = {
  id: string;
  name: string;
  county: string;
  municipality: string;
  sport: string;
  org: string;
  surplus: number;
  status: ClubStatus;
  url?: string;
  host?: string;
  platform?: string;
  confidence?: number;
  logo?: boolean;
  onDark?: boolean;
  hero?: boolean;
  colors?: string[];
  socials?: string[];
  founded?: string;
  at?: string;
};

export type ClubDetail = ClubItem & {
  orgNr: string;
  envelopes: number;
  title?: string;
  siteName?: string;
  description?: string;
  logoInfo?: { source: string; vector: boolean; icon: boolean } | null;
  colorInfo?: { hex: string; source: string }[];
  fonts?: { heading: string; body: string };
  socialLinks?: Record<string, string>;
  emails?: string[];
  phones?: string[];
  shop?: string;
};

type Index = { builtAt: string; running: boolean; items: ClubItem[] };

let cache: { mtime: number; index: Index } | null = null;

async function loadIndex(): Promise<Index | null> {
  const file = path.join(CLUBS_DIR, "index.json");
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  if (cache?.mtime !== info.mtimeMs) cache = { mtime: info.mtimeMs, index: JSON.parse(await readFile(file, "utf8")) as Index };
  return cache.index;
}

export const SORTS = ["size", "name", "recent", "colors"] as const;
export const SHOWS = ["all", "logo", "site", "missing", "queued"] as const;

export type ClubQuery = { q: string; county: string; sport: string; show: (typeof SHOWS)[number]; sort: (typeof SORTS)[number]; offset: number; limit: number };

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const shown = (c: ClubItem, show: ClubQuery["show"]) =>
  show === "all" || (show === "logo" ? Boolean(c.logo) : show === "site" ? c.status === "found" : show === "missing" ? c.status === "missing" || c.status === "error" : c.status === "queued");

function count(items: ClubItem[], key: "county" | "sport") {
  const m = new Map<string, number>();
  for (const c of items) if (c[key]) m.set(c[key], (m.get(c[key]) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
}

/** Varje facett räknas med alla andra filter, så att siffrorna visar vad ett klick ger. */
export async function queryClubs(q: ClubQuery) {
  const index = await loadIndex();
  if (!index) return null;
  const words = fold(q.q).split(/\s+/).filter(Boolean);
  const text = (c: ClubItem) => words.every((w) => fold(`${c.name} ${c.municipality} ${c.county} ${c.sport} ${c.host ?? ""}`).includes(w));
  const base = index.items.filter((c) => text(c) && shown(c, q.show));
  const inCounty = base.filter((c) => !q.county || c.county === q.county);
  const items = inCounty.filter((c) => !q.sport || c.sport === q.sport);
  const order: Record<ClubQuery["sort"], (a: ClubItem, b: ClubItem) => number> = {
    size: (a, b) => b.surplus - a.surplus,
    name: (a, b) => a.name.localeCompare(b.name, "sv"),
    recent: (a, b) => (b.at ?? "").localeCompare(a.at ?? ""),
    colors: (a, b) => Number(Boolean(b.logo)) - Number(Boolean(a.logo)) || hue(a.colors?.[0]) - hue(b.colors?.[0]),
  };
  const all = index.items;
  const done = all.filter((c) => c.status !== "queued");
  return {
    total: items.length,
    items: [...items].sort(order[q.sort]).slice(q.offset, q.offset + q.limit),
    facets: { counties: count(base.filter((c) => !q.sport || c.sport === q.sport), "county"), sports: count(inCounty, "sport").slice(0, 40) },
    stats: {
      clubs: all.length,
      done: done.length,
      found: done.filter((c) => c.status === "found").length,
      logos: done.filter((c) => c.logo).length,
      missing: done.filter((c) => c.status !== "found").length,
      builtAt: index.builtAt,
      running: index.running && Date.now() - Date.parse(index.builtAt) < 15 * 60_000,
    },
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

/** En skrapad klubb som ordmärkena kan ritas för: namn, profilfärger, klubbmärke och grundandeår. */
export async function registryWordmarkClub(id: string) {
  if (!CLUB_ID.test(id)) return null;
  const s = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));
  if (s?.status !== "found") return null;
  sources ??= await loadSources();
  const c = sources.get(id);
  if (!c) return null;
  const logo = s.logo ? registryAsset(id, s.at, "logo.png") : undefined;
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
  if (!CLUB_ID.test(id)) return undefined;
  const s = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));
  return s?.status === "found" && s.hero ? registryAsset(id, s.at, "bild.jpg") : undefined;
}

type Source = { id: string; name: string; county: string; municipality: string; org: string; sport: string; orgNr: string; surplus: number; envelopes: number };
let sources: Map<string, Source> | null = null;
const loadSources = async () => new Map((JSON.parse(await readFile(path.join(CLUBS_DIR, "clubs.json"), "utf8").catch(() => "[]")) as Source[]).map((c) => [c.id, c]));

export async function clubDetail(id: string): Promise<ClubDetail | null> {
  if (!CLUB_ID.test(id)) return null;
  sources ??= await loadSources();
  const c = sources.get(id);
  if (!c) return null;
  const s = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));
  const base: ClubDetail = { id, name: c.name, county: c.county, municipality: c.municipality, sport: c.sport, org: c.org, orgNr: c.orgNr, surplus: c.surplus, envelopes: c.envelopes, status: s?.status ?? "queued", at: s?.at };
  if (s?.status !== "found") return base;
  return {
    ...base,
    url: web(s.url),
    host: s.host,
    platform: s.platform,
    confidence: s.confidence,
    title: s.title,
    siteName: s.siteName,
    description: s.description,
    logo: Boolean(s.logo),
    onDark: Boolean(s.logo?.onDark),
    hero: s.hero,
    colors: s.colors.map((x: { hex: string }) => x.hex),
    colorInfo: s.colors,
    logoInfo: s.logo ? { source: s.logo.source, vector: s.logo.vector, icon: s.logo.icon } : null,
    fonts: s.fonts,
    socialLinks: Object.fromEntries(Object.entries((s.socials ?? {}) as Record<string, unknown>).flatMap(([k, v]) => (web(v) ? [[k, web(v)!]] : []))),
    socials: Object.keys(s.socials ?? {}),
    emails: s.emails,
    phones: s.phones,
    shop: web(s.shop),
    founded: s.founded,
  };
}
