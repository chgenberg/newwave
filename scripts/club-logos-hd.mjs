// Högupplösta klubbmärken: letar upp klubbens märke i bästa möjliga kvalitet, i stället för den lilla bild som
// skrapan (scrape-clubs.mjs) tog första bästa av. Registret rörs inte – resultatet läggs i .data/newwave/clubs/logos-hd/.
//
//   node scripts/club-logos-hd.mjs pick <antal> <utfil>          väljer klubbar vars märke inte räcker för tryck
//   node scripts/club-logos-hd.mjs run <idfil|id,id> [--workers=6] [--no-llm] [--debug]
//   node scripts/club-logos-hd.mjs sheet <idfil> <utmapp>        före och efter som bilder, 25 klubbar per bild
//
// Så letar agenten, för varje klubb:
//   1. Klubbens egen sajt i en riktig webbläsare: alla bilder som ser ut som märket (största varianten i srcset,
//      originalfilen bakom storleksparametrar), ikoner, delningsbild, strukturerad data, SVG i sidhuvudet och
//      nedladdningsbara filer (SVG, PDF, AI, ZIP) – också på undersidor som "Om oss" och "Grafisk profil".
//   2. Klubbens Facebooksida, vars profilbild ofta är märket i stort format.
//   3. Wikidata och svenska Wikipedia, där många klubbmärken finns som vektor.
//   4. Varje kandidat jämförs med märket vi har (form, konturer och färger). De största som liknar det granskas sist
//      av en bildmodell, som väljer den som verkligen är klubbens hela märke och läser av klubbens färger.
// Kräver OPENAI_API_KEY för granskningen (utan den, eller med --no-llm, väljs kandidaten bara på likhet).

import { execFile, spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), ".data", "newwave", "clubs");
const OUT = path.join(ROOT, "logos-hd");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
/** Wikimedia vill att automatiska klienter presenterar sig. Ingen kontaktuppgift till någon person skickas. */
const WIKI_UA = "klubbregister-logotyper/1.0";
/** Långsidan en rasterbild måste ha för att räcka till ett bröstmärke på 10 cm i 300 dpi. */
export const PRINT_PX = 1200;
/** Så lik märket vi har en kandidat måste vara för att granskas. */
export const SIM_MIN = 0.32;
const MODEL = process.env.LOGO_MODEL || "gpt-5-mini";

const args = process.argv.slice(2);
const flag = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const has = (k) => args.includes(`--${k}`);
const log = (...m) => console.log(new Date().toLocaleTimeString("sv-SE"), ...m);

/**
 * Plattformarnas egna loggor och standardbilder – aldrig klubbens märke. Prövas mot adressen efter vidarebefordring:
 * SvenskaLag skickar en klubb utan vektormärke vidare till en standardbild.
 */
const NOT_CLUB = [
  /svenskalag\.se\/img\/(logo|svenskalag|icons?)\b/i,
  /svenskalag\.se\/img\/clubmarks\/mcard\/0\.png/i,
  /svenskalag\.se\/img\/headers\//i,
  /duyn491kcolsw\.cloudfront\.net\/files\//i, // Webnodes egna ikoner
  /static\.xx\.fbcdn\.net\/rsrc/i, // Facebooks standardavatar
  /laget\.se\/(content|images?|img)\/(logo|laget)/i,
  /sportadmin\.se\/(img|images)\/(logo|sportadmin)/i,
  /klubbenonline\.se\/(img|images)\/logo/i,
  /gravatar\.com|wp-includes\/images|wordpress\.org/i,
];

/* ---------- Säker hämtning: bara publika adresser ---------- */

const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80)/i;
const hostOk = new Map();
const isPublicHost = (host) => {
  if (!hostOk.has(host)) {
    hostOk.set(
      host,
      lookup(host, { all: true })
        .then((all) => all.length > 0 && all.every((a) => !PRIVATE.test(a.address)))
        .catch(() => false),
    );
  }
  return hostOk.get(host);
};

async function fetchBuffer(url, { timeout = 15_000, max = 15_000_000, ua = UA } = {}) {
  if (url.startsWith("data:")) {
    const [head, b] = url.split(",", 2);
    return { buf: head.includes(";base64") ? Buffer.from(b, "base64") : Buffer.from(decodeURIComponent(b)), type: head.slice(5).split(";")[0], url };
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 5; hop++) {
    if (!/^https?:$/.test(u.protocol) || !(await isPublicHost(u.hostname))) return null;
    if (NOT_CLUB.some((re) => re.test(u.href))) return null;
    const get = () => fetch(u, { redirect: "manual", signal: AbortSignal.timeout(timeout), headers: { "User-Agent": ua, Accept: "*/*" } });
    // Ett nytt försök vid nätverksfel: små klubbsajter svarar ibland inte första gången.
    const res = await get().catch(() => new Promise((ok) => setTimeout(ok, 1500)).then(get).catch(() => null));
    if (!res) return null;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      u = new URL(loc, u);
      continue;
    }
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > max) return null;
    const buf = Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    return buf.length && buf.length <= max ? { buf, type: res.headers.get("content-type") ?? "", url: u.href } : null;
  }
  return null;
}

const json = async (url) => {
  const r = await fetchBuffer(url, { ua: WIKI_UA, max: 5_000_000 });
  try {
    return r ? JSON.parse(r.buf.toString("utf8")) : null;
  } catch {
    return null;
  }
};

/* ---------- Namn ---------- */

const fold = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const flat = (s) => fold(s).replace(/[^a-z0-9]/g, "");

/* ---------- Kandidater på klubbens sajt ---------- */

/** Andra adresser till samma bild i större format: utan storleksparametrar, utan WordPress-storlek, original hos Wix, Cloudinary och Laget.se. */
export function variants(src) {
  const out = new Set([src]);
  let url;
  try {
    url = new URL(src);
  } catch {
    return [...out];
  }
  // Laget.se och andra med ImageResizer: storleken efter semikolon i sökvägen.
  if (url.pathname.includes(";")) {
    const v = new URL(url);
    v.pathname = v.pathname.split(";")[0];
    out.add(v.href);
  }
  const wp = url.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "").replace(/-(scaled|thumb|thumbnail|small|medium)(?=\.\w+$)/i, "");
  if (wp !== url.pathname) {
    const v = new URL(url);
    v.pathname = wp;
    out.add(v.href);
  }
  const q = new URL(url);
  let changed = false;
  for (const k of [...q.searchParams.keys()]) {
    if (/^(w|h|width|height|size|resize|fit|quality|q|fm|auto|crop|dpr|maxwidth|maxheight|mode|scale|rw|rh|preset|bgcolor|margin)$/i.test(k)) {
      q.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) out.add(q.href);
  if (/squarespace/i.test(url.hostname)) {
    const s = new URL(url);
    s.searchParams.set("format", "2500w");
    out.add(s.href);
  }
  const wix = url.href.match(/^(https:\/\/static\.wixstatic\.com\/media\/[^/]+)\/v1\//);
  if (wix) out.add(wix[1]);
  const cloud = url.href.replace(/\/upload\/(?:[a-z]{1,2}_[^/]+\/)+/, "/upload/");
  if (cloud !== url.href) out.add(cloud);
  if (/\.(png|jpe?g|webp|gif)$/i.test(url.pathname) && !/svenskalag|laget\.se|sportadmin|klubbenonline|fbcdn/i.test(url.hostname)) {
    const s = new URL(url);
    s.pathname = s.pathname.replace(/\.(png|jpe?g|webp|gif)$/i, ".svg");
    s.search = "";
    out.add(s.href);
  }
  return [...out];
}

/** Körs i sidan: allt som kan vara klubbens märke, och länkar till undersidor där en grafisk profil kan ligga. */
function collectInPage() {
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const hint = /logo|logga|logotyp|klubbmarke|klubbmärke|emblem|crest|vapen|brand|badge|sk[oö]ld|clubmark/i;
  const noise = /sponsor|partner|swish|klarna|facebook|instagram|youtube|twitter|tiktok|linkedin|flag|cookie|avatar|profile-pic/i;
  const out = { imgs: [], icons: [], metas: [], ld: [], svgs: [], files: [], pages: [] };
  const fromSet = (set, add) => {
    for (const part of (set || "").split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u) add(abs(u));
    }
  };
  for (const img of document.querySelectorAll("img")) {
    const r = img.getBoundingClientRect();
    const attrs = [img.className, img.id, img.alt, img.src, img.getAttribute("data-src") || "", img.closest("a")?.className || "", img.parentElement?.className || ""].join(" ");
    const top = r.top + scrollY < 450;
    const inHeader = Boolean(img.closest("header, nav, [class*=header i], [id*=header i], [class*=logo i], [id*=logo i]"));
    if (noise.test(attrs) || !(hint.test(attrs) || (top && inHeader))) continue;
    const srcs = new Set();
    const add = (u) => u && srcs.add(u);
    for (const u of [img.currentSrc, img.src, img.getAttribute("data-src"), img.getAttribute("data-lazy-src"), img.getAttribute("data-original")]) if (u) add(abs(u));
    fromSet(img.srcset, add);
    fromSet(img.getAttribute("data-srcset"), add);
    const pic = img.closest("picture");
    if (pic) for (const s of pic.querySelectorAll("source")) fromSet(s.srcset, add);
    out.imgs.push({ srcs: [...srcs], hint: hint.test(attrs) });
  }
  for (const el of document.querySelectorAll("header *, [class*=logo i], [id*=logo i]")) {
    const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    if (m && hint.test(`${el.className} ${el.id} ${m[1]}`)) out.imgs.push({ srcs: [abs(m[1])], hint: true });
  }
  for (const l of document.querySelectorAll("link[rel*=icon i], link[rel=apple-touch-icon], link[rel=manifest], link[rel=mask-icon]")) out.icons.push({ rel: l.rel, href: abs(l.href), sizes: l.sizes?.value || "" });
  for (const m of document.querySelectorAll("meta[property='og:image'], meta[name='twitter:image'], meta[itemprop=logo]")) if (m.content) out.metas.push(abs(m.content));
  for (const s of document.querySelectorAll("script[type='application/ld+json']")) out.ld.push((s.textContent || "").slice(0, 20000));
  for (const svg of document.querySelectorAll("header svg, [class*=logo i] svg, svg[class*=logo i], [id*=logo i] svg")) {
    const r = svg.getBoundingClientRect();
    if (r.width >= 40 && r.height >= 40) out.svgs.push(svg.outerHTML.slice(0, 600000));
  }
  for (const a of document.querySelectorAll("a[href]")) {
    const href = abs(a.getAttribute("href"));
    if (!href) continue;
    const text = `${a.textContent || ""} ${href}`;
    if (/\.(svg|eps|ai|pdf|zip)(\?|$)/i.test(href) && /logo|logga|logotyp|klubbm|profil|grafisk|varum|emblem|vapen|press|media/i.test(fold(text))) out.files.push(href);
    else {
      try {
        if (new URL(href).hostname === location.hostname && /om oss|om klubben|om foreningen|klubbinfo|grafisk profil|var profil|press|media|dokument|logga|logotyp|varumarke/i.test(fold(a.textContent || ""))) out.pages.push(href);
      } catch {}
    }
  }
  out.pages = [...new Set(out.pages)].slice(0, 4);
  return out;

  function fold(s) {
    return String(s).toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o");
  }
}

let browser = null;
async function launch() {
  const { chromium } = await import("playwright-core");
  const opts = { args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] };
  return process.env.CHROMIUM_PATH ? chromium.launch({ ...opts, executablePath: process.env.CHROMIUM_PATH }) : chromium.launch({ ...opts, channel: "chrome" });
}

async function visitPage(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => null);
    return await page.evaluate(collectInPage);
  } finally {
    await page.close().catch(() => null);
  }
}

/** Alla kandidater på sajten, med var de kom ifrån. */
async function siteCandidates(site) {
  const found = [];
  const add = (url, source) => url && found.push({ url, source });
  add(site.logo?.from, "nuvarande källa");
  if (!site.url) return found;
  browser ??= await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2, locale: "sv-SE", userAgent: UA, ignoreHTTPSErrors: true });
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (["media", "font"].includes(req.resourceType())) return route.abort();
    try {
      return (await isPublicHost(new URL(req.url()).hostname)) ? route.continue() : route.abort();
    } catch {
      return route.abort();
    }
  });
  try {
    const home = await visitPage(context, site.url);
    const pages = [home];
    for (const sub of home.pages.slice(0, 2)) pages.push(await visitPage(context, sub).catch(() => null));
    for (const [n, p] of pages.entries()) {
      if (!p) continue;
      const where = n === 0 ? "startsidan" : "undersida";
      for (const img of p.imgs) for (const src of img.srcs) add(src, `bild på ${where}`);
      for (const i of p.icons) {
        if (/manifest/i.test(i.rel)) {
          const m = await fetchBuffer(i.href, { max: 200_000 });
          try {
            for (const icon of JSON.parse(m?.buf.toString("utf8") ?? "{}").icons ?? []) add(new URL(icon.src, i.href).href, "appmanifest");
          } catch {}
        } else add(i.href, "ikon");
      }
      for (const m of p.metas) add(m, "delningsbild");
      for (const raw of p.ld) {
        for (const m of raw.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/g)) add(m[1], "strukturerad data");
      }
      for (const svg of p.svgs) found.push({ inline: svg, source: `SVG i sidhuvudet (${where})` });
      for (const f of p.files) add(f, `fil på ${where}`);
    }
  } finally {
    await context.close().catch(() => null);
  }
  return found;
}

/* ---------- Facebook ---------- */

/** Sidans namn eller nummer ur en Facebooklänk. Grupper och delningslänkar har ingen profilbild att hämta. */
export function facebookPage(link) {
  try {
    const u = new URL(link);
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "profile.php") return u.searchParams.get("id");
    if (["pages", "people", "pg"].includes(parts[0])) return parts.findLast((p) => /^\d{6,}$/.test(p)) ?? parts[1] ?? null;
    if (!parts[0] || /^(groups|events|sharer|share|watch|p|hashtag|login|home\.php|photo|story\.php|permalink\.php|plugins|dialog|tr)$/i.test(parts[0])) return null;
    return parts[0];
  } catch {
    return null;
  }
}

function facebookCandidates(site) {
  const page = facebookPage(site.socials?.facebook ?? "");
  return page ? [{ url: `https://graph.facebook.com/${encodeURIComponent(page)}/picture?width=2000&height=2000`, source: "Facebook-profilbild" }] : [];
}

/* ---------- Wikidata och Wikipedia ---------- */

const SPORTY = /forening|klubb|idrott|fotboll|hockey|bandy|handboll|innebandy|basket|volleyboll|sallskap|sport|ishockey|team|club|ryttar|simsallskap|skid|golf|tennis|brottning|boxning/;

async function commonsUrl(file) {
  const r = await json(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(`File:${file}`)}`);
  const page = Object.values(r?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}

async function wikiCandidates(club) {
  const found = [];
  const s = await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=sv&uselang=sv&type=item&limit=6&search=${encodeURIComponent(club.name)}`);
  const ids = (s?.search ?? []).map((x) => x.id);
  if (ids.length) {
    const e = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels|descriptions&languages=sv|en&ids=${ids.join("|")}`);
    for (const ent of Object.values(e?.entities ?? {})) {
      const label = ent.labels?.sv?.value ?? ent.labels?.en?.value ?? "";
      const desc = fold(`${ent.descriptions?.sv?.value ?? ""} ${ent.descriptions?.en?.value ?? ""}`);
      // Samma namn, och beskrivningen säger att det är en förening – annars är det en annan sak med samma namn.
      if (flat(label) !== flat(club.name) || !SPORTY.test(desc)) continue;
      for (const prop of ["P154", "P94"]) {
        for (const c of ent.claims?.[prop] ?? []) {
          const file = c.mainsnak?.datavalue?.value;
          const url = file ? await commonsUrl(file) : null;
          if (url) found.push({ url, source: prop === "P154" ? "Wikidata (logotyp)" : "Wikidata (vapen)" });
        }
      }
    }
  }
  const w = await json(`https://sv.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=3&srsearch=${encodeURIComponent(`${club.name} ${club.municipality ?? ""}`)}`);
  const title = (w?.query?.search ?? []).map((x) => x.title).find((t) => flat(t).startsWith(flat(club.name)) || flat(club.name).startsWith(flat(t)));
  if (title) {
    const p = await json(`https://sv.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(title)}`);
    const orig = Object.values(p?.query?.pages ?? {})[0]?.original?.source;
    if (orig) found.push({ url: orig, source: "Wikipedia" });
  }
  return found;
}

/* ---------- Läsa en kandidat ---------- */

const run = (cmd, a) => new Promise((ok, fail) => execFile(cmd, a, { timeout: 30_000 }, (e, out) => (e ? fail(e) : ok(out))));

/** PDF eller AI (PDF-kompatibel) till SVG, första sidan. */
async function pdfToSvg(buf) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "logga-"));
  try {
    await writeFile(path.join(dir, "in.pdf"), buf);
    await run("pdftocairo", ["-svg", "-f", "1", "-l", "1", path.join(dir, "in.pdf"), path.join(dir, "ut.svg")]);
    return await readFile(path.join(dir, "ut.svg"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const withXmlns = (svg) => (/\sxmlns=/.test(svg.match(/<svg\b[^>]*>/i)?.[0] ?? "") ? svg : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"'));
/** En SVG som bara bär en inbäddad rasterbild är ingen vektor. */
const realVector = (svg) => /<(path|polygon|circle|ellipse|polyline|text)\b/i.test(svg);

/**
 * Hur stor bilden verkligen är: en uppskalad bild har inga detaljer som försvinner när den skalas ner och upp igen.
 * Ger långsidan bilden hade innan den skalades upp, annars hela långsidan. Bara tydlig uppskalning (tre gånger eller
 * mer, som när en bildtjänst blåser upp en ikon) märks säkert – lättare uppskalning går inte att skilja från
 * JPEG-brus, och räknas som äkta.
 */
export async function effectiveLong(png) {
  const { data, info } = await sharp(png).flatten({ background: "#FFFFFF" }).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const long = Math.max(w, h);
  if (long < 300) return long;
  const loss = async (f) => {
    const small = await sharp(data, { raw: { width: w, height: h, channels: 1 } }).resize(Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f)), { kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
    const back = await sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: 1 } }).resize(w, h, { kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
    let d = 0;
    for (let i = 0; i < data.length; i++) d += Math.abs(data[i] - back[i]);
    return d / data.length;
  };
  // Förlusten vid en knappt märkbar nedskalning är bildens brus. Förlorar bilden inte mer än så när den krymps till en
  // fjärdedel eller en tredjedel, fanns detaljerna aldrig där.
  const noise = await loss(0.9);
  for (const f of [0.25, 0.35]) {
    if (long * f < 80) continue;
    if ((await loss(f)) < 1.15 * noise + 0.2) return Math.round(long * f);
  }
  return long;
}

/** Små bilder för att jämföra form, konturer och färger, med bakgrunden både ljus och mörk. */
async function features(png) {
  const one = async (background) => {
    const g = await sharp(png).flatten({ background }).resize(64, 64, { fit: "contain", background }).greyscale().raw().toBuffer();
    const c = await sharp(png).flatten({ background }).resize(32, 32, { fit: "contain", background }).removeAlpha().raw().toBuffer();
    const e = new Float32Array(64 * 64);
    for (let y = 1; y < 63; y++)
      for (let x = 1; x < 63; x++) {
        const gx = g[y * 64 + x + 1] - g[y * 64 + x - 1];
        const gy = g[(y + 1) * 64 + x] - g[(y - 1) * 64 + x];
        e[y * 64 + x] = Math.hypot(gx, gy);
      }
    // Färger i 12 kulörer plus mörkt och grått; bakgrundens färg räknas inte.
    const hist = new Float32Array(14);
    const bg = background === "#FFFFFF" ? 255 : 34;
    for (let i = 0; i < c.length; i += 3) {
      const [r, gg, b] = [c[i], c[i + 1], c[i + 2]];
      if (Math.abs(r - bg) < 14 && Math.abs(gg - bg) < 14 && Math.abs(b - bg) < 14) continue;
      const mx = Math.max(r, gg, b);
      const mn = Math.min(r, gg, b);
      if (mx - mn < 40) hist[mx < 90 ? 12 : 13]++;
      else {
        const d = mx - mn;
        const hue = mx === r ? ((gg - b) / d + 6) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
        hist[Math.floor(hue * 2) % 12]++;
      }
    }
    const sum = hist.reduce((a, b) => a + b, 0) || 1;
    return { g, e, hist: hist.map((v) => v / sum) };
  };
  const m = await sharp(png).metadata();
  return { light: await one("#FFFFFF"), dark: await one("#222222"), aspect: (m.width ?? 1) / (m.height ?? 1) };
}

const corr = (a, b) => {
  let sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / a.length;
  const mb = sb / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da < 1e-6 || db < 1e-6 ? 0 : num / Math.sqrt(da * db);
};

/** 0–1: hur lik en kandidat är märket vi har, på form, konturer och färger. */
export function similarity(a, b) {
  let best = 0;
  for (const x of [a.fx.light, a.fx.dark]) {
    for (const y of [b.fx.light, b.fx.dark]) {
      let inter = 0;
      for (let i = 0; i < 14; i++) inter += Math.min(x.hist[i], y.hist[i]);
      const s = 0.35 * Math.max(0, corr(x.g, y.g)) + 0.35 * Math.max(0, corr(x.e, y.e)) + 0.3 * inter;
      best = Math.max(best, s);
    }
  }
  // Ett avlångt sidhuvud är inte ett runt märke.
  const ratio = Math.max(a.fx.aspect / b.fx.aspect, b.fx.aspect / a.fx.aspect);
  return ratio > 1.35 ? best / Math.sqrt(ratio) : best;
}

/**
 * Skär bort tomma kanter. Ligger märket på en färgad panel – en delningsbild eller banderoll – skärs panelen också bort,
 * men bara när den tar en rejäl del av bilden, så att ett märke med egen fyrkantig bakgrund behåller sin marginal.
 */
async function crestCrop(png) {
  const trim = (b) => sharp(b).trim({ threshold: 24 }).png().toBuffer().catch(() => b);
  let cur = await trim(png);
  for (let pass = 0; pass < 2; pass++) {
    const a = await sharp(cur).metadata();
    const next = await trim(cur);
    const b = await sharp(next).metadata();
    if ((b.width * b.height) / (a.width * a.height) > 0.85) break;
    cur = next;
  }
  return cur;
}

/**
 * Läser en kandidat: vektor eller raster, och dess verkliga storlek efter att tomma kanter skurits bort och
 * uppskalning räknats bort. Ger också små bilder för jämförelse och en PNG för granskningen.
 */
export async function load(cand, { minLong = 64 } = {}) {
  let buf;
  let kind = "raster";
  let finalUrl = cand.url ?? null;
  if (cand.inline) {
    buf = Buffer.from(withXmlns(cand.inline));
    kind = "svg";
  } else {
    const r = await fetchBuffer(cand.url);
    if (!r) return null;
    buf = r.buf;
    finalUrl = r.url;
    const head = buf.subarray(0, 600).toString("utf8");
    if (head.startsWith("%PDF")) {
      buf = await pdfToSvg(buf).catch(() => null);
      if (!buf) return null;
      kind = "svg";
    } else if (head.startsWith("PK")) {
      const zip = await JSZip.loadAsync(buf).catch(() => null);
      const inner = zip ? Object.values(zip.files).filter((f) => !f.dir && /\.(svg|pdf|png)$/i.test(f.name) && !/__MACOSX/.test(f.name)) : [];
      const pick = inner.sort((a, b) => Number(/\.svg$/i.test(b.name)) - Number(/\.svg$/i.test(a.name)))[0];
      if (!pick) return null;
      return load({ ...cand, url: `data:application/octet-stream;base64,${(await pick.async("nodebuffer")).toString("base64")}`, source: `${cand.source} (zip: ${pick.name})` }, { minLong });
    } else if (/<svg[\s>]/i.test(buf.subarray(0, 4000).toString("utf8"))) kind = "svg";
  }
  if (kind === "svg") {
    const text = withXmlns(buf.toString("utf8"));
    if (!realVector(text)) return null;
    buf = Buffer.from(text);
  }
  try {
    const meta = await (kind === "svg" ? sharp(buf, { density: 72 }) : sharp(buf, { limitInputPixels: 80_000_000, animated: false })).metadata();
    if (!meta.width || !meta.height) return null;
    const density = kind === "svg" ? Math.min(2400, Math.max(72, Math.round((72 * 1400) / Math.max(meta.width, meta.height)))) : undefined;
    const png = await (kind === "svg" ? sharp(buf, { density }) : sharp(buf, { limitInputPixels: 80_000_000, animated: false })).ensureAlpha().png().toBuffer();
    const trimmed = await crestCrop(png);
    const tm = await sharp(trimmed).metadata();
    const px = Math.max(tm.width ?? 0, tm.height ?? 0);
    if (kind === "raster" && px < minLong) return null;
    const long = kind === "svg" ? Infinity : await effectiveLong(trimmed);
    const review = await sharp(trimmed).flatten({ background: "#FFFFFF" }).resize(512, 512, { fit: "inside" }).png().toBuffer();
    const fx = await features(trimmed);
    // Rasterbilder sparas beskurna till märket, som PNG: samma bild som mättes och granskades.
    return { ...cand, finalUrl, buf, kind, px, long, w: tm.width, h: tm.height, fx, review, ext: kind === "svg" ? "svg" : "png", out: kind === "svg" ? buf : trimmed };
  } catch {
    return null;
  }
}

/* ---------- Granskning med bildmodell ---------- */

let openai = null;
async function review(club, current, cands) {
  if (has("no-llm") || !process.env.OPENAI_API_KEY) return null;
  if (!openai) openai = new (await import("openai")).default();
  const img = (buf) => ({ type: "input_image", detail: "low", image_url: `data:image/png;base64,${buf.toString("base64")}` });
  const text = `Klubb: ${club.name}${club.municipality ? `, ${club.municipality}` : ""}${club.sport ? ` (${club.sport})` : ""}.
Bild 1 är det vi i dag har som klubbens märke, i låg upplösning.${cands.length ? ` Bild 2–${cands.length + 1} är kandidater i högre upplösning från klubbens sajt, Facebooksida eller Wikipedia.` : ""}
Är bild 1 över huvud taget ett klubbmärke eller en logga för just den här klubben? Svara nej om det är ett foto, en skärmbild, en tabell, en banderoll, en sponsors eller en plattforms logga.
${cands.length ? `Vilken kandidat visar samma klubbmärke som bild 1? Det är samma märke även om klubbnamnet står bredvid, över eller under märket i den ena bilden men inte i den andra, eller om bakgrunden skiljer sig. Det duger inte om det är en sponsor, en annan klubb, ett lagfoto, en plattforms eller ett förbunds logga, en äldre eller nyare version av märket, eller om märket är beskuret så att delar av det saknas. Det duger inte heller om kandidaten är ett foto av märket (broderat på tyg, på en flagga, en vägg eller ett plagg) eller en bild där märket bara är en liten del – kandidaten ska vara märket självt som en ren digital bild. Är bild 1 inget klubbmärke, välj bara en kandidat där klubbens namn eller initialer går att läsa. Kandidaterna är sorterade efter upplösning, bäst först: välj den första som duger. Ange kandidatens nummer (2–${cands.length + 1}), eller 0 om ingen duger. ` : ""}Läs också av klubbens färger ur märket: 2–3 färger med hex och svenskt namn, viktigast först, utan vitt och svart om de inte är bärande.
Svara som JSON: {"currentIsLogo": true | false, "best": n, "variant": "samma" | "utan namn" | "med namn" | "annan bakgrund" | "", "colors": [{"hex": "#RRGGBB", "name": ""}], "note": "kort motivering på svenska"}`;
  const res = await openai.responses.create({
    model: MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text }, img(current.review), ...cands.map((c) => img(c.review))] }],
    text: { format: { type: "json_object" } },
  });
  try {
    return { ...JSON.parse(res.output_text), usage: { in: res.usage?.input_tokens ?? 0, out: res.usage?.output_tokens ?? 0 } };
  } catch {
    return null;
  }
}

/* ---------- En klubb ---------- */

const sizeLabel = (c) => (c.kind === "svg" ? "vektor" : c.long < c.px ? `${c.long} px (uppskalad ${c.px})` : `${c.px} px`);

async function debugStrip(id, current, shortlist, chosen) {
  const tiles = [current, ...shortlist];
  const comps = [];
  for (const [i, c] of tiles.entries()) {
    const thumb = await sharp(c.review).resize(220, 220, { fit: "contain", background: "#FFFFFF" }).png().toBuffer();
    comps.push({ input: thumb, left: i * 240 + 10, top: 10 });
    const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
    const t1 = i === 0 ? "i dag" : `${i + 1}. ${c.source}`;
    const t2 = `${sizeLabel(c)}${i ? ` · likhet ${c.sim.toFixed(2)}` : ""}${c === chosen ? " · VALD" : ""}`;
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="50"><text x="10" y="18" font-family="Helvetica" font-size="12">${esc(t1.slice(0, 34))}</text><text x="10" y="36" font-family="Helvetica" font-size="12" fill="${c === chosen ? "#0A7A2F" : "#555"}">${esc(t2.slice(0, 38))}</text></svg>`), left: i * 240, top: 235 });
  }
  await mkdir(path.join(OUT, "debug"), { recursive: true });
  await sharp({ create: { width: 240 * tiles.length, height: 290, channels: 3, background: "#FFFFFF" } }).composite(comps).png().toFile(path.join(OUT, "debug", `${id}.png`));
}

async function processClub(id) {
  const started = Date.now();
  const site = JSON.parse(await readFile(path.join(ROOT, "sites", `${id}.json`), "utf8"));
  const index = JSON.parse(await readFile(path.join(ROOT, "index.json"), "utf8")).items.find((c) => c.id === id) ?? {};
  const club = { id, name: index.name ?? site.title ?? id, municipality: index.municipality, sport: index.sport };
  const current = await load({ url: `data:image/png;base64,${(await readFile(path.join(ROOT, "logos", `${id}.png`))).toString("base64")}`, source: "registret" }, { minLong: 1 });
  const before = { long: current?.px ?? 0, vector: Boolean(site.logo?.vector) };

  const raw = [
    ...(await siteCandidates(site).catch((e) => (log(club.name, "sajten:", e.message.split("\n")[0]), []))),
    ...facebookCandidates(site),
    ...(await wikiCandidates(club).catch(() => [])),
  ];
  // Varje bildadress i alla storleksvarianter, utan dubbletter.
  const seen = new Set();
  const list = [];
  for (const c of raw) {
    if (c.inline) list.push(c);
    else for (const url of variants(c.url)) if (!seen.has(url) && (seen.add(url), true)) list.push({ url, source: c.source });
  }
  const loaded = [];
  for (let i = 0; i < list.length && i < 60; i += 6) loaded.push(...(await Promise.all(list.slice(i, i + 6).map((c) => load(c).catch(() => null)))));
  const tried = loaded.filter(Boolean).map((c) => ({ ...c, sim: current ? similarity(current, c) : 0 }));
  // Bättre än det vi har: vektor, eller verkligen större. Lika nog för att kunna vara samma märke.
  const better = tried.filter((c) => c.sim >= SIM_MIN && (c.kind === "svg" || c.long >= Math.max(before.long * 1.4, before.long + 80)));
  const ranked = better.sort((a, b) => Number(b.kind === "svg") - Number(a.kind === "svg") || b.long - a.long || b.sim - a.sim);
  // De största av varje slag, så att granskaren kan välja bort en felaktig. Samma bild i flera storlekar räknas en gång.
  const shortlist = [];
  for (const c of ranked) {
    if (shortlist.length >= 4) break;
    if (shortlist.some((s) => s.kind === c.kind && similarity(s, c) > 0.97)) continue;
    shortlist.push(c);
  }

  let chosen = null;
  let verdict = null;
  if (current) verdict = await review(club, current, shortlist).catch((e) => (log(club.name, "granskning:", e.message), null));
  if (verdict) chosen = verdict.best >= 2 ? shortlist[verdict.best - 2] ?? null : null;
  else chosen = shortlist.find((c) => c.sim >= 0.6) ?? null;
  if (has("debug") && current) await debugStrip(id, current, shortlist, chosen);

  // Är registrets bild inget märke alls, ska en människa titta på klubben även om agenten hittat något.
  // Kandidaterna valdes för att likna registrets bild; är den fel finns inget att jämföra med, så agenten tar inget
  // själv – granskarens val sparas som förslag.
  const wrong = verdict?.currentIsLogo === false;
  const suggestion = wrong && chosen ? { source: chosen.source, url: chosen.finalUrl ?? "inbäddad", size: sizeLabel(chosen) } : null;
  if (wrong) chosen = null;
  // Inget gick att hämta, inte ens bilden vi redan har: sajten svarade inte. Klubben körs om nästa gång.
  const unreachable = !tried.length && Boolean(site.url || site.logo?.from);
  const status = unreachable ? "kunde inte nås" : wrong ? "fel bild i registret" : !chosen ? "inget bättre" : chosen.kind === "svg" ? "vektor" : chosen.long >= PRINT_PX ? "tryckbar" : "bättre men inte tryckbar";
  await mkdir(OUT, { recursive: true });
  if (chosen) await writeFile(path.join(OUT, `${id}.${chosen.ext}`), chosen.out);
  const record = {
    id,
    name: club.name,
    at: new Date().toISOString(),
    ms: Date.now() - started,
    status,
    before,
    after: chosen ? { source: chosen.source, url: chosen.finalUrl?.startsWith("data:") ? "inbäddad" : chosen.finalUrl ?? "inbäddad", file: `${id}.${chosen.ext}`, vector: chosen.kind === "svg", long: chosen.kind === "svg" ? null : chosen.long, px: chosen.kind === "svg" ? null : chosen.px, sim: Math.round(chosen.sim * 100) / 100 } : null,
    suggestion,
    colors: { before: (site.colors ?? []).map((c) => c.hex).slice(0, 4), read: verdict?.colors ?? null },
    variant: chosen ? verdict?.variant || null : null,
    note: verdict?.note ?? null,
    usage: verdict?.usage ?? null,
    shortlist: shortlist.map((c) => ({ source: c.source, url: c.finalUrl?.slice(0, 200) ?? "inbäddad", size: sizeLabel(c), sim: Math.round(c.sim * 100) / 100 })),
    tried: tried.map((c) => ({ source: c.source, url: c.finalUrl?.startsWith("data:") ? "inbäddad" : (c.finalUrl ?? "inbäddad").slice(0, 200), size: sizeLabel(c), sim: Math.round(c.sim * 100) / 100 })),
  };
  await writeFile(path.join(OUT, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

/* ---------- Kommandon ---------- */

async function pick(count, file) {
  const index = JSON.parse(await readFile(path.join(ROOT, "index.json"), "utf8")).items;
  const rows = [];
  for (const c of index) {
    const site = JSON.parse(await readFile(path.join(ROOT, "sites", `${c.id}.json`), "utf8").catch(() => "null"));
    if (!site?.logo || site.logo.vector) continue;
    const m = await sharp(path.join(ROOT, "logos", `${c.id}.png`)).metadata();
    const long = Math.max(m.width ?? 0, m.height ?? 0);
    if (long < PRINT_PX) rows.push({ id: c.id, long, platform: site.platform || "egen sajt" });
  }
  // Spritt över storlekar och plattformar, i proportion till hur många som finns, med fast slump så att urvalet går att göra om.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const band = (r) => (r.long < 300 ? "<300" : r.long < 600 ? "300–599" : "600–1199");
  const groups = new Map();
  for (const r of rows.sort(() => rnd() - 0.5)) {
    const k = `${band(r)} · ${r.platform}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const chosen = [];
  for (const [, g] of groups) chosen.push(...g.slice(0, Math.max(1, Math.round((g.length / rows.length) * count))));
  const ids = chosen.sort(() => rnd() - 0.5).slice(0, count).map((r) => r.id);
  await writeFile(file, `${ids.join("\n")}\n`);
  log(`${rows.length} klubbar har ett märke som inte räcker för tryck. ${ids.length} valda till ${file}.`);
}

/** Längsta tid en klubb får ta innan den ges upp. */
const CLUB_TIMEOUT_MS = 4 * 60_000;

/**
 * Varje klubb körs i en egen process. En trasig bild på en klubbsajt kan få bildbiblioteket att krascha i inbyggd kod
 * (det hände på klubb 1 617 av 4 616), och det går inte att fånga i JavaScript – utan egen process stoppade en enda
 * bild hela körningen. Kraschar eller hänger klubben sparas det som "kraschade", och klubben hoppas över nästa gång.
 */
function inChild(id) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "one", id, ...args.filter((a) => a.startsWith("--"))], { stdio: ["ignore", "pipe", "inherit"], env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), CLUB_TIMEOUT_MS);
    child.on("exit", async (code, signal) => {
      clearTimeout(timer);
      try {
        done(JSON.parse(out.trim().split("\n").pop()));
      } catch {
        const record = { id, at: new Date().toISOString(), status: "kraschade", note: signal === "SIGKILL" ? "tog längre än fyra minuter" : `processen avslutades med ${signal ?? `kod ${code}`}`, before: null, after: null, tried: [] };
        await mkdir(OUT, { recursive: true });
        await writeFile(path.join(OUT, `${id}.json`), JSON.stringify(record, null, 2));
        done(record);
      }
    });
  });
}

async function runAll(spec) {
  const all = existsSync(spec) ? (await readFile(spec, "utf8")).split(/\s+/).filter(Boolean) : spec.split(",");
  // Klubbar som redan är klara hoppas över, så att en avbruten körning kan fortsätta; --force kör om dem.
  const finished = (id) => {
    try {
      return JSON.parse(readFileSync(path.join(OUT, `${id}.json`), "utf8")).status !== "kunde inte nås";
    } catch {
      return false;
    }
  };
  const ids = has("force") ? all : all.filter((id) => !finished(id));
  if (ids.length < all.length) log(`${all.length - ids.length} klubbar är redan klara och hoppas över.`);
  const workers = Number(flag("workers", 6));
  const stats = {};
  const usage = { in: 0, out: 0 };
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (let i = next++; i < ids.length; i = next++) {
      const r = await inChild(ids[i]);
      stats[r.status] = (stats[r.status] ?? 0) + 1;
      if (r.usage) {
        usage.in += r.usage.in;
        usage.out += r.usage.out;
      }
      done++;
      log(`${String(done).padStart(3)}/${ids.length} ${String(r.name ?? r.id).slice(0, 30).padEnd(30)} ${r.status.padEnd(24)} ${r.before ? `${r.before.long} px` : ""} → ${r.after ? (r.after.vector ? "vektor" : `${r.after.long} px`) : "–"}  ${r.after?.source ?? ""}`);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  await Promise.race([browser?.close(), new Promise((ok) => setTimeout(ok, 5000))]);
  // Listpris för GPT-5 mini: 0,25 dollar per miljon tokens in och 2 dollar ut, cirka 10 kronor per dollar.
  const sek = ((usage.in * 0.25 + usage.out * 2) / 1e6) * 10;
  log(`klart: ${JSON.stringify(stats)} · granskning ${usage.in} tokens in, ${usage.out} ut, cirka ${sek.toFixed(2)} kr`);
}

async function sheet(spec, dir) {
  const ids = (await readFile(spec, "utf8")).split(/\s+/).filter(Boolean);
  await mkdir(dir, { recursive: true });
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const box = async (file) => {
    if (!file || !existsSync(file)) return null;
    const isSvg = file.endsWith(".svg");
    return sharp(await readFile(file), isSvg ? { density: 200 } : {}).flatten({ background: "#FFFFFF" }).resize(150, 150, { fit: "contain", background: "#FFFFFF" }).png().toBuffer();
  };
  for (let page = 0; page * 25 < ids.length; page++) {
    const rows = ids.slice(page * 25, page * 25 + 25);
    const cell = { w: 560, h: 190 };
    const comps = [];
    for (const [i, id] of rows.entries()) {
      const r = JSON.parse(await readFile(path.join(OUT, `${id}.json`), "utf8").catch(() => "null"));
      const x = (i % 5) * cell.w;
      const y = Math.floor(i / 5) * cell.h;
      const before = await box(path.join(ROOT, "logos", `${id}.png`));
      const after = r?.after ? await box(path.join(OUT, r.after.file)) : null;
      if (before) comps.push({ input: before, left: x + 10, top: y + 30 });
      if (after) comps.push({ input: after, left: x + 190, top: y + 30 });
      const color = r?.status === "vektor" || r?.status === "tryckbar" ? "#0A7A2F" : r?.after ? "#9A6700" : "#888";
      const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cell.h}"><text x="10" y="20" font-family="Helvetica" font-size="15" font-weight="bold">${esc((r?.name ?? id).slice(0, 44))}</text><text x="350" y="70" font-family="Helvetica" font-size="14">före: ${r?.before?.long ?? "?"} px</text><text x="350" y="92" font-family="Helvetica" font-size="14">efter: ${r?.after ? (r.after.vector ? "vektor" : `${r.after.long} px`) : "–"}</text><text x="350" y="114" font-family="Helvetica" font-size="12" fill="#555">${esc((r?.after?.source ?? "").slice(0, 30))}</text><text x="350" y="136" font-family="Helvetica" font-size="13" font-weight="bold" fill="${color}">${esc(r?.status ?? "")}</text>${after ? "" : `<text x="245" y="110" font-family="Helvetica" font-size="40" fill="#bbb">–</text>`}</svg>`;
      comps.push({ input: Buffer.from(label), left: x, top: y });
    }
    await sharp({ create: { width: cell.w * 5, height: cell.h * Math.ceil(rows.length / 5), channels: 3, background: "#FFFFFF" } })
      .composite(comps)
      .png()
      .toFile(path.join(dir, `fore-efter-${page + 1}.png`));
  }
  log(`${Math.ceil(ids.length / 25)} bilder i ${dir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, a, b] = args.filter((x) => !x.startsWith("--"));
  if (cmd === "pick") await pick(Number(a), b);
  else if (cmd === "run") await runAll(a);
  else if (cmd === "one") {
    // En klubb i en egen process (se inChild): resultatet som sista rad, som JSON.
    const r = await processClub(a).catch((e) => ({ id: a, status: `fel: ${e.message}`.slice(0, 80) }));
    await Promise.race([browser?.close(), new Promise((ok) => setTimeout(ok, 5000))]);
    process.stdout.write(`\n${JSON.stringify(r)}\n`);
  }
  else if (cmd === "sheet") await sheet(a, b);
  else console.log("node scripts/club-logos-hd.mjs pick <antal> <utfil> | run <idfil|id,id> [--workers=6] [--no-llm] [--debug] | sheet <idfil> <utmapp>");
  // Öppna anslutningar och webbläsaren får inte hålla kvar processen.
  process.exit(0);
}
