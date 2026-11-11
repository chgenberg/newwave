import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { seasonFor, upcomingOccasions } from "./calendar";
import { ASA_IF, CLUBS } from "./club";
import { copyFor } from "./copy";
import { registryAsset } from "./newwave/clubAssets";
import { CLUBS_DIR, clubDetail } from "./newwave/clubRegistry";
import { deltaE, hexToRgb, rgbToHex, type Rgb } from "./scarf";
import { loadFile, saveFile } from "./store";
import type { Club, ColorToken, Signal, SourceStatus } from "./types";

/**
 * Vem halsdukarna görs för. Tre sorters beställare går genom samma flöde:
 * – en klubb med full profil i lib/club.ts (referensen är klubbens id),
 * – en klubb ur klubbregistret (`reg:<id>`), där färgerna läses ur klubbmärket,
 * – en egen uppladdad logga (`own:<id>`), sparad tillsammans med namnet.
 * Inspirationsbanken (scripts/scarf-bank.ts) bygger sina profiler med samma funktioner.
 */

// --- Färger ur märket ----------------------------------------------------------

const lum = ([r, g, b]: Rgb) => r * 0.299 + g * 0.587 + b * 0.114;
const sat = ([r, g, b]: Rgb) => (Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b));

/** Märkets färger efter yta: närliggande nyanser slås ihop, kantutjämning och småfläckar faller bort. */
export async function crestColors(crest: Buffer) {
  const { data } = await sharp(crest).resize(140, 140, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    total++;
  }
  const clusters: { rgb: [number, number, number]; w: number; hex: string }[] = [];
  for (const [key, n] of [...buckets].sort((a, b) => b[1] - a[1])) {
    const rgb: Rgb = [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4];
    const hex = rgbToHex(rgb);
    const c = clusters.find((x) => deltaE(x.hex, hex) < 17);
    if (c) {
      c.rgb = [(c.rgb[0] * c.w + rgb[0] * n) / (c.w + n), (c.rgb[1] * c.w + rgb[1] * n) / (c.w + n), (c.rgb[2] * c.w + rgb[2] * n) / (c.w + n)];
      c.w += n;
    } else clusters.push({ rgb: [...rgb], w: n, hex });
  }
  return clusters
    .map((c) => {
      const rgb = c.rgb.map(Math.round) as Rgb;
      // Mörk marin är inte svart: bara det som är mörkt i alla kanaler räknas som svart.
      const hex = lum(rgb) > 238 && sat(rgb) < 0.08 ? "#FFFFFF" : Math.max(...rgb) < 58 ? "#0A0A0A" : rgbToHex(rgb);
      return { hex, share: c.w / (total || 1) };
    })
    .filter((c) => c.share >= 0.04)
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);
}

function colorName(hex: string) {
  const rgb = hexToRgb(hex);
  const [r, g, b] = rgb.map((v) => v / 255);
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const l = lum(rgb);
  if (l > 238 && sat(rgb) < 0.1) return "Vit";
  if (Math.max(...rgb) < 58) return "Svart";
  if (sat(rgb) < 0.14) return l > 150 ? "Ljusgrå" : "Grå";
  const d = max - min;
  const h = ((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  if (h < 16 || h >= 335) return l < 70 ? "Vinröd" : "Röd";
  if (h < 40) return l < 120 || (sat(rgb) < 0.6 && l < 170) ? "Brun" : "Orange";
  if (h < 66) return sat(rgb) < 0.72 ? "Guld" : "Gul";
  if (h < 170) return l < 70 ? "Mörkgrön" : "Grön";
  if (h < 200) return "Turkos";
  if (h < 245) return l < 62 ? "Mörkblå" : "Blå";
  if (h < 300) return "Lila";
  return "Rosa";
}

const isGrey = (hex: string) => {
  const rgb = hexToRgb(hex);
  return sat(rgb) < 0.16 && lum(rgb) >= 30 && lum(rgb) <= 238;
};

/** En kulör – varken vit, svart eller grå. */
const isChromatic = (hex: string) => {
  const rgb = hexToRgb(hex);
  return sat(rgb) >= 0.16 && Math.max(...rgb) >= 58 && !(lum(rgb) > 238 && sat(rgb) < 0.1);
};

/**
 * Profilens färger i ordning: de bärande först – störst yta i märket, där vitt väger hälften eftersom det ofta är
 * bakgrund och grått räknas som skuggning – sedan vitt och svart. Angivna kulörer (Bilaga 1) går alltid först.
 */
export function paletteOf(crest: { hex: string; share: number }[], given?: string[]): ColorToken[] {
  const out: string[] = [];
  const add = (hex: string, min = 12) => {
    if (out.length < 5 && !out.some((o) => deltaE(o, hex) < min)) out.push(hex.toUpperCase());
  };
  given?.forEach((h) => add(h));
  const carriers = crest
    .filter((c) => !isGrey(c.hex))
    .map((c) => ({ hex: c.hex, w: c.hex === "#FFFFFF" ? c.share * 0.5 : c.share }))
    .sort((a, b) => b.w - a.w);
  // Nyanser av en angiven kulör är kantutjämning i märket, inte egna färger.
  carriers.slice(0, 3).forEach((c) => add(c.hex, given?.length ? 34 : 12));
  if (out.length < 2) crest.filter((c) => isGrey(c.hex)).slice(0, 1).forEach((c) => add(c.hex));
  add("#FFFFFF");
  add("#0A0A0A");
  const seen = new Map<string, number>();
  return out.map((hex) => {
    const base = colorName(hex);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { name: n > 1 ? `${base} ${n}` : base, hex };
  });
}

// --- Profilen ------------------------------------------------------------------

/** Det som behövs för att göra en profil av en organisation utan egen regelbok. */
export type Org = {
  id: string;
  name: string;
  city: string;
  /** Sporten, eller för företag och föreningar vad de gör. */
  category: string;
  group: "idrott" | "annat";
  founded?: number;
  /** Maskoten, som får ritas som eget motiv. */
  mascot?: string;
};

const short = (name: string) => (name.length <= 6 ? name : name.split(/\s+/).map((w) => (w === w.toLocaleUpperCase("sv-SE") ? w : w[0])).join("").toLocaleUpperCase("sv-SE").slice(0, 5));

export function clubOf(p: Org, palette: ColorToken[], crest: { hex: string }[]): Club {
  const what = p.category.toLocaleLowerCase("sv-SE");
  const colors = `${palette.map((c) => `${c.name.toLocaleLowerCase("sv-SE")} ${c.hex}`).join(", ")}`;
  const base = {
    ...ASA_IF,
    id: p.id,
    unlisted: true,
    copy: undefined,
    name: p.name,
    shortName: short(p.name),
    nicknames: [p.name],
    city: p.city,
    arena: "",
    founded: p.founded ?? 0,
    tagline: "",
    newsQuery: `"${p.name}"`,
    palette,
    crestColors: crest.map((c) => c.hex),
    sources: { website: "", weather: { place: p.city, lat: 0, lon: 0 } },
  };
  if (p.group === "annat") {
    return {
      ...base,
      kind: "brand",
      tone: `Varm, personlig och lokal – ${what}${p.city ? ` i ${p.city}` : ""}. Glimten i ögat, aldrig reklamig.`,
      rules: [
        `Endast profilens färger: ${colors}.`,
        "Endast den officiella loggan. Den får aldrig ändras, beskäras eller färgläggas om. AI ritar aldrig logga.",
        "Inga verkliga personers namn eller ansikten utan godkännande.",
        "Inga säljfraser, priser eller erbjudanden på halsduken.",
        "Aldrig konkurrenters namn, loggor eller färger.",
      ],
      agent: {
        ...ASA_IF.agent,
        name: `${p.name}-agenten`,
        mission: `Ta fram stickade halsdukar som medarbetare, kunder och grannar till ${p.name} vill bära.`,
        guidelines: [`Följ ${p.name}s färger utan undantag.`, "Använd det som är verksamhetens eget: loggan, namnet och det man gör.", "Allt ska kännas som en gåva man blir glad över – inte som reklam.", "Aldrig namn eller ansikten utan godkännande."],
      },
    };
  }
  return {
    ...base,
    tone: `Varm, stolt och lokal förening${p.city ? ` i ${p.city}` : ""} – ${what} för alla åldrar. Glimten i ögat, aldrig kaxig mot andra klubbar.`,
    rules: [
      `Endast klubbens färger: ${colors}.`,
      "Endast det officiella klubbmärket. Det får aldrig ändras, beskäras eller färgläggas om. AI ritar aldrig märke eller logga.",
      "Inga spelares eller barns namn, ansikten eller nummer utan godkännande.",
      `Motiv ska höra hemma i ${what}${p.city ? ` eller i ${p.city}` : ""}.`,
      ...(p.mascot ? [`Klubbens maskot, ${p.mascot}, får ritas som eget motiv på halsduken. Det är beställt av klubben och räknas inte som ett nytt klubbmärke.`] : []),
      "Inga svordomar, hat eller personangrepp – och aldrig elakt mot andra klubbar.",
    ],
    agent: {
      ...ASA_IF.agent,
      name: `${p.name}-agenten`,
      mission: `Ta fram stickade halsdukar som medlemmar, föräldrar och supportrar i ${p.name} vill bära.`,
      guidelines: [
        `Följ ${p.name}s färger utan undantag.`,
        `Använd det som är klubbens eget: märket, namnet${p.city ? `, orten ${p.city}` : ""} och sporten ${what}.`,
        "Allt ska kännas som något medlemmarna vill bära – inte som reklam.",
        "Aldrig namn, ansikten eller nummer utan godkännande. Aldrig hat, svordomar eller personangrepp.",
      ],
    },
  };
}

// --- Signaler ------------------------------------------------------------------

/** Vad sporten eller verksamheten betyder för en halsduk. */
export const SPORT: Record<string, string> = {
  Fotboll: "Gräs, läktare och söndagsmatcher – föreningen är byns mötesplats.",
  Innebandy: "Fart, plast och hallgolv – vintersäsongen är i full gång.",
  Handboll: "Hallen, klistret och klacken – säsongen pågår hela vintern.",
  Ishockey: "Is, puck och kalla hallar – halsduken hör till.",
  Bandy: "Stor is, kyla och varm dryck på läktaren – bandyn är halsdukens sport.",
  Orientering: "Skog, karta och kompass.",
  Ridsport: "Stall, tävlingsdagar och kalla ridhus.",
  Simning: "Simhall, tävlingar och föräldrar på läktaren.",
  Basket: "Hallen, tempot och korgen.",
  Golf: "Vintern är väntan på säsongen – och en halsduk i klubbshoppen.",
  Skidor: "Snö, spår och minusgrader – här bärs halsduken på riktigt.",
  Segling: "Hamnen, bryggan och höstens upptagning.",
  Kafé: "Ett stamställe – halsduken säljs över disk och bärs av personalen.",
  Byggföretag: "Arbetslag som står ute hela vintern.",
  Förskola: "Barn, föräldrar och pedagoger – en halsduk till hela huset.",
  Restaurang: "Personalen på uteserveringen och gästerna som vill ta med sig ett minne.",
  Teknikbolag: "Medarbetare och kunder – en present som faktiskt används.",
  Bostadsrättsförening: "Grannar som känner varandra – en halsduk till gårdsfesten och städdagen.",
};

/**
 * Signalerna för en organisation utan egen profil: kalendern, årstiden och det som är organisationens eget.
 * Matcher och väder kräver uppgifter som bara klubbarna med full profil har.
 */
export function orgSignals(org: Org, now = new Date()): { signals: Signal[]; sources: SourceStatus[] } {
  const sport = org.group === "idrott";
  const nextYear = now.getUTCFullYear() + 1;
  const what = org.category.toLocaleLowerCase("sv-SE");
  const own: Signal[] = [
    { id: "own-what", kind: "club", title: `${sport ? "Sporten" : "Verksamheten"}: ${what}`, detail: SPORT[org.category] ?? (sport ? "Det medlemmarna samlas kring, vecka efter vecka." : "Det som är deras eget – det folk redan förknippar med namnet.") },
    ...(org.city ? [{ id: "own-city", kind: "club" as const, title: `Hemorten ${org.city}`, detail: "Lokal stolthet – orten hör till namnet." }] : []),
    ...(org.founded ? [{ id: "own-history", kind: "club" as const, title: `Grundad ${org.founded}`, detail: "Årtalet är klubbens starkaste symbol efter märket." }] : []),
    ...(sport
      ? [
          { id: "own-squad", kind: "club" as const, title: `Truppen ${nextYear}`, detail: "Spelarnas namn och nummer – en ny halsduk varje säsong. Kräver klubbens och spelarnas godkännande." },
          { id: "own-personal", kind: "custom" as const, title: "Personliga halsdukar", detail: "Eget namn och nummer – till spelare, ledare, nya medlemmar och julklappar." },
        ]
      : [{ id: "own-gift", kind: "club" as const, title: "Kundgåvor och personal", detail: `Halsdukar till medarbetare, kunder och event – ${org.name}s färger i vintermörkret.` }]),
  ];
  // Kalenderns texter är skrivna för fotboll; här räcker högtiden och datumet.
  const occasions = upcomingOccasions(now, 75, !sport).map((o) => ({ ...o, detail: "Högtid i kalendern." }));
  const season = seasonFor(now, !sport);
  return {
    signals: [...occasions, { ...season, detail: season.title === "Vinter" || season.title === "Höst" ? "Kallt och mörkt – halsduksväder." : "Ljusare tider – halsduken till matcher och kyliga kvällar." }, ...own],
    sources: [
      { id: "calendar", name: "Svensk kalender", ok: true, count: occasions.length + 1 },
      { id: "club", name: sport ? "Klubbens märke och uppgifter" : "Loggan och uppgifterna", ok: true, count: own.length },
    ],
  };
}

// --- Från referens till klubb -------------------------------------------------------

/** Laddningsrutans rader för en organisation utan egna. */
const LINES = ["Garnet träs på maskinen…", "Maskorna räknas…", "Ränderna rättas till…", "Märket läggs på plats…", "Fransarna knyts…", "Färgerna stäms av mot Pantone…"];

export type ScarfClub = {
  ref: string;
  club: Club;
  /** Märket som stickas. `undefined` betyder klubbens eget ur profilen. */
  crest?: Buffer | null;
  crestUrl: string;
  /** Finns för klubbar ur registret och egna loggor – de saknar egen regelbok, matcher och väder. */
  org: Org | null;
};

/** Det gränssnittet behöver veta om den valda klubben. */
export type ScarfPick = { ref: string; name: string; sub: string; crest: string; colors: string[]; brand: boolean; lines: string[]; done: string };

const REG = /^reg:([a-z0-9-]{1,80})$/;
const OWN = /^own:([0-9a-f-]{36})$/;

/** Märket i den storlek det stickas från. */
export const forKnitting = (logo: Buffer) =>
  sharp(logo)
    .trim({ threshold: 8 })
    .resize(600, 600, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer()
    .catch(() => sharp(logo).resize(600, 600, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer());

async function derived(ref: string, org: Org, logo: Buffer, crestUrl: string, siteColors: string[] = []): Promise<ScarfClub> {
  const crest = await forKnitting(logo);
  const colors = await crestColors(crest);
  // Ett märke utan kulör (vit logga för mörk bakgrund) får klubbens färger från webbplatsen.
  const given = colors.some((c) => isChromatic(c.hex)) ? undefined : siteColors.filter(isChromatic).slice(0, 2);
  return { ref, club: clubOf(org, paletteOf(colors, given?.length ? given : undefined), colors), crest, crestUrl, org };
}

const OwnMeta = (raw: unknown) => {
  const m = raw as { name?: unknown; group?: unknown; category?: unknown; city?: unknown; crest?: unknown } | null;
  if (!m || typeof m.name !== "string" || typeof m.crest !== "string" || !/^[0-9a-f-]{36}\.png$/.test(m.crest)) return null;
  return { name: m.name, group: m.group === "annat" ? ("annat" as const) : ("idrott" as const), category: typeof m.category === "string" ? m.category : "", city: typeof m.city === "string" ? m.city : "", crest: m.crest };
};

async function load(ref: string): Promise<ScarfClub | null> {
  const club = CLUBS[ref];
  if (club) return { ref, club, crestUrl: `/api/v1/brand/${club.id}/${club.brand.crest.farg}`, org: null };

  const reg = REG.exec(ref)?.[1];
  if (reg) {
    const d = await clubDetail(reg);
    const logo = d ? await readFile(path.join(CLUBS_DIR, "logos", `${reg}.png`)).catch(() => null) : null;
    if (!d || !logo) return null;
    const org: Org = { id: reg, name: d.name, city: d.municipality, category: d.sport || "Idrott", group: "idrott", founded: Number(d.founded) || undefined };
    return derived(ref, org, logo, registryAsset(reg, d.at, "logo.png"), d.colors ?? []);
  }

  const own = OWN.exec(ref)?.[1];
  if (own) {
    const file = await loadFile(`${own}.json`);
    const meta = file ? OwnMeta(JSON.parse(file.data.toString("utf8"))) : null;
    const logo = meta ? await loadFile(meta.crest) : null;
    if (!meta || !logo) return null;
    const org: Org = { id: `egen-${own.slice(0, 8)}`, name: meta.name, city: meta.city, category: meta.category || (meta.group === "idrott" ? "Idrott" : "Företag"), group: meta.group };
    return derived(ref, org, logo.data, `/api/v1/files/${meta.crest}`);
  }
  return null;
}

/** Flödets alla steg slår upp samma klubb; profilen ur ett märke räknas därför bara ut en gång. */
const cache = new Map<string, Promise<ScarfClub | null>>();

export function scarfClub(ref: string): Promise<ScarfClub | null> {
  if (CLUBS[ref]) return load(ref);
  if (!REG.test(ref) && !OWN.test(ref)) return Promise.resolve(null);
  let hit = cache.get(ref);
  if (!hit) {
    if (cache.size >= 300) cache.delete(cache.keys().next().value as string);
    hit = load(ref).catch(() => null);
    cache.set(ref, hit);
    // Ett misslyckat uppslag ska kunna göras om.
    void hit.then((v) => v === null && cache.delete(ref));
  }
  return hit;
}

/** Sparar en uppladdad logga med namnet och ger referensen som flödet körs med. */
export async function saveOwnClub(input: { name: string; group: "idrott" | "annat"; category: string; city: string; logo: Buffer }) {
  const crest = await saveFile(await forKnitting(input.logo), "png");
  const meta = await saveFile(JSON.stringify({ v: 1, name: input.name, group: input.group, category: input.category, city: input.city, crest: crest.id }), "json");
  return `own:${meta.id.slice(0, 36)}`;
}

export function pickView(c: ScarfClub): ScarfPick {
  const brand = c.club.kind === "brand";
  const copy = c.org ? null : copyFor(c.club);
  return {
    ref: c.ref,
    name: c.club.name,
    sub: c.org ? [c.org.category === "Idrott" || c.org.category === "Företag" ? "" : c.org.category, c.org.city].filter(Boolean).join(" · ") : c.club.city,
    crest: c.crestUrl,
    colors: c.club.palette.map((p) => p.hex.toUpperCase()),
    brand,
    lines: copy?.loaderLines ?? LINES,
    done: copy?.loaderDone ?? "Klart!",
  };
}

/** Utan känt grundningsår får inga gamla årtal stå på halsduken, även om modellen hittar på ett. */
export function withoutYears<T extends { front: { main: string; sub: string }; back: { main: string; sub: string } }>(idea: T, founded: number | undefined): T {
  if (founded) return idea;
  const clean = (s: string) =>
    s
      .replace(/\b(SEDAN|EST\.?|ANNO|GRUNDAD)\s*(1[89]\d{2}|20[01]\d)\b/g, "")
      .replace(/\b(1[89]\d{2}|20[01]\d)\b/g, "")
      .replace(/\s*[·•–-]\s*$/g, "")
      .replace(/^\s*[·•–-]\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return { ...idea, front: { main: clean(idea.front.main), sub: clean(idea.front.sub) }, back: { main: clean(idea.back.main), sub: clean(idea.back.sub) } };
}
