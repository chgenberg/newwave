/**
 * Derbydemons körning: 5 000 påhittade supporteridéer genom hela flödet, på riktigt och med uppmätt kostnad.
 * Varje steg sparas under /tmp/nw-derby, så en avbruten körning fortsätter där den slutade utan att betala igen.
 * Resultatet hamnar i lib/newwave/derbyRun.json och bilderna i public/newwave/derby.
 *
 *   set -a; . ./.env.local; set +a; JITI_ALIAS='{"@/":"<repo>/"}' node_modules/.bin/jiti scripts/derby-run.ts
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { produceArtwork } from "@/lib/artwork";
import { readAsset } from "@/lib/newwave/asset";
import { nwProduct } from "@/lib/newwave/catalog";
import {
  addUsage,
  costSek,
  DERBY,
  type Flag,
  MODELS,
  moderate,
  NO_USAGE,
  ruleFlag,
  scoreIdeas,
  type Stopper,
  type Theme,
  type Usage,
  usageOf,
  type Verdict,
} from "@/lib/newwave/derby";
import type { DerbyRun } from "@/lib/newwave/derbyData";
import { mockupJpeg } from "@/lib/newwave/serverMockup";
import { generatePhoto, IMAGE_MODEL, openai } from "@/lib/openai";
import type { Concept } from "@/lib/types";

const WORK = "/tmp/nw-derby";
const OUT_JSON = path.join(process.cwd(), "lib/newwave/derbyRun.json");
const OUT_IMG = path.join(process.cwd(), "public/newwave/derby");
const TARGET = 5000;
const { club } = DERBY;

type Idea = { id: number; text: string; area: string };
const BAD: Exclude<Flag, "ok">[] = ["hat", "spam", "farg", "spelare", "amne"];
const STOPPERS: Stopper[] = ["regler", "moderering", "agent"];
/** Det som gör ett stopp självklart för en läsare, så att exemplen på sidan är tydliga. */
const SIGNAL: Record<Exclude<Flag, "ok">, RegExp> = {
  hat: /idiot|hata|hatar|död|krossa|suger/i,
  spam: /swish|köp|följ|biljett|klicka|rabatt|länk|www|\.se\b/i,
  farg: /grön|röd|gul/i,
  spelare: /nummer|\bnr\b|\b\d{1,2}\b|namn/i,
  amne: /recept|katt|hund|semester|väder|pizza|bulle|bullar/i,
};
type Scored = Idea & { stop: Stopper | null; flag: Flag; verdict: Verdict | null; restored: boolean };

async function cached<T>(name: string, make: () => Promise<T>): Promise<T> {
  const file = path.join(WORK, `${name}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8")) as T;
  const value = await make();
  await writeFile(file, JSON.stringify(value));
  return value;
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        for (let attempt = 1; ; attempt++) {
          try {
            out[i] = await fn(items[i], i);
            break;
          } catch (err) {
            if (attempt >= 4) throw err;
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }
    }),
  );
  return out;
}

const digest = (xs: { id: number }[]) => createHash("md5").update(xs.map((x) => x.id).join(",")).digest("hex").slice(0, 10);
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t = Date.now();
  const v = await fn();
  return [v, Math.round((Date.now() - t) / 100) / 10];
};
let seed = 1904;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

/* ---------- 1. Påhittade bidrag ---------- */

const AREAS = [
  ...["Majorna", "Linné", "Hisingen", "Kortedala", "Angered", "Bergsjön", "Frölunda", "Högsbo", "Johanneberg", "Lindholmen", "Biskopsgården", "Torslanda", "Haga", "Gamlestaden", "Örgryte", "Västra Frölunda", "Kungsladugård", "Eriksberg", "Backa", "Mölndal"].flatMap((a) => [a, a]),
  "Kungsbacka", "Kungälv", "Partille", "Lerum", "Alingsås", "Borås", "Uddevalla", "Stenungsund", "Stockholm", "Malmö",
];
const PERSONAS = [
  "tonåringar som står på klacken", "pensionärer som såg UEFA-cupfinalerna 1982 och 1987", "småbarnsföräldrar som tar med barnen", "utflyttade göteborgare",
  "grafiska formgivare och illustratörer", "folk i tifo-gruppen", "barn runt tio år, skrivna av en förälder", "säsongskortsinnehavare sedan 70-talet",
  "studenter på Chalmers", "hamnarbetare och folk från Hisingen", "ordvitsare som älskar göteborgska", "supportrar som är nya på läktaren",
  "fans som bor utanför stan", "mammor och mormödrar på Gamla Ullevi", "tatuerare och streetart-folk", "lagledare i ungdomsfotbollen",
];
const HINTS = [
  "Änglarna och änglavingar", "de blåvita ränderna", "Gamla Ullevi och strålkastarna", "\"Hela stadens lag\"", "1904 och klubbens historia",
  "Europakvällarna och UEFA-cupen", "göteborgska ord och uttryck", "vänliga skämt om Makrillarna", "havet, hamnen, kranarna och Älvsborgsbron",
  "klacken, tifon och sånger", "staden: Poseidon, Feskekôrka, spårvagnar, Liseberg", "derbykänslan dagen före matchen",
];
const GEN_SYSTEM = `Du skriver påhittade men realistiska tävlingsbidrag. ${club.name} låter vem som helst skicka in en idé till motivet för derbyt mot ${DERBY.rival} på ${DERBY.arena}; vinnaren blir derbyaffischen och derbytröjan. Svara bara med bidragen.`;

function genPrompt(i: number) {
  const base = `Skriv 50 olika bidrag från 50 olika ${pick(PERSONAS)}, men låt dem variera i ålder, stil och kvalitet. Många kretsar kring ${pick(HINTS)}, andra kring annat som hör derbyt till.
Ett bidrag beskriver vad som ska synas på affischen och tröjan, ibland med en kort slogan. Ungefär var femte ska vara riktigt bra och konkret (en tydlig bild man kan trycka), hälften helt okej, resten korta, slarviga eller klyschiga som "blåvitt för alltid" eller rena hejarop. Vissa idéer återkommer hos flera.
Längd 3–45 ord. Skriv naturlig vardaglig svenska som riktiga människor skriver i ett formulär: ibland stavfel, ibland göteborgska, sällan emoji. Inga spelares namn.`;
  if (i % 12 !== 11) return base;
  return `${base}
Den här gången bryter ungefär hälften mot tävlingsreglerna, så att juryns filter får något att göra: reklam och spam (biljetter, Swish, "följ mitt konto", länkar), elakheter mot ${DERBY.rival} med milda ord som "idioter" eller "hatar" (aldrig grövre än så), idéer där grönt, rött eller gult är huvudfärgen, idéer med en känd spelares namn och tröjnummer, och sådant som inte alls handlar om derbyt.`;
}

async function generate(): Promise<{ ideas: Idea[]; usage: Usage }> {
  const batches = Array.from({ length: Math.ceil(TARGET / 46) }, (_, i) => genPrompt(i));
  let usage = NO_USAGE;
  const lists = await pool(batches, 12, async (prompt) => {
    const res = await openai().responses.create({
      model: MODELS.semi,
      reasoning: { effort: "minimal" },
      input: [
        { role: "system", content: GEN_SYSTEM },
        { role: "user", content: prompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bidrag",
          strict: true,
          schema: { type: "object", additionalProperties: false, required: ["ideas"], properties: { ideas: { type: "array", items: { type: "string" } } } },
        },
      },
    });
    usage = addUsage(usage, usageOf(res.usage));
    return (JSON.parse(res.output_text) as { ideas: string[] }).ideas;
  });
  const texts = lists.flat().map((t) => t.trim().slice(0, DERBY.maxChars)).filter((t) => t.length >= 3);
  // Blanda, så att de regelbrytande omgångarna inte hamnar i klump.
  for (let i = texts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [texts[i], texts[j]] = [texts[j], texts[i]];
  }
  return { ideas: texts.slice(0, TARGET).map((text, i) => ({ id: i + 1, text, area: pick(AREAS) })), usage };
}

/** Genereringsmodellen skriver ibland in sin egen bedömning ("Kort och slarvigt:", "(reklam)"); en riktig supporter gör inte det. */
const JUDGED = /kort|slarvig|klysch|bra\b|stark|tydlig|kreativ|hejarop|regelbrott|reklam|spam|elak|okej|\bok\b|\brå\b|peppig|tråkig|konkret|genomtänk|fel färg|grönt|ilska|barsk|stilren|kärnidé|perfekt|klockren|tryck/i;
/** Självberöm sist i bidraget: "– perfekt för tröjtryck", ", mycket tryckbar". */
const PRAISE = /\s*[—–,;]\s*([^—–,;]{0,40}\b(tryck|vektor|perfekt|konkret|genomförbar|koncis|stilren|klockren|ikonisk|poster|tydlig och|lätt att|funkar)[^—–,;]{0,30})\.?$/i;
function tidy(text: string) {
  const t = text
    .replace(/^\s*[([]?([^:()[\]]{2,40}?)[)\]]?\s*[:–]\s+/, (all, label: string) => (JUDGED.test(label) ? "" : all))
    .replace(/\s*[([]([^()[\]]{2,40})[)\]]\s*\.?$/, (all, label: string) => (JUDGED.test(label) ? "" : all))
    .replace(PRAISE, "")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- 2–3. Regler, moderering och första läsningen ---------- */

type Verdicts = { verdicts: Record<number, Verdict & { text: string }>; usage: Usage; seconds: number };

/** Betyg på de idéer som saknar ett, sparade per bidrag och text; en omkörning läser bara det som är nytt. */
async function scoreAll(name: string, ideas: Idea[], model: string): Promise<Verdicts> {
  const file = path.join(WORK, `${name}.json`);
  const done: Verdicts = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : { verdicts: {}, usage: NO_USAGE, seconds: 0 };
  const fresh = (x: Idea) => done.verdicts[x.id]?.text === x.text;
  const [, seconds] = await timed(async () => {
    for (let round = 0; round < 3; round++) {
      const todo = ideas.filter((x) => !fresh(x));
      if (!todo.length) break;
      await pool(chunk(todo, 25), 16, async (c) => {
        const r = await scoreIdeas(
          c.map((x) => x.text),
          model,
        );
        done.usage = addUsage(done.usage, r.usage);
        r.verdicts.forEach((v, i) => {
          if (v) done.verdicts[c[i].id] = { ...v, text: c[i].text };
        });
      });
    }
  });
  done.seconds = Math.round((done.seconds + seconds) * 10) / 10;
  await writeFile(file, JSON.stringify(done));
  return done;
}

/** Modereringens svar per bidragstext; svaren skiftar lite mellan anrop, så en omkörning återanvänder dem. */
async function moderateAll(ideas: Idea[]) {
  const file = path.join(WORK, "2-moderation.json");
  const done: { flagged: Record<string, boolean>; seconds: number } = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : { flagged: {}, seconds: 0 };
  const todo = ideas.filter((x) => !(x.text in done.flagged));
  const [, seconds] = await timed(() =>
    pool(chunk(todo, 32), 6, async (c) => {
      (await moderate(c.map((x) => x.text))).forEach((f, i) => (done.flagged[c[i].text] = f));
    }),
  );
  done.seconds = Math.round((done.seconds + seconds) * 10) / 10;
  await writeFile(file, JSON.stringify(done));
  return { flags: ideas.map((x) => done.flagged[x.text]), seconds: done.seconds };
}

/** Ordlistan och modereringen, betyg på allt som klarade dem och en andra åsikt om det agenten stoppar. */
async function screen(ideas: Idea[]) {
  const rules = ideas.map((x) => ruleFlag(x.text));
  const flagged = await moderateAll(ideas);
  const scored: Scored[] = ideas.map((x, i) => ({ ...x, stop: rules[i] ? "regler" : flagged.flags[i] ? "moderering" : null, flag: rules[i] ?? (flagged.flags[i] ? "hat" : "ok"), verdict: null, restored: false }));
  const open = scored.filter((x) => !x.stop);
  const first = await scoreAll("2-screen", open, MODELS.screen);
  const second = await scoreAll(
    "2-review",
    open.filter((x) => first.verdicts[x.id] && first.verdicts[x.id].flag !== "ok"),
    MODELS.review,
  );
  for (const x of open) {
    const v = first.verdicts[x.id];
    if (!v) continue;
    const r = v.flag === "ok" ? v : (second.verdicts[x.id] ?? v);
    x.verdict = r;
    x.restored = v.flag !== "ok" && r.flag === "ok";
    if (r.flag !== "ok") {
      x.stop = "agent";
      x.flag = r.flag;
    }
  }
  return { scored, first, second, modSeconds: flagged.seconds };
}

/* ---------- 4. Semifinal och final ---------- */

const norm = (t: string) => t.toLowerCase().replace(/[^a-zåäö0-9]+/g, " ").trim();

async function semi(top: Scored[]) {
  const res = await openai().responses.create({
    model: MODELS.semi,
    reasoning: { effort: "low" },
    input: [
      {
        role: "system",
        content: `Du är juryn i ${club.name}s derbytävling. De här idéerna klarade första läsningen bland flera tusen. Läs dem noga och betygsätt var och en igen 0–100: hur unik den är, hur mycket derby och Göteborg den andas, om den har glimten i ögat, hur stark bild den blir på en affisch och en tröja och om supportrar vill bära den. Derbykänslan väger tyngst; klubbens grafiker förenklar för tryck, så dra inte ner en stark idé för detaljer. Ge ett lägre betyg till idéer som i stort sett är samma som en annan idé på listan. Klubbens regler:\n${club.rules.join("\n")}`,
      },
      { role: "user", content: top.map((x, i) => `${i + 1}. ${x.text}`).join("\n") },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "semifinal",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["scores"],
          properties: { scores: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "score"], properties: { n: { type: "integer" }, score: { type: "integer" } } } } },
        },
      },
    },
  });
  const { scores } = JSON.parse(res.output_text) as { scores: { n: number; score: number }[] };
  return { semi: top.map((x, i) => ({ ...x, semi: scores.find((s) => s.n === i + 1)?.score ?? 0 })), usage: usageOf(res.usage) };
}

const PALETTE = [...club.palette, ...club.agent.satire.extraColors].filter((c) => c.hex !== "#FFD100");

const JUDGES = 3;
const BRIEF = `Vinnaren blir derbyaffischen i sociala medier och derbytröjan i klubbshoppen. Den ska kännas som just det här derbyt – Göteborg, ${club.shortName} och glimten i ögat mot ${DERBY.rival} – och inte som vilket supportermotiv som helst. Klubbens grafiker förenklar för tryck, så döm idén och inte detaljerna.`;
const RULES = `Klubbens regler gäller allt:\n${club.rules.join("\n")}\n${club.agent.satire.rules.join("\n")}`;
const schema = (name: string, properties: Record<string, unknown>) => ({
  type: "json_schema" as const,
  name,
  strict: true,
  schema: { type: "object", additionalProperties: false, required: Object.keys(properties), properties },
});

/** En domare i panelen: rangordnar alla finalister utan att se de andras röster. */
async function judge(finalists: Scored[]) {
  const res = await openai().responses.create({
    model: MODELS.final,
    reasoning: { effort: "low" },
    input: [
      {
        role: "system",
        content: `Du är en av ${JUDGES} domare i ${club.name}s derbytävling inför matchen mot ${DERBY.rival} på ${DERBY.arena}. ${finalists.length} finalister är kvar av ${TARGET} bidrag. Rangordna alla från bäst till sämst och motivera varje placering med högst tjugo ord på svenska. ${BRIEF}\n\n${RULES}`,
      },
      { role: "user", content: finalists.map((x, i) => `${i + 1}. ${x.text}`).join("\n") },
    ],
    text: { format: schema("domare", { ranking: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "why"], properties: { n: { type: "integer" }, why: { type: "string" } } } } }) },
  });
  return { ranking: (JSON.parse(res.output_text) as { ranking: { n: number; why: string }[] }).ranking, usage: usageOf(res.usage) };
}

type ConceptOut = { title: string; slogan: string; story: string; mode: "standard" | "satir"; palette: string[]; artDirection: string; style: string; poster: string };

/** Panelens vinnare blir ett koncept för affischen och tröjan, troget mot supporterns idé. */
async function conceptFor(idea: Scored, whys: string[]) {
  const res = await openai().responses.create({
    model: MODELS.final,
    reasoning: { effort: "low" },
    input: [
      {
        role: "system",
        content: `Du gör konceptet för vinnaren i ${club.name}s derbytävling mot ${DERBY.rival}, troget mot supporterns idé. ${BRIEF}
- title: kort namn på motivet, svenska.
- slogan: högst ${club.maxSloganLength} tecken, svenska eller göteborgska, till affischen.
- story: två meningar på svenska om idén och varför domarna valde den.
- mode: "satir" bara om motivet skämtar om ${DERBY.rival}, annars "standard".
- palette: två eller tre av klubbens färger: ${PALETTE.map((c) => `${c.name} ${c.hex}`).join(", ")}. Satirfärgerna bara i läget satir.
- artDirection: på engelska, ett enda stort ikoniskt motiv för tröjtrycket, platt grafik.
- style: på engelska, kort stilbeskrivning för trycket.
- poster: på engelska, en stående illustrerad affischbild för sociala medier byggd på samma idé, med ett lugnt mörkare parti längst ned där klubben lägger text.

${RULES}`,
      },
      { role: "user", content: `Vinnaren: ${idea.text}\n\nDomarnas motiveringar:\n${whys.join("\n")}` },
    ],
    text: {
      format: schema("koncept", {
        title: { type: "string" },
        slogan: { type: "string" },
        story: { type: "string" },
        mode: { type: "string", enum: ["standard", "satir"] },
        palette: { type: "array", items: { type: "string", enum: PALETTE.map((c) => c.hex) } },
        artDirection: { type: "string" },
        style: { type: "string" },
        poster: { type: "string" },
      }),
    },
  });
  return { concept: JSON.parse(res.output_text) as ConceptOut, usage: usageOf(res.usage) };
}

/** Domarnas röster ihop: plats ett ger lika många poäng som det finns finalister, sista platsen en. */
function tally(finalists: (Scored & { semi: number })[], rankings: { n: number; why: string }[][]) {
  return finalists
    .map((x, i) => {
      const places = rankings.map((r) => r.findIndex((v) => v.n === i + 1));
      const best = places.reduce((b, p, j) => (p >= 0 && (b < 0 || p < places[b]) ? j : b), -1);
      return { x, points: places.reduce((sum, p) => sum + (p >= 0 ? finalists.length - p : 0), 0), why: best >= 0 ? rankings[best][places[best]].why : "" };
    })
    .sort((a, b) => b.points - a.points || b.x.semi - a.x.semi);
}

/* ---------- 5. Bilderna ---------- */

const PRODUCTS = ["p001", "p002", "p004"];

async function images(concept: Concept, poster: string) {
  await mkdir(OUT_IMG, { recursive: true });
  const [art, posterJpg] = await Promise.all([
    produceArtwork(club, concept),
    generatePhoto(
      `Vertical illustrated football derby poster artwork for ${club.name} against their city rivals, for social media. ${poster}
Palette: deep IFK blue #234B9A, dark navy #1A3770, sky blue #197BC4 and white${concept.mode === "satir" ? ", with at most a small touch of green as a joke" : ""}; no red, no yellow, no gold.
Bold, modern sports-poster illustration with strong graphic shapes and dramatic light. Keep the lower third calm and darker for text that is added afterwards.
Absolutely no text, letters, numbers, logos, crests, shields, club badges, jersey numbers or recognisable faces; any people are seen from behind or as silhouettes.`,
      "1024x1536",
    ),
  ]);
  const svg = await readAsset(art.url);
  if (!svg) throw new Error("Trycket gick inte att läsa");
  await writeFile(path.join(OUT_IMG, "tryck.png"), await sharp(svg, { density: 300 }).resize(1600, 1600, { fit: "inside" }).png().toBuffer());
  await writeFile(path.join(OUT_IMG, "affisch.jpg"), await sharp(posterJpg).jpeg({ quality: 86 }).toBuffer());
  return { attempts: art.attempts, checks: art.imageChecks.map((c) => ({ rule: c.rule, ok: c.ok })) };
}

/** Trycket på klubbshoppens plagg, samma mockup som butiken gör. */
async function mockups() {
  const products = [];
  for (const id of PRODUCTS) {
    const p = nwProduct(id);
    const jpg = p && (await mockupJpeg(p, "/newwave/derby/tryck.png", 1000));
    if (!p || !jpg) throw new Error(`Mockupen för ${id} gick inte att göra`);
    await writeFile(path.join(OUT_IMG, `${id}.jpg`), jpg);
    products.push({ id, name: `${p.name} ${p.garmentColor.toLowerCase()}`, price: p.priceSek + 50, image: `/newwave/derby/${id}.jpg` });
  }
  return products;
}

/* ---------- Körningen ---------- */

async function main() {
  await mkdir(WORK, { recursive: true });
  const t0 = Date.now();
  const raw = await cached("1-ideas", generate);
  const gen = { ...raw, ideas: raw.ideas.map((x) => ({ ...x, text: tidy(x.text) })).filter((x) => x.text.length >= 3) };
  console.log(`bidrag: ${gen.ideas.length}, ${costSek(MODELS.semi, gen.usage).toFixed(2)} kr`);

  const sc = await screen(gen.ideas);
  const ok = sc.scored.filter((x) => !x.stop && x.verdict);
  console.log(`godkända: ${ok.length} (${ok.filter((x) => x.restored).length} räddade), borttagna: ${sc.scored.filter((x) => x.stop).length}, olästa: ${sc.scored.filter((x) => !x.stop && !x.verdict).length}, ${costSek(MODELS.screen, sc.first.usage).toFixed(2)} + ${costSek(MODELS.review, sc.second.usage).toFixed(2)} kr`);

  const seen = new Set<string>();
  const ranked = [...ok].sort((a, b) => b.verdict!.score - a.verdict!.score || a.id - b.id);
  const top = ranked.filter((x) => (seen.has(norm(x.text)) ? false : (seen.add(norm(x.text)), true))).slice(0, 100);
  const sm = await cached(`3-semi-${digest(top)}`, async () => {
    const [r, seconds] = await timed(() => semi(top));
    return { ...r, seconds };
  });
  const finalists = [...sm.semi].sort((a, b) => b.semi - a.semi).slice(0, 16);
  console.log(`semifinal: ${costSek(MODELS.semi, sm.usage).toFixed(2)} kr`);

  const panel = await cached(`4-panel-${digest(finalists)}`, async () => {
    const [r, seconds] = await timed(() => Promise.all(Array.from({ length: JUDGES }, () => judge(finalists))));
    return { rankings: r.map((x) => x.ranking), usage: r.map((x) => x.usage).reduce(addUsage, NO_USAGE), seconds };
  });
  const order = tally(finalists, panel.rankings);
  const winner = order[0];
  const cc = await cached(`4-concept-${winner.x.id}`, async () => {
    const [r, seconds] = await timed(() => conceptFor(winner.x, panel.rankings.map((r) => r.find((v) => v.n === finalists.indexOf(winner.x) + 1)?.why ?? "")));
    return { ...r, seconds };
  });
  const c = cc.concept;
  const finalUsage = addUsage(panel.usage, cc.usage);
  console.log(`final: ${costSek(MODELS.final, finalUsage).toFixed(2)} kr, vinnare (${winner.points} av ${JUDGES * finalists.length} poäng): ${winner.x.text}`);

  const concept: Concept = {
    id: "derby-ifk-gais",
    signal: `Derbyt mot ${DERBY.rival}: vinnande supporteridé av ${TARGET}`,
    mode: c.mode,
    title: c.title,
    slogan: c.slogan.slice(0, club.maxSloganLength),
    story: c.story,
    style: c.style,
    artDirection: c.artDirection,
    palette: c.palette.length ? c.palette : ["#234B9A", "#FFFFFF", "#1A3770"],
    products: PRODUCTS,
  };
  const img = await cached(`5-images-${winner.x.id}`, async () => {
    if (!process.env.DERBY_IMAGES) throw new Error(`Vinnaren (#${winner.x.id}) har inga bilder än. De kostar runt ${2 * 4} kr; kör igen med DERBY_IMAGES=1.`);
    const [r, seconds] = await timed(() => images(concept, c.poster));
    return { ...r, seconds };
  });
  const products = await mockups();

  const removed = sc.scored.filter((x) => x.stop);
  const examples = BAD.flatMap((f) =>
    removed
      .filter((x) => x.flag === f)
      .sort((a, b) => Number(SIGNAL[f].test(b.text)) - Number(SIGNAL[f].test(a.text)) || STOPPERS.indexOf(a.stop!) - STOPPERS.indexOf(b.stop!) || a.text.length - b.text.length)
      .slice(0, 2)
      .map((x) => ({ text: x.text, area: x.area, flag: f, by: x.stop! })),
  );
  const themes = new Map<Theme, Scored[]>();
  for (const x of ok) themes.set(x.verdict!.theme, [...(themes.get(x.verdict!.theme) ?? []), x]);
  const idea = (x: Scored) => ({ id: x.id, text: x.text, area: x.area, score: x.verdict?.score ?? 0 });

  const run: DerbyRun = {
    ranAt: new Date().toISOString(),
    total: gen.ideas.length,
    approved: ok.length,
    restored: ok.filter((x) => x.restored).length,
    removed: Object.fromEntries(BAD.map((f) => [f, removed.filter((x) => x.flag === f).length])) as DerbyRun["removed"],
    stoppedBy: { regler: removed.filter((x) => x.stop === "regler").length, moderering: removed.filter((x) => x.stop === "moderering").length, agent: removed.filter((x) => x.stop === "agent").length },
    examples,
    rescued: ok
      .filter((x) => x.restored)
      .sort((a, b) => b.verdict!.score - a.verdict!.score)
      .slice(0, 3)
      .map((x) => ({ ...idea(x), was: sc.first.verdicts[x.id].flag as Exclude<Flag, "ok"> })),
    themes: [...themes.entries()]
      .map(([theme, xs]) => ({ theme, count: xs.length, avg: Math.round(xs.reduce((s, x) => s + x.verdict!.score, 0) / xs.length) }))
      .sort((a, b) => b.count - a.count),
    scores: ok.map((x) => x.verdict!.score).sort((a, b) => b - a),
    stream: ok.filter((_, i) => i % 97 === 0).slice(0, 40).map((x) => ({ ...idea(x), theme: x.verdict!.theme, why: x.verdict!.why })),
    semi: sm.semi.map((x) => ({ ...idea(x), semi: x.semi })).sort((a, b) => b.semi - a.semi),
    final: order.map((r, i) => ({ ...idea(r.x), rank: i + 1, points: r.points, why: r.why })),
    judges: JUDGES,
    winner: { ...idea(winner.x), why: winner.why, title: concept.title, slogan: concept.slogan, story: concept.story, mode: concept.mode },
    images: { poster: "/newwave/derby/affisch.jpg", print: "/newwave/derby/tryck.png", products, attempts: img.attempts, checks: img.checks },
    seconds: { moderate: sc.modSeconds, screen: sc.first.seconds, review: sc.second.seconds, semi: sm.seconds, final: Math.round((panel.seconds + cc.seconds) * 10) / 10, images: img.seconds },
    usage: [
      { stage: "generate", model: MODELS.semi, ...gen.usage, sek: costSek(MODELS.semi, gen.usage) },
      { stage: "screen", model: MODELS.screen, ...sc.first.usage, sek: costSek(MODELS.screen, sc.first.usage) },
      { stage: "review", model: MODELS.review, ...sc.second.usage, sek: costSek(MODELS.review, sc.second.usage) },
      { stage: "semi", model: MODELS.semi, ...sm.usage, sek: costSek(MODELS.semi, sm.usage) },
      { stage: "final", model: MODELS.final, ...finalUsage, sek: costSek(MODELS.final, finalUsage) },
    ],
    imageModel: IMAGE_MODEL,
    imageCount: img.attempts + 1,
  };
  await writeFile(OUT_JSON, `${JSON.stringify(run, null, 1)}\n`);
  console.log(`klart på ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
