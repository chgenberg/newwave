import { type Flag, SEK_PER_USD, type Stopper, type Theme, type Usage } from "./derby";
import data from "./derbyRun.json";

/** Körningen med 5 000 bidrag, gjord en gång av scripts/derby-run.ts; sidan visar den och jämför nya bidrag med den. */

export type DerbyIdea = { id: number; text: string; area: string; score: number };
export type DerbyStage = "generate" | "screen" | "review" | "semi" | "final";

export type DerbyRun = {
  ranAt: string;
  total: number;
  approved: number;
  /** Bidrag som den billiga modellen stoppade men den bättre släppte igenom. */
  restored: number;
  removed: Record<Exclude<Flag, "ok">, number>;
  stoppedBy: Record<Stopper, number>;
  examples: { text: string; area: string; flag: Exclude<Flag, "ok">; by: Stopper }[];
  /** De bästa bidragen som andra åsikten räddade, med det den billiga modellen ville stoppa dem för. */
  rescued: (DerbyIdea & { was: Exclude<Flag, "ok"> })[];
  themes: { theme: Theme; count: number; avg: number }[];
  /** Alla godkända bidrags betyg, högst först. */
  scores: number[];
  stream: (DerbyIdea & { theme: Theme; why: string })[];
  semi: (DerbyIdea & { semi: number })[];
  final: (DerbyIdea & { rank: number; points: number; why: string })[];
  judges: number;
  winner: DerbyIdea & { why: string; title: string; slogan: string; story: string; mode: "standard" | "satir" };
  images: { poster: string; print: string; products: { id: string; name: string; price: number; image: string }[]; attempts: number; checks: { rule: string; ok: boolean }[] };
  seconds: { moderate: number; screen: number; review: number; semi: number; final: number; images: number };
  usage: (Usage & { stage: DerbyStage; model: string; sek: number })[];
  imageModel: string;
  imageCount: number;
};

export const DERBY_RUN = data as DerbyRun;

/**
 * Bildmodellens listpris i dollar per miljon tokens: text in, bilder in och bilden ut (gpt-image-2 och gpt-image-2.5
 * kostar lika mycket per token; OpenAI:s prislista i november 2026). Bildmodellen redovisar sina tokens i svaret
 * (`usage`) precis som textmodellerna, med text och bild in var för sig. Rabatten för tokens i modellens cache räknas
 * inte, så kostnaden blir hellre lite för hög än för låg.
 */
export const IMAGE_PRICES = { textIn: 5, imageIn: 8, imageOut: 30 };

/** Svarets `usage` från bildmodellen (images.generate och images.edit). */
export type ImageUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  output_tokens_details?: { text_tokens?: number; image_tokens?: number };
};

const tokens = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/**
 * Vad ett bildanrop kostade i kronor, ur tokens i svaret, eller null om svaret saknar tokens. Text in som inte
 * särredovisas räknas som bild (det dyrare priset), och allt ut räknas som bild.
 */
export function imageCostSek(u: ImageUsage | null | undefined): number | null {
  const input = tokens(u?.input_tokens);
  const output = tokens(u?.output_tokens);
  if (input === undefined && output === undefined) return null;
  const text = Math.min(tokens(u?.input_tokens_details?.text_tokens) ?? 0, input ?? 0);
  const usd = (text * IMAGE_PRICES.textIn + ((input ?? 0) - text) * IMAGE_PRICES.imageIn + (output ?? 0) * IMAGE_PRICES.imageOut) / 1e6;
  return usd * SEK_PER_USD;
}

/** En typisk bild i 1024 × 1536 med en referensbild, uppmätt på miljöbilderna: cirka 450 tokens text och 1 024 bild in, 343 ut. */
export const IMAGE_USAGE_TYPICAL: ImageUsage = { input_tokens: 1470, output_tokens: 343, input_tokens_details: { text_tokens: 446, image_tokens: 1024 } };

/** Uppskattat pris per bild i kronor, cirka 0,21 kr: den typiska bilden med listpriset. Den verkliga kostnaden räknas ur svarets tokens. */
export const IMAGE_SEK = imageCostSek(IMAGE_USAGE_TYPICAL)!;

/** Platsen ett betyg får bland körningens godkända bidrag; lika betyg delar plats. */
export function placeOf(scores: number[], score: number) {
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scores[mid] > score) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}
