/**
 * Inspirationsbanken: en halsduk per organisation – sex idrottsföreningar i olika sporter (Gräsrot 360 och
 * klubbregistret) och sex företag och föreningar utanför idrotten (återförsäljardemons påhittade kunder).
 * Hela flödet körs på riktigt: agenten föreslår, bildmodellen ritar motiv, stickmotorn stickar, granskaren
 * sätter betyg och underkänt görs om en gång.
 *
 * Färgerna läses ur märket. Receptet per organisation är beställt i listan nedan så att banken blir blandad;
 * text, färgroller, typsnitt och motiv är agentens. Varje steg sparas under /tmp/nw-scarf-bank.
 *
 * Resultat: lib/scarfBank.json, public/halsduk/bank/ (korrektur, märke, motiv) och ../offert/halsdukar-inspiration/ (zip).
 *
 *   set -a; . ./.env.local; set +a; JITI_ALIAS='{"@/":"<repo>/"}' node_modules/.bin/jiti scripts/scarf-bank.ts
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { seasonFor, upcomingOccasions } from "@/lib/calendar";
import { CLUBS_DIR } from "@/lib/newwave/clubRegistry";
import { errorMessage } from "@/lib/openai";
import { htmlToPdf } from "@/lib/pdf";
import { createScarfIdeas, drawScarfMotif, reviewScarf, reviseScarfIdea, type ScarfReview } from "@/lib/scarfAgent";
import type { BankScarf } from "@/lib/scarfBank";
import { SPORT, clubOf, crestColors, paletteOf, withoutYears } from "@/lib/scarfClub";
import { facePreview } from "@/lib/scarfEngine";
import { knitIdea, proof } from "@/lib/scarfFlow";
import { buildPackage, slug } from "@/lib/scarfProduction";
import { RECIPES, type RecipeId, type ScarfIdea } from "@/lib/scarfRecipes";
import type { Signal } from "@/lib/types";

const TMP = "/tmp/nw-scarf-bank";
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public", "halsduk", "bank");
const SEND = path.join(ROOT, "..", "offert", "halsdukar-inspiration");
const today = new Date().toISOString().slice(0, 10);

type Pick = {
  id: string;
  from: "grasrot" | "registry" | "kund";
  name: string;
  city: string;
  /** Sporten, eller för företag och föreningar vad de gör. */
  category: string;
  group: "idrott" | "annat";
  founded?: number;
  colors?: string[];
  recipe: RecipeId;
  /** Det organisationen själv bär i namn, märke eller verksamhet. */
  symbol?: string;
  /** Den här halsduken får vara lekfull. */
  fun?: boolean;
  /** Maskoten, som får ritas som eget motiv. */
  mascot?: string;
  /** Tillfället halsduken görs för. Företag får annars bara årstiden, så att inte alla blir luciahalsdukar. */
  when?: { title: string; detail: string };
};

/** Tolv organisationer. `founded` står bara där registret har årtalet; företagen är återförsäljardemons påhittade kunder. */
const PICKS: Pick[] = [
  { id: "farsta-ibk", from: "grasrot", name: "Farsta Sharks IBK", city: "Stockholm", category: "Innebandy", group: "idrott", recipe: "motiv", symbol: "Klubben kallas Sharks och hajen är klubbens maskot. Beställaren vill se en haj som motiv, inte en boll.", fun: true, mascot: "hajen" },
  { id: "lyktan", from: "kund", name: "Kaffebaren Lyktan", city: "", category: "Kafé", group: "annat", colors: ["#6E3F1F"], recipe: "motiv", symbol: "Kaffet, lyktan i fönstret och stamgästerna.", fun: true },
  { id: "almtuna-is", from: "registry", name: "Almtuna IS", city: "Uppsala", category: "Ishockey", group: "idrott", recipe: "motiv", symbol: "Is, puck och korsade klubbor." },
  { id: "kb-bygg", from: "kund", name: "KB Bygg & Mark", city: "", category: "Byggföretag", group: "annat", colors: ["#E07020"], recipe: "profil", symbol: "Personalens vinterhalsduk på bygget – syns på håll som varselränder." },
  { id: "arbra-bk", from: "grasrot", name: "Arbrå BK", city: "Arbrå", category: "Fotboll", group: "idrott", recipe: "jul" },
  { id: "solviken", from: "kund", name: "Solvikens förskola", city: "", category: "Förskola", group: "annat", colors: ["#E0A800"], recipe: "motiv", symbol: "Solen i märket – och barn och pedagoger som är ute i alla väder.", fun: true, when: { title: "Lucia", detail: "Luciatåg på gården i decembermörkret." } },
  { id: "kongahalla-ridsallskap", from: "registry", name: "Kongahälla Ridsällskap", city: "Kungälv", category: "Ridsport", group: "idrott", founded: 1970, recipe: "motiv", symbol: "Hästen.", fun: true },
  { id: "hamnkrogen", from: "kund", name: "Hamnkrogen i Varberg", city: "Varberg", category: "Restaurang", group: "annat", colors: ["#14365E"], recipe: "vagor", symbol: "Hamnen, havet och ankaret." },
  { id: "byttorps-if", from: "grasrot", name: "Byttorps IF", city: "Borås", category: "Fotboll", group: "idrott", recipe: "argyle" },
  { id: "techvast", from: "kund", name: "TechVäst AB", city: "", category: "Teknikbolag", group: "annat", colors: ["#5B3FD0"], recipe: "toning", symbol: "Skärmar, kod och sena kvällar – ett lag som bygger saker ihop.", when: { title: "Kick-off i januari", detail: "Nytt år, nya mål – alla medarbetare samlas och får varsin halsduk." } },
  { id: "varbergs-basket", from: "registry", name: "Varbergs Basket", city: "Varberg", category: "Basket", group: "idrott", recipe: "motiv", symbol: "Basketbollen och korgen.", fun: true },
  { id: "strandangen", from: "kund", name: "Brf Strandängen", city: "", category: "Bostadsrättsförening", group: "annat", colors: ["#2E7D5B"], recipe: "tapet", symbol: "Grannarna och gården mellan husen.", when: { title: "Glögg på gården första advent", detail: "Grannarna samlas vid grillplatsen – föreningen bjuder på glögg och en halsduk till varje hushåll." } },
];

async function cached<T>(file: string, make: () => Promise<T>): Promise<T> {
  const p = path.join(TMP, file);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8")) as T;
  const v = await make();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(v, null, 2));
  return v;
}
async function cachedFile(file: string, make: () => Promise<Buffer>): Promise<Buffer> {
  const p = path.join(TMP, file);
  if (existsSync(p)) return readFile(p);
  const v = await make();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, v);
  return v;
}

/** Kundloggan är en symbol med namnet under. Symbolen är märket; namnet stickas som text. */
async function symbolOf(logo: Buffer) {
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const filled = Array.from({ length: info.height }, (_, y) => {
    for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 40) return true;
    return false;
  });
  const top = filled.indexOf(true);
  let end = top;
  while (end < info.height && filled[end]) end++;
  // Slutar första blocket inte före nederkanten finns inget namn under – då är hela bilden märket.
  if (top < 0 || end >= info.height - 2) return logo;
  return sharp(logo).extract({ left: 0, top, width: info.width, height: end - top }).png().toBuffer();
}

async function loadCrest(p: Pick): Promise<Buffer> {
  if (p.from === "registry") return readFile(path.join(CLUBS_DIR, "logos", `${p.id}.png`));
  if (p.from === "kund") return symbolOf(await readFile(path.join(ROOT, "public", "newwave", "resellers", "kunder", `${p.id}.png`)));
  const dir = path.join(ROOT, "assets", "grasrot", p.id);
  if (existsSync(path.join(dir, "emblem.png"))) return readFile(path.join(dir, "emblem.png"));
  return sharp(await readFile(path.join(dir, "original.svg")), { density: 300 }).resize({ height: 900, fit: "inside" }).png().toBuffer();
}

function signalsFor(p: Pick, now: Date): Signal[] {
  const own: Signal[] = [
    { id: "sport", kind: "club", title: `${p.group === "idrott" ? "Sporten" : "Verksamheten"}: ${p.category.toLocaleLowerCase("sv-SE")}`, detail: SPORT[p.category] ?? "" },
    ...(p.city ? [{ id: "ort", kind: "club" as const, title: `Hemorten ${p.city}`, detail: "Lokal stolthet – orten hör till namnet." }] : []),
    ...(p.symbol ? [{ id: "symbol", kind: "club" as const, title: p.group === "idrott" ? "Klubbens symbol" : "Det som är deras eget", detail: p.symbol }] : []),
    ...(p.founded ? [{ id: "ar", kind: "club" as const, title: `Grundad ${p.founded}`, detail: "Årtalet är klubbens starkaste symbol efter märket." }] : []),
    ...(p.group === "idrott" ? [{ id: "personlig", kind: "custom" as const, title: "Personliga halsdukar", detail: "Eget namn och nummer – till spelare, ledare och julklappar." }] : []),
    p.fun
      ? { id: "ton", kind: "custom", title: "Tonläge: lekfull", detail: "Den här halsduken får vara rolig – en ordlek, en maskot eller ett oväntat motiv som man ler åt. Ett motiv får ritas; märket ritas aldrig om." }
      : { id: "ton", kind: "custom", title: "Tonläge: stilren", detail: "En halsduk man bär till vardags – de egna färgerna, ett tydligt budskap och inget krångel." },
  ];
  const season = { ...seasonFor(now), detail: "Kallt och mörkt – halsduksväder." };
  if (p.group === "annat") return [...(p.when ? [{ id: "nar", kind: "occasion" as const, ...p.when }] : []), season, ...own];
  // Kalenderns texter är skrivna för fotboll; här räcker högtiden och datumet.
  return [...upcomingOccasions(now, 75).map((o) => ({ ...o, detail: "Högtid i kalendern." })), season, ...own];
}

async function make(p: Pick, now: Date): Promise<BankScarf> {
  // Märket sparas i den storlek det stickas från, så att stickfilerna blir exakt desamma när de tas fram igen.
  const crest = await sharp(await loadCrest(p)).trim({ threshold: 8 }).resize(600, 600, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  const colors = await crestColors(crest);
  const palette = paletteOf(colors, p.colors);
  const club = clubOf(p, palette, colors);
  const signals = signalsFor(p, now);
  console.log(`${p.name}: profil ${palette.map((c) => `${c.name} ${c.hex}`).join(", ")}`);

  const first = await cached<ScarfIdea>(`${p.id}/idea.json`, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [idea] = await createScarfIdeas(club, signals, 1, [], [p.recipe]);
      if (idea && (idea.recipe === p.recipe || attempt === 2)) return withoutYears(idea, p.founded);
    }
    throw new Error(`Ingen idé för ${p.name}`);
  });

  const motif = (idea: ScarfIdea, key: string) =>
    idea.recipe === "motiv" && idea.art
      ? cachedFile(`${key}/motiv.png`, () => drawScarfMotif(idea, { ink: idea.colors.ink, accent: idea.colors.accent, ground: idea.colors.ground }))
          // Motivet sparas i den storlek det stickas från, så att stickfilerna blir exakt desamma när de tas fram igen.
          .then((buf) => sharp(buf).resize({ width: 900, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer())
          .catch((e) => {
            console.log(`  ${p.name}: motivet misslyckades – ${errorMessage(e)}`);
            return null;
          })
      : Promise.resolve(null);
  const judge = (idea: ScarfIdea, key: string, sheet: Buffer) =>
    cached<ScarfReview | null>(`${key}/review.json`, () => reviewScarf(club, idea, sheet)).catch((e) => {
      console.log(`  ${p.name}: granskaren svarade inte – ${errorMessage(e)}`);
      return null;
    });

  let idea = first;
  let key = p.id;
  let art = await motif(idea, key);
  let result = await knitIdea(club, idea, { crest, art });
  let review = await judge(idea, key, await proof(result.knit));
  let firstReview: ScarfReview | null = null;
  if (review?.verdict === "underkänd") {
    const revised = await cached<ScarfIdea | null>(`${key}/revised.json`, async () => {
      const r = await reviseScarfIdea(club, idea, review!);
      return r ? withoutYears(r, p.founded) : null;
    }).catch(() => null);
    if (revised) {
      firstReview = review;
      idea = revised;
      key = `${p.id}/v2`;
      art = await motif(idea, key);
      result = await knitIdea(club, idea, { crest, art });
      review = await judge(idea, key, await proof(result.knit));
    }
  }
  const { built, knit, report, front, back } = result;

  const name = `${p.id}-${slug(idea.title)}`;
  const [f, b] = await Promise.all(knit.faces.map((face) => facePreview(face, knit.palette, 2000)));
  await Promise.all([
    sharp(f).flatten({ background: "#F5F5F7" }).jpeg({ quality: 88 }).toFile(path.join(PUBLIC, `${name}-fram.jpg`)),
    sharp(b).flatten({ background: "#F5F5F7" }).jpeg({ quality: 88 }).toFile(path.join(PUBLIC, `${name}-bak.jpg`)),
    writeFile(path.join(PUBLIC, `${p.id}-skold.png`), crest),
    ...(built.uses.art && art ? [writeFile(path.join(PUBLIC, `${name}-motiv.png`), art)] : []),
  ]);
  const pack = await buildPackage({ club: club.name, title: idea.title, why: idea.why, front, back, consent: built.consent, knit, report, date: today, pdf: htmlToPdf });
  const zip = new JSZip();
  for (const file of pack.files) zip.file(file.name, file.data);
  await writeFile(path.join(SEND, `stickfiler-${pack.base}.zip`), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

  const warn = report.checks.filter((c) => c.level === "varning").map((c) => c.title);
  console.log(
    `${p.name.padEnd(24)} ${idea.recipe.padEnd(9)} "${idea.title}"  ${knit.palette.length} garn  jpg-avvikelse ${pack.jpgDrift}  ${warn.length ? `VARNING: ${warn.join(", ")}` : "ok"}${
      review ? `  betyg ${review.sales}/${review.brandFit}/${review.legibility}/${review.craft} → ${review.verdict}` : ""
    }${firstReview ? "  (omgjord)" : ""}${built.uses.art ? "  [ritat motiv]" : ""}`,
  );
  return {
    slug: name,
    club: { id: club.id, name: club.name, shortName: club.shortName, palette: club.palette, crestColors: club.crestColors, founded: club.founded, arena: club.arena, city: club.city, nicknames: club.nicknames, kind: club.kind, category: p.category, group: p.group },
    idea,
    level: RECIPES[idea.recipe].level,
    recipeLabel: RECIPES[idea.recipe].label,
    yarns: report.yarns.map((y) => ({ hex: y.hex, pantone: y.pantone, share: Math.round(y.share * 1000) / 1000 })),
    system: report.maxColorsPerRow <= 4 ? "dubbel" : "enkel",
    maxColorsPerRow: report.maxColorsPerRow,
    minTextMm: knit.minTextMm === null ? null : Math.round(knit.minTextMm),
    ok: report.ok,
    consent: built.consent,
    art: built.uses.art,
    review,
    firstReview,
    text: { front, back },
  };
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const picks = only.length ? PICKS.filter((p) => only.includes(p.id)) : PICKS;
  await Promise.all([mkdir(PUBLIC, { recursive: true }), mkdir(SEND, { recursive: true })]);
  const now = new Date();
  const out = new Array<BankScarf | null>(picks.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < picks.length; i = next++) {
      out[i] = await make(picks[i], now).catch((e) => {
        console.log(`${picks[i].name}: FEL – ${errorMessage(e)}`);
        return null;
      });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const scarves = out.filter((s): s is BankScarf => s !== null);
  if (!only.length) await writeFile(path.join(ROOT, "lib", "scarfBank.json"), `${JSON.stringify({ date: today, scarves }, null, 2)}\n`);
  console.log(`\n${scarves.length} av ${picks.length} halsdukar klara.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
