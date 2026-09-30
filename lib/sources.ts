import type { Club, Signal } from "./types";

export type FeedItem = { sourceId: SourceId; source: string; title: string; url: string; published: string };
export type SourceId = "news" | "club" | "social" | "podcast" | "search" | "offer";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; CraftKlubbmerch/1.0)" };
const DAY = 24 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function get(url: string, timeoutMs = 10_000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} svarade ${res.status}`);
  return res;
}

export const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();

const tag = (xml: string, t: string) => decode(xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
const isoDay = (d: string) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 10);
};
const recent = (published: string, days: number) => !!published && Date.now() - new Date(published).getTime() < days * DAY;

export async function googleNews(club: Club): Promise<FeedItem[]> {
  return cached(`news:${club.id}`, 30 * 60_000, async () => {
    const q = encodeURIComponent(`${club.newsQuery} when:14d`);
    const xml = await (await get(`https://news.google.com/rss/search?q=${q}&hl=sv&gl=SE&ceid=SE:sv`)).text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25).map(([, item]) => {
      const full = tag(item, "title");
      const source = tag(item, "source") || full.split(" - ").pop() || "";
      return {
        sourceId: "news" as const,
        source,
        title: full.endsWith(` - ${source}`) ? full.slice(0, -(source.length + 3)) : full,
        url: tag(item, "link"),
        published: isoDay(tag(item, "pubDate")),
      };
    });
  });
}

export async function clubNews(club: Club): Promise<FeedItem[]> {
  const press = club.sources.pressRss;
  if (press) {
    return cached(`club:${club.id}`, 30 * 60_000, async () => {
      const xml = await (await get(press.url)).text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
        .slice(0, 15)
        .map(([, i]) => ({ sourceId: "club" as const, source: press.name, title: tag(i, "title"), url: tag(i, "link"), published: isoDay(tag(i, "pubDate")) }))
        .filter((p) => recent(p.published, 120));
    });
  }
  return cached(`club:${club.id}`, 30 * 60_000, async () => {
    const res = await get(`${club.sources.website}/wp-json/wp/v2/posts?per_page=15&_fields=date,title,link`);
    const posts = (await res.json()) as { date: string; title: { rendered: string }; link: string }[];
    return posts
      .map((p) => ({ sourceId: "club" as const, source: new URL(club.sources.website).hostname, title: decode(p.title.rendered), url: p.link, published: isoDay(p.date) }))
      .filter((p) => recent(p.published, 21));
  });
}

export async function clubVideos(club: Club): Promise<FeedItem[]> {
  return cached(`social:${club.id}`, 60 * 60_000, async () => {
    const { youtubeChannelId, youtubeUser } = club.sources;
    if (!youtubeChannelId && !youtubeUser) return [];
    const query = youtubeChannelId ? `channel_id=${youtubeChannelId}` : `user=${encodeURIComponent(youtubeUser!)}`;
    const xml = await (await get(`https://www.youtube.com/feeds/videos.xml?${query}`)).text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 6).map(([, e]) => ({
      sourceId: "social" as const,
      source: "YouTube",
      title: tag(e, "title"),
      url: e.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "",
      published: isoDay(tag(e, "published")),
    }));
  });
}

export async function podcasts(club: Club): Promise<FeedItem[]> {
  if (!club.sources.podcastSearch?.length) return [];
  return cached(`podcast:${club.id}`, 6 * 60 * 60_000, async () => {
    const feeds = new Map<string, string>();
    for (const term of club.sources.podcastSearch ?? []) {
      const res = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&country=se&limit=15`);
      const json = (await res.json()) as { results: { collectionName: string; feedUrl?: string }[] };
      for (const r of json.results) if (r.feedUrl) feeds.set(r.feedUrl, r.collectionName);
    }
    const stems = [club.name, club.shortName, ...club.nicknames].map((n) => n.toLowerCase().split(" ")[0].slice(0, 6));
    const relevant = [...feeds].filter(([, name]) => stems.some((s) => name.toLowerCase().includes(s))).slice(0, 8);
    const episodes = await Promise.allSettled(
      relevant.map(async ([url, name]) => {
        const xml = await (await get(url, 8_000)).text();
        return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3).map(([, i]) => ({
          sourceId: "podcast" as const,
          source: name,
          title: tag(i, "title"),
          url: tag(i, "link") || url,
          published: isoDay(tag(i, "pubDate")),
        }));
      }),
    );
    return episodes.flatMap((e) => (e.status === "fulfilled" ? e.value : [])).filter((e) => recent(e.published, 30));
  });
}

export async function searchTrends(): Promise<FeedItem[]> {
  return cached("search:SE", 60 * 60_000, async () => {
    const xml = await (await get("https://trends.google.com/trending/rss?geo=SE")).text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map(([, i]) => {
      const context = tag(i, "ht:news_item_title");
      return {
        sourceId: "search" as const,
        source: "Google Trends",
        title: context ? `${tag(i, "title")} (${context})` : tag(i, "title"),
        url: tag(i, "ht:news_item_url") || "https://trends.google.com/trending?geo=SE",
        published: isoDay(tag(i, "pubDate")),
      };
    });
  });
}

export async function offers(club: Club): Promise<FeedItem[]> {
  const url = club.sources.offersUrl;
  if (!url) return [];
  return cached(`offer:${club.id}`, 6 * 60 * 60_000, async () => {
    const html = await (await get(url)).text();
    const today = new Date().toISOString().slice(0, 10);
    const titles = [
      ...[...html.matchAll(/<h2[^>]*>([^<]{4,90})<\/h2>/g)].map((m) => m[1]),
      ...[...html.matchAll(/aria-label="([^"]{4,60})"[^>]*class="uk-button-secondary/g)].map((m) => m[1]),
    ].map(decode);
    return [...new Set(titles)].slice(0, 8).map((title) => ({ sourceId: "offer" as const, source: "Erbjudanden · circlek.se", title, url, published: today }));
  });
}

type SportsDbEvent = {
  idEvent: string;
  strTimestamp: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strVenue?: string;
};

export async function matchSignals(club: Club, now = new Date()): Promise<Signal[]> {
  const id = club.sources.sportsDbTeamId;
  if (!id) return [];
  const base = "https://www.thesportsdb.com/api/v1/json/123";
  const [next, last] = await cached(`match:${club.id}`, 15 * 60_000, () =>
    Promise.all([
      get(`${base}/eventsnext.php?id=${id}`).then((r) => r.json() as Promise<{ events: SportsDbEvent[] | null }>),
      get(`${base}/eventslast.php?id=${id}`).then((r) => r.json() as Promise<{ results: SportsDbEvent[] | null }>),
    ]),
  );
  const isHome = (e: SportsDbEvent) => e.strHomeTeam === club.name;
  const opponent = (e: SportsDbEvent) => (isHome(e) ? e.strAwayTeam : e.strHomeTeam);
  const source = (e: SportsDbEvent, published: string) => ({ name: "Allsvenskan · TheSportsDB", url: `https://www.thesportsdb.com/event/${e.idEvent}`, published });
  const signals: Signal[] = [];

  const upcoming = (next.events ?? []).find((e) => new Date(`${e.strTimestamp}Z`) > now);
  if (upcoming) {
    const when = new Date(`${upcoming.strTimestamp}Z`);
    const days = Math.ceil((when.getTime() - now.getTime()) / DAY);
    if (days <= 21) {
      const date = when.toISOString().slice(0, 10);
      signals.push({
        id: `match-next-${upcoming.idEvent}`,
        kind: "match",
        title: `${isHome(upcoming) ? "Hemmamatch" : "Bortamatch"} mot ${opponent(upcoming)}`,
        detail: `${when.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}${isHome(upcoming) ? ` på ${club.arena}` : ""} – matchdagsmerch.`,
        date,
        daysUntil: days,
        source: source(upcoming, date),
      });
    }
  }

  const played = (last.results ?? [])
    .filter((e) => e.intHomeScore !== null && e.intAwayScore !== null)
    .sort((a, b) => b.strTimestamp.localeCompare(a.strTimestamp))[0];
  if (played && now.getTime() - new Date(`${played.strTimestamp}Z`).getTime() < 7 * DAY) {
    const us = Number(isHome(played) ? played.intHomeScore : played.intAwayScore);
    const them = Number(isHome(played) ? played.intAwayScore : played.intHomeScore);
    if (us > them) {
      const date = played.strTimestamp.slice(0, 10);
      signals.push({
        id: `match-win-${played.idEvent}`,
        kind: "match",
        title: `Seger mot ${opponent(played)} ${us}–${them}`,
        detail: "Färsk seger – supportrarna vill fira den nu, inte om en vecka.",
        date,
        source: source(played, date),
      });
    }
  }
  return signals;
}

export async function weatherSignal(club: Club): Promise<Signal> {
  const { lat, lon, place } = club.sources.weather;
  const data = await cached(`weather:${club.id}`, 60 * 60_000, async () => {
    const res = await get(`https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`);
    return (await res.json()) as { timeSeries: { time: string; data: { air_temperature?: number; precipitation_amount_mean?: number } }[] };
  });
  const horizon = Date.now() + 5 * DAY;
  const days = new Map<string, { max: number; rain: number }>();
  for (const t of data.timeSeries) {
    if (new Date(t.time).getTime() > horizon) break;
    const day = t.time.slice(0, 10);
    const d = days.get(day) ?? { max: -99, rain: 0 };
    d.max = Math.max(d.max, t.data.air_temperature ?? -99);
    d.rain += t.data.precipitation_amount_mean ?? 0;
    days.set(day, d);
  }
  const list = [...days.values()];
  const avgMax = Math.round(list.reduce((s, d) => s + d.max, 0) / Math.max(list.length, 1));
  const rain = Math.round(list.reduce((s, d) => s + d.rain, 0));

  const [title, detail] =
    avgMax <= 10
      ? [`Hoodieväder i ${place}`, `Runt ${avgMax} °C de kommande dagarna – lyft fram hoodies och varma plagg.`]
      : rain >= 15
        ? [`Regniga dagar i ${place}`, `Omkring ${rain} mm regn väntas – hoodies och inomhusmotiv säljer, t.ex. muggar.`]
        : avgMax >= 20
          ? [`T-tröjeväder i ${place}`, `Upp mot ${avgMax} °C – t-tröjor och ljusa motiv.`]
          : [`Höstväder i ${place}`, `Kring ${avgMax} °C – t-tröja under dagen, hoodie till ${club.kind === "brand" ? "kvällens bilresa" : "kvällsmatchen"}.`];
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `weather-${today}`,
    kind: "weather",
    title,
    detail,
    date: today,
    source: { name: "SMHI", url: `https://www.smhi.se/vader/prognoser-och-varningar/vaderprognos/q/${encodeURIComponent(place)}`, published: today },
  };
}
