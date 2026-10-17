import { NW_CATALOG, type Season } from "./catalog";
import { clubOccasions } from "./club";

export type Template = { occasion: string; title: string; brief: string; products: string[] };

export const TEMPLATES: Template[] = [
  { occasion: "Fars dag", title: "Pappa på läktaren", brief: "Varm merch till alla klubbpappor. Termosmugg och hoodie med klubbens märke, och ett inlägg som hyllar pappor som skjutsar, fikar och hejar.", products: ["p004", "p021", "p039"] },
  { occasion: "Julmarknad", title: "En klapp till laget", brief: "Julklappar i klubbens färger till julmarknaden. Mössa, termos och presentask, plus ett inlägg och ett nyhetsbrev om var man köper.", products: ["p012", "p019", "p038", "p014"] },
  { occasion: "Säsongsstart", title: "Ny säsong, samma hjärta", brief: "Kicka igång säsongen med träningskläder och vattenflaskor. Lyft nya spelare och ledare i inläggen.", products: ["p008", "p016", "p020"] },
  { occasion: "Sommarcup", title: "Sol, cup och klubbkänsla", brief: "Allt till cupen: keps, kylväska och picknickfilt. Inlägg som peppar inför helgen och tackar funktionärerna.", products: ["p011", "p018", "p035", "p028"] },
  { occasion: "Skolstart", title: "Tillbaka i skolan", brief: "Ryggsäck, anteckningsbok och reflex till skolstarten. Påminn om höstens träningstider.", products: ["p015", "p026", "p030"] },
  { occasion: "Medlemsvärvning", title: "Bli en av oss", brief: "Inlägg och nyhetsbrev som bjuder in nya medlemmar. Välkomst-t-shirt till alla som går med.", products: ["p001"] },
  { occasion: "Höstlovscupen", title: "Varm på läktaren", brief: "Hoodie, mössa och termosmugg till höstlovscuperna. Inlägg med matchtider och var man köper.", products: ["p004", "p012", "p021"] },
  { occasion: "Black Friday", title: "Kläder för hela laget", brief: "Klubbkläder till hela familjen inför vintern. Lyft att en del av varje köp går till föreningen.", products: ["p002", "p004", "p016"] },
  { occasion: "Lucia", title: "Ljus i mörkret", brief: "Reflexer och mössor till luciatåget och de mörka träningskvällarna.", products: ["p030", "p012", "p013"] },
  { occasion: "Jul", title: "God jul från klubben", brief: "Julhälsning till medlemmar och sponsorer, med presentask och chokladask i klubbens färger.", products: ["p038", "p039", "p022"] },
  { occasion: "Halloween", title: "Läskigt bra lag", brief: "Lekfullt inlägg till ungdomslagen och en t-shirt i begränsad upplaga.", products: ["p001", "p039"] },
  { occasion: "Avslutning", title: "Tack för säsongen", brief: "Tack till spelare, ledare och föräldrar. Piké till ledarna och picknickfilt till avslutningen.", products: ["p003", "p035", "p034"] },
];

export const SEASON_OF = (m: number): Season => (m === 12 || m <= 2 ? "vinter" : m <= 5 ? "vår" : m <= 8 ? "sommar" : "höst");

/** Säsongsprodukterna först, sedan det som funkar året runt – bara det Craft tillåter. */
export function seasonProducts(season: Season, allowed: string[], limit = 4) {
  const ok = NW_CATALOG.filter((p) => allowed.includes(p.id) && p.seasons.includes(season));
  return [...ok.filter((p) => p.seasons.length < 4), ...ok.filter((p) => p.seasons.length === 4)].slice(0, limit).map((p) => p.id);
}

export function templateFor(occasion: string, date: string | undefined, allowed: string[]): Template {
  const t = TEMPLATES.find((x) => x.occasion === occasion);
  if (t) return { ...t, products: t.products.filter((id) => allowed.includes(id)) };
  const season = SEASON_OF(date ? Number(date.slice(5, 7)) : new Date().getMonth() + 1);
  return { occasion, title: occasion, brief: `Material till ${occasion.toLowerCase()} i varje klubbs färger och ton, med produkter som passar ${season}en.`, products: seasonProducts(season, allowed, 3) };
}

const SPORT: { occasion: string; month: number; day: number }[] = [
  { occasion: "Säsongsstart", month: 3, day: 15 },
  { occasion: "Avslutning", month: 6, day: 10 },
  { occasion: "Sommarcup", month: 6, day: 20 },
  { occasion: "Medlemsvärvning", month: 8, day: 25 },
  { occasion: "Höstlovscupen", month: 10, day: 28 },
  { occasion: "Julmarknad", month: 12, day: 5 },
];

const SKIP = new Set(["Nyår", "Valborg", "Nationaldagen", "Midsommar", "Påsk", "Alla hjärtans dag", "Mors dag"]);

export type CalendarItem = { occasion: string; date: string; kind: "högtid" | "säsong" };

/** Tillfällen som Craft brukar kampanja kring, de kommande månaderna. */
export function craftCalendar(now: Date, days = 200): CalendarItem[] {
  const until = now.getTime() + days * 86_400_000;
  const national = clubOccasions(now, days, false)
    .filter((o) => !SKIP.has(o.title))
    .map((o) => ({ occasion: o.title, date: o.date ?? "", kind: "högtid" as const }));
  const sport = SPORT.flatMap((s) =>
    [now.getUTCFullYear(), now.getUTCFullYear() + 1].map((y) => ({ occasion: s.occasion, date: `${y}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`, kind: "säsong" as const })),
  ).filter((s) => new Date(s.date).getTime() >= now.getTime() - 86_400_000 && new Date(s.date).getTime() <= until);
  return [...national, ...sport].filter((o) => o.date).sort((a, b) => a.date.localeCompare(b.date));
}
