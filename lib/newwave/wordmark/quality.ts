import { open, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { readAsset } from "@/lib/newwave/asset";
import { CLUB_ID, CLUBS_DIR, queryClubs } from "@/lib/newwave/clubRegistry";
import { CRAFT_CLUBS } from "@/lib/newwave/craft";
import { deltaE, hexToRgb } from "@/lib/scarf";
import { allPrefs, type ClubPrefs } from "./clubPrefs";
import { splitName } from "./names";
import { paletteFor, type WordmarkClub } from "./render";
import { fitScore, type Template } from "./schema";
import { allTemplates, wordmarkClub } from "./store";

/**
 * Kontrollerna innan ett ordmärke når en klubb: syns färgerna på plagget, är märket i färg och skarpt nog, är namnet
 * rätt delat. Det klubben har rättat och godkänt i klubbportalen väger tyngst – en godkänd klubb granskas inte igen.
 */
export type Level = "fel" | "varning" | "info";
export type IssueId = "colors-missing" | "light-contrast" | "dark-contrast" | "colors-mismatch" | "colors-guessed" | "team-page" | "logo-missing" | "logo-white" | "logo-small" | "name-split" | "name-long" | "founded-missing" | "site-unsure";
export type Issue = { id: IssueId; level: Level; text: string; fix: string };
export type Checked = { id: string; name: string; logo?: string; issues: Issue[]; approved: boolean; size: number };

export const ISSUE_LABEL: Record<IssueId, string> = {
  "colors-missing": "Färger saknas",
  "light-contrast": "Syns dåligt på vitt",
  "dark-contrast": "Syns dåligt på svart",
  "colors-mismatch": "Färgerna matchar inte märket",
  "colors-guessed": "Osäker huvudfärg",
  "team-page": "Lagsida",
  "logo-missing": "Märke saknas",
  "logo-white": "Vitt märke",
  "logo-small": "Lågupplöst märke",
  "name-split": "Konstig namndelning",
  "name-long": "Långt namn",
  "founded-missing": "Grundandeår saknas",
  "site-unsure": "Osäker webbplats",
};

const RANK: Record<Level, number> = { fel: 0, varning: 1, info: 2 };
const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const chroma = (hex: string) => {
  const c = hexToRgb(hex);
  return (Math.max(...c) - Math.min(...c)) / 255;
};
const cmAt150 = (px: number) => Math.max(1, Math.round((px / 150) * 2.54));

type Facts = {
  club: WordmarkClub;
  prefs: ClubPrefs;
  /** Längsta sidan på märket i px; null = inget märke, undefined = okänt. */
  logoPx?: number | null;
  vector?: boolean;
  logoColors?: { hex: string; share: number }[];
  onDark?: boolean;
  /** Färgerna är bara lästa ur märket, inte ur webbplatsen. */
  colorsFromLogo?: boolean;
  confidence?: number;
};

function assess(f: Facts, templates: Template[]): Issue[] {
  const out: Issue[] = [];
  const { club, prefs } = f;
  const own = Boolean(prefs.colors);
  const colors = club.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  if (!colors.length) out.push({ id: "colors-missing", level: "fel", text: "Klubbfärger saknas – ordmärkena ritas i svart och vitt.", fix: "Be klubben rätta färgerna i klubbportalen." });
  else {
    if (paletteFor(colors, "light").primary === "#111111") out.push({ id: "light-contrast", level: "varning", text: "Ingen klubbfärg syns tydligt på vita plagg – ordmärket blir svart där.", fix: "Välj mörka plagg eller lägg till en mörkare klubbfärg." });
    if (paletteFor(colors, "dark").primary === "#FFFFFF") out.push({ id: "dark-contrast", level: "varning", text: "Ingen klubbfärg syns tydligt på svarta plagg – ordmärket blir vitt där.", fix: "Välj ljusa plagg eller lägg till en ljusare klubbfärg." });
    const inLogo = (f.logoColors ?? []).filter((c) => c.share >= 0.08 && chroma(c.hex) > 0.25);
    if (!own && inLogo.length && chroma(colors[0]) > 0.25 && inLogo.every((c) => deltaE(c.hex, colors[0]) > 30))
      out.push({ id: "colors-mismatch", level: "varning", text: `Huvudfärgen ${colors[0]} finns inte i märket (${inLogo.map((c) => c.hex).join(", ")}).`, fix: "Kontrollera färgerna mot klubbens tröja och rätta dem." });
    else if (!own && f.colorsFromLogo && inLogo.length >= 3)
      out.push({ id: "colors-guessed", level: "varning", text: `Färgerna är lästa ur ett märke med ${inLogo.length} färger – ${colors[0]} blev huvudfärg.`, fix: "Låt klubben bekräfta huvudfärgen (tröjans färg)." });
  }
  if (f.logoPx === null) out.push({ id: "logo-missing", level: "varning", text: "Klubbmärke saknas – mallar med märke ritas utan det.", fix: "Be klubben ladda upp märket." });
  else {
    const white = (f.logoColors ?? []).filter((c) => lum(c.hex) > 0.85).reduce((s, c) => s + c.share, 0);
    if (f.onDark || white >= 0.6) out.push({ id: "logo-white", level: "fel", text: "Märket är mest vitt och försvinner på ljusa plagg.", fix: "Be klubben om märket i färg, eller tryck bara på mörka plagg." });
    if (f.logoPx !== undefined && !f.vector && f.logoPx < 400)
      out.push({
        id: "logo-small",
        level: f.logoPx < 200 ? "varning" : "info",
        text: `Märket är bara ${f.logoPx} px – skarpt till ungefär ${cmAt150(f.logoPx)} cm i tryck.`,
        fix: "Be klubben om märket som vektor (SVG, PDF, AI) eller minst 1000 px.",
      });
  }
  const names = prefs.names ?? {};
  const split = splitName(club.name);
  const [name1, name2] = [names.name1 ?? split.name1, names.name2 ?? split.name2];
  if (!prefs.names && name1.split(" ").length >= 2)
    out.push({ id: "name-split", level: "varning", text: `Namnet delas som "${name1}" + "${name2}".`, fix: "Sätt Namn 1 och Namn 2 för klubben." });
  const chars = [...name2].length;
  const tight = templates.filter((t) => fitScore(t, chars) < 0.5).length;
  if (tight > templates.length / 3) out.push({ id: "name-long", level: "info", text: `Långt namn (${chars} tecken) – ${tight} av ${templates.length} mallar blir trånga.`, fix: "Korta Namn 2, t.ex. till smeknamnet." });
  if (!club.founded) out.push({ id: "founded-missing", level: "info", text: "Grundandeår saknas – mallar med årtal och jubileum visas inte.", fix: "Fyll i året i klubbportalen." });
  if (/\((lag|p\d|f\d|herr|dam)/i.test(club.name)) out.push({ id: "team-page", level: "varning", text: "Posten är ett lag, inte föreningen – märke och färger kan vara lagets.", fix: "Använd föreningens egen post." });
  if (f.confidence !== undefined && f.confidence < 70) out.push({ id: "site-unsure", level: "varning", text: `Webbplatsen matchades med ${f.confidence} % säkerhet.`, fix: "Kontrollera att märket och färgerna är rätt klubbs." });
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

async function pngSide(file: string) {
  const fh = await open(file).catch(() => null);
  if (!fh) return null;
  try {
    const head = Buffer.alloc(24);
    await fh.read(head, 0, 24, 0);
    return Math.max(head.readUInt32BE(16), head.readUInt32BE(20));
  } finally {
    await fh.close();
  }
}

type Site = { logo?: { vector?: boolean; onDark?: boolean; colors?: { hex: string; share: number }[] } | null; colors?: { source?: string }[]; confidence?: number };
const readSite = async (id: string): Promise<Site | null> => JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${id}.json`), "utf8").catch(() => "null"));

async function factsFor(club: WordmarkClub, prefs: ClubPrefs): Promise<Facts> {
  const site = CRAFT_CLUBS.some((c) => c.id === club.id) ? null : await readSite(club.id);
  if (!site) {
    const raw = club.logo ? await readAsset(club.logo) : null;
    const meta = raw ? await sharp(raw).metadata().catch(() => null) : null;
    return { club, prefs, logoPx: raw ? Math.max(meta?.width ?? 0, meta?.height ?? 0) : null, vector: meta?.format === "svg" };
  }
  const logoPx = site.logo ? await pngSide(path.join(CLUBS_DIR, "logos", `${club.id}.png`)) : null;
  const colorsFromLogo = Boolean(site.colors?.length) && site.colors!.every((c) => c.source === "logga");
  return { club, prefs, logoPx, vector: site.logo?.vector, logoColors: site.logo?.colors, onDark: site.logo?.onDark, colorsFromLogo, confidence: site.confidence };
}

const listed = async () => (await allTemplates()).filter((t) => !t.hidden);

export async function clubQuality(id: string): Promise<Checked | null> {
  if (!CLUB_ID.test(id)) return null;
  const [prefs, templates] = await Promise.all([allPrefs(), listed()]);
  const p = prefs[id] ?? { favorites: [] };
  const club = await wordmarkClub(id, p);
  if (!club) return null;
  return { id, name: club.name, logo: club.logo, issues: assess(await factsFor(club, p), templates), approved: Boolean(p.approved), size: 0 };
}

/**
 * Granskningskön: Crafts klubbar och alla klubbar i registret med webbplats, de med fel och varningar först och
 * de största föreningarna först inom samma nivå. Godkända klubbar hoppas över.
 */
let memo: { key: string; at: number; checked: Promise<Checked[]> } | null = null;
const TTL = 5 * 60_000;

/** Alla klubbar kontrolleras på några sekunder; resultatet återanvänds tills klubbarnas val, mallarna eller registret ändras. */
async function checkAll() {
  const [registry, prefs, templates] = await Promise.all([queryClubs({ q: "", county: "", sport: "", sort: "size", offset: 0, limit: 100_000 }), allPrefs(), listed()]);
  const key = JSON.stringify([registry?.stats.builtAt, prefs, templates.map((t) => [t.id, t.fit])]);
  if (memo?.key === key && Date.now() - memo.at < TTL) return { prefs, checked: await memo.checked };
  memo = { key, at: Date.now(), checked: run(registry?.items ?? [], prefs, templates) };
  return { prefs, checked: await memo.checked };
}

async function run(registry: { id: string; surplus: number }[], prefs: Record<string, ClubPrefs>, templates: Template[]) {
  const ids = [...CRAFT_CLUBS.map((c) => ({ id: c.id, size: Number.MAX_SAFE_INTEGER })), ...registry.map((c) => ({ id: c.id, size: c.surplus }))];
  const checked: Checked[] = [];
  const batch = 24;
  for (let i = 0; i < ids.length; i += batch) {
    const part = await Promise.all(
      ids.slice(i, i + batch).map(async ({ id, size }) => {
        const p = prefs[id] ?? { favorites: [] };
        if (p.approved) return null;
        const club = await wordmarkClub(id, p);
        if (!club) return null;
        return { id, name: club.name, logo: club.logo, issues: assess(await factsFor(club, p), templates), approved: false, size };
      }),
    );
    for (const c of part) if (c) checked.push(c);
  }
  return checked;
}

export async function qualityQueue(opts: { issue?: IssueId; offset: number; limit: number }) {
  const { prefs, checked } = await checkAll();
  const counts: Partial<Record<IssueId, number>> = {};
  for (const c of checked) for (const i of c.issues) if (i.level !== "info") counts[i.id] = (counts[i.id] ?? 0) + 1;
  const worst = (c: Checked) => Math.min(...c.issues.filter((i) => i.level !== "info").map((i) => RANK[i.level]), 9);
  const flagged = checked
    .filter((c) => worst(c) < 9 && (!opts.issue || c.issues.some((i) => i.id === opts.issue)))
    .sort((a, b) => worst(a) - worst(b) || b.size - a.size);
  return {
    checked: checked.length,
    approved: Object.values(prefs).filter((p) => p.approved).length,
    flagged: flagged.length,
    counts,
    items: flagged.slice(opts.offset, opts.offset + opts.limit).map((c) => ({ id: c.id, name: c.name, logo: c.logo, issues: c.issues, approved: c.approved })),
  };
}
