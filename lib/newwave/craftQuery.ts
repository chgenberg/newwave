/** Tolkar sökningar med vanliga ord, t.ex. "inaktiva fotbollsklubbar i Halland", till filter. */

export const ONBOARD_STEPS = ["Logga", "Färger", "Tonalitet", "Intersport-butik", "Agent igång"] as const;

export type ClubStatusWord = "aktiv" | "lugn" | "inaktiv";
export type QueryMeta = { regions: string[]; sports: string[]; cities: string[]; clubs: { id: string; name: string }[]; occasions?: string[] };

export type ClubQuery = {
  statuses: ClubStatusWord[];
  regions: string[];
  sports: string[];
  cities: string[];
  pending?: boolean;
  onboarding?: boolean;
  autopilot?: boolean;
  queue?: boolean;
  sort?: "aktiv" | "material" | "salt" | "namn";
  text: string;
  labels: string[];
};

export type MaterialQuery = {
  gate?: "granskas" | "stoppad";
  status?: "väntar" | "godkänd" | "ändring";
  from?: "Craft" | "Klubbens agent";
  occasions: string[];
  clubIds: string[];
  regions: string[];
  sports: string[];
  lowScore?: boolean;
  flagged?: boolean;
  text: string;
  labels: string[];
};

const FILLER = new Set(["visa", "alla", "klubb", "klubbar", "klubbarna", "föreningar", "i", "och", "med", "som", "från", "de", "den", "det", "en", "ett", "mig", "lista", "på", "är", "har", "vilka", "material", "allt", "inom", "kring", "runt", "eller", "för", "till"]);

const norm = (s: string) => s.toLowerCase().normalize("NFC");
const startsWord = (text: string, stem: string) => new RegExp(`(^|[^a-zåäö])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text);

function places(t: string, meta: QueryMeta) {
  const regions = meta.regions.filter((r) => startsWord(t, norm(r).slice(0, Math.max(5, norm(r).length - 2))));
  const cities = meta.cities.filter((c) => !regions.some((r) => norm(r) === norm(c)) && startsWord(t, norm(c).slice(0, Math.max(4, norm(c).length - 1))));
  const sports = meta.sports.filter((s) => startsWord(t, norm(s)));
  return { regions, cities, sports };
}

function leftover(t: string, matched: string[]) {
  return t
    .split(/[\s,]+/)
    .filter((w) => w && !FILLER.has(w) && !matched.some((m) => w.startsWith(norm(m).slice(0, 4))))
    .join(" ");
}

export function parseClubQuery(input: string, meta: QueryMeta): ClubQuery {
  const t = norm(input.trim());
  const q: ClubQuery = { statuses: [], regions: [], sports: [], cities: [], text: "", labels: [] };
  if (!t) return q;
  const { regions, cities, sports } = places(t, meta);
  Object.assign(q, { regions, cities, sports });

  const used: string[] = [...regions, ...cities, ...sports];
  const hit = (re: RegExp, word: string) => (re.test(t) ? (used.push(word), true) : false);

  if (hit(/knuff|uppmärksamhet|tappat/, "knuff")) q.statuses.push("lugn", "inaktiv");
  if (hit(/inaktiv/, "inaktiv")) q.statuses.push("inaktiv");
  if (hit(/lugn/, "lugn")) q.statuses.push("lugn");
  if (hit(/(^|[^n])aktiv/, "aktiv") && !q.statuses.includes("inaktiv")) q.statuses.push("aktiv");
  q.statuses = [...new Set(q.statuses)];
  if (hit(/väntar|ej godk|inte godk|obesvar|svarat/, "väntar")) q.pending = true;
  if (hit(/uppstart|ofärdig|saknar|nya|nyanslut|onboard/, "uppstart")) q.onboarding = true;
  if (hit(/granska|låga betyg|underkän/, "granska")) q.queue = true;
  if (hit(/utan autopilot|autopilot av|manuell/, "autopilot")) q.autopilot = false;
  else if (hit(/autopilot/, "autopilot")) q.autopilot = true;
  if (hit(/säljer mest|mest sål|bäst|topp/, "säljer")) q.sort = "salt";
  else if (hit(/mest material|flitig|skapar mest/, "mest")) q.sort = "material";

  q.text = leftover(t, [...used, "mest", "säljer", "sålt", "betyg", "låga"]);
  const named = meta.clubs.some((c) => q.text && norm(c.name).includes(q.text.split(" ")[0]));
  if (!named && used.length) q.text = "";

  q.labels = [
    ...q.statuses.map((s) => ({ aktiv: "Aktiva", lugn: "Lugna", inaktiv: "Inaktiva" })[s]),
    ...q.sports,
    ...q.regions,
    ...q.cities,
    ...(q.pending ? ["Väntar på svar"] : []),
    ...(q.onboarding ? ["Uppstart pågår"] : []),
    ...(q.queue ? ["I granskningskön"] : []),
    ...(q.autopilot === true ? ["Autopilot på"] : q.autopilot === false ? ["Autopilot av"] : []),
    ...(q.sort === "salt" ? ["Mest sålt först"] : q.sort === "material" ? ["Mest material först"] : []),
    ...(q.text ? [`”${q.text}”`] : []),
  ];
  return q;
}

export function parseMaterialQuery(input: string, meta: QueryMeta): MaterialQuery {
  const t = norm(input.trim());
  const q: MaterialQuery = { occasions: [], clubIds: [], regions: [], sports: [], text: "", labels: [] };
  if (!t) return q;
  const { regions, sports } = places(t, meta);
  Object.assign(q, { regions, sports });
  const used: string[] = [...regions, ...sports];
  const hit = (re: RegExp, word: string) => (re.test(t) ? (used.push(word), true) : false);

  if (hit(/granska|hos craft|kön/, "granska")) q.gate = "granskas";
  else if (hit(/stopp/, "stopp")) q.gate = "stoppad";
  if (hit(/väntar|obesvar/, "väntar")) q.status = "väntar";
  else if (hit(/godkän/, "godkän")) q.status = "godkänd";
  else if (hit(/ändring|ändras/, "ändr")) q.status = "ändring";
  if (hit(/från craft|craft-kampanj|kampanj/, "craft")) q.from = "Craft";
  else if (hit(/klubbens agent|egna|egen/, "klubbens")) q.from = "Klubbens agent";
  if (hit(/låga? betyg|dåliga|svaga/, "betyg")) q.lowScore = true;
  if (hit(/varning|regel|bryter/, "varning")) q.flagged = true;
  q.occasions = (meta.occasions ?? []).filter((o) => startsWord(t, norm(o).slice(0, Math.max(4, norm(o).length - 2))));
  used.push(...q.occasions);
  q.clubIds = meta.clubs.filter((c) => startsWord(t, norm(c.name.split(" ")[0]).slice(0, 4)) && norm(c.name.split(" ")[0]).length > 2).map((c) => c.id);
  used.push(...meta.clubs.filter((c) => q.clubIds.includes(c.id)).map((c) => c.name.split(" ")[0]));

  q.text = used.length ? "" : leftover(t, []);
  const clubName = (id: string) => meta.clubs.find((c) => c.id === id)?.name ?? id;
  q.labels = [
    ...(q.gate === "granskas" ? ["Hos Craft"] : q.gate === "stoppad" ? ["Stoppade"] : []),
    ...(q.status ? [{ väntar: "Väntar", godkänd: "Godkända", ändring: "Ändras" }[q.status]] : []),
    ...(q.from ? [q.from === "Craft" ? "Från Craft" : "Klubbens agent"] : []),
    ...(q.lowScore ? ["Betyg under 7"] : []),
    ...(q.flagged ? ["Med varningar"] : []),
    ...q.occasions,
    ...q.clubIds.map(clubName),
    ...q.sports,
    ...q.regions,
    ...(q.text ? [`”${q.text}”`] : []),
  ];
  return q;
}
