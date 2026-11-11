import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { seasonFor, upcomingOccasions } from "./calendar";
import { IMAGE_MODEL, IMAGE_QUALITY, TEXT_MODEL, generateJson, openai } from "./openai";
import { FONT_KEYS, FONT_LABEL, ICONS, ICON_LABEL, type FontKey, type IconId } from "./scarfDesign";
import { PERSONAL, RECIPES, RECIPE_IDS, SAMPLE_SIGNERS, type RecipeId, type ScarfIdea } from "./scarfRecipes";
import { SCARF_TEXT } from "./scarf";
import { matchSignals, weatherSignal } from "./sources";
import type { Club, Signal, SourceStatus } from "./types";

/**
 * Halsduksagenten: läser av vad som händer kring klubben, föreslår halsdukar och granskar det stickade resultatet.
 * Agenten väljer recept, text, färgroller, typsnitt och motiv; stickmotorn står för måtten och maskinens gränser.
 */

export const MAX_MAIN = SCARF_TEXT.main;
export const MAX_SUB = SCARF_TEXT.sub;
/** Namnteckningar på en autografhalsduk: högst så här många, och så här långa. */
export const MAX_SIGNERS = SCARF_TEXT.signers;
export const MAX_SIGN = SCARF_TEXT.sign;

// --- Signaler ----------------------------------------------------------------

export async function scarfSignals(club: Club, now = new Date()): Promise<{ signals: Signal[]; sources: SourceStatus[] }> {
  const brand = club.kind === "brand";
  const [matchRes, weatherRes] = await Promise.allSettled([club.sources.sportsDbTeamId ? matchSignals(club, now) : Promise.resolve([]), weatherSignal(club)]);
  const matches = matchRes.status === "fulfilled" ? matchRes.value : [];
  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const occasions = upcomingOccasions(now, 75, brand);
  const nextYear = now.getUTCFullYear() + 1;
  const age = nextYear - club.founded;

  const own: Signal[] = brand
    ? [
        { id: "own-gift", kind: "club", title: "Kundgåvor och personal", detail: `Halsdukar till medarbetare, kunder och event – ${club.name}s färger i vintermörkret.` },
        { id: "own-tagline", kind: "club", title: `Devisen: ${club.tagline}`, detail: "Det folk redan förknippar med varumärket." },
      ]
    : [
        age % 5 === 0
          ? { id: "own-jubilee", kind: "club", title: `${club.name} fyller ${age} år ${nextYear}`, detail: `Grundad ${club.founded}. Jubileumshalsduk som samlarobjekt.` }
          : { id: "own-history", kind: "club", title: `Grundad ${club.founded}`, detail: `${age} säsonger av historia – årtalet är klubbens starkaste symbol efter skölden.` },
        { id: "own-arena", kind: "club", title: `Hemmaplan: ${club.arena}`, detail: "Arenan är en egen symbol för supportrarna." },
        { id: "own-nick", kind: "club", title: `Smeknamnet ${club.nicknames[0] ?? club.shortName}`, detail: "Det supportrarna själva säger." },
        { id: "own-squad", kind: "club", title: `Truppen ${nextYear}`, detail: "Spelarnas namn och nummer – en ny halsduk varje säsong. Kräver klubbens och spelarnas godkännande." },
        { id: "own-personal", kind: "custom", title: "Personliga halsdukar", detail: "Eget namn och nummer – till spelare, ledare, nya medlemmar och julklappar." },
      ];

  const signals = [...matches, ...occasions, ...(weather ? [weather] : []), seasonFor(now, brand), ...own];
  const sources: SourceStatus[] = [
    { id: "calendar", name: "Svensk kalender", ok: true, count: occasions.length + 1 },
    ...(club.sources.sportsDbTeamId ? [{ id: "match", name: "Matcher", ok: matchRes.status === "fulfilled", count: matches.length }] : []),
    { id: "weather", name: "SMHI", ok: Boolean(weather), count: weather ? 1 : 0 },
    { id: "club", name: brand ? "Varumärkets profil" : "Klubbens profil", ok: true, count: own.length },
  ];
  return { signals, sources };
}

// --- Idéer -------------------------------------------------------------------

const ICON_IDS = Object.keys(ICONS) as IconId[];

type RawIdea = {
  title: string;
  why: string;
  signal: string;
  recipe: RecipeId;
  frontMain: string;
  frontSub: string;
  backMain: string;
  backSub: string;
  font: FontKey;
  ground: string;
  ink: string;
  accent: string;
  icon: IconId | "ingen";
  art: string;
  number: string;
  roster: string[];
};

const schema = (club: Club, signals: Signal[], recipes: RecipeId[] = RECIPE_IDS) => {
  const colors = { type: "string", enum: club.palette.map((c) => c.hex) };
  const text = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "why", "signal", "recipe", "frontMain", "frontSub", "backMain", "backSub", "font", "ground", "ink", "accent", "icon", "art", "number", "roster"],
          properties: {
            title: text,
            why: text,
            signal: { type: "string", enum: signals.map((s) => s.title) },
            recipe: { type: "string", enum: recipes },
            frontMain: text,
            frontSub: text,
            backMain: text,
            backSub: text,
            font: { type: "string", enum: FONT_KEYS },
            ground: colors,
            ink: colors,
            accent: colors,
            icon: { type: "string", enum: [...ICON_IDS, "ingen"] },
            art: text,
            number: text,
            roster: { type: "array", items: text },
          },
        },
      },
    },
  };
};

const describeSignal = (s: Signal) => `- [${s.kind}] ${s.title}${s.date ? ` (${s.date}${s.daysUntil !== undefined ? `, om ${s.daysUntil} dagar` : ""})` : ""}: ${s.detail}`;

/** Det beställaren har bett om utöver signalerna. */
export type IdeaOrder = {
  /** En anvisning per beställt recept, till exempel att smeknamnet ska stå på framsidan. */
  notes?: Partial<Record<RecipeId, string>>;
  /** Beställarens egen önskan i fri text. Den finns också som signal med samma titel. */
  wish?: string;
};

/** `only`: beställaren har bett om just recepten i `want`, och varje recept ska bli en idé. */
function system(club: Club, count: number, avoid: RecipeId[], want: RecipeId[] = [], order: IdeaOrder = {}, only = false) {
  const brand = club.kind === "brand";
  const recipes = only
    ? `Beställaren har bett om ${want.length > 1 ? "recepten" : "receptet"} ${want.join(", ")}. Gör exakt en idé per recept.${want.map((r) => (order.notes?.[r] ? `\n  ${r}: ${order.notes[r]}.` : "")).join("")}`
    : count === 1
      ? `Välj det recept som passar idén bäst.${avoid.length ? ` Recepten ${avoid.join(", ")} är redan använda – välj ett annat.` : ""}`
      : `Använd ${count} olika recept${count >= 4 ? ". Minst två enkla och minst två komplexa" : ", gärna ett enkelt och ett komplext"}.${avoid.length ? `\n- Recepten ${avoid.join(", ")} är redan använda i kollektionen – välj andra.` : ""}${want.length ? `\n- Beställaren vill ha med ${want.length > 1 ? "recepten" : "receptet"} ${want.join(" och ")}.` : ""}`;
  return `Du är ${club.agent.name} och formger stickade halsdukar för ${club.name}. Halsdukarna stickas i jacquard av Seger på en OPEK 365 och säljs ${brand ? `till ${club.name}s kunder och medarbetare` : "i klubbens butik"}.

Så fungerar en stickad halsduk:
- Den är cirka 135 × 18 cm och stickas maska för maska: 120 maskor på höjden och 1 210 på längden per sida. Det finns en framsida och en baksida, som får olika text.
- Högst sju garner i hela halsduken. ${brand ? "Loggans" : "Sköldens"} egna färger tar plats bland dem, så välj tre färger ur profilen: botten (ground), text (ink) och detalj (accent).
- Text måste vara kort och stor. Huvudraden högst ${MAX_MAIN} tecken, helst under 11. Underraden högst ${MAX_SUB} tecken. Allt sätts i versaler.
- Inga foton, toningar eller tunna linjer, utom i de recept som är gjorda för det.

${brand ? "Varumärkets" : "Klubbens"} regelbok (gäller även halsdukar; regler om digitaltryck gäller inte här):
${club.rules.map((r) => `- ${r}`).join("\n")}
- Tonalitet: ${club.tone}
- ${brand ? "Namn" : "Smeknamn"} som får användas: ${club.nicknames.join(", ")}.${brand || !club.arena ? "" : ` Hemmaarena: ${club.arena}.`}${brand || !club.founded ? "" : ` Grundad ${club.founded}.`}${club.tagline ? ` Devis: "${club.tagline}".` : ""}${
    brand || (club.founded && club.arena) ? "" : `\n- ${[club.founded ? "" : "Grundningsåret", club.arena ? "" : "hemmaarenan"].filter(Boolean).join(" och ")} är inte ${club.founded || club.arena ? "känt" : "kända"}: skriv inga årtal för grundandet och hitta inte på arenanamn, smeknamn eller deviser.`
  }
- Färger: ${club.palette.map((c) => `${c.name} ${c.hex}`).join(", ")}.

Du väljer ett recept per idé. Stickmotorn sköter mått, marginaler och maskinens gränser.
${RECIPE_IDS.map((id) => `- ${id} (${RECIPES[id].level}): ${RECIPES[id].hint}`).join("\n")}

Typsnitt: ${FONT_KEYS.map((k) => `${k} (${FONT_LABEL[k].split(" – ")[1]})`).join(", ")}.
Ikoner: ${ICON_IDS.map((k) => `${k} (${ICON_LABEL[k]})`).join(", ")}, eller "ingen".

Ta fram exakt ${count} ${count === 1 ? "idé" : "idéer"}. Tänk som en supporter som står i kön till souvenirshoppen: varje halsduk ska ha EN tydlig anledning att finnas – en högtid, en match, ett årtal, ett smeknamn, en plats.
- ${recipes}${order.wish ? `\n- Beställarens egen önskan: "${order.wish}". ${count > 1 ? "Minst en idé" : "Idén"} ska bygga på den och ha signalen "${order.wish}".` : ""}
- Sprid idéerna över signalerna. Högtider och matcher som ligger nära i tid går först.
- ${brand ? "Recepten trupp, porträtt, autograf, arena och matchdag passar inte ett företag – välj inte dem." : "Recepten trupp, porträtt, personlig och autograf bär namn, nummer, ansikte eller namnteckning. De stickas först när klubben och personen har godkänt, så regelbokens förbud mot spelarnamn hindrar dem inte – men föreslå högst ett av trupp, porträtt och autograf om beställaren inte bett om dem. Använd påhittade exempelnamn."}
- Receptet jul passar bara när julen är en av signalerna.
- Variera typsnitt. Botten (ground) ska vara en av profilens bärande färger – ${club.palette.slice(0, 2).map((c) => c.name).join(" eller ")} – så att halsduken känns igen på håll. Neutrala färger som svart är detaljer, inte botten.
- Underraden ska tillföra något: en plats, ett årtal eller en devis. Inga säljfraser som "julklapp" eller "erbjudande", och hellre ingen underrad än en lång.
- Halsdukar säljs länge. Datum och motståndare får bara stå på baksidans underrad, och bara när signalen är en match.

Fält:
- title: halsdukens namn, två till fyra ord.
- why: en mening om varför supportrarna vill ha den just nu. Nämn inte regelboken eller tekniken.
- signal: exakt titeln på signalen idén bygger på.
- frontMain/frontSub: framsidans huvudrad och underrad. backMain/backSub: baksidans. Underraden får vara tom ("").
  bar: frontMain används inte, backMain är ett årtal eller en förkortning på högst sex tecken.
  retro: frontSub är ett årtal eller högst fem tecken som stickas tvärs över ändarna. backSub är en vanlig underrad.
  matchdag: frontMain står på vänster halva och frontSub på höger – två korta rader som hör ihop.
  motiv: frontMain står till vänster om motivet och frontSub till höger. Lämnas frontSub tom får halsduken ett motiv i varje ände.
  personlig: frontMain är ett exempelnamn och number ett tröjnummer.
  trupp: frontMain är rubriken och roster 10–14 påhittade exempelspelare som "7 NILSSON".
  porträtt: frontMain är ett påhittat efternamn med tröjnummer, till exempel "9 HOLM". Fotot är ett exempelfoto som byts mot spelarens.
  autograf: frontMain är en kort rubrik, till exempel "SIGNERAD", och roster två eller tre påhittade exempelnamn med för- och efternamn, som "Elsa Lindkvist". Namnen stickas som namnteckningar.
- ground, ink, accent: färgkoder ur profilen. ink måste synas tydligt mot ground.
- icon: en ikon som passar idén, annars "ingen". Används av motiv, tapet, arena, vagor, jul och matchdag.
- art: bara för receptet motiv, och i högst en idé: en beskrivning på engelska av ETT djärvt, platt motiv som bildmodellen ritar (inga personer, ingen text, ${brand ? "ingen logga" : "ingen sköld"}). Annars "".
- number: tröjnummer för personlig, annars "".
- roster: bara för trupp och autograf, annars [].`;
}

/** En namnteckning skrivs med stor bokstav först i varje namn, inte i versaler som resten av halsduken. */
const signer = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("sv-SE")
    .replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toLocaleUpperCase("sv-SE"));

const up = (s: string, max: number) => s.replace(/\s+/g, " ").trim().toLocaleUpperCase("sv-SE").slice(0, max).trim();

/** Rättar en idé till det som går att sticka: längder, färger ur profilen och inga förbjudna ord. Ger null om idén inte går att rädda. */
export function cleanIdea(club: Club, raw: RawIdea): ScarfIdea | null {
  if (!RECIPE_IDS.includes(raw.recipe) || !FONT_KEYS.includes(raw.font)) return null;
  const hexes = club.palette.map((c) => c.hex.toUpperCase());
  const color = (h: string, fallback: string) => (hexes.includes(h.toUpperCase()) ? h.toUpperCase() : fallback);
  const idea: ScarfIdea = {
    id: randomUUID(),
    title: raw.title.replace(/\s+/g, " ").trim().slice(0, 40),
    why: raw.why.replace(/\s+/g, " ").trim().slice(0, 220),
    signal: raw.signal,
    recipe: raw.recipe,
    front: { main: up(raw.frontMain, MAX_MAIN), sub: up(raw.frontSub, MAX_SUB) },
    back: { main: up(raw.backMain, MAX_MAIN), sub: up(raw.backSub, MAX_SUB) },
    font: raw.font,
    colors: { ground: color(raw.ground, hexes[0]), ink: color(raw.ink, hexes[1] ?? "#FFFFFF"), accent: color(raw.accent, hexes[2] ?? hexes[1] ?? hexes[0]) },
    icon: raw.icon !== "ingen" && ICON_IDS.includes(raw.icon) ? raw.icon : null,
    art: raw.recipe === "motiv" && raw.art.trim() ? raw.art.replace(/\s+/g, " ").trim().slice(0, 400) : null,
    number: raw.number.replace(/\D/g, "").slice(0, 2),
    roster:
      raw.recipe === "trupp"
        ? raw.roster.map((p) => up(p, SCARF_TEXT.player)).filter(Boolean).slice(0, SCARF_TEXT.players)
        : raw.recipe === "autograf"
          ? raw.roster.map((p) => signer(p).slice(0, MAX_SIGN).trim()).filter(Boolean).slice(0, MAX_SIGNERS)
          : [],
  };
  const words = [idea.title, idea.front.main, idea.front.sub, idea.back.main, idea.back.sub, ...idea.roster].join(" ").toLocaleLowerCase("sv-SE");
  if (club.bannedWords.some((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, "u").test(words))) return null;
  if (!idea.title || (!idea.front.main && idea.recipe !== "bar")) return null;
  return idea;
}

/**
 * Recepten i `want` är beställda och får ett eget anrop där modellen bara kan välja bland dem – då kommer de alltid med.
 * Resten av kollektionen tas fram parallellt bland de recept som är kvar.
 */
export async function createScarfIdeas(club: Club, signals: Signal[], count: number, avoid: RecipeId[] = [], want: RecipeId[] = [], order: IdeaOrder = {}): Promise<ScarfIdea[]> {
  const hasJul = signals.some((s) => /jul/i.test(s.title));
  const wanted = [...new Set(want)].filter((r) => RECIPE_IDS.includes(r) && !avoid.includes(r)).slice(0, count);
  const rest = count - wanted.length;
  const free = RECIPE_IDS.filter((r) => !wanted.includes(r) && !avoid.includes(r) && (hasJul || r !== "jul"));
  // Den fria önskan hör till resten av kollektionen; är allt beställt per recept får en av de beställda bära den.
  const wish = (here: boolean) => (here ? order.wish : undefined);
  const ask = (n: number, only: RecipeId[] | null) =>
    generateJson<{ ideas: RawIdea[] }>({
      system: system(club, n, only ? [] : [...avoid, ...wanted], only ?? [], { notes: order.notes, wish: wish(only ? rest === 0 : true) }, Boolean(only)),
      user: `Signaler just nu:\n${signals.map(describeSignal).join("\n")}\n\nTa fram ${n} ${n === 1 ? "halsduk" : "halsdukar"}.`,
      schemaName: "scarf_ideas",
      schema: schema(club, signals, only ?? (free.length >= n ? free : RECIPE_IDS)),
    });
  const answers = await Promise.allSettled([wanted.length ? ask(wanted.length, wanted) : null, rest > 0 ? ask(rest, null) : null]);
  const raws = answers.flatMap((a) => (a.status === "fulfilled" && a.value ? a.value.ideas : []));
  const failed = answers.find((a): a is PromiseRejectedResult => a.status === "rejected");
  if (!raws.length && failed) throw failed.reason;

  const seen = new Set<RecipeId>(avoid);
  const ideas: ScarfIdea[] = [];
  for (const raw of raws) {
    const idea = cleanIdea(club, raw);
    // Ett recept per körning, så att kollektionen blir varierad även om modellen upprepar sig.
    if (!idea || seen.has(idea.recipe)) continue;
    if (idea.recipe === "jul" && !hasJul) continue;
    seen.add(idea.recipe);
    ideas.push(idea);
  }
  return ideas.slice(0, count);
}

const describeIdea = (idea: ScarfIdea) => `Framsida: ${[idea.front.main, idea.front.sub].filter(Boolean).join(" / ") || "ingen text"}. Baksida: ${[idea.back.main, idea.back.sub].filter(Boolean).join(" / ") || "ingen text"}.
Färger: botten ${idea.colors.ground}, text ${idea.colors.ink}, detalj ${idea.colors.accent}.${idea.roster.length ? `\nNamn: ${idea.roster.join(", ")}.` : ""}${idea.number ? `\nNummer: ${idea.number}.` : ""}${idea.icon ? `\nIkon: ${idea.icon}.` : ""}${idea.art ? `\nRitat motiv: ${idea.art}` : ""}`;

/** En ny version av en halsduk: samma signal, en idé tillbaka. */
async function redo(club: Club, idea: ScarfIdea, user: string): Promise<ScarfIdea | null> {
  const signal: Signal = { id: "revise", kind: "custom", title: idea.signal, detail: idea.why };
  const res = await generateJson<{ ideas: RawIdea[] }>({ system: system(club, 1, []), user, schemaName: "scarf_ideas", schema: schema(club, [signal]) });
  const revised = res.ideas[0] ? cleanIdea(club, res.ideas[0]) : null;
  return revised ? { ...revised, art: revised.art ?? (revised.recipe === "motiv" ? idea.art : null) } : null;
}

/** Granskaren underkände: agenten gör om halsduken en gång med granskarens punkter som underlag. */
export function reviseScarfIdea(club: Club, idea: ScarfIdea, review: Pick<ScarfReview, "issues" | "summary">): Promise<ScarfIdea | null> {
  return redo(
    club,
    idea,
    `Granskaren underkände halsduken "${idea.title}" (recept ${idea.recipe}, typsnitt ${idea.font}).
${describeIdea(idea)}

Granskarens omdöme: ${review.summary}
${review.issues.map((i) => `- ${i}`).join("\n")}

Gör om halsduken så att punkterna är åtgärdade. Behåll signalen "${idea.signal}" och grundidén. Du får byta recept, text, typsnitt och färger. Ge exakt en idé.`,
  );
}

/** Beställaren ber om en ändring med egna ord: agenten gör den och låter resten av halsduken vara. */
export function changeScarfIdea(club: Club, idea: ScarfIdea, instruction: string): Promise<ScarfIdea | null> {
  return redo(
    club,
    idea,
    `Beställaren vill ändra halsduken "${idea.title}" (recept ${idea.recipe}, typsnitt ${idea.font}).
${describeIdea(idea)}

Ändringen beställaren ber om: "${instruction}"

Gör ändringen och låt allt annat vara som det är – samma recept, typsnitt, färger och texter, om inte ändringen kräver något annat. Beställarens ändring går före dina egna råd om textlängd och underrader, men måtten i tecken gäller fortfarande. Signalen är "${idea.signal}". Ge exakt en idé.`,
  );
}

/** Idéer utan språkmodell: samma recept, fyllda från klubbens profil och signalerna. Används när nyckel saknas. */
export function demoScarfIdeas(club: Club, signals: Signal[], count: number, want: RecipeId[] = []): ScarfIdea[] {
  const brand = club.kind === "brand";
  const [p0, p1, p2, p3] = [club.palette[0].hex, club.palette[1]?.hex ?? "#FFFFFF", club.palette[2]?.hex ?? club.palette[0].hex, club.palette[3]?.hex ?? club.palette[1]?.hex ?? "#FFFFFF"];
  const nick = club.nicknames[0] ?? club.shortName;
  // Okänt grundningsår eller okänd arena lämnar raden tom i stället för att hitta på något.
  const year = club.founded ? String(club.founded) : "";
  const place = [club.city, year].filter(Boolean).join(" · ");
  const find = (re: RegExp) => signals.find((s) => re.test(s.title))?.title;
  const any = signals[0]?.title ?? "";
  const make = (recipe: RecipeId, title: string, why: string, signal: string | undefined, front: [string, string], back: [string, string], font: FontKey, colors: [string, string, string], extra: Partial<ScarfIdea> = {}): RawIdea | null =>
    signal === undefined
      ? null
      : { title, why, signal, recipe, frontMain: front[0], frontSub: front[1], backMain: back[0], backSub: back[1], font, ground: colors[0], ink: colors[1], accent: colors[2], icon: extra.icon ?? "ingen", art: "", number: extra.number ?? "", roster: extra.roster ?? [] };
  const wings: IconId = club.nicknames.some((n) => /äng/i.test(n)) ? "vingar" : brand ? "kopp" : "stjarna";
  const raws = [
    make("jul", `${nick} jul`, "Julklappen som går att bära på läktaren i april.", find(/^jul/i), ["GOD JUL", place], [club.name, club.tagline.length <= MAX_SUB ? club.tagline : ""], "slab", [p0, p1, p3], { icon: "snoflinga" }),
    make("klassisk", "Klassikern", "Den alla känner igen – sköld, namn och ränder.", find(/grundad|fyller|devisen/i) ?? any, [nick, place], [club.name, club.tagline.length <= MAX_SUB ? club.tagline : ""], "anton", [p0, p1, p3]),
    brand
      ? make("profil", "Profilhalsduken", "En kundgåva som faktiskt används när det är kallt.", find(/kundgåvor/i) ?? any, [club.name, club.tagline], [club.tagline.length <= MAX_MAIN ? club.tagline : club.name, ""], "block", [p0, p2, p1])
      : make("matchdag", "Stormatchen", "Två halvor, en sköld – halsduken man köper på väg in.", find(/ - | – |match|derby|omgång/i) ?? find(/arena|hemmaplan/i), [nick, club.city], [club.tagline.length <= MAX_MAIN ? club.tagline : club.name, club.arena], "block", [p0, p1, p3]),
    make("bar", "Bar scarf", "Bara färgerna. Syns över hela läktaren.", find(/vinter|höst|kallt|grad/i) ?? any, ["", ""], [year, ""], "varsity", [p0, p1, p3]),
    make("motiv", brand ? "Kaffet på vägen" : "Vingarna", "Ett motiv som säger allt utan att stava det.", find(/smeknamn|devisen/i) ?? any, [nick, brand ? club.tagline.slice(0, MAX_MAIN) : year ? `SEDAN ${year}` : ""], [club.name, ""], "anton", [p0, p1, p3], { icon: wings }),
    make("retro", "Årtalet", "Collegebokstäver och årtalet tvärs över ändarna.", find(/grundad|fyller/i) ?? any, [nick, year], [club.name, ""], "varsity", [p1, p0, p3]),
    brand ? null : make("arena", "Hemmaplan", "Arenan är halva kärleken.", find(/hemmaplan/i), [club.arena, place], [club.name, ""], "smal", [p2, p1, p3], { icon: "stralkastare" }),
    make("tapet", "Stjärnhimmel", "Mönstrad ton i ton – snygg även utan match.", find(/vinter|höst|lucia|nyår/i) ?? any, [nick, ""], [club.name, ""], "block", [p0, p1, p3], { icon: "stjarna" }),
    brand ? null : make("personlig", "Med eget namn", "Julklappen till den som har allt – utom en halsduk med sitt eget namn.", find(/personliga/i), ["ELLA", club.name], [nick, ""], "varsity", [p0, p1, p3], { number: "7" }),
    make("toning", "Skymning", "Modern och ren – färgerna tonar över i varandra.", find(/vinter|höst|black friday/i) ?? any, [nick, ""], [club.name, ""], "teknik", [p0, p1, p2]),
    brand ? null : make("trupp", `Truppen ${new Date().getUTCFullYear() + 1}`, "En ny varje säsong – samlarobjektet för de trogna.", find(/truppen/i), [`TRUPPEN ${new Date().getUTCFullYear() + 1}`, ""], [club.name, ""], "anton", [p0, p1, p3]),
    make("argyle", "Söndagsfin", "Romber ton i ton – halsduken som funkar till kappan.", find(/fars dag|jul|lucia|vinter|höst/i) ?? any, [nick, ""], [club.name, ""], "slab", [p0, p1, p3]),
    make("sicksack", "Sjuttiotal", "Sicksack som på läktarna förr.", any, [nick, ""], [club.name, ""], "rund", [p0, p1, p3]),
    brand ? null : make("portratt", "En av oss", "Ansiktet alla känner igen – stickat i fyra gråtoner.", find(/truppen|personliga/i) ?? any, ["9 HOLM", club.arena || club.city], [nick, ""], "anton", [p0, p1, p3]),
    brand ? null : make("autograf", "Signerad", "Namnteckningarna man annars köar för efter matchen.", find(/truppen/i) ?? any, ["SIGNERAD", String(new Date().getUTCFullYear() + 1)], [club.name, ""], "block", [p0, p1, p3], { roster: SAMPLE_SIGNERS }),
  ];
  // Det beställaren bett om går först; resten kommer i listans ordning.
  const rank = (r: RecipeId) => (want.includes(r) ? want.indexOf(r) : want.length);
  return raws
    .filter((r): r is RawIdea => r !== null)
    .map((r) => cleanIdea(club, r))
    .filter((i): i is ScarfIdea => i !== null)
    .map((idea, at) => ({ idea, at }))
    .sort((a, b) => rank(a.idea.recipe) - rank(b.idea.recipe) || a.at - b.at)
    .map((x) => x.idea)
    .slice(0, count);
}

// --- Motiv från bildmodellen ---------------------------------------------------

/** Ritar ett platt motiv i två av halsdukens garnfärger, frilagt. Stickmotorn reducerar det sedan till maskor. */
export async function drawScarfMotif(idea: ScarfIdea, colors: { ink: string; accent: string; ground: string }): Promise<Buffer> {
  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt: [
      `A single bold, flat pictogram for a knitted jacquard football scarf: ${idea.art}.`,
      `Use only two solid colours: ${colors.ink} and ${colors.accent}. It will sit on a ${colors.ground} background, so do not use that colour.`,
      "Style: chunky simplified silhouette like a woven badge or a cross-stitch chart – thick shapes, generous gaps, hard edges.",
      "No gradients, no shading, no outlines thinner than a marker stroke, no small details, no text, no letters, no numbers, no logos, no crests, no human faces.",
      "One centred motif that fills the frame edge to edge in a wide landscape composition. Transparent background.",
    ].join("\n"),
    size: "1536x1024",
    quality: IMAGE_QUALITY,
    background: "transparent",
    output_format: "png",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade inget motiv");
  return Buffer.from(b64, "base64");
}

// --- Granskaren ----------------------------------------------------------------

export type ScarfReview = { sales: number; brandFit: number; legibility: number; craft: number; strengths: string[]; issues: string[]; summary: string; verdict: "godkänd" | "underkänd" };

export const REVIEW_MIN = { sales: 7, brandFit: 8, legibility: 7 };

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sales", "brandFit", "legibility", "craft", "strengths", "issues", "summary"],
  properties: {
    sales: { type: "integer", minimum: 1, maximum: 10 },
    brandFit: { type: "integer", minimum: 1, maximum: 10 },
    legibility: { type: "integer", minimum: 1, maximum: 10 },
    craft: { type: "integer", minimum: 1, maximum: 10 },
    strengths: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

/** Granskaren ser korrekturet – fram- och baksida som de blir stickade – och sätter betyg. */
export async function reviewScarf(club: Club, idea: ScarfIdea, proof: Buffer): Promise<ScarfReview> {
  const brand = club.kind === "brand";
  const jpg = await sharp(proof).flatten({ background: "#FFFFFF" }).resize({ width: 1600 }).jpeg({ quality: 82 }).toBuffer();
  const res = await openai().responses.create({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content: `Du är granskaren för ${club.name}s stickade halsdukar – en erfaren merchansvarig som avgör om en halsduk får skickas till stickeriet. Var ärlig och kräsen.
Skalan: 5 = duger inte, 6 = nästan, 7 = säljbar och klar att sticka, 8 = stark, 9 = bästsäljare, 10 är sällsynt.
Halsduken går till stickeriet om sales är minst ${REVIEW_MIN.sales}, brandFit minst ${REVIEW_MIN.brandFit} och legibility minst ${REVIEW_MIN.legibility}. Annars görs den om. Sätt betygen så att de stämmer med din bedömning, och skriv sammanfattningen så att den stämmer med utfallet.

${brand ? "Varumärkets" : "Klubbens"} riktlinjer:
${club.agent.guidelines.map((g) => `- ${g}`).join("\n")}
${club.rules.filter((r) => !/DTG|digitaltryck/i.test(r)).map((r) => `- ${r}`).join("\n")}

${PERSONAL.includes(idea.recipe) ? "Den här halsduken bär namn, nummer, ansikte eller namnteckning. Den stickas först när klubben och personen har godkänt det skriftligt, och namnen i korrekturet är påhittade exempel – räkna därför inte namn, nummer, porträtt eller namnteckningar som ett regelbrott.\n\n" : ""}${idea.recipe === "autograf" ? "Namnteckningarna är autografer skrivna för hand. De ska se ut som namnteckningar och behöver inte gå att läsa bokstav för bokstav – bedöm läsbarheten på rubriken och baksidans text.\n\n" : ""}Bilden är ett korrektur: framsidan överst och baksidan under, som de ser ut stickade i jacquard med fransar. ${brand ? "Loggan" : "Skölden"} är den officiella och ska inte räknas som ett fel. Halsduken är 135 cm lång och ses oftast på några meters håll.

Betygsätt 1–10:
- sales: hur troligt är det att en ${brand ? "kund eller medarbetare" : "supporter"} köper och bär den?
- brandFit: följer den riktlinjerna, färgerna och tonläget?
- legibility: går texten att läsa på håll, och är kontrasten tydlig?
- craft: ser den ut som en genomarbetad produkt – balans, rytm och detaljer?
strengths/issues: korta punkter på svenska, högst tre av varje. issues är det som bör provstickas eller förbättras, även för en godkänd halsduk. summary: en mening om helheten, utan att nämna betyg eller gränser.`,
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: `Halsduken "${idea.title}" (recept: ${RECIPES[idea.recipe].label}). Idén: ${idea.why} Framsida: ${[idea.front.main, idea.front.sub].filter(Boolean).join(" / ") || "ingen text"}. Baksida: ${[idea.back.main, idea.back.sub].filter(Boolean).join(" / ") || "ingen text"}.` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "auto" },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "scarf_review", schema: reviewSchema, strict: true } },
  });
  const r = JSON.parse(res.output_text) as Omit<ScarfReview, "verdict">;
  return { ...r, strengths: r.strengths.slice(0, 3), issues: r.issues.slice(0, 3), verdict: r.sales >= REVIEW_MIN.sales && r.brandFit >= REVIEW_MIN.brandFit && r.legibility >= REVIEW_MIN.legibility ? "godkänd" : "underkänd" };
}
