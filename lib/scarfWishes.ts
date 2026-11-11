import type { RecipeId } from "./scarfRecipes";

/**
 * Det beställaren kan be om innan agenten kör: motiv, namn, arena, smeknamn, trupp, autografer och ansikten.
 * Varje önskemål är ett recept, ibland med en anvisning till agenten. Ren data – används av både sidan och servern.
 */
export const WISHES = [
  { id: "motiv", label: "Motiv", recipe: "motiv", note: "" },
  { id: "namn", label: "Namn", recipe: "personlig", note: "" },
  { id: "arena", label: "Arena", recipe: "arena", note: "" },
  { id: "smeknamn", label: "Smeknamn", recipe: "klassisk", note: "framsidans huvudrad ska vara ett smeknamn eller det supportrarna själva kallar klubben" },
  { id: "trupp", label: "Trupp", recipe: "trupp", note: "" },
  { id: "autograf", label: "Autografer", recipe: "autograf", note: "" },
  { id: "ansikte", label: "Ansikten", recipe: "portratt", note: "" },
] as const satisfies readonly { id: string; label: string; recipe: RecipeId; note: string }[];

export type WishId = (typeof WISHES)[number]["id"];
export const WISH_IDS = WISHES.map((w) => w.id) as [WishId, ...WishId[]];

/** Ett företag har varken arena, trupp eller smeknamn – där går det att be om motiv och namn. */
export const BRAND_WISHES: WishId[] = ["motiv", "namn"];

/** Längsta fria önskan, i tecken. */
export const WISH_MAX = 80;
