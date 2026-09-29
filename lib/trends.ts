import { generateJson, hasOpenAIKey } from "./openai";
import type { Club, Signal } from "./types";

type NewsItem = { title: string; source: string; url: string; published: string };

const cache = new Map<string, { at: number; trends: Signal[] }>();
const TTL_MS = 30 * 60 * 1000;

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function fetchNews(club: Club): Promise<NewsItem[]> {
  const q = encodeURIComponent(`${club.newsQuery} when:14d`);
  const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=sv&gl=SE&ceid=SE:sv`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Nyhetsflödet svarade ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 30).map(([, item]) => {
    const tag = (t: string) => decode(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "").trim();
    const full = tag("title");
    const source = tag("source") || full.split(" - ").pop() || "";
    return {
      title: full.replace(new RegExp(`\\s-\\s${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), ""),
      source,
      url: tag("link"),
      published: new Date(tag("pubDate")).toISOString().slice(0, 10),
    };
  });
}

const trendSchema = {
  type: "object",
  additionalProperties: false,
  required: ["trends"],
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "newsIndex"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          newsIndex: { type: "integer" },
        },
      },
    },
  },
};

export async function clubTrends(club: Club): Promise<Signal[]> {
  const hit = cache.get(club.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.trends;

  const news = await fetchNews(club);
  if (news.length === 0) return [];

  let picked: { title: string; detail: string; newsIndex: number }[];
  if (hasOpenAIKey()) {
    const out = await generateJson<{ trends: typeof picked }>({
      system: `Du bevakar nyheter om ${club.name} för att hitta signaler som supportrar skulle vilja bära på en tröja eller mugg.
Välj högst 3 POSITIVA och aktuella signaler: segersviter, viktiga segrar, jubileum, rekordpublik, tabelläge, kommande stormatcher, derbyn, supporterkultur.
Hoppa över: skador, sjukdom, dödsfall, brott, skandaler, ekonomiska problem, spelare som lämnar, förluster och allt negativt.
Nämn aldrig spelares namn – beskriv i stället vad som hänt för laget.
title: kort signal, max 6 ord. detail: en mening om varför den är värd ett motiv just nu. newsIndex: index i listan.`,
      user: news.map((n, i) => `${i}. [${n.published}] ${n.title} (${n.source})`).join("\n"),
      schemaName: "trends",
      schema: trendSchema,
    });
    picked = out.trends;
  } else {
    picked = news.slice(0, 2).map((n, i) => ({ title: n.title.slice(0, 60), detail: `Nyhet från ${n.source}.`, newsIndex: i }));
  }

  const trends: Signal[] = picked
    .slice(0, 3)
    .filter((t) => news[t.newsIndex])
    .map((t, i) => {
      const n = news[t.newsIndex];
      return {
        id: `trend-${i}-${n.published}`,
        kind: "trend",
        title: t.title,
        detail: t.detail,
        date: n.published,
        source: { name: n.source, url: n.url, published: n.published },
      };
    });
  cache.set(club.id, { at: Date.now(), trends });
  return trends;
}
