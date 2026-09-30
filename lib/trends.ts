import { errorMessage, generateJson, hasOpenAIKey } from "./openai";
import { type FeedItem, type SourceId, clubNews, clubVideos, googleNews, offers, podcasts, searchTrends } from "./sources";
import type { Club, Signal, SourceStatus } from "./types";

const cache = new Map<string, { at: number; value: { trends: Signal[]; status: SourceStatus[] } }>();
const TTL_MS = 30 * 60 * 1000;

type Feed = { id: SourceId; name: string; load: (club: Club) => Promise<FeedItem[]>; kind: Signal["kind"] };

const CLUB_FEEDS: Feed[] = [
  { id: "news", name: "Google Nyheter", load: googleNews, kind: "trend" },
  { id: "club", name: "Klubbens nyheter", load: clubNews, kind: "club" },
  { id: "social", name: "Klubbens YouTube", load: clubVideos, kind: "social" },
  { id: "podcast", name: "Supporterpoddar", load: podcasts, kind: "podcast" },
  { id: "search", name: "Google Trends", load: () => searchTrends(), kind: "search" },
];

const BRAND_FEEDS: Feed[] = [
  { id: "news", name: "Google Nyheter", load: googleNews, kind: "trend" },
  { id: "club", name: "Pressrummet", load: clubNews, kind: "club" },
  { id: "offer", name: "Erbjudanden", load: offers, kind: "offer" },
  { id: "social", name: "YouTube", load: clubVideos, kind: "social" },
  { id: "search", name: "Google Trends", load: () => searchTrends(), kind: "search" },
];

const clubPrompt = (club: Club) => `Du bevakar ${club.name} (${club.nicknames.join(", ")}) för att hitta signaler som supportrar skulle vilja bära på en tröja eller dricka ur i en mugg.
Listan blandar fem källor. Välj högst 6 POSITIVA och aktuella signaler, gärna från olika källor:
- GOOGLE NYHETER: segersviter, viktiga segrar, tabelläge, rekordpublik, stormatcher.
- KLUBBENS NYHETER: jubileum, evenemang, biljettsläpp, klubbhistoria, familjedagar, supporterinitiativ.
- KLUBBENS YOUTUBE: det som engagerar supportrarna – teman och stämningar, aldrig en enskild spelare. Hoppa över om äldre än 30 dagar.
- SUPPORTERPODDAR: läktarens egna uttryck, skämt och stämning – bra för satir. Återge temat, inte avsnittstiteln ordagrant.
- GOOGLE TRENDS: bara om sökningen tydligt går att koppla till fotboll, Göteborg eller något supportrar skulle göra kul merch av. Oftast hoppar du över allt här.
Hoppa alltid över: skador, sjukdom, dödsfall, brott, skandaler, ekonomiska problem, spelare som lämnar, förluster och allt negativt.
Nämn aldrig spelares namn – beskriv i stället vad som hänt för laget.
title: kort signal, max 6 ord. detail: en mening om varför den är värd ett motiv just nu. index: numret i listan.`;

const brandPrompt = (club: Club) => `Du bevakar varumärket ${club.name} (drivmedels- och servicestationer i hela Sverige) för att hitta signaler som stamkunder skulle vilja bära på en tröja, dricka ur i en mugg eller ha i bilen.
Listan blandar fem källor. Välj högst 6 POSITIVA och aktuella signaler, gärna från olika källor:
- GOOGLE NYHETER: nya stationer, samarbeten, sponsring, välgörenhet, utmärkelser, kul händelser vid stationerna.
- PRESSRUMMET: kampanjer, jubileer, sponsring (t.ex. idrott och Bris), nya tjänster, säsongens satsningar.
- ERBJUDANDEN: vad stationerna säljer just nu – kaffe, korv, Meal Deals, dryck. Bra för lekfulla motiv om själva produkten, aldrig om priset.
- YOUTUBE: teman och stämningar i Circle K:s egna filmer. Hoppa över om äldre än 60 dagar.
- GOOGLE TRENDS: bara om sökningen tydligt går att koppla till bilresor, väder, helger, kaffe, mat på vägen eller något stamkunder skulle göra kul merch av. Oftast hoppar du över allt här.
Hoppa alltid över: drivmedelspriser, konkurrenter, stängda stationer, rån och brott, olyckor, rättsprocesser, myndighetsgranskningar, uppsägningar, politik och allt negativt.
Nämn aldrig verkliga personers namn.
title: kort signal, max 6 ord. detail: en mening om varför den är värd ett motiv just nu. index: numret i listan.`;

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
        required: ["title", "detail", "index"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          index: { type: "integer" },
        },
      },
    },
  },
};

export async function clubTrends(club: Club): Promise<{ trends: Signal[]; status: SourceStatus[] }> {
  const hit = cache.get(club.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const FEEDS = club.kind === "brand" ? BRAND_FEEDS : CLUB_FEEDS;
  const results = await Promise.allSettled(FEEDS.map((f) => f.load(club)));
  const status: SourceStatus[] = FEEDS.map((f, i) => {
    const r = results[i];
    return r.status === "fulfilled"
      ? { id: f.id, name: f.name, ok: true, count: r.value.length }
      : { id: f.id, name: f.name, ok: false, count: 0, note: errorMessage(r.reason) };
  });
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (items.length === 0) return { trends: [], status };

  const label = (id: SourceId) => FEEDS.find((f) => f.id === id)!.name.toUpperCase();
  let picked: { title: string; detail: string; index: number }[];
  if (hasOpenAIKey()) {
    const out = await generateJson<{ trends: typeof picked }>({
      system: club.kind === "brand" ? brandPrompt(club) : clubPrompt(club),
      user: items.map((n, i) => `${i}. [${label(n.sourceId)}] [${n.published}] ${n.title} (${n.source})`).join("\n"),
      schemaName: "trends",
      schema: trendSchema,
    });
    picked = out.trends;
  } else {
    picked = items
      .filter((n) => n.sourceId === "news" || n.sourceId === "club" || n.sourceId === "offer")
      .slice(0, 3)
      .map((n) => ({ title: n.title.slice(0, 60), detail: `Från ${n.source}.`, index: items.indexOf(n) }));
  }

  const trends: Signal[] = picked
    .filter((t) => items[t.index])
    .slice(0, 6)
    .map((t, i) => {
      const n = items[t.index];
      return {
        id: `${n.sourceId}-${i}-${n.published}`,
        kind: FEEDS.find((f) => f.id === n.sourceId)!.kind,
        title: t.title,
        detail: t.detail,
        date: n.published,
        source: { name: n.source, url: n.url, published: n.published },
      };
    });
  const value = { trends, status };
  cache.set(club.id, { at: Date.now(), value });
  return value;
}
