import type { ScarfReview } from "./scarfAgent";
import type { Level, ScarfIdea } from "./scarfRecipes";
import data from "./scarfDemo.json";

/** En halsduk ur demokörningen (scripts/scarf-demo.ts): idén, det stickade resultatet och granskarens betyg. */
export type DemoScarf = {
  slug: string;
  clubId: string;
  club: string;
  idea: ScarfIdea;
  level: Level;
  recipeLabel: string;
  /** "ai" = idén kom från språkmodellen, "demo" = från klubbens profil utan modell. */
  mode: "ai" | "demo";
  palette: string[];
  yarns: { hex: string; pantone: string; share: number }[];
  system: "dubbel" | "enkel";
  maxColorsPerRow: number;
  minTextMm: number | null;
  ok: boolean;
  consent: string | null;
  /** Motivet ritades av bildmodellen och ligger som public/halsduk/demo/<slug>-motiv.png. */
  art: boolean;
  review: ScarfReview | null;
  /** Granskarens omdöme om första versionen, när agenten fick göra om halsduken. */
  firstReview: ScarfReview | null;
  text: { front: string; back: string };
};

export const SCARF_DEMO = data as unknown as { date: string; scarves: DemoScarf[] };
