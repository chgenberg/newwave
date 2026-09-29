// Lokal demo: hämtar IFK Göteborgs publika innehåll och grafiska profil via WordPress REST-API:t.
// Kör: node scripts/scrape-ifk.mjs [--images=200]
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const BASE = "https://ifkgoteborg.se";
const OUT = path.join(process.cwd(), ".data", "brand", "ifk-goteborg");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/140 Safari/537.36 CraftKlubbmerchDemo";
const DELAY_MS = 400;
const RECENT_IMAGES = Number(process.argv.find((a) => a.startsWith("--images="))?.split("=")[1] ?? 200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

async function get(url, { json = true, retries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS);
    requests++;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, res, data: json ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    } catch (err) {
      if (attempt >= retries) return { ok: false, status: String(err) };
      await sleep(2000 * attempt);
    }
  }
}

const exists = (p) => access(p).then(() => true, () => false);
const strip = (html = "") =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;/g, "–").replace(/&#8217;/g, "’").replace(/&#8230;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();

async function download(url, dir) {
  const u = new URL(url, BASE);
  const rel = u.pathname.replace(/^\/wp-content\//, "").replace(/^\//, "");
  const file = path.join(OUT, dir, rel);
  if (await exists(file)) return rel;
  const r = await get(u.toString(), { json: false });
  if (!r.ok) return null;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, r.data);
  return rel;
}

async function allOf(type, fields) {
  const items = [];
  for (let page = 1; ; page++) {
    const r = await get(`${BASE}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_fields=${fields}`);
    if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) break;
    items.push(...r.data);
    const total = Number(r.res.headers.get("x-wp-totalpages") ?? page);
    process.stdout.write(`\r${type}: ${items.length} (sida ${page}/${total})   `);
    if (page >= total) break;
  }
  process.stdout.write("\n");
  return items;
}

await mkdir(OUT, { recursive: true });
const started = Date.now();

// 1. Startsida + grafisk profil
const home = await get(BASE, { json: false });
const html = home.data.toString("utf8");
await writeFile(path.join(OUT, "startsida.html"), html);

const cssUrls = [...html.matchAll(/<link[^>]+rel=['"]stylesheet['"][^>]+href=['"]([^'"]+)['"]/gi)]
  .map(([, h]) => (h.startsWith("//") ? `https:${h}` : h))
  .filter((h) => h.includes("ifkgoteborg.se/wp-content/themes") || h.includes("fonts.googleapis"));
const css = [];
for (const u of cssUrls) {
  const r = await get(u, { json: false });
  if (r.ok) css.push({ url: u, text: r.data.toString("utf8") });
}
await mkdir(path.join(OUT, "profil"), { recursive: true });
await writeFile(path.join(OUT, "profil", "tema.css"), css.map((c) => `/* ${c.url} */\n${c.text}`).join("\n\n"));

const cssText = css.map((c) => c.text).join("\n");
const colorCounts = {};
for (const [hex] of cssText.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
  const h = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  colorCounts[h.toUpperCase()] = (colorCounts[h.toUpperCase()] ?? 0) + 1;
}
const fonts = [...new Set([...cssText.matchAll(/font-family:\s*([^;}]+)/gi)].map(([, f]) => f.trim()))];
const fontFiles = [...new Set([...cssText.matchAll(/url\(['"]?([^'")]+\.(?:woff2?|ttf|otf))/gi)].map(([, u]) => u))];

const themeAssets = [
  ...new Set(
    [...html.matchAll(/(?:src|href)=['"]([^'"]*\/wp-content\/(?:themes|uploads)\/[^'"]+\.(?:png|svg|jpe?g|webp|ico))['"]/gi)].map(([, u]) => u),
  ),
];
const brandFiles = [];
for (const u of [...themeAssets, ...fontFiles.map((f) => new URL(f, cssUrls[0] ?? BASE).toString())]) {
  const rel = await download(u, "profil");
  if (rel) brandFiles.push(rel);
}

// 2. All text: sidor och nyheter
const pages = await allOf("pages", "id,date,modified,link,slug,title,content,excerpt,featured_media");
const posts = await allOf("posts", "id,date,link,slug,title,content,excerpt,featured_media,categories,tags");
const categories = await allOf("categories", "id,name,slug,count");
const tags = await allOf("tags", "id,name,slug,count");
const clean = (p) => ({
  id: p.id,
  date: p.date,
  link: p.link,
  slug: p.slug,
  title: strip(p.title?.rendered),
  excerpt: strip(p.excerpt?.rendered),
  text: strip(p.content?.rendered),
  featuredMedia: p.featured_media || null,
  categories: p.categories,
  tags: p.tags,
});
await mkdir(path.join(OUT, "innehall"), { recursive: true });
await writeFile(path.join(OUT, "innehall", "sidor.json"), JSON.stringify(pages.map(clean), null, 1));
await writeFile(path.join(OUT, "innehall", "nyheter.json"), JSON.stringify(posts.map(clean), null, 1));
await writeFile(path.join(OUT, "innehall", "kategorier.json"), JSON.stringify({ categories, tags }, null, 1));

// 3. Mediaregister (alla filer) + nedladdning av logotyper och senaste nyhetsbilder
const media = await allOf("media", "id,date,source_url,mime_type,alt_text,title,media_details");
const index = media.map((m) => ({
  id: m.id,
  date: m.date,
  url: m.source_url,
  mime: m.mime_type,
  alt: m.alt_text,
  title: strip(m.title?.rendered),
  width: m.media_details?.width ?? null,
  height: m.media_details?.height ?? null,
}));
await writeFile(path.join(OUT, "media-register.json"), JSON.stringify(index, null, 1));

const logoLike = index.filter((m) => /logo|logga|emblem|sk[öo]ld|crest|vapen|symbol|ifk[-_ ]?(vit|bla|blå|white|blue)/i.test(`${m.url} ${m.title} ${m.alt}`));
const logos = [];
for (const m of logoLike) {
  const rel = await download(m.url, "logotyper");
  if (rel) logos.push({ ...m, file: rel });
}

const byId = new Map(index.map((m) => [m.id, m]));
const recent = posts.slice(0, RECENT_IMAGES).map((p) => byId.get(p.featured_media)).filter(Boolean);
const images = [];
for (const [i, m] of recent.entries()) {
  process.stdout.write(`\rnyhetsbilder: ${i + 1}/${recent.length}   `);
  const rel = await download(m.url, "bilder");
  if (rel) images.push({ ...m, file: rel });
}
process.stdout.write("\n");

const summary = {
  source: BASE,
  scrapedAt: new Date().toISOString(),
  requests,
  minutes: Math.round((Date.now() - started) / 6000) / 10,
  counts: { pages: pages.length, posts: posts.length, media: index.length, logos: logos.length, images: images.length, brandFiles: brandFiles.length },
  profile: {
    fonts,
    fontFiles,
    topColors: Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 25),
    stylesheets: cssUrls,
  },
  logos: logos.map((l) => ({ file: l.file, width: l.width, height: l.height, title: l.title })),
  brandFiles,
};
await writeFile(path.join(OUT, "sammanfattning.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.counts), `${summary.minutes} min, ${requests} anrop`);
