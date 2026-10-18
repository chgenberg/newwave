import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Besöksloggen bakom statistiksidan. Den är bara på när `ADMIN_PASSWORD` finns, så att ingen loggar utan att kunna läsa.
 * En fil per dag med en händelse per rad; platsuppslagen cachas per IP-adress.
 */
const DIR = path.join(process.cwd(), ".data", "visits");
const PLACES = path.join(DIR, "places.json");
const MAX_DAY_BYTES = 20_000_000;

export const VISITOR_COOKIE = "nw_besok";
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
export const isVisitorId = (id: string | undefined): id is string => !!id && /^[a-z0-9]{24}$/.test(id);
export const newVisitorId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);

export const trackingOn = () => Boolean(process.env.ADMIN_PASSWORD);

export type VisitEvent = {
  at: string;
  /** `admin` markerar en webbläsare som loggat in på statistiksidan; den räknas inte som besökare. */
  type: "view" | "ping" | "film" | "login" | "fail" | "admin";
  vid: string;
  ip: string;
  ua: string;
  sid?: string;
  path?: string;
  /** Aktiva sekunder sedan förra pingen. */
  sec?: number;
  /** Hur långt filmen kommit, i procent. */
  pct?: number;
  ref?: string;
  lang?: string;
  screen?: string;
  tz?: string;
};

export async function logVisit(e: Omit<VisitEvent, "at">) {
  if (!trackingOn()) return;
  const file = path.join(DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  await mkdir(DIR, { recursive: true });
  const size = await stat(file).then((s) => s.size, () => 0);
  if (size > MAX_DAY_BYTES) return;
  await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...e })}\n`);
}

export type Place = { city?: string; region?: string; country?: string; org?: string; hostname?: string; loc?: string };

const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80|unknown$)/i;

async function lookup(ip: string): Promise<Place | null> {
  if (PRIVATE.test(ip)) return { city: "Lokalt nätverk" };
  const token = process.env.IPINFO_TOKEN ? `?token=${process.env.IPINFO_TOKEN}` : "";
  const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json${token}`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as Place | null;
  return j && { city: j.city, region: j.region, country: j.country, org: j.org, hostname: j.hostname, loc: j.loc };
}

/** Slår upp de adresser som saknas i cachen, högst `max` per anrop så att sidan inte väntar på hundratals uppslag. */
async function places(ips: string[], max = 60): Promise<Record<string, Place>> {
  const cache: Record<string, Place> = JSON.parse(await readFile(PLACES, "utf8").catch(() => "{}"));
  const missing = ips.filter((ip) => !cache[ip]).slice(0, max);
  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    const found = await Promise.all(batch.map(lookup));
    batch.forEach((ip, n) => {
      const place = found[n];
      if (place) cache[ip] = place;
    });
  }
  if (missing.length) {
    await mkdir(DIR, { recursive: true });
    await writeFile(`${PLACES}.tmp`, JSON.stringify(cache));
    await rename(`${PLACES}.tmp`, PLACES);
  }
  return cache;
}

export function device(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Okänd enhet";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "okänd webbläsare";
  return `${os} · ${browser}`;
}

export type VisitSession = { sid: string; start: string; end: string; sec: number; pages: string[]; film: number };
export type Visitor = {
  vid: string;
  ips: { ip: string; place?: Place }[];
  device: string;
  ua: string;
  lang?: string;
  screen?: string;
  tz?: string;
  ref?: string;
  first: string;
  last: string;
  logins: number;
  fails: number;
  views: number;
  sec: number;
  film: number;
  sessions: VisitSession[];
};

export async function visitReport() {
  const files = (await readdir(DIR).catch(() => [] as string[])).filter((f) => f.endsWith(".jsonl")).sort();
  const events: VisitEvent[] = [];
  for (const f of files) {
    for (const line of (await readFile(path.join(DIR, f), "utf8")).split("\n")) {
      if (!line) continue;
      try {
        events.push(JSON.parse(line) as VisitEvent);
      } catch {}
    }
  }

  const byVisitor = new Map<string, Visitor & { ipSet: Set<string>; bySid: Map<string, VisitSession> }>();
  for (const e of events) {
    let v = byVisitor.get(e.vid);
    if (!v) {
      v = { vid: e.vid, ips: [], ipSet: new Set(), device: device(e.ua), ua: e.ua, first: e.at, last: e.at, logins: 0, fails: 0, views: 0, sec: 0, film: 0, sessions: [], bySid: new Map() };
      byVisitor.set(e.vid, v);
    }
    v.last = e.at;
    v.ipSet.add(e.ip);
    v.ua = e.ua;
    v.device = device(e.ua);
    v.lang ??= e.lang;
    v.screen ??= e.screen;
    v.tz ??= e.tz;
    if (e.ref && !v.ref) v.ref = e.ref;
    if (e.type === "login") v.logins++;
    if (e.type === "fail") v.fails++;
    if (!e.sid) continue;
    let s = v.bySid.get(e.sid);
    if (!s) {
      s = { sid: e.sid, start: e.at, end: e.at, sec: 0, pages: [], film: 0 };
      v.bySid.set(e.sid, s);
    }
    s.end = e.at;
    if (e.type === "view" && e.path) {
      v.views++;
      if (s.pages.at(-1) !== e.path) s.pages.push(e.path);
    }
    if (e.type === "ping" && e.sec) {
      s.sec += e.sec;
      v.sec += e.sec;
    }
    if (e.type === "film" && e.pct !== undefined) {
      s.film = Math.max(s.film, e.pct);
      v.film = Math.max(v.film, e.pct);
    }
  }

  const admins = new Set(events.filter((e) => e.type === "admin").map((e) => e.vid));
  const visitors = [...byVisitor.values()].filter((v) => !admins.has(v.vid));
  const found = await places([...new Set(visitors.flatMap((v) => [...v.ipSet]))]);
  const list: Visitor[] = visitors
    .map(({ ipSet, bySid, ...v }) => ({ ...v, ips: [...ipSet].map((ip) => ({ ip, place: found[ip] })), sessions: [...bySid.values()].reverse() }))
    .sort((a, b) => b.last.localeCompare(a.last));

  return {
    visitors: list,
    totals: {
      visitors: list.length,
      loggedIn: list.filter((v) => v.logins > 0).length,
      sessions: list.reduce((n, v) => n + v.sessions.length, 0),
      sec: list.reduce((n, v) => n + v.sec, 0),
      film: list.filter((v) => v.film > 0).length,
      fails: list.reduce((n, v) => n + v.fails, 0),
    },
  };
}
