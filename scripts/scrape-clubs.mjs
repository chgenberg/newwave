// Klubbregistret: hittar varje förenings webbplats och hämtar logga, färger, typsnitt, kanaler och kontakt.
// Kör:
//   node scripts/scrape-clubs.mjs import <leadslista.xlsx>   läser listan till .data/newwave/clubs/clubs.json
//   node scripts/scrape-clubs.mjs run [--workers=4] [--limit=N] [--only=id,id] [--retry=missing,error] [--before=2026-10-21T15:34]
//   node scripts/scrape-clubs.mjs index                       bygger om index.json för sidan
//   node scripts/scrape-clubs.mjs publish <mapp>              packar registret till produktion; sedan
//     tar -czf clubs.tar.gz -C <mapp> . && gh release create clubs-<datum> clubs.tar.gz, och taggen i Dockerfile (CLUBS_RELEASE)
// Körningen kan avbrytas och startas om; färdiga klubbar hoppas över.
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), ".data", "newwave", "clubs");
const SITES = path.join(ROOT, "sites");
const LOGOS = path.join(ROOT, "logos");
const IMAGES = path.join(ROOT, "images");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const VERSION = 1;

const args = process.argv.slice(2);
const flag = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(new Date().toLocaleTimeString("sv-SE"), ...m);

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file);
}

/* ---------- Namn ---------- */

const fold = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const flat = (s) => fold(s).replace(/[^a-z0-9]/g, "");
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "klubb";

/** Förkortningar och ord som finns i tusentals namn och därför inte skiljer klubbar åt. */
const GENERIC = new Set(
  "if ik sk fk bk ff fc ibk ibf ibs hk hf gif aik bois bik gik sif iff ok bf bwk tk sok rk ssk kk ck ak cf fbk hc idrottsforening idrottsklubb idrottsallians idrottssallskap forening foreningen klubb klubben sportklubb bollklubb fotbollsklubb fotbollsforening innebandyklubb handbollsklubb hockeyklubb ishockeyklubb skidklubb ridklubb skytteforening skyttegille tennisklubb golfklubb simklubb orienteringsklubb bowlingklubb gymnastikforening friidrottsklubb brukshundklubb brukshundsklubb pro avd lokalavdelning hembygdsforening sallskap sportfiskeklubb fiskevardsforening scoutkar och av i for the of".split(" "),
);
const coreTokens = (name) => fold(name).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !GENERIC.has(t));

/** 0–1: hur väl en värddel eller sökväg ("vaksalask", "storvreta-ibk") motsvarar klubbnamnet. */
function labelMatch(label, name) {
  const l = flat(label);
  if (!l) return 0;
  const full = flat(name);
  if (l === full) return 1;
  const core = coreTokens(name);
  if (!core.length) return l.includes(full) ? 0.8 : 0;
  const has = (t) => l.includes(t) || (t.length > 5 && l.includes(t.replace(/s$/, "")));
  const hits = core.filter(has).length / core.length;
  if (hits === 1) return l.length <= full.length + 6 ? 0.9 : 0.75;
  return Math.max(hits * 0.6, has(core[0]) && core[0].length >= 5 ? 0.6 : 0);
}

/** 0–1: hur väl en sidtitel eller text nämner klubben. */
function textMatch(text, name) {
  const t = ` ${fold(text).replace(/[^a-z0-9]+/g, " ")} `;
  const full = fold(name).replace(/[^a-z0-9]+/g, " ").trim();
  if (full && t.includes(` ${full} `)) return 1;
  const core = coreTokens(name);
  if (!core.length) return 0;
  return core.filter((w) => t.includes(` ${w} `) || (w.length > 5 && w.endsWith("s") && t.includes(` ${w.slice(0, -1)} `))).length / core.length;
}

/** Ortsnamn (även genitiv) som inte räcker för att skilja en klubb från ortens tidning, kommun eller grannklubb. */
const placeWords = (club) => new Set([club.municipality, club.county].flatMap((p) => fold(p ?? "").split(/[^a-z0-9]+/)).filter((w) => w.length > 2 && w !== "lan").flatMap((w) => [w, `${w}s`]));

/** Lagdelar och verksamhetsord som inte skiljer en klubb från en annan. */
const NOISE = new Set("ungdom ungdomar ungdomssektion sektion sektionen dam damer herr herrar junior juniorer akademi utveckling lag".split(" "));
const KIND = /(klubben|klubb|foreningen|forening|sallskapet|sallskap|forbund)$/;
const NEWS = /(tidning|posten|allehanda|kuriren|nytt|nyheter|bladet|cylex|kommun|ballou|loopia|binero|oderland|webhotel)/;

/** Kommunens, tidningens eller katalogens sajt, även när klubben använder den som e-postdomän. */
function publicSite(club, cand) {
  const domain = cand.host.replace(/\.[a-z]+$/, "");
  return !cand.platform && (NEWS.test(domain) || placeWords(club).has(flat(domain.split(".").pop())));
}

/** Sidan måste bära klubbens första egna namnord, och om det är orten även ett till eller namnets förkortning ("Avesta BK"). */
function identity(club, cand, data) {
  const name = club.name.replace(/\(.*?\)/g, " ");
  const core = coreTokens(name).filter((w) => !NOISE.has(w));
  if (!core.length) return true;
  const places = placeWords(club);
  const domain = cand.host.replace(/\.[a-z]+$/, "");
  const label = flat(`${domain} ${cand.platform ? new URL(cand.url).pathname : ""}`);
  const title = `${data.title} ${data.siteName} ${data.h1}`;
  const text = ` ${fold(title).replace(/[^a-z0-9]+/g, " ")} `;
  const has = (w) => {
    const forms = w.length > 5 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w];
    const stem = w.replace(KIND, "").replace(/s$/, "");
    return forms.some((f) => text.includes(` ${f} `) || label.includes(f)) || (stem !== w && stem.length >= 4 && (text.includes(stem) || label.includes(stem)));
  };
  const key = core.find((w) => !KIND.test(w)) ?? core[0];
  if (!places.has(key)) return has(key) || fold(data.text).includes(key);
  if (!has(key)) return false;
  const words = fold(name).split(/[^a-z0-9]+/).filter((w) => w && !NOISE.has(w));
  const firsts = [words[0], words[0].endsWith("s") ? words[0].slice(0, -1) : `${words[0]}s`];
  const shorts = firsts.flatMap((f) => words.slice(1).map((_, i) => [f, ...words.slice(1, i + 2)].map((w) => ABBR[w] ?? w).join("")));
  const flatTitle = flat(title);
  return core.some((w) => w !== key && has(w)) || shorts.some((x) => label.includes(x) || flatTitle.includes(x)) || [data.title, data.siteName, data.h1].some((t) => textMatch(t, name) === 1);
}

/* ---------- Import av Excel ---------- */

const PERSONAL_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|mac|telia|bredband|bredband2|comhem|tele2|spray|swipnet|passagen|home|glocalnet|bahnhof|ownit|tiscali|aol|protonmail|proton|mail|post|privat|telenor|bbtele|tdcadsl|chello|algonet|euromail|everyday|mhmail|pro|hem|jmail)\./;

async function importXlsx(file) {
  const zip = await JSZip.loadAsync(await readFile(file));
  const xml = (p) => zip.file(p)?.async("string") ?? Promise.resolve("");
  const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = [...(await xml("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheet = await xml("xl/worksheets/sheet1.xml");
  const col = (ref) => ref.replace(/\d+/g, "").split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const out = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = c[2].match(/t="(\w+)"/)?.[1];
      const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      out[col(c[1])] = type === "s" ? shared[Number(v)] : type === "inlineStr" ? unescape(c[3].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "") : v === undefined ? null : unescape(v);
    }
    return out;
  });
  const head = rows[0].map((h) => String(h ?? "").trim());
  const at = (name) => head.indexOf(name);
  const I = { name: at("Kundnamn"), county: at("Län"), municipality: at("Kommun"), org: at("Organisationstillhörighet"), sport: at("Primär organisationsidentitet"), surplus: at("Totalt_H20-V21_Överskott"), envelopes: at("Antal kuvert H2025"), orgNr: at("Organisationsnummer"), email: at("E-post") };
  if (I.name < 0) throw new Error("Hittade ingen kolumn Kundnamn");
  const titled = (s) => (s && s !== "-" ? String(s).trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : "");
  const used = new Set();
  const clubs = [];
  for (const r of rows.slice(1)) {
    const name = String(r[I.name] ?? "").trim();
    if (!name) continue;
    const orgNr = String(r[I.orgNr] ?? "").trim();
    let id = slug(name);
    if (used.has(id)) id = `${id}-${orgNr.replace(/\D/g, "").slice(-4) || clubs.length}`;
    while (used.has(id)) id = `${id}-${clubs.length}`;
    used.add(id);
    const domain = String(r[I.email] ?? "").split("@")[1]?.trim().toLowerCase().replace(/[>\s].*$/, "");
    const sport = String(r[I.sport] ?? "").trim();
    clubs.push({
      id,
      name,
      county: titled(r[I.county]),
      municipality: String(r[I.municipality] ?? "").trim(),
      org: String(r[I.org] ?? "").trim(),
      sport: sport && sport !== "Saknas" ? sport : "",
      orgNr,
      surplus: Number(r[I.surplus]) || 0,
      envelopes: Number(r[I.envelopes]) || 0,
      ...(domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !PERSONAL_MAIL.test(domain) ? { mailDomain: domain } : {}),
    });
  }
  await writeJson(path.join(ROOT, "clubs.json"), clubs);
  log(`${clubs.length} klubbar, ${clubs.filter((c) => c.mailDomain).length} med egen e-postdomän → ${path.relative(process.cwd(), ROOT)}/clubs.json`);
}

/* ---------- Sökning ---------- */

/** Sajter som nämner klubbar men inte är klubbens egen. */
const NOT_CLUB =
  /(^|\.)(wikipedia\.org|facebook\.com|instagram\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|tiktok\.com|allabolag\.se|ratsit\.se|merinfo\.se|hitta\.se|eniro\.se|bolagsfakta\.se|proff\.se|foretagsfakta\.se|upplysning\.se|syna\.se|largestcompanies\.com|creditsafe\.com|kreditrapporten\.se|bizzdo\.se|fotbollszonen\.se|svenskfotboll\.se|innebandy\.se|handbollslaget\.se|everysport\.com|cupmate\.nu|intersport\.se|stadium\.se|fritidforalla\.se|mynewsdesk\.com|google\.[a-z.]+|bing\.com|duckduckgo\.com|brave\.com|kommun\.se|regionen\.se|rf\.se|svenskidrott\.se|sisuidrottsutbildarna\.se|swehockey\.se|svenskbandy\.se|minfotboll\.se|fogis\.se|profixio\.com|sportadmin\.se|idrottsforeningar\.se|foreningsliv\.se|wikidata\.org|mapcarta\.com|yelp\.[a-z]+|tripadvisor\.[a-z.]+|gulasidorna\.se|amazon\.[a-z.]+|ebay\.[a-z.]+|blocket\.se|tradera\.com|aftonbladet\.se|expressen\.se|svd\.se|dn\.se|gp\.se|sydsvenskan\.se|nt\.se|corren\.se|unt\.se|na\.se|vlt\.se|bt\.se|hd\.se|mitti\.se|lokaltidningen\.se|svt\.se|sverigesradio\.se|tv4\.se|ungdomsbarometern\.se|bingolotto\.se|svenskaspel\.se|kuvert\.se|pinterest\.[a-z.]+|reddit\.com|apple\.com|play\.google\.com|wordpress\.com\/?$)$/;

/** Plattformar där klubbens sida är första delen av sökvägen. */
const PLATFORMS = { "laget.se": "Laget.se", "svenskalag.se": "SvenskaLag", "idrottonline.se": "IdrottOnline", "sportadmin.se": "SportAdmin", "klubbenonline.se": "KlubbenOnline", "foreningsdata.se": "Föreningsdata" };
const platformOf = (host) => Object.keys(PLATFORMS).find((p) => host === p || host.endsWith(`.${p}`));

/** Bing släpper bara igenom en riktig webbläsare, så den söker i en egen flik som behåller sina kakor. */
let bingPage = null;
async function bingSearch(q) {
  if (!bingPage || bingPage.isClosed() || !bingPage.context().browser()?.isConnected()) {
    await bingPage?.context().browser()?.close().catch(() => {});
    const b = await launchBrowser();
    const ctx = await b.newContext({ locale: "sv-SE", viewport: { width: 1280, height: 900 }, userAgent: UA });
    bingPage = await ctx.newPage();
  }
  const res = await bingPage.goto(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=sv&cc=SE`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await bingPage.waitForSelector("li.b_algo h2 a, #b_results .b_no", { timeout: 8000 }).catch(() => {});
  const results = await bingPage.$$eval("li.b_algo h2 a", (as) => as.map((a) => ({ url: a.href, title: a.textContent ?? "" }))).catch(() => []);
  const blocked = !results.length && /captcha|challenge|verify|verifiera/i.test(`${await bingPage.title().catch(() => "")} ${(await bingPage.content().catch(() => "")).slice(0, 20_000)}`);
  return {
    status: res?.status() ?? 0,
    blocked,
    results: results.map((r) => {
      try {
        const u = new URL(r.url).searchParams.get("u");
        return u?.startsWith("a1") ? { ...r, url: Buffer.from(u.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString() } : r;
      } catch {
        return r;
      }
    }),
  };
}

const ENGINES = {
  bing: { gap: 8000, run: bingSearch },
  brave: {
    gap: 9000,
    url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`,
    parse: (html) =>
      [...html.matchAll(/data-type="web"[\s\S]*?<a href="(https?:\/\/[^"]+)"[\s\S]*?<div class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => ({ url: decodeHtml(m[1]), title: stripTags(m[2]) })),
  },
  ddg: {
    gap: 7000,
    url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=se-sv`,
    parse: (html) =>
      [...html.matchAll(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
        .map((m) => {
          const href = decodeHtml(m[1]);
          const u = href.match(/[?&]uddg=([^&]+)/)?.[1];
          return { url: u ? decodeURIComponent(u) : href.startsWith("//") ? `https:${href}` : href, title: stripTags(m[2]) };
        })
        .filter((r) => /^https?:\/\//.test(r.url) && !/duckduckgo\.com\/y\.js/.test(r.url)),
  },
};
const engineState = Object.fromEntries(Object.keys(ENGINES).map((k) => [k, { next: 0, blockedUntil: 0, strikes: 0, transient: 0, queries: 0 }]));
const decodeHtml = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripTags = (s) => decodeHtml(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function fetchEngine(q, e) {
  const res = await fetch(e.url(q), { headers: { "User-Agent": UA, "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.5", Accept: "text/html" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const html = res ? await res.text().catch(() => "") : "";
  const results = res?.ok ? e.parse(html) : [];
  return { status: res?.status ?? 0, results, blocked: !res || res.status === 429 || res.status === 403 || (!results.length && /captcha|anomaly|unusual traffic|too many requests|are you a robot|challenge/i.test(html)) };
}

let searchChain = Promise.resolve();
/** Alla sökningar går i en kö: varje motor får ett eget avstånd mellan anropen och vilar länge om den börjar blockera. */
function search(q) {
  const run = searchChain.then(async () => {
    for (let lap = 0; lap < 40; lap++) {
      const now = Date.now();
      const ready = Object.entries(engineState)
        .filter(([, s]) => s.blockedUntil <= now)
        .sort((a, b) => a[1].next - b[1].next);
      if (!ready.length) {
        const wake = Math.min(...Object.values(engineState).map((s) => s.blockedUntil));
        log(`alla sökmotorer vilar, väntar ${Math.round((wake - now) / 60000)} min`);
        await sleep(Math.max(5000, wake - now));
        continue;
      }
      const [name, s] = ready[0];
      if (s.next > now) await sleep(s.next - now);
      const e = ENGINES[name];
      s.next = Date.now() + e.gap + Math.random() * 3000;
      s.queries++;
      const { status, blocked, transient, results } = await (e.run ?? fetchEngine)(q, e).catch((err) => ({ status: String(err.message ?? err).slice(0, 60), blocked: true, transient: true, results: [] }));
      if (transient && ++s.transient < 4) {
        s.blockedUntil = Date.now() + 30_000;
        if (name === "bing") await bingPage?.context().browser()?.close().catch(() => {});
        continue;
      }
      s.transient = 0;
      if (blocked) {
        s.strikes++;
        s.blockedUntil = Date.now() + Math.min(60, 5 * 2 ** (s.strikes - 1)) * 60_000;
        log(`${name} blockerar (${status || "inget svar"}), vilar ${Math.round((s.blockedUntil - Date.now()) / 60000)} min`);
        continue;
      }
      s.strikes = 0;
      return { engine: name, results: results.slice(0, 10) };
    }
    return { engine: "", results: [] };
  });
  searchChain = run.catch(() => {});
  return run;
}

/** Sökträffar blir kandidater med en poäng för hur troligt det är att de är klubbens egen sida. */
function rankResults(club, results) {
  const out = [];
  results.forEach((r, rank) => {
    let u;
    try {
      u = new URL(r.url);
    } catch {
      return;
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (NOT_CLUB.test(host) || /\.(pdf|docx?|xlsx?)$/i.test(u.pathname)) return;
    const platform = platformOf(host);
    let site, label;
    if (platform) {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (!seg && host === platform) return;
      label = host === platform ? seg : host.slice(0, -platform.length - 1);
      site = host === platform ? `https://${u.hostname}/${seg}` : `https://${u.hostname}`;
    } else {
      label = host.split(".").slice(0, -1).join(".");
      site = `${u.protocol}//${u.hostname}`;
    }
    const byHost = labelMatch(label, club.name);
    const byTitle = textMatch(r.title, club.name);
    const score = byHost * 60 + byTitle * 25 + (10 - rank) - (platform ? 6 : 0) + (club.mailDomain && host.endsWith(club.mailDomain) ? 40 : 0);
    out.push({ url: site, host, platform: platform ? PLATFORMS[platform] : "", score: Math.round(score), byHost, byTitle, title: r.title.slice(0, 120) });
  });
  const seen = new Set();
  return out.sort((a, b) => b.score - a.score).filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/* ---------- Gissade adresser ---------- */

/** Vanliga förkortningar i föreningars domäner, t.ex. "Moheds Sportklubb" → mohedssk.se. */
const ABBR = { sportklubb: "sk", sportklubben: "sk", idrottsforening: "if", idrottsforeningen: "if", idrottsklubb: "ik", idrottsklubben: "ik", idrottssallskap: "is", bollklubb: "bk", bollklubben: "bk", bandyklubb: "bk", bandyklubben: "bk", fotbollsklubb: "fk", fotbollsforening: "ff", innebandyklubb: "ibk", innebandyforening: "ibf", handbollsklubb: "hk", handbollsforening: "hf", hockeyklubb: "hk", ishockeyklubb: "hk", tennisklubb: "tk", golfklubb: "gk", skidklubb: "sk", simklubb: "sk", ridklubb: "rk", ryttarforening: "rf", skytteforening: "sf", bowlingklubb: "bk", orienteringsklubb: "ok", friidrottsklubb: "fik", gymnastikforening: "gf", brukshundklubb: "bk", basketklubb: "bbk", bordtennisklubb: "btk", badmintonklubb: "bmk", motorklubb: "mk", segelsallskap: "ss", kanotklubb: "kk", cykelklubb: "ck" };

function guessCandidates(club) {
  const words = fold(club.name).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return { domains: [], pages: [] };
  const full = words.join("");
  const short = words.map((w) => ABBR[w] ?? w).join("");
  const places = placeWords(club);
  const core = words.filter((w) => !GENERIC.has(w) && !ABBR[w] && !places.has(w)).join("");
  const bases = [...new Set([full, short, core.length >= 6 ? core : ""])].filter((b) => b.length >= 4 && b.length <= 40);
  const raw = club.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/);
  return {
    domains: bases.flatMap((b) => [`${b}.se`, `${b}.nu`, `${b}.com`]),
    pages: [...new Set([`https://www.svenskalag.se/${full}`, `https://www.svenskalag.se/${short}`, `https://www.laget.se/${raw.join("")}`, `https://www.laget.se/${raw.join("_")}`])],
  };
}

/** Domäner som finns i DNS och plattformssidor som inte svarar 404; inga sökmotorer behövs. */
async function guessSites(club) {
  const { domains, pages } = guessCandidates(club);
  const live = await Promise.all(domains.map(async (d) => ((await lookup(d).catch(() => null)) ? d : null)));
  const out = live.filter(Boolean).map((host) => ({ url: `https://${host}`, host, platform: "", score: 80, byHost: labelMatch(host.split(".")[0], club.name), byTitle: 0, title: "gissad adress", guessed: true }));
  for (const url of pages) {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    await res?.body?.cancel().catch(() => {});
    if (res?.ok && new URL(res.url).pathname.length > 1) {
      const host = new URL(url).hostname.replace(/^www\./, "");
      out.push({ url, host, platform: PLATFORMS[host], score: 75, byHost: labelMatch(new URL(url).pathname.slice(1), club.name), byTitle: 0, title: "gissad adress", guessed: true });
    }
    await sleep(400);
  }
  return out.sort((a, b) => b.byHost - a.byHost).slice(0, 4);
}

/* ---------- Webbläsaren ---------- */

const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80)/i;
const hostOk = new Map();
const isPublicHost = (host) => {
  if (!hostOk.has(host)) {
    if (hostOk.size > 5000) hostOk.clear();
    hostOk.set(
      host,
      lookup(host, { all: true })
        .then((all) => all.length > 0 && all.every((a) => !PRIVATE.test(a.address)))
        .catch(() => false),
    );
  }
  return hostOk.get(host);
};

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const opts = { args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-blink-features=AutomationControlled"] };
  return process.env.CHROMIUM_PATH ? chromium.launch({ ...opts, executablePath: process.env.CHROMIUM_PATH }) : chromium.launch({ ...opts, channel: "chrome" });
}

/** Webbläsaren byts efter ett antal sajter mot minnesläckor; den gamla stängs först när dess sista flik är klar. */
let current = null;
let launching = null;
async function acquire() {
  while (!current || current.uses >= 150 || !current.browser.isConnected()) {
    if (!launching) {
      launching = launchBrowser().then((browser) => {
        const old = current;
        current = { browser, uses: 0, active: 0 };
        if (old) {
          old.retired = true;
          if (old.active === 0) old.browser.close().catch(() => {});
        }
      });
      launching.finally(() => (launching = null)).catch(() => {});
    }
    await launching;
  }
  current.uses++;
  current.active++;
  return current;
}
function release(h) {
  h.active--;
  if (h.retired && h.active === 0) h.browser.close().catch(() => {});
}

/** Körs i sidan. Bara vanlig webbläsar-JS; inget från Node får användas här. */
function collect(words) {
  const meta = (k) => document.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.content?.trim() ?? "";
  const clean = (s, n) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const abs = (u) => {
    try {
      return new URL(u, location.href).toString();
    } catch {
      return "";
    }
  };
  const largest = (srcset) =>
    (srcset ?? "")
      .split(",")
      .map((s) => s.trim().split(/\s+/))
      .filter((p) => p[0])
      .sort((a, b) => parseFloat(b[1] ?? "0") - parseFloat(a[1] ?? "0"))[0]?.[0] ?? "";
  const flatten = (s) => s.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]/g, "");
  /** Inbäddad SVG med de beräknade färgerna inskrivna, så att den kan ritas utanför sidan. */
  const svgString = (svg) => {
    if (svg.querySelector("use, image, foreignObject")) return "";
    const clone = svg.cloneNode(true);
    const from = [svg, ...svg.querySelectorAll("*")];
    const to = [clone, ...clone.querySelectorAll("*")];
    from.forEach((e, k) => {
      const cs = getComputedStyle(e);
      for (const p of ["fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "opacity", "font-family", "font-weight", "font-size"]) to[k].setAttribute(p, cs.getPropertyValue(p));
      if (cs.display === "none" || cs.visibility === "hidden") to[k].setAttribute("display", "none");
      to[k].removeAttribute("class");
      to[k].removeAttribute("style");
    });
    const r = svg.getBoundingClientRect();
    if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    clone.setAttribute("width", String(r.width));
    clone.setAttribute("height", String(r.height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const out = new XMLSerializer().serializeToString(clone);
    return out.length < 300_000 ? out : "";
  };

  let ldLogo = "";
  const sameAs = [];
  const walk = (v, d) => {
    if (!v || typeof v !== "object" || d > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    const type = String(v["@type"] ?? "");
    if (/Organization|SportsTeam|SportsOrganization|SportsClub|LocalBusiness|NGO/i.test(type)) {
      const l = typeof v.logo === "string" ? v.logo : v.logo?.url;
      if (l && !ldLogo) ldLogo = abs(l);
      if (Array.isArray(v.sameAs)) sameAs.push(...v.sameAs.filter((s) => typeof s === "string"));
    }
    Object.values(v).forEach((x) => walk(x, d + 1));
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      walk(JSON.parse(s.textContent ?? ""), 0);
    } catch {}
  });

  const brand = [...words, flatten(meta("og:site_name"))].filter((w) => w.length >= 3);
  const logos = [];
  let n = 0;
  document.querySelectorAll("img, svg, a[class*='logo' i], div[class*='logo' i], span[class*='logo' i]").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "svg" && el.closest("svg")) return;
    if (el.parentElement?.closest("svg")) return;
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.top + scrollY > 420 || r.width < 20 || r.height < 16 || r.width > 640 || r.height > 320) return;
    let bg = "";
    if (tag !== "img" && tag !== "svg") {
      const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(el).backgroundImage);
      if (!m || m[1].startsWith("data:")) return;
      bg = abs(m[1]);
    }
    const link = el.closest("a");
    let home = false;
    try {
      const u = new URL(link?.getAttribute("href") ?? "", location.href);
      home = u.hostname === location.hostname && u.pathname.split("/").filter(Boolean).length <= 1;
    } catch {}
    const hay = [el, el.parentElement, link]
      .map((e) => (e ? `${e.getAttribute("class") ?? ""} ${e.id} ${e.getAttribute("alt") ?? ""} ${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""} ${e.getAttribute("src") ?? ""}` : ""))
      .join(" ")
      .toLowerCase();
    let score = 0;
    if (/logo|brand|emblem|crest|klubbmarke|klubbmärke|vapen/.test(hay)) score += 40;
    if (brand.some((w) => flatten(hay).includes(w))) score += 35;
    if (home) score += 25;
    if (el.closest("header, nav, [role=banner], [class*='header' i], [class*='navbar' i], [class*='topbar' i]")) score += 15;
    if (r.top + scrollY < 200) score += 8;
    if (/flag|lang|locale|country|sprak|språk|cart|user|account|search|menu|hamburger|lucide|icon|sponsor|partner|swish|klarna|facebook|instagram|youtube|twitter|tiktok|linkedin|app-?store|google-?play|publisher logo|laget-logo|laget_se|fallbackimg|header-background|\/img\/headers\/|svenskalag\.se\/img\/logo|idrottonline.*logo-io/.test(hay)) score -= 70;
    if (r.width < 32 && r.height < 32) score -= 25;
    if (score < 25) return;
    el.setAttribute("data-club-logo", String(n));
    logos.push({ i: n++, tag, src: tag === "img" ? largest(el.getAttribute("srcset")) || el.currentSrc || el.src : bg, svg: tag === "svg" ? svgString(el) : "", w: Math.round(r.width), h: Math.round(r.height), score });
  });

  const socials = {};
  const SOCIAL = { facebook: /facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)/i, instagram: /instagram\.com\/(?!p\/|explore)/i, youtube: /youtube\.com\/(channel|c\/|user|@)/i, tiktok: /tiktok\.com\/@/i, x: /(twitter|x)\.com\/(?!intent|share|home)/i, linkedin: /linkedin\.com\/(company|school)/i };
  const emails = new Set();
  const phones = new Set();
  let shop = "";
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("mailto:")) emails.add(decodeURIComponent(href.slice(7).split("?")[0]).trim().toLowerCase());
    else if (href.startsWith("tel:")) phones.add(href.slice(4).replace(/[^\d+]/g, ""));
    const url = abs(href);
    for (const [k, re] of Object.entries(SOCIAL)) if (!socials[k] && re.test(url)) socials[k] = url.split("?")[0];
    if (!shop && /webbshop|klubbshop|butik|shop|supportershop|merch|klubbkläder|klubbklader/i.test(`${a.textContent} ${href}`) && !/shopify\.com\/?$|apps\.apple|play\.google/i.test(url)) shop = url;
  }
  for (const s of sameAs) for (const [k, re] of Object.entries(SOCIAL)) if (!socials[k] && re.test(s)) socials[k] = s;
  const body = document.body?.innerText ?? "";
  for (const m of body.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) if (emails.size < 6) emails.add(m[0].toLowerCase());
  const founded = /(?:grundad|grundades|bildad|bildades|startades|founded|sedan)\D{0,24}((?:18|19|20)\d\d)/i.exec(body)?.[1] ?? "";

  const colors = {};
  const add = (c, w) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.6)) return;
    const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    colors[hex] = (colors[hex] ?? 0) + w;
  };
  document.querySelectorAll("header, nav, footer, [class*='header' i], [class*='navbar' i], [class*='menu' i], button, .btn, [class*='button' i], h1, h2, a").forEach((el, k) => {
    if (k > 1500 || !visible(el)) return;
    const r = el.getBoundingClientRect();
    const area = Math.min(r.width * r.height, 400_000);
    const cs = getComputedStyle(el);
    add(cs.backgroundColor, area / 1000);
    if (/^(H1|H2|A|BUTTON)$/.test(el.tagName)) add(cs.color, Math.min(30, (r.width * r.height) / 2000));
  });
  const font = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim() : "";
  };
  const icons = [...document.querySelectorAll("link[rel~='icon'], link[rel='apple-touch-icon'], link[rel='apple-touch-icon-precomposed']")].map((l) => ({ href: abs(l.getAttribute("href") ?? ""), rel: l.getAttribute("rel") ?? "", sizes: parseInt(l.getAttribute("sizes") ?? "0") || 0 }));

  let hero = meta("og:image") ? abs(meta("og:image")) : "";
  if (!hero) {
    let best = 0;
    document.querySelectorAll("img").forEach((img) => {
      const r = img.getBoundingClientRect();
      const a = r.width * r.height;
      if (r.top + scrollY < 1100 && a > best && r.width > 400 && img.naturalWidth > 500 && !/logo|icon|sponsor/i.test(img.src + img.className)) {
        best = a;
        hero = largest(img.getAttribute("srcset")) || img.currentSrc || img.src;
      }
    });
  }

  return {
    title: clean(document.title, 160),
    description: clean(meta("og:description") || meta("description"), 400),
    siteName: clean(meta("og:site_name"), 80),
    h1: clean(document.querySelector("h1")?.textContent, 120),
    lang: document.documentElement.lang,
    themeColor: meta("theme-color"),
    hero,
    ldLogo,
    logos: logos.sort((a, b) => b.score - a.score).slice(0, 5),
    icons,
    socials,
    emails: [...emails].filter((e) => !/\.(png|jpe?g|gif|svg|webp)$|example|sentry|wixpress|domain\.|@2x/.test(e)).slice(0, 4),
    phones: [...phones].filter((p) => p.length >= 8).slice(0, 3),
    shop,
    founded,
    colors: Object.entries(colors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([hex, w]) => ({ hex, w: Math.round(w) })),
    fonts: { heading: font("h1") || font("h2"), body: font("p") || getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim() },
    text: clean(body, 3000),
  };
}

async function fetchBuffer(url, timeoutMs = 10_000, max = 6_000_000) {
  if (url.startsWith("data:image/")) {
    const [head, b] = url.split(",", 2);
    return head.includes(";base64") ? Buffer.from(b, "base64") : Buffer.from(decodeURIComponent(b));
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(u.protocol) || !(await isPublicHost(u.hostname))) return null;
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8" } }).catch(() => null);
    if (!res) return null;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      u = new URL(loc, u);
      continue;
    }
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    return buf.length && buf.length <= max ? buf : null;
  }
  return null;
}

/* ---------- Logga och färger ---------- */

const withXmlns = (svg) => (/\sxmlns=/.test(svg.match(/<svg\b[^>]*>/i)?.[0] ?? "") ? svg : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"'));

/** Gör bakgrunden genomskinlig, beskär och skalar. Avvisar foton och för små bilder. */
async function cleanLogo(buf, minSide) {
  const isSvg = /<svg[\s>]/i.test(buf.subarray(0, 3000).toString("utf8"));
  const input = isSvg ? Buffer.from(withXmlns(buf.toString("utf8"))) : buf;
  const meta = await sharp(input, isSvg ? { density: 72 } : { limitInputPixels: 40_000_000 }).metadata();
  const density = isSvg ? Math.min(2400, Math.max(72, Math.round((72 * 900) / Math.max(meta.width ?? 100, meta.height ?? 100)))) : undefined;
  const { data, info } = await sharp(input, density ? { density } : { limitInputPixels: 40_000_000, animated: false })
    .resize(900, 900, { fit: "inside", withoutEnlargement: !isSvg })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 250) opaque++;
  if (opaque / (w * h) > 0.97) {
    const px = (x, y) => [0, 1, 2].map((c) => data[(y * w + x) * 4 + c]);
    const cs = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
    const bg = [0, 1, 2].map((c) => cs.reduce((s, p) => s + p[c], 0) / 4);
    const near = (k) => Math.hypot(data[k] - bg[0], data[k + 1] - bg[1], data[k + 2] - bg[2]);
    if (cs.some((p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) > 40)) throw new Error("foto");
    let edge = 0, edgeBg = 0;
    for (let x = 0; x < w; x += 3)
      for (const y of [0, h - 1]) {
        edge++;
        if (near((y * w + x) * 4) < 40) edgeBg++;
      }
    for (let y = 0; y < h; y += 3)
      for (const x of [0, w - 1]) {
        edge++;
        if (near((y * w + x) * 4) < 40) edgeBg++;
      }
    if (edgeBg / edge < 0.85) throw new Error("foto");
    for (let k = 0; k < data.length; k += 4) {
      const d = near(k);
      const t = Math.min(1, Math.max(0, (d - 22) / 48));
      data[k + 3] = Math.round(data[k + 3] * t * t * (3 - 2 * t));
    }
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 24) {
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("tom");
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (Math.max(bw, bh) < minSide || bh < 14 || bw / bh > 9 || bh / bw > 4 || count / (bw * bh) < 0.03) throw new Error("ingen tydlig logga");
  const pad = Math.round(Math.max(bw, bh) * 0.03);
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: Math.min(w - left, bw + 2 * pad), height: Math.min(h - top, bh + 2 * pad) })
    .resize(640, 640, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return { png, vector: isSvg };
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/** Loggans färger i andelar, och om dess ytterkant mest är vit (då försvinner den på ljus botten och visas på mörk). */
async function logoPalette(png) {
  const { data, info } = await sharp(png).resize(160, 160, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map();
  let n = 0, edge = 0, edgeLight = 0;
  const clear = (x, y) => x < 0 || y < 0 || x >= info.width || y >= info.height || data[(y * info.width + x) * 4 + 3] < 100;
  for (let k = 0; k < data.length; k += 4) {
    if (data[k + 3] < 160) continue;
    const c = [data[k], data[k + 1], data[k + 2]];
    n++;
    const x = (k / 4) % info.width, y = Math.floor(k / 4 / info.width);
    if (clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1)) {
      edge++;
      if (lum(c) > 0.85 && sat(c) < 0.18) edgeLight++;
    }
    const key = c.map((v) => v >> 5).join(",");
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += c[0];
    b.g += c[1];
    b.b += c[2];
    buckets.set(key, b);
  }
  const colors = [...buckets.values()]
    .filter((b) => b.n > n * 0.03)
    .sort((a, b) => b.n - a.n)
    .map((b) => ({ hex: hex(b.r / b.n, b.g / b.n, b.b / b.n), share: Math.round((b.n / n) * 100) / 100 }));
  const merged = [];
  for (const c of colors) {
    const near = merged.find((m) => Math.hypot(...rgbOf(m.hex).map((v, i) => v - rgbOf(c.hex)[i])) < 48);
    if (near) near.share = Math.round((near.share + c.share) * 100) / 100;
    else merged.push({ ...c });
  }
  return { colors: merged.slice(0, 6), onDark: edge > 0 && edgeLight / edge > 0.35 };
}

/** Klubbens profilfärger: loggans färger först; sidans theme-color och starkaste färg bara när loggan inte ger två. */
function brandColors(logo, page) {
  const out = [];
  const push = (h, source) => {
    if (!/^#[0-9A-F]{6}$/i.test(h)) return;
    const c = rgbOf(h);
    if (out.some((o) => Math.hypot(...rgbOf(o.hex).map((v, i) => v - c[i])) < 52)) return;
    out.push({ hex: h.toUpperCase(), source });
  };
  for (const c of logo?.colors ?? []) if (sat(rgbOf(c.hex)) > 0.25 || (lum(rgbOf(c.hex)) < 0.2 && c.share > 0.15)) push(c.hex, "logga");
  if (out.length < 2) {
    if (page?.themeColor && /^#[0-9a-f]{6}$/i.test(page.themeColor)) push(page.themeColor, "webbplats");
    const strong = (page?.colors ?? []).find((c) => sat(rgbOf(c.hex)) > 0.3 && lum(rgbOf(c.hex)) > 0.05 && lum(rgbOf(c.hex)) < 0.92);
    if (strong) push(strong.hex, "webbplats");
  }
  for (const c of logo?.colors ?? []) push(c.hex, "logga");
  return out.filter((c) => !(lum(rgbOf(c.hex)) > 0.94 && sat(rgbOf(c.hex)) < 0.1)).slice(0, 4);
}

/* ---------- En klubb ---------- */

/** Webbläsarkontroller (Cloudflare m.fl.) som släpper igenom en riktig Chrome efter några sekunder. */
const CHALLENGE = /checking your browser|just a moment|attention required|please wait|one moment|ddos-guard|vänta/i;

async function visit(url, club) {
  const handle = await acquire();
  const context = await handle.browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2, locale: "sv-SE", userAgent: UA, ignoreHTTPSErrors: true });
  try {
    await context.addInitScript({ content: "globalThis.__name ??= (f) => f;" });
    await context.route("**/*", async (route) => {
      const req = route.request();
      let u;
      try {
        u = new URL(req.url());
      } catch {
        return route.abort();
      }
      if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
      if (!/^https?:$/.test(u.protocol) || ["media", "websocket", "eventsource"].includes(req.resourceType())) return route.abort();
      if (/googletagmanager|google-analytics|doubleclick|facebook\.net|hotjar|clarity\.ms/.test(u.hostname)) return route.abort();
      return (await isPublicHost(u.hostname)) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch((e) => {
      if (url.startsWith("https:") && /ERR_SSL|ERR_CERT|ERR_CONNECTION_(REFUSED|RESET|CLOSED)/.test(e.message)) return page.goto(url.replace(/^https:/, "http:"), { waitUntil: "domcontentloaded", timeout: 25_000 });
      throw e;
    });
    const title = () => page.title().catch(() => "");
    if (res && res.status() >= 400) {
      const challenged = CHALLENGE.test(await title());
      for (let i = 0; challenged && i < 15 && CHALLENGE.test(await title()); i++) await page.waitForTimeout(1000);
      if (!challenged || CHALLENGE.test(await title())) throw new Error(`HTTP ${res.status()}`);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await dismissCookies(page);
    await page.waitForTimeout(500);
    const finalUrl = page.url();
    if (!(await isPublicHost(new URL(finalUrl).hostname))) throw new Error("intern adress");
    const words = [flat(club.name), ...coreTokens(club.name)].filter((w) => w.length >= 3);
    const data = await page.evaluate(collect, words);
    await page
      .evaluate(() => {
        for (const el of document.querySelectorAll("[data-club-logo]"))
          for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            a.style.setProperty("background", "transparent", "important");
            a.style.setProperty("box-shadow", "none", "important");
          }
      })
      .catch(() => {});
    const shots = [];
    for (const l of data.logos.slice(0, 3)) {
      if (l.tag === "img" && l.src) continue;
      const png = await page
        .locator(`[data-club-logo="${l.i}"]`)
        .first()
        .screenshot({ omitBackground: true, timeout: 4000 })
        .catch(() => null);
      if (png) shots.push({ i: l.i, png });
    }
    return { finalUrl, data, shots };
  } catch (e) {
    if (/Target .*closed|browser has been closed|has been closed/i.test(String(e?.message))) handle.uses = Infinity;
    throw e;
  } finally {
    await context.close().catch(() => {});
    release(handle);
  }
}

async function dismissCookies(page) {
  for (const label of ["Godkänn alla", "Acceptera alla", "Tillåt alla", "Jag godkänner", "Godkänn", "Acceptera", "OK", "Accept all", "Accept"]) {
    const btn = page.getByRole("button", { name: label, exact: true }).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      return;
    }
  }
}

async function pickLogo(club, visited) {
  const { data, shots } = visited;
  const tries = [];
  if (data.ldLogo) tries.push({ kind: "url", value: data.ldLogo, source: "strukturerad data", min: 64 });
  for (const l of data.logos) {
    const shot = shots.find((s) => s.i === l.i);
    if (l.tag === "img" && l.src) tries.push({ kind: "url", value: l.src, source: "sidhuvudet", min: 64 });
    else if (l.svg) tries.push({ kind: "buf", value: Buffer.from(l.svg), source: "inbäddad SVG", min: 32 });
    else if (l.src) tries.push({ kind: "url", value: l.src, source: "sidhuvudet (bakgrund)", min: 64 });
    if (shot) tries.push({ kind: "buf", value: shot.png, source: "skärmdump av sidhuvudet", min: 56 });
  }
  const touch = data.icons.filter((i) => /apple-touch/.test(i.rel) || i.sizes >= 120 || /\.svg/i.test(i.href)).sort((a, b) => b.sizes - a.sizes);
  for (const i of touch.slice(0, 2)) tries.push({ kind: "url", value: i.href, source: "appikon", min: 96, icon: true });
  for (const t of tries.slice(0, 8)) {
    const buf = t.kind === "buf" ? t.value : await fetchBuffer(t.value);
    if (!buf) continue;
    try {
      const { png, vector } = await cleanLogo(buf, t.min);
      return { png, vector, source: t.source, icon: Boolean(t.icon), from: t.kind === "url" && !t.value.startsWith("data:") ? t.value.slice(0, 300) : "" };
    } catch (e) {
      if (process.env.DEBUG) log("logga", t.source, String(t.value).slice(0, 80), e.message);
    }
  }
  return null;
}

async function heroImage(url) {
  const buf = url ? await fetchBuffer(url, 10_000, 12_000_000) : null;
  if (!buf) return null;
  try {
    const m = await sharp(buf, { limitInputPixels: 60_000_000 }).metadata();
    if ((m.width ?? 0) < 400 || (m.height ?? 0) < 200) return null;
    return await sharp(buf, { limitInputPixels: 60_000_000, animated: false }).rotate().flatten({ background: "#FFFFFF" }).resize(960, 600, { fit: "cover", position: "attention" }).jpeg({ quality: 74, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}

/** En sida räknas som klubbens om adressen eller sidans namn tydligt motsvarar klubben. */
function confidence(club, cand, { data, finalUrl }) {
  const landed = { ...cand, host: new URL(finalUrl).hostname.replace(/^www\./, "") };
  const named = Math.max(textMatch(data.title, club.name), textMatch(data.siteName, club.name), textMatch(data.h1, club.name));
  const inText = textMatch(data.text, club.name);
  const place = club.municipality && fold(data.text).includes(fold(club.municipality)) ? 1 : 0;
  const sport = club.sport && fold(data.text).includes(fold(club.sport).slice(0, 6)) ? 1 : 0;
  const mail = club.mailDomain && cand.host.endsWith(club.mailDomain) ? 1 : 0;
  if (publicSite(club, cand) || publicSite(club, landed) || (!mail && !identity(club, cand, data))) return Math.min(35, Math.round(cand.byHost * 40 + named * 30));
  const score = cand.byHost * 40 + named * 30 + inText * 10 + place * 8 + sport * 5 + mail * 30;
  return Math.min(100, Math.round(mail && identity(club, cand, data) ? Math.max(score, 60) : score));
}

async function processClub(club) {
  const started = Date.now();
  const tried = [];
  let candidates = [];
  if (club.mailDomain) candidates.push({ url: `https://${club.mailDomain}`, host: club.mailDomain, platform: "", score: 100, byHost: labelMatch(club.mailDomain.split(".")[0], club.name), byTitle: 0, title: "e-postdomän" });
  const queries = [`${club.name} ${club.municipality}${club.sport ? ` ${club.sport}` : ""}`, `"${club.name}" ${club.municipality || club.county} förening`];
  const engines = [];
  const runSearch = async () => {
    const q = queries[engines.length];
    if (!q) return false;
    const r = await search(q);
    engines.push(r.engine);
    candidates.push(...rankResults(club, r.results).filter((c) => !candidates.some((x) => x.url === c.url)));
    candidates = [...candidates.slice(0, 1), ...candidates.slice(1).sort((a, b) => b.score - a.score)];
    return true;
  };
  let best = null;
  const seen = new Set();
  if (!club.mailDomain) {
    for (const cand of await guessSites(club).catch(() => [])) {
      seen.add(cand.url);
      try {
        const page = await visit(cand.url, club);
        const conf = confidence(club, cand, page);
        const named = Math.max(textMatch(page.data.title, club.name), textMatch(page.data.siteName, club.name), textMatch(page.data.h1, club.name));
        tried.push({ url: cand.url, conf, guessed: true });
        if (named >= 0.5 && (!best || conf > best.conf)) best = { cand, visited: page, conf };
        if (best?.conf >= 55) break;
      } catch (e) {
        tried.push({ url: cand.url, guessed: true, error: String(e.message ?? e).slice(0, 120) });
      }
    }
    if (!(best?.conf >= 55)) await runSearch();
  }

  for (let round = 0; round < 3 && !(best && best.conf >= 55); round++) {
    let tries = 0;
    for (const cand of candidates) {
      if (seen.has(cand.url)) continue;
      if (tries >= 3 || (cand.score < 30 && cand.byHost < 0.5)) break;
      seen.add(cand.url);
      tries++;
      try {
        const page = await visit(cand.url, club);
        const conf = confidence(club, cand, page);
        tried.push({ url: cand.url, conf });
        if (!best || conf > best.conf) best = { cand, visited: page, conf };
        if (conf >= 55) break;
      } catch (e) {
        tried.push({ url: cand.url, error: String(e.message ?? e).slice(0, 120) });
      }
    }
    if (best && best.conf >= 55) break;
    if (!(await runSearch())) break;
  }
  if (best && best.conf < 40) best = null;

  const base = { v: VERSION, id: club.id, at: new Date().toISOString(), ms: Date.now() - started, query: queries.slice(0, engines.length).join(" · "), engine: engines.join(","), tried, candidates: candidates.slice(0, 5).map(({ url, score }) => ({ url, score })) };
  if (!best) return { ...base, status: "missing" };

  const { cand, visited, conf } = best;
  const d = visited.data;
  const logo = await pickLogo(club, visited).catch(() => null);
  const palette = logo ? await logoPalette(logo.png) : null;
  if (logo) await writeFile(path.join(LOGOS, `${club.id}.png`), logo.png);
  const hero = d.hero && d.hero !== logo?.from && d.hero !== d.ldLogo ? await heroImage(d.hero) : null;
  if (hero) await writeFile(path.join(IMAGES, `${club.id}.jpg`), hero);
  const host = new URL(visited.finalUrl).hostname.replace(/^www\./, "");
  return {
    ...base,
    status: "found",
    url: cand.platform ? cand.url : visited.finalUrl.replace(/[?#].*$/, ""),
    host,
    platform: cand.platform || PLATFORMS[platformOf(host)] || "",
    confidence: conf,
    title: d.title,
    siteName: d.siteName,
    description: d.description,
    logo: logo ? { source: logo.source, from: logo.from, vector: logo.vector, icon: logo.icon, onDark: palette.onDark, colors: palette.colors } : null,
    hero: Boolean(hero),
    colors: brandColors(palette, d),
    siteColors: d.colors.slice(0, 8),
    themeColor: d.themeColor,
    fonts: d.fonts,
    socials: d.socials,
    emails: d.emails,
    phones: d.phones,
    shop: d.shop,
    founded: d.founded,
    lang: d.lang,
  };
}

/* ---------- Index för sidan ---------- */

/** Paraplyorganisationer vars föreningar är klubbar som tränar och tävlar; pensionärs-, patient- och hembygdsföreningar visas inte. */
const CLUB_ORGS = new Set([
  "Riksidrottsförbundet",
  "",
  "Svenska Pistolskytteförbundet",
  "Sveriges Schackförbund",
  "Svenska Bridgeförbundet",
  "Förbundet Svensk Bridge",
  "Sveriges Sportfiske- och Fiskevårdsförbund",
  "Svenska Frisksportförbundet",
  "KFUM Sverige",
  "KFUK/KFUM Riksförbund",
  "Förbundet Aktiv Ungdom",
  "Svenska Kennelklubben",
  "Svenska Båtunionen",
  "Sveriges Motorcyklisters Centralorganisa",
  "Sveriges MotorCyklister",
]);
/** Lag och träningsgrupper står i listan som "Klubb (Lag: P-05)" – de är en del av en klubb, inte en egen. */
const TEAM = /\((lag|grupp|sektion|team)\b|\((?!\d{4}\))[^)]*\d[^)]*\)|,\s*[pfhd]\s?\d/i;
const GONE = /upph[öo]rt|slutat|nedlagd|vilande|inaktiverad|dublett/i;
/** Förbund och distrikt står ibland med i listan men är inte klubbar. */
const FEDERATION = /förbund(et)?\b|riksförbund|distrikt/i;

const word = (w) => `(?<!\\p{L})(?:${w})(?!\\p{L})`;
/** Ord som bara en idrottsklubbs webbplats har i rubriken eller beskrivningen. */
const SPORTY = new RegExp(
  word(
    "if|ik|fk|bk|sk|hk|ok|ff|fc|bc|kk|gk|ck|tk|aif|gif|ifk|ibk|ibf|bbk|btk|goif|mc|mck|team|club|united|bandy|karate|judo|boxning|friidrott|curling|rugby|bridge|schack|badminton|taekwondo|parkour|motocross|sällskap\\p{L}*|sim\\p{L}*|kanot\\p{L}*|rodd\\p{L}*|basket\\p{L}*|volley\\p{L}*|cheer\\p{L}*|matcher|träning\\p{L}*|tävling\\p{L}*|" +
      ["klubb", "förening", "idrott", "sport", "fotboll", "hockey", "handboll", "innebandy", "golf", "ryttar", "ridsport", "ridskol", "skytt", "tennis", "bowling", "orientering", "brott", "dans", "gymnast", "cykel", "skid", "segel", "segling", "hund", "fiske", "motor", "kamp", "båt", "flyg", "skate", "fäkt", "klätt", "boule", "bangolf", "biljard", "dart", "dyk", "löp", "triathlon", "skridsko", "konståk", "trav", "jakt", "pistol", "enduro", "speedway", "rally", "karting"].map((w) => `\\p{L}*${w}\\p{L}*`).join("|"),
  ),
  "iu",
);
/** Domäner till salu, parkerade sidor och samfälligheter. */
const PARKED = /samfällighet|for sale|till salu|godaddy|hugedomains|dynadot|sedo|dan\.com|domain names|domain broker|buy this domain|köp domänen|inaktiv sida|webbhotell/i;
/** Företag, kommuner och byar – fel webbplats när inget i texten låter som idrott. */
const BUSINESS = new RegExp(word("ab|kommun|bryggeri|camping|stugor|hotell|vandrarhem|restaurang|café|cafe|fönster|machinery|maskiner|släp|for rent|houses|byn|by med|guide|hitta lokala|eurodance|craftsmanship|församling|körsällskap|\\p{L}*domän\\p{L}*|\\p{L}*fastighet\\p{L}*|\\p{L}*butik\\p{L}*|\\p{L}*advokat\\p{L}*|\\p{L}*kyrka\\p{L}*|\\p{L}*tillverk\\p{L}*|\\p{L}*scout\\p{L}*|\\p{L}*bygd\\p{L}*"), "iu");
/** Föreningar som inte är idrottsklubbar. */
const NOT_SPORT = /scout|hembygd|byalag|samhällsförening|intresseförening|försvarsutbildarna|^svenska .*klubben$|^pro\b|pensionär|körsällskap|riksförbund|hjärt|lung/i;
const COMMON = /^(if|ik|fk|bk|sk|hk|ok|ff|aif|gif|ifk|ibk|ibf)$|klubb|forening|sallskap|idrott/;
/** Ord i klubbens namn som varken är orten eller ett föreningsord, som "björklöven" i IF Björklöven. */
const ownWords = (c) => (fold(c.name).match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !COMMON.test(w) && !fold(c.municipality).includes(w.replace(/s$/, "")));

/**
 * Klubbens egen webbplats: rubriken, beskrivningen eller adressen låter som en idrottsklubb, eller bär klubbens eget namn
 * utan att vara ett företag, en kommun eller en domän till salu. Annars är webbplatsen – och märket därifrån – fel.
 */
function clubSite(c, s) {
  const text = [s.title, s.siteName, s.description, s.host.replace(/[.-]/g, " ")].filter(Boolean).join(" · ");
  if (PARKED.test(text)) return false;
  if (SPORTY.test(text)) return true;
  if (BUSINESS.test(text)) return false;
  const label = fold(s.host.replace(/^www\./, "").split(".")[0]);
  const first = fold(c.name).match(/[a-z0-9]+/)?.[0] ?? "";
  // Adresser som knivstais.se och kalixmk.se: ortens namn och klubbens förkortning.
  const suffix = label.slice(first.length);
  if (first.length >= 3 && label.startsWith(first) && suffix.length >= 1 && suffix.length <= 6 && !/^(sweden|sverige|info|online|city|turism|nu|se)$/.test(suffix)) return true;
  const abbreviations = c.name.match(/(?<!\p{L})\p{Lu}{2,5}(?!\p{L})/gu) ?? [];
  if (abbreviations.some((a) => new RegExp(word(a), "iu").test(text))) return true;
  return ownWords(c).some((w) => fold(text).includes(w));
}

/** Sidan visar bara klubbar med eget klubbmärke från klubbens egen webbplats. */
const listed = (c, s) => s?.status === "found" && Boolean(s.logo) && CLUB_ORGS.has(c.org) && !TEAM.test(c.name) && !GONE.test(c.name) && !FEDERATION.test(c.name) && !NOT_SPORT.test(c.name) && clubSite(c, s);

/** Webbplatsen, med föreningens egen sida på plattformar som laget.se där många klubbar delar domän. */
function siteOf(url) {
  const u = new URL(url);
  const first = u.pathname.split("/").find(Boolean);
  return u.hostname.replace(/^www\./, "") + (first ? `/${first.toLowerCase()}` : "");
}
const GENERIC_WORDS = new Set("if ik fk bk sk hk ok kf ff bc ifk aif gif ibk ibf goif idrottsförening idrottsklubb sportklubb bollklubb fotboll fotbollsklubb innebandy innebandyklubb handboll handbollsklubb hockey ishockey bandy golfklubb ridklubb skytteförening skyttegille tennisklubb bowlingklubb orientering orienteringsklubb simklubb friidrott ungdom förening klubb sektion herr damer damfotboll korpen motions".split(" "));
const nameWords = (name) => new Set((name.toLowerCase().match(/[a-zåäöéü]{3,}/g) ?? []).filter((w) => !GENERIC_WORDS.has(w)).map((w) => w.replace(/s$/, "")));

/**
 * Samma bild som klubbmärke på olika klubbars webbplatser är plattformens ikon, en parkerad domän eller ett märke som
 * hamnat hos fel klubb – utom när klubbarna delar namn, som sektionerna i samma förening.
 */
async function sharedLogos(candidates) {
  const byImage = new Map();
  for (const { c, s } of candidates) {
    const data = await readFile(path.join(LOGOS, `${c.id}.png`)).catch(() => null);
    if (!data) continue;
    const key = createHash("sha1").update(data).digest("hex");
    byImage.set(key, [...(byImage.get(key) ?? []), { c, s }]);
  }
  const wrong = new Set();
  for (const group of byImage.values()) {
    if (group.length < 2 || new Set(group.map(({ s }) => siteOf(s.url))).size < 2) continue;
    const [first, ...rest] = group.map(({ c }) => nameWords(c.name));
    if (![...first].some((w) => rest.every((r) => r.has(w)))) for (const { c } of group) wrong.add(c.id);
  }
  return wrong;
}

/**
 * Tre eller fler klubbar på samma webbplats är ortens, förbundets eller seriens sajt. Där står bara klubbar kvar vars
 * namn börjar som en annans på sajten, som sektionerna "IK Ymer Orientering" och "IK Ymer Fotboll".
 */
function sharedSites(candidates) {
  const bySite = new Map();
  for (const x of candidates) bySite.set(siteOf(x.s.url), [...(bySite.get(siteOf(x.s.url)) ?? []), x]);
  const wrong = new Set();
  for (const group of bySite.values()) {
    if (group.length < 3) continue;
    const heads = group.map(({ c }) => fold(c.name).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 2).join(" "));
    group.forEach(({ c }, i) => {
      if (!heads[i].includes(" ") || heads.filter((h) => h === heads[i]).length < 2) wrong.add(c.id);
    });
  }
  return wrong;
}

async function buildIndex() {
  const clubs = JSON.parse(await readFile(path.join(ROOT, "clubs.json"), "utf8"));
  const files = new Set(existsSync(SITES) ? await readdir(SITES) : []);
  const candidates = [];
  for (const c of clubs) {
    const s = files.has(`${c.id}.json`) ? JSON.parse(await readFile(path.join(SITES, `${c.id}.json`), "utf8").catch(() => "null")) : null;
    if (listed(c, s)) candidates.push({ c, s });
  }
  const wrong = new Set([...(await sharedLogos(candidates)), ...sharedSites(candidates)]);
  const items = [];
  for (const { c, s } of candidates) {
    if (wrong.has(c.id)) continue;
    items.push({
      id: c.id,
      name: c.name,
      county: c.county,
      municipality: c.municipality,
      sport: c.sport,
      org: c.org,
      surplus: c.surplus,
      url: s.url,
      host: s.host,
      platform: s.platform,
      confidence: s.confidence,
      onDark: Boolean(s.logo.onDark),
      hero: s.hero,
      colors: s.colors.map((x) => x.hex),
      socials: Object.keys(s.socials ?? {}),
      founded: s.founded,
      at: s.at,
    });
  }
  await writeJson(path.join(ROOT, "index.json"), { builtAt: new Date().toISOString(), items });
  return items;
}

/* ---------- Paket till produktion ---------- */

/** E-post och telefonnummer i löptext. */
const CONTACT = /[\w.+-]+@[\w-]+(\.[\w-]+)+|(\+46|\b0)[\d\s-]{6,}\d/g;
/** Fält som inte lämnar datorn: kontaktuppgifter och sökspåret. */
const UNPUBLISHED = ["emails", "phones", "query", "engine", "tried", "candidates", "ms"];

/**
 * Packar de listade klubbarna till `dir` med samma mappar som registret, utan kontaktuppgifter och med mindre bilder.
 * Produktionen hämtar paketet som release-tillgång (se Dockerfile) och läser det när `.data` saknar registret.
 */
async function publish(dir) {
  if (!dir) throw new Error("Ange en mapp: publish <mapp>");
  const index = JSON.parse(await readFile(path.join(ROOT, "index.json"), "utf8"));
  // Leadslistans siffror stannar på datorn; ordningen bär storleken så att sorteringen på storlek står kvar.
  const items = index.items.sort((a, b) => b.surplus - a.surplus).map((c) => ({ ...c, surplus: 0 }));
  const ids = new Set(items.map((c) => c.id));
  const out = (...p) => path.join(dir, ...p);
  await Promise.all(["sites", "logos", "images"].map((d) => mkdir(out(d), { recursive: true })));
  const clubs = JSON.parse(await readFile(path.join(ROOT, "clubs.json"), "utf8"));
  await writeJson(out("clubs.json"), clubs.filter((c) => ids.has(c.id)).map((c) => ({ ...c, mailDomain: undefined, surplus: 0, envelopes: 0 })));
  await writeJson(out("index.json"), { builtAt: index.builtAt, items });
  let n = 0;
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const s = JSON.parse(await readFile(path.join(SITES, `${c.id}.json`), "utf8"));
        for (const k of UNPUBLISHED) delete s[k];
        if (!/^https?:/i.test(s.shop ?? "")) delete s.shop;
        for (const k of ["title", "siteName", "description"]) if (s[k]) s[k] = s[k].replace(CONTACT, "").replace(/\s{2,}/g, " ").trim();
        await writeJson(out("sites", `${c.id}.json`), s);
        const logo = sharp(path.join(LOGOS, `${c.id}.png`)).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true });
        await logo.png({ palette: true, quality: 95, effort: 8 }).toFile(out("logos", `${c.id}.png`));
        if (c.hero && existsSync(path.join(IMAGES, `${c.id}.jpg`)))
          await sharp(path.join(IMAGES, `${c.id}.jpg`)).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(out("images", `${c.id}.jpg`));
        if (++n % 500 === 0) log(`${n}/${items.length}`);
      }
    }),
  );
  log(`${items.length} klubbar packade i ${dir}`);
}

/* ---------- Körning ---------- */


async function run() {
  const clubs = JSON.parse(await readFile(path.join(ROOT, "clubs.json"), "utf8"));
  await Promise.all([SITES, LOGOS, IMAGES].map((d) => mkdir(d, { recursive: true })));
  const retry = new Set((flag("retry", "") || "").split(",").filter(Boolean));
  const only = new Set((flag("only", "") || "").split(",").filter(Boolean));
  const before = flag("before", "") ? new Date(flag("before", "")).toISOString() : "";
  const done = new Map();
  for (const f of await readdir(SITES)) {
    if (!f.endsWith(".json")) continue;
    const s = JSON.parse(await readFile(path.join(SITES, f), "utf8").catch(() => "null"));
    if (s) done.set(s.id, s);
  }
  const queue = clubs
    .filter((c) => (only.size ? only.has(c.id) : !done.has(c.id) || retry.has(done.get(c.id).status) || (before && done.get(c.id).at < before)))
    .sort((a, b) => Number(Boolean(b.mailDomain)) - Number(Boolean(a.mailDomain)) || b.surplus - a.surplus)
    .slice(0, Number(flag("limit", "0")) || undefined);
  const workers = Number(flag("workers", "4"));
  log(`${queue.length} klubbar i kö (${done.size} klara sedan tidigare), ${workers} arbetare`);
  const stats = { found: 0, missing: 0, error: 0, logo: 0 };
  let n = 0;
  let indexAt = 0;
  const t0 = Date.now();
  const next = () => queue.shift();
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let club = next(); club; club = next()) {
        let result;
        try {
          result = await Promise.race([processClub(club), sleep(180_000).then(() => Promise.reject(new Error("tidsgräns")))]);
        } catch (e) {
          result = { v: VERSION, id: club.id, at: new Date().toISOString(), status: "error", error: String(e?.message ?? e).slice(0, 200) };
        }
        await writeJson(path.join(SITES, `${club.id}.json`), result);
        stats[result.status]++;
        if (result.logo) stats.logo++;
        n++;
        const rate = n / ((Date.now() - t0) / 3_600_000);
        log(`${String(n).padStart(5)} ${result.status.padEnd(7)} ${club.name.slice(0, 34).padEnd(34)} ${result.status === "found" ? `${result.host} ${result.confidence}% ${result.logo ? "logga" : "–"}` : (result.error ?? "")}  [${stats.found} hittade, ${stats.logo} loggor, ${Math.round(rate)}/h]`);
        if (n - indexAt >= 25) {
          indexAt = n;
          await buildIndex().catch((e) => log("index", e.message));
        }
      }
    }),
  );
  await buildIndex();
  await current?.browser.close().catch(() => {});
  await bingPage?.context().browser()?.close().catch(() => {});
  log(`klart: ${stats.found} hittade, ${stats.logo} med logga, ${stats.missing} utan webbplats, ${stats.error} fel`);
}

const cmd = args[0];
if (cmd === "import") await importXlsx(args[1]);
else if (cmd === "run") await run();
else if (cmd === "index") log(`${(await buildIndex()).length} klubbar i index.json`);
else if (cmd === "publish") await publish(args[1]);
else console.log("Använd: import <fil.xlsx> | run [--workers=4] [--limit=N] [--only=id] [--retry=missing,error] [--before=tid] | index | publish <mapp>");
process.exit(0);
