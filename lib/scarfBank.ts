import type { ScarfReview } from "./scarfAgent";
import type { Level, ScarfClub, ScarfIdea } from "./scarfRecipes";
import data from "./scarfBank.json";

/**
 * Inspirationsbanken: en halsduk per idrottsförening, framtagen av agenten i scripts/scarf-bank.ts.
 * På sidan visas de tillsammans med demokörningens halsdukar (lib/scarfDemo.ts).
 * Profilen ligger med i posten, så att stickfilerna kan tas fram igen utan klubbregistret:
 * märket ligger som public/halsduk/bank/<id>-skold.png och ett ritat motiv som <slug>-motiv.png.
 */
export type BankScarf = {
  slug: string;
  /** `category` är sporten, eller för företag och föreningar vad de gör. */
  club: ScarfClub & { category: string; group: "idrott" | "annat" };
  idea: ScarfIdea;
  level: Level;
  recipeLabel: string;
  yarns: { hex: string; pantone: string; share: number }[];
  system: "dubbel" | "enkel";
  maxColorsPerRow: number;
  minTextMm: number | null;
  ok: boolean;
  consent: string | null;
  /** Motivet ritades av bildmodellen. */
  art: boolean;
  review: ScarfReview | null;
  /** Granskarens omdöme om första versionen, när agenten fick göra om halsduken. */
  firstReview: ScarfReview | null;
  text: { front: string; back: string };
};

export const SCARF_BANK = data as unknown as { date: string; scarves: BankScarf[] };
export const bankScarf = (slug: string) => SCARF_BANK.scarves.find((s) => s.slug === slug) ?? null;
