import type { Flag, Stopper, Theme, Usage } from "./derby";
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

/** Uppskattat pris per bild; bildmodellen redovisar inte tokens som textmodellerna. */
export const IMAGE_SEK = 4;

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
