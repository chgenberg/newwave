/**
 * Inspirationsbanken: en halsduk per förening – sex idrottsföreningar i olika sporter (Gräsrot 360 och
 * klubbregistret). Banken visar dem tillsammans med demokörningens halsdukar (scripts/scarf-demo.ts).
 * Hela flödet körs på riktigt: agenten föreslår, bildmodellen ritar motiv, stickmotorn stickar, granskaren
 * sätter betyg och underkänt görs om en gång.
 *
 * Färgerna läses ur märket. Receptet per organisation är beställt i listan nedan så att banken blir blandad;
 * text, färgroller, typsnitt och motiv är agentens. Varje steg sparas under /tmp/nw-scarf-bank.
 *
 * Föreningar som redan ligger i banken görs inte om – en körning lägger bara till dem som saknas i lib/scarfBank.json.
 * Med föreningens id som argument görs just den om. `--send` lägger dessutom stickfilerna som zip i
 * ../offert/halsdukar-inspiration/, för utskick; på sajten packas de när de hämtas.
 *
 * Resultat: lib/scarfBank.json och public/halsduk/bank/ (korrektur, märke, motiv).
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
const TO_SEND = process.argv.includes("--send");

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
  /** Tillfället halsduken görs för. Utan det får föreningen kalenderns högtider, och då blir det ofta en julhalsduk. */
  when?: { title: string; detail: string };
};

/** Tillfällen som gäller vilken förening som helst – inget som måste stämma med en viss klubbs kalender. */
const HOME = { title: "Hemmapremiären", detail: "Första hemmamatchen för säsongen – halsduken alla tar med sig." };
const YEAR = { title: "Supporterhalsduken", detail: "Halsduken som bärs hela säsongen, år efter år." };
const KIDS = { title: "Säsongsavslutningen", detail: "En halsduk till alla ungdomar och ledare när säsongen summeras." };

/**
 * Föreningarna i banken, blandade över sporter och recept. Årtalet står bara där det finns i klubbregistret eller i
 * klubbens eget märke, och orten bara där den står i klubbens namn eller märke. Ordningen är den som visas på sidan.
 */
const PICKS: Pick[] = [
  { id: "farsta-ibk", from: "grasrot", name: "Farsta Sharks IBK", city: "Stockholm", category: "Innebandy", group: "idrott", recipe: "motiv", symbol: "Klubben kallas Sharks och hajen är klubbens maskot. Beställaren vill se en haj som motiv, inte en boll.", fun: true, mascot: "hajen" },
  { id: "almtuna-is", from: "registry", name: "Almtuna IS", city: "Uppsala", category: "Ishockey", group: "idrott", recipe: "motiv", symbol: "Is, puck och korsade klubbor." },
  { id: "arbra-bk", from: "grasrot", name: "Arbrå BK", city: "Arbrå", category: "Fotboll", group: "idrott", recipe: "jul" },
  { id: "kongahalla-ridsallskap", from: "registry", name: "Kongahälla Ridsällskap", city: "Kungälv", category: "Ridsport", group: "idrott", founded: 1970, recipe: "motiv", symbol: "Hästen.", fun: true },
  { id: "byttorps-if", from: "grasrot", name: "Byttorps IF", city: "Borås", category: "Fotboll", group: "idrott", recipe: "argyle" },
  { id: "varbergs-basket", from: "registry", name: "Varbergs Basket", city: "Varberg", category: "Basket", group: "idrott", recipe: "motiv", symbol: "Basketbollen och korgen.", fun: true },
  { id: "storvreta-ibk", from: "registry", name: "Storvreta IBK", city: "Storvreta", category: "Innebandy", group: "idrott", recipe: "motiv", symbol: "Örnen i klubbmärket.", fun: true, mascot: "örnen", when: HOME },
  { id: "spanga-is-fk", from: "registry", name: "Spånga IS FK", city: "Spånga", category: "Fotboll", group: "idrott", founded: 1929, recipe: "retro", when: YEAR },
  { id: "ystads-aff-rockets", from: "registry", name: "Ystad Rockets", city: "Ystad", category: "Amerikansk fotboll", group: "idrott", founded: 1993, recipe: "motiv", symbol: "Klubben heter Rockets – raketen är given.", fun: true, mascot: "raketen", when: YEAR },
  { id: "nassjo-if", from: "registry", name: "Nässjö IF", city: "Nässjö", category: "Bandy", group: "idrott", founded: 1899, recipe: "jul" },
  { id: "onnereds-hk", from: "registry", name: "Önnereds HK", city: "Önnered", category: "Handboll", group: "idrott", founded: 1965, recipe: "autograf", when: HOME },
  { id: "tarna-ik-fjallvinden", from: "registry", name: "Tärna IK Fjällvinden", city: "Tärnaby", category: "Skidor", group: "idrott", founded: 1928, recipe: "motiv", symbol: "Fjället i klubbmärket och backen ner mot byn.", when: YEAR },
  { id: "ifk-ostersund", from: "registry", name: "IFK Östersund", city: "Östersund", category: "Fotboll", group: "idrott", founded: 1906, recipe: "klassisk", when: YEAR },
  { id: "pingvin-rugby-club", from: "registry", name: "Pingvin Rugby Club", city: "Trelleborg", category: "Rugby", group: "idrott", recipe: "motiv", symbol: "Pingvinen i klubbmärket.", fun: true, mascot: "pingvinen", when: YEAR },
  { id: "sala-simsallskap", from: "registry", name: "Sala Simsällskap", city: "Sala", category: "Simning", group: "idrott", founded: 1927, recipe: "vagor", when: KIDS },
  { id: "if-bjorkloven", from: "registry", name: "IF Björklöven", city: "Umeå", category: "Ishockey", group: "idrott", recipe: "tapet", symbol: "Björklövet – klubbens namn och märke.", when: HOME },
  { id: "toreboda-golfklubb", from: "registry", name: "Töreboda Golfklubb", city: "Töreboda", category: "Golf", group: "idrott", recipe: "argyle", when: { title: "Klubbshoppen", detail: "En halsduk i klubbens färger för kalla morgonronder." } },
  { id: "tjorns-konstakning-team-seaside", from: "registry", name: "Tjörns Konståkningsklubb", city: "Tjörn", category: "Konståkning", group: "idrott", founded: 1985, recipe: "motiv", symbol: "Skridskon och isen.", fun: true, when: KIDS },
  { id: "sodertalje-sportklubb", from: "registry", name: "Södertälje SK", city: "Södertälje", category: "Ishockey", group: "idrott", founded: 1902, recipe: "retro", when: YEAR },
  { id: "koping-tennisklubb", from: "registry", name: "Köpings Tennisklubb", city: "Köping", category: "Tennis", group: "idrott", founded: 1897, recipe: "klassisk", when: YEAR },
  { id: "gothia-volleybollklubb", from: "registry", name: "Gothia Volley", city: "", category: "Volleyboll", group: "idrott", recipe: "motiv", symbol: "Lejonet med kronan i klubbmärket.", fun: true, mascot: "lejonet", when: HOME },
  { id: "kungalvs-bk", from: "registry", name: "Kungälvs BK", city: "Kungälv", category: "Bowling", group: "idrott", founded: 1962, recipe: "retro", when: YEAR },
  { id: "sundsvalls-friidrottsforening", from: "registry", name: "Sundsvalls Friidrott", city: "Sundsvall", category: "Friidrott", group: "idrott", recipe: "toning", symbol: "Löparbanans kurva i klubbmärket.", when: KIDS },
  { id: "ck-granit", from: "registry", name: "CK Granit", city: "Gävle", category: "Curling", group: "idrott", founded: 1963, recipe: "motiv", symbol: "Curlingstenen i klubbmärket.", fun: true, when: YEAR },
  { id: "karra-hf", from: "registry", name: "Kärra HF", city: "Göteborg", category: "Handboll", group: "idrott", founded: 1958, recipe: "sicksack", when: HOME },
  { id: "ok-landehof", from: "registry", name: "OK Landehof", city: "", category: "Orientering", group: "idrott", recipe: "tapet", symbol: "Orienteringsskärmen i klubbmärket.", when: YEAR },
  { id: "bankeryds-basket", from: "registry", name: "Bankeryds Basket", city: "Bankeryd", category: "Basket", group: "idrott", founded: 1981, recipe: "personlig" },
  { id: "dalaro-batklubb", from: "registry", name: "Dalarö Båtklubb", city: "Dalarö", category: "Segling", group: "idrott", founded: 1947, recipe: "motiv", symbol: "Segelbåten och hamnen.", when: { title: "Sjösättningen", detail: "Vårens sjösättning – klubben samlas på bryggan." } },
  { id: "guldstadens-boxningsklubb", from: "registry", name: "Guldstadens BK", city: "Skellefteå", category: "Boxning", group: "idrott", recipe: "bar", when: YEAR },
  { id: "ifk-vanersborg", from: "registry", name: "IFK Vänersborg", city: "Vänersborg", category: "Bandy", group: "idrott", recipe: "matchdag", when: { title: "Annandagsbandyn", detail: "Bandyns egen högtid – läktaren är full på annandag jul." } },
  { id: "gefle-gymnastikforening", from: "registry", name: "Gefle Gymnastikförening", city: "Gävle", category: "Gymnastik", group: "idrott", recipe: "toning", when: KIDS },
  { id: "vastra-frolunda-badmintonklubb", from: "registry", name: "Västra Frölunda Badmintonklubb", city: "Västra Frölunda", category: "Badminton", group: "idrott", recipe: "sicksack", symbol: "Fjäderbollen i klubbmärket.", when: YEAR },
  { id: "ik-sparta", from: "registry", name: "IK Sparta", city: "Malmö", category: "Brottning", group: "idrott", recipe: "klassisk", when: YEAR },
  { id: "hindas-kanot-friluftsklubb", from: "registry", name: "Hindås Kanot & Friluftsklubb", city: "Hindås", category: "Kanot", group: "idrott", recipe: "vagor", symbol: "Kanoten och paddlarna i klubbmärket.", when: { title: "Paddelsäsongen", detail: "När isen går upp bär klubben ut kanoterna igen." } },
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
  if (p.when) return [{ id: "nar", kind: "occasion" as const, ...p.when }, season, ...own];
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
  let drift = "";
  if (TO_SEND) {
    const pack = await buildPackage({ club: club.name, title: idea.title, why: idea.why, front, back, consent: built.consent, knit, report, date: today, pdf: htmlToPdf });
    const zip = new JSZip();
    for (const file of pack.files) zip.file(file.name, file.data);
    await writeFile(path.join(SEND, `stickfiler-${pack.base}.zip`), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    drift = `  jpg-avvikelse ${pack.jpgDrift}`;
  }

  const warn = report.checks.filter((c) => c.level === "varning").map((c) => c.title);
  console.log(
    `${p.name.padEnd(24)} ${idea.recipe.padEnd(9)} "${idea.title}"  ${knit.palette.length} garn${drift}  ${warn.length ? `VARNING: ${warn.join(", ")}` : "ok"}${
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
  const file = path.join(ROOT, "lib", "scarfBank.json");
  const kept = new Map(((JSON.parse(await readFile(file, "utf8")) as { scarves: BankScarf[] }).scarves ?? []).map((s) => [s.club.id, s]));
  // Utan argument görs bara det som saknas; med föreningens id görs just den om.
  const picks = PICKS.filter((p) => (only.length ? only.includes(p.id) : !kept.has(p.id)));
  await Promise.all([mkdir(PUBLIC, { recursive: true }), ...(TO_SEND ? [mkdir(SEND, { recursive: true })] : [])]);
  const now = new Date();
  let next = 0;
  let made = 0;
  const worker = async () => {
    for (let i = next++; i < picks.length; i = next++) {
      const scarf = await make(picks[i], now).catch((e) => {
        console.log(`${picks[i].name}: FEL – ${errorMessage(e)}`);
        return null;
      });
      if (!scarf) continue;
      kept.set(picks[i].id, scarf);
      made++;
      // Sparas efter varje halsduk, i listans ordning, så att en avbruten körning inte tappar det som blev klart.
      const scarves = PICKS.flatMap((p) => (kept.has(p.id) ? [kept.get(p.id)!] : []));
      await writeFile(file, `${JSON.stringify({ date: today, scarves }, null, 2)}\n`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`\n${made} av ${picks.length} halsdukar klara. Banken har ${kept.size}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
