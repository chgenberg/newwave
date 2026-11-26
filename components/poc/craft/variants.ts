import { monogramFor, shortName, splitName } from "@/lib/newwave/wordmark/names";

/**
 * Varianter av ordmallens texter, och hur designerna fördelas över klubbarna. Ren kod utan serverberoenden: samma
 * funktioner används av klubbkollektionen i webbläsaren (för att visa vad varje klubb får) och av lib/poc/build.ts när
 * klubbprodukterna görs.
 *
 * En variant säger var mallens huvudrad (den stora texten, oftast namnet) och underrad (den lilla, t.ex. "IFK" eller
 * "Sedan 1904") hämtar sin text: mallens egen, något ur klubbregistret eller en egen text – ett smeknamn eller en
 * stadsdel. En klubb kan ha flera varianter; varje blir en egen produkt i klubbens shop.
 */

export const TEXT_SOURCES = ["mall", "namn", "kortnamn", "ort", "kommun", "sedan", "sport", "egen"] as const;
export type TextSource = (typeof TEXT_SOURCES)[number];

export const TEXT_SOURCE_LABEL: Record<TextSource, string> = {
  mall: "Mallens text",
  namn: "Klubbens namn",
  kortnamn: "Kortnamn",
  ort: "Ort",
  kommun: "Kommun",
  sedan: "SEDAN + år",
  sport: "Sport",
  egen: "Egen text",
};

export type TextChoice = { from: TextSource; text?: string };
export type VariantChoice = { main: TextChoice; sub: TextChoice };
export const STANDARD_VARIANT: VariantChoice = { main: { from: "mall" }, sub: { from: "mall" } };

/** Texterna en variant ger en klubb. En rad som saknas behåller mallens text. */
export type VariantTexts = { main?: string; sub?: string };

/** Det ur klubbregistret som varianterna hämtar sina texter från. */
export type ClubFacts = { name: string; municipality?: string; sport?: string; founded?: number };

/** Lika långt som ordmallarnas egna namn (lib/newwave/wordmark/spec.ts). */
export const MAX_TEXT = 30;
export const MAX_VARIANTS = 6;

export const cleanText = (s: string) =>
  s
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);

/** Klubbens förkortning: den egna (AIK, IFK) eller initialerna (SIBK); ett ord blir namnet utan föreningsorden. */
export function kortnamn(name: string) {
  const mono = monogramFor(splitName(name), name);
  return [...mono].length >= 2 ? mono : shortName(name);
}

/** Ord som är förkortningar (IF, IBK, SS04) eller säger vad föreningen är (Fotboll, Skytteförening). */
const notPlace = (w: string) => /\d/.test(w) || (/^[A-ZÅÄÖ/]{2,5}$/.test(w) && w === w.toUpperCase()) || shortName(`x ${w}`) === "x";

/** Genitivets s bort: "Vasalunds" → "Vasalund", "Djurgårdens" → "Djurgården" – men inte "Kramfors" eller "Bollnäs". */
const nominative = (w: string) => (/[bcdfghjklmnpqrtvw]s$/i.test(w) && !/fors$/i.test(w) && w.length > 4 ? w.slice(0, -1) : w);

/** Orten i klubbens namn ("Storvreta" i Storvreta IBK); har namnet ingen ort blir det kommunen. */
export function ortOf(club: ClubFacts) {
  // Sektionen ("Herrbowling" i Duvbo IK Herrbowling) är ingen ort.
  const sport = (club.sport ?? "").toLocaleLowerCase("sv-SE");
  const words = club.name.split(/\s+/).filter((w) => w && !notPlace(w) && !(sport.length >= 4 && w.toLocaleLowerCase("sv-SE").includes(sport)));
  if (words.length && words.length <= 2) return [...words.slice(0, -1), nominative(words.at(-1)!)].join(" ");
  return club.municipality || "";
}

/** Texten ett val ger klubben; tom eller okänd betyder att mallen behåller sin. */
export function resolveText(c: TextChoice, club: ClubFacts): string | undefined {
  const text = (() => {
    switch (c.from) {
      case "namn":
        return club.name;
      case "kortnamn":
        return kortnamn(club.name);
      case "ort":
        return ortOf(club);
      case "kommun":
        return club.municipality ?? "";
      case "sedan":
        return club.founded ? `Sedan ${club.founded}` : "";
      case "sport":
        return club.sport ?? "";
      case "egen":
        return c.text ?? "";
      default:
        return "";
    }
  })();
  return cleanText(text) || undefined;
}

/** En egen text som inte skrivits för klubben: varianten blir ingen produkt hos den klubben. */
export const isComplete = (v: VariantChoice) => [v.main, v.sub].every((c) => c.from !== "egen" || Boolean(cleanText(c.text ?? "")));

/** Klubbens varianter: de som är ifyllda för klubben, och mallens egna texter om ingen är det. */
export const usable = (list: VariantChoice[]) => {
  const ok = list.filter(isComplete);
  return ok.length ? ok : [STANDARD_VARIANT];
};

export const variantTexts = (v: VariantChoice, club: ClubFacts): VariantTexts => {
  const [main, sub] = [resolveText(v.main, club), resolveText(v.sub, club)];
  return { ...(main ? { main } : {}), ...(sub ? { sub } : {}) };
};

const slug = (s: string) =>
  s
    .toLocaleLowerCase("sv-SE")
    .replace(/[^a-z0-9åäöéü]+/g, "-")
    .replace(/^-|-$/g, "");

/** Variantens nyckel i klubbprodukten: texterna, "" för mallens egna. Samma texter är samma produkt. */
export const variantKey = (t: VariantTexts) => (t.main || t.sub ? `${slug(t.main ?? "") || "-"}~${slug(t.sub ?? "") || "-"}`.slice(0, 80) : "");

/** Varianten som den står i titeln och listorna: "AIK · Solna". */
export const variantLabel = (t: VariantTexts) => [t.main, t.sub].filter(Boolean).join(" · ");

export const sameChoice = (a: VariantChoice, b: VariantChoice) => JSON.stringify(a) === JSON.stringify(b);

// ── Fördelningen ────────────────────────────────────────────────────────────

/**
 * Fördelar designerna över klubbarna så att klubbar i samma kommun i möjligaste mån får olika design, och så att
 * designerna används ungefär lika mycket. `fixed` är Crafts egna val per klubb; de räknas med. Samma indata ger
 * samma fördelning.
 */
export function distribute(clubs: { id: string; municipality: string }[], designs: string[], fixed: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (!designs.length) return out;
  const total = new Map(designs.map((d) => [d, 0]));
  const groups = new Map<string, { id: string; municipality: string }[]>();
  for (const c of clubs) {
    const own = fixed[c.id];
    if (own && total.has(own)) total.set(own, total.get(own)! + 1);
    const key = c.municipality || `\u0000${c.id}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b, "sv"))) {
    const group = groups.get(key)!.sort((a, b) => a.id.localeCompare(b.id));
    const local = new Map(designs.map((d) => [d, 0]));
    for (const c of group) {
      const own = fixed[c.id];
      if (own && local.has(own)) local.set(own, local.get(own)! + 1);
    }
    for (const c of group) {
      const own = fixed[c.id];
      if (own && total.has(own)) {
        out[c.id] = own;
        continue;
      }
      const pick = [...designs].sort((a, b) => local.get(a)! - local.get(b)! || total.get(a)! - total.get(b)! || designs.indexOf(a) - designs.indexOf(b))[0];
      out[c.id] = pick;
      local.set(pick, local.get(pick)! + 1);
      total.set(pick, total.get(pick)! + 1);
    }
  }
  return out;
}

/** Kommunerna där klubbar fått samma design för att de är fler än designerna: kommunen, antalet klubbar och flest på en design. */
export function crowded(clubs: { id: string; municipality: string }[], assigned: Record<string, string>) {
  const by = new Map<string, Map<string, number>>();
  for (const c of clubs) {
    if (!c.municipality || !assigned[c.id]) continue;
    const m = by.get(c.municipality) ?? new Map<string, number>();
    m.set(assigned[c.id], (m.get(assigned[c.id]) ?? 0) + 1);
    by.set(c.municipality, m);
  }
  return [...by]
    .map(([municipality, m]) => ({ municipality, clubs: [...m.values()].reduce((a, b) => a + b, 0), most: Math.max(...m.values()) }))
    .filter((x) => x.most > 1)
    .sort((a, b) => b.clubs - a.clubs);
}
