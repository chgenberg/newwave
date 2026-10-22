import { TEMPLATES as CAMPAIGNS, craftCalendar } from "@/lib/newwave/craftCalendar";
import { nextJubilee } from "./names";

/**
 * Säljtillfällen per klubb: ett kommande jubileum (från grundandeåret) och säsongens tillfällen ur Crafts kalender,
 * med mallarna och produkterna som passar.
 */
export type Moment = { title: string; when: string; why: string; templates: string[]; products: string[] };

const LOOK: Record<string, string[]> = {
  Säsongsstart: ["campus", "kapsel"],
  Avslutning: ["emblem", "lagerkrans"],
  Sommarcup: ["retro-skript", "solskript"],
  Medlemsvärvning: ["monogram", "akademi"],
  Höstlovscupen: ["hockeyranderna", "universitet"],
  Julmarknad: ["lagerkrans", "skriptbage"],
  Jul: ["lagerkrans", "skriptbage"],
};

const month = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric" });

export function clubMoments(club: { name: string; founded?: number }, now = new Date(), limit = 4): Moment[] {
  const out: Moment[] = [];
  const year = now.getFullYear();
  const j = club.founded ? nextJubilee(club.founded, year) : null;
  if (j && j.year - year <= 3)
    out.push({
      title: `${j.years} år`,
      when: String(j.year),
      why: `${club.name} fyller ${j.years} år ${j.year === year ? "i år" : j.year}. Jubileumskollektionen bär årtalen ${club.founded}–${j.year}.`,
      templates: ["jubileum", "jubileumsband"],
      products: ["p001", "p004", "p022", "p038"],
    });
  const seen = new Set<string>();
  for (const c of craftCalendar(now, 240)) {
    const look = LOOK[c.occasion];
    const campaign = CAMPAIGNS.find((t) => t.occasion === c.occasion);
    if (!look || !campaign || seen.has(c.occasion)) continue;
    seen.add(c.occasion);
    out.push({ title: c.occasion, when: month.format(new Date(`${c.date}T12:00:00Z`)), why: campaign.brief, templates: look, products: campaign.products });
  }
  return out.slice(0, limit);
}
