import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { generateJson, hasOpenAIKey } from "./openai";
import type { Club, Signal } from "./types";

const MAX_BYTES = 3_000_000;

export class NewsError extends Error {}

export function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new NewsError("Det ser inte ut som en länk.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new NewsError("Länken måste börja med http eller https.");
  const { address } = await lookup(url.hostname).catch(() => {
    throw new NewsError("Hittar inte webbplatsen.");
  });
  if (isPrivate(address)) throw new NewsError("Länken pekar på en intern adress.");
  return url;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export async function fetchHtml(start: URL) {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
        "Accept-Language": "sv-SE,sv;q=0.9",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new NewsError(`Sidan svarade ${res.status}.`);
    if (!(res.headers.get("content-type") ?? "").includes("html")) throw new NewsError("Länken går inte till en artikel.");
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new NewsError("Sidan är för stor för att läsas.");
    return { html: new TextDecoder("utf-8").decode(buf), finalUrl: url };
  }
  throw new NewsError("För många omdirigeringar.");
}

export type Article = {
  url: string;
  title: string;
  description: string;
  site: string;
  published: string;
  image: string | null;
  text: string;
};

export async function readArticle(raw: string): Promise<Article> {
  const url = await assertPublicUrl(raw);
  const { html, finalUrl } = await fetchHtml(url);

  const meta: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
    const key = tag.match(/(?:property|name)\s*=\s*"([^"]+)"/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*"([^"]*)"/i)?.[1];
    if (key && content && !meta[key]) meta[key] = decode(content);
  }

  let body = "";
  for (const [, json] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const found = json.match(/"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (found) body = JSON.parse(`"${found[1]}"`);
  }
  if (!body) {
    const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    body = [...article.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(([, p]) => strip(p))
      .filter((p) => p.length > 40 && !/cookie|schibsted|inloggad|prenumer|användarvillkor/i.test(p))
      .join("\n");
  }

  const title = meta["og:title"] || strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!title && !body) throw new NewsError("Kunde inte läsa någon artikel på sidan.");

  return {
    url: finalUrl.toString(),
    title,
    description: meta["og:description"] || meta["description"] || "",
    site: meta["og:site_name"] || finalUrl.hostname.replace(/^www\./, ""),
    published: (meta["article:published_time"] || meta["publisheddate"] || new Date().toISOString()).slice(0, 10),
    image: meta["og:image"] || null,
    text: body.slice(0, 6000),
  };
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["aboutClub", "suitable", "reason", "title", "detail"],
  properties: {
    aboutClub: { type: "boolean" },
    suitable: { type: "boolean" },
    reason: { type: "string" },
    title: { type: "string" },
    detail: { type: "string" },
  },
};

export async function articleToSignal(club: Club, article: Article): Promise<Signal> {
  if (!hasOpenAIKey()) {
    return {
      id: `news-${Date.now()}`,
      kind: "news",
      title: article.title.slice(0, 60),
      detail: article.description || article.title,
      date: article.published,
      source: { name: article.site, url: article.url, published: article.published },
    };
  }

  const out = await generateJson<{ aboutClub: boolean; suitable: boolean; reason: string; title: string; detail: string }>({
    system: `Du läser en nyhetsartikel och avgör om den kan bli ett merch-motiv för ${club.name} (${club.nicknames.join(", ")}).
- aboutClub: handlar artikeln om ${club.name} eller något supportrarna bryr sig om kopplat till klubben?
- suitable: är den positiv eller stolt nog att bära på en tröja? Nej för skador, sjukdom, dödsfall, brott, skandaler, ekonomiska problem, spelare som lämnar och förluster.
- reason: en mening på svenska som förklarar bedömningen.
- title: signalen i max 6 ord, utan spelarnamn.
- detail: 1–2 meningar om vad som hänt och varför det är värt ett motiv nu. Nämn aldrig spelares namn – beskriv vad som hänt för laget.`,
    user: `Källa: ${article.site} (${article.published})
Rubrik: ${article.title}
Ingress: ${article.description}

${article.text}`,
    schemaName: "news_signal",
    schema,
  });

  if (!out.aboutClub) throw new NewsError(`Nyheten verkar inte handla om ${club.name}. ${out.reason}`);
  if (!out.suitable) throw new NewsError(`Den här nyheten passar inte för merch. ${out.reason}`);

  return {
    id: `news-${Date.now()}`,
    kind: "news",
    title: out.title,
    detail: out.detail,
    date: article.published,
    source: { name: article.site, url: article.url, published: article.published },
  };
}
