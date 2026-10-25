import { IFK_GOTEBORG } from "@/lib/club";
import { openai } from "@/lib/openai";

/**
 * Derbyt: vem som helst skickar in en idé till derbyts motiv. Klubbens regler och en gratis moderering sållar,
 * en billig modell läser och betygsätter alla, en bättre modell dömer finalen. Demons 5 000 bidrag och ett nytt
 * bidrag på sidan går genom samma filter och samma betygsskala.
 */

export const DERBY = { club: IFK_GOTEBORG, rival: "GAIS", rivalNick: "Makrillarna", arena: IFK_GOTEBORG.arena, maxChars: 280 };

export const MODELS = { screen: "gpt-5-nano", review: "gpt-5-mini", semi: "gpt-5-mini", final: "gpt-5", moderation: "omni-moderation-latest" } as const;

/** Listpris i dollar per miljon tokens: in, in som redan finns i modellens cache, och ut. */
export const PRICES: Record<string, { label: string; in: number; cached: number; out: number }> = {
  "gpt-5-nano": { label: "GPT-5 nano", in: 0.05, cached: 0.005, out: 0.4 },
  "gpt-5-mini": { label: "GPT-5 mini", in: 0.25, cached: 0.025, out: 2 },
  "gpt-5": { label: "GPT-5", in: 1.25, cached: 0.125, out: 10 },
  "claude-haiku-4.5": { label: "Claude Haiku 4.5", in: 1, cached: 0.1, out: 5 },
  "claude-sonnet-4.5": { label: "Claude Sonnet 4.5", in: 3, cached: 0.3, out: 15 },
};
export const SEK_PER_USD = 10;

export type Usage = { calls: number; input: number; cached: number; output: number };
export const NO_USAGE: Usage = { calls: 0, input: 0, cached: 0, output: 0 };
export const addUsage = (a: Usage, b: Usage): Usage => ({ calls: a.calls + b.calls, input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output });

export function costSek(model: string, u: Usage) {
  const p = PRICES[model];
  return (((u.input - u.cached) * p.in + u.cached * p.cached + u.output * p.out) / 1e6) * SEK_PER_USD;
}

type ResponseUsage = { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } } | undefined;
export const usageOf = (u: ResponseUsage): Usage => ({ calls: 1, input: u?.input_tokens ?? 0, cached: u?.input_tokens_details?.cached_tokens ?? 0, output: u?.output_tokens ?? 0 });

/** Temana med det som hör till vart och ett, så att agenten sorterar likadant varje gång. */
const THEME_HINTS = {
  Änglarna: "änglar, vingar, glorior",
  "Blåvitt och ränderna": "färgerna, ränderna, halsdukar och tröjor",
  "Gamla Ullevi": "arenan, strålkastarna, läktarna",
  "Hela stadens lag": "staden och gemenskapen: siluetten, Poseidon, spårvagnar, Liseberg, stadsdelar",
  "Historia och 1904": "1904, gamla tider, retro, generationer",
  Europakvällarna: "UEFA-cupen 1982 och 1987, Europa",
  Göteborgska: "ordvitsar och dialekt, där orden är idén",
  "Skämt om Makrillarna": `skämt om ${"GAIS"} och makrillar`,
  "Havet och hamnen": "älven, kranarna, båtar, fyrar, Älvsborgsbron",
  "Klacken och tifot": "sånger, tifon, flaggor, supportrarna själva",
  Övrigt: "allt annat",
} as const;
export const THEMES = Object.keys(THEME_HINTS) as (keyof typeof THEME_HINTS)[];
export type Theme = keyof typeof THEME_HINTS;

export const FLAGS = {
  ok: "Godkänd",
  hat: "Hat, hot eller olämpligt",
  spam: "Spam eller reklam",
  farg: "Fel färger",
  spelare: "Spelares namn eller nummer",
  amne: "Handlar inte om derbyt",
} as const;
export type Flag = keyof typeof FLAGS;

export type Verdict = { score: number; theme: Theme; flag: Flag; why: string };
/** Vem som stoppade bidraget: klubbens ordlista, modereringen eller agenten. */
export type Stopper = "regler" | "moderering" | "agent";

/** Det klubbens regler stoppar direkt, utan AI: spärrade ord, länkar, Swish och telefonnummer. */
export function ruleFlag(text: string): Flag | null {
  const t = text.toLowerCase();
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(se|com|nu|net)\b|swish|\b07\d[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}\b/.test(t)) return "spam";
  const words = t.split(/[^a-zåäöéü]+/);
  return DERBY.club.bannedWords.some((b) => words.some((w) => w === b || (b.length > 3 && w.startsWith(b)))) ? "hat" : null;
}

/** Modereringens egen flagga slår till redan vid "Vi tar dem"; klubben stoppar först när någon kategori är minst så här säker. */
const MODERATION_MIN = 0.5;

/** OpenAI:s moderering kostar ingenting; den tar hat, hot, trakasserier och sexuellt innehåll. */
export async function moderate(texts: string[]): Promise<boolean[]> {
  const res = await openai().moderations.create({ model: MODELS.moderation, input: texts });
  return res.results.map((r) => Object.values(r.category_scores as unknown as Record<string, number>).some((v) => v >= MODERATION_MIN));
}

const { club } = DERBY;

export const RUBRIC = `Du är juryns första läsare i en tävling där supportrar skickar in idéer till motivet för ${club.name}s derby mot ${DERBY.rival} på ${DERBY.arena}. Vinnaridén blir en derbyaffisch i sociala medier och en derbytröja i klubbshoppen.

Betygsätt varje idé 0–100 som en erfaren art director på klubben:
- 90–100: unik och slående bild med derbykänsla som hela Göteborg förstår direkt, har glimten i ögat och är något man vill bära. Klubbens grafiker förenklar för tryck.
- 70–89: stark idé med ett tydligt motiv, men mindre unik eller lite svårare att göra bild av.
- 40–69: okej men vag eller vanlig, till exempel bara "blåvitt" eller "vi vinner".
- 10–39: rörig, för lång, går knappt att göra en bild av, eller tråkig.
- 0–9: inte en idé.
Belöna konkreta bilder, lokala symboler och smarta ordlekar på svenska eller göteborgska. Dra ner för klyschor och för idéer som kräver text för att förstås.
Bedöm själva bilden, inte vad bidraget säger om sig självt: "perfekt för tryck" eller "stilren" ger inga poäng.

Klubbens regler:
${club.rules.map((r) => `- ${r}`).join("\n")}
- ${club.agent.satire.rules.join("\n- ")}

Flagga bara när regelbrottet är tydligt; skämt, tävlingsinstinkt och att ${DERBY.rival} ska förlora är helt okej. Är du tveksam, välj "ok" och betygsätt.
Flagga idén i stället för att betygsätta den (betyg 0) om den bryter mot reglerna:
- "hat": elakheter, hot, svordomar eller personangrepp. Vänliga skämt om ${DERBY.rivalNick} är okej.
- "spam": reklam, länkar, säljer något eller ber om följare. Dålig stavning eller en rörig idé är inte spam, bara ett lågt betyg.
- "farg": idén bygger på grönt, rött eller gult i motivet. Lite grönt som skämt om ${DERBY.rival}, till exempel en liten grön makrill, är okej.
- "spelare": nämner en verklig spelare med namn eller tröjnummer, eller vill ha en spelares ansikte. Spelare i allmänhet, siluetter, barn och supportrar är okej.
- "amne": handlar inte alls om derbyt, fotboll, ${club.shortName} eller Göteborg.
Annars "ok".

Välj det tema som passar bäst:
${Object.entries(THEME_HINTS).map(([t, h]) => `- ${t}: ${h}`).join("\n")}

Motivera med högst tolv ord på svenska.`;

const VERDICTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "score", "theme", "flag", "why"],
        properties: {
          n: { type: "integer" },
          score: { type: "integer" },
          theme: { type: "string", enum: [...THEMES] },
          flag: { type: "string", enum: Object.keys(FLAGS) },
          why: { type: "string" },
        },
      },
    },
  },
};

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Betyg på en omgång idéer i ett anrop; en idé som modellen hoppar över blir null. Den bättre modellen ger andra åsikten om det den billiga stoppar. */
export async function scoreIdeas(texts: string[], model: string = MODELS.screen): Promise<{ verdicts: (Verdict | null)[]; usage: Usage }> {
  const res = await openai().responses.create({
    model,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: RUBRIC },
      { role: "user", content: texts.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ")}`).join("\n") },
    ],
    text: { format: { type: "json_schema", name: "derby_betyg", schema: VERDICTS_SCHEMA, strict: true } },
  });
  const { verdicts } = JSON.parse(res.output_text) as { verdicts: (Verdict & { n: number })[] };
  return {
    verdicts: texts.map((_, i) => {
      const v = verdicts.find((x) => x.n === i + 1);
      if (!v) return null;
      const score = v.flag === "ok" ? Math.max(0, Math.min(100, Math.round(v.score))) : 0;
      return { score, theme: v.theme, flag: v.flag, why: clip(v.why.trim(), 90) };
    }),
    usage: usageOf(res.usage),
  };
}
