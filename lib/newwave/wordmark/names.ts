/** Föreningsförkortningar som blir Namn 1; resten av namnet, oftast orten, blir Namn 2 – som MIAMI och Dolphins. */
const TYPES = new Set([
  "AIK", "BK", "BOIS", "BOIK", "FBK", "FC", "FF", "FK", "GAIS", "GIF", "GOIF", "HBK", "HF", "HK", "IBF", "IBK", "IF", "IFK", "IK", "IS", "KIF", "SK", "SOIK", "UIF", "AIF", "BIK", "BTK", "FBC", "IBS", "OK", "SS", "TK",
]);

export type NameParts = { name1: string; name2: string };

/** IF, men också sammanslagna former som IF/FK. */
const isType = (word: string) => word.toUpperCase().split("/").every((w) => TYPES.has(w));

export function splitName(name: string): NameParts {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const kinds = words.filter(isType);
  const rest = words.filter((w) => !isType(w));
  if (kinds.length && rest.length) return { name1: kinds.join(" "), name2: rest.join(" ") };
  if (words.length > 1) return { name1: words[0], name2: words.slice(1).join(" ") };
  return { name1: "", name2: words[0] ?? "" };
}

/** Ord som bara säger vad föreningen är eller vilken sektion det gäller – Ishockeyförening, Fotbollsklubb, Fotboll. */
const KIND_WORD = /^([a-zåäö]*(förening|klubb|sällskap|allians)|fotboll|ishockey|hockey|handboll|innebandy|bandy|basket|friidrott|volleyboll)$/i;

/** Namnet utan föreningsorden, "Hammarby Ishockeyförening" → "Hammarby"; oförändrat när inget annat skulle bli kvar. */
export function shortName(text: string) {
  const words = text.trim().split(/\s+/);
  const kept = words.filter((w) => !KIND_WORD.test(w));
  return kept.length && kept.length < words.length ? kept.join(" ") : text;
}

/** Förkortningar som räcker som monogram på egen hand; IF, FF och BK säger inte vilken klubb det är. */
const OWN = new Set(["AIK", "BOIS", "GAIS", "IFK"]);

/**
 * Klubbens egen förkortning (IFK, AIK), annars initialerna i namnets ordning – ÅIF, KFF, BKH – och första bokstaven
 * när namnet är ett ord eller initialerna blir för långa, som H:et på Harvards tröjor.
 */
export function monogramFor(parts: NameParts, name: string) {
  if (OWN.has(parts.name1.toUpperCase())) return parts.name1;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => (isType(w) ? w.toUpperCase() : ([...w][0] ?? "").toUpperCase())).join("");
  return words.length > 1 && [...initials].length <= 4 ? initials : ([...parts.name2][0] ?? "").toUpperCase();
}

/** Raden under eller runt namnet: grundandeåret om det finns, annars klubbens sporter. */
export function taglineFor(club: { founded?: number; sports?: readonly string[] }) {
  if (club.founded) return `Sedan ${club.founded}`;
  return (club.sports ?? []).slice(0, 3).join(" · ");
}

/** Nästa jämna jubileum från och med `year`: var tionde år samt 25 och 75. */
export function nextJubilee(founded: number, year: number) {
  const age = year - founded;
  if (age < 0) return null;
  for (let n = Math.max(10, age); ; n++) if (n % 10 === 0 || n % 25 === 0) return { years: n, year: founded + n };
}
