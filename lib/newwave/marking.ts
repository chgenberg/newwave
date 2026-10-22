import type { NwProduct } from "./catalog";
import { isHex } from "./colors";
import { cleanSpec, type WordmarkSpec } from "./wordmark/spec";

/**
 * Märkning: metoder, placeringar, priser och leveranstid för designstudion och offerterna.
 * Priserna är exkl. moms: startkostnad per färg plus styckpris per färg, stafflat på antal.
 */

export const METHODS = ["dtg", "screentryck", "transfer", "brodyr", "gravyr", "digitaltryck", "sublimering"] as const;
export type Method = (typeof METHODS)[number];
/** Hur metoden ser ut på 3D-modellen; DTG och sublimering är fyrfärg i tyget som digitaltryck. */
export type Look = "screentryck" | "transfer" | "brodyr" | "gravyr" | "digitaltryck";
export const lookOf = (m: Method): Look => (m === "dtg" || m === "sublimering" ? "digitaltryck" : m);

export const SHAPES = ["original", "rund", "kvadrat", "rektangel"] as const;
export type Shape = (typeof SHAPES)[number];
export const SHAPE_LABEL: Record<Shape, string> = { original: "Original", rund: "Rund", kvadrat: "Kvadrat", rektangel: "Rektangel" };

type Vec3 = [number, number, number];

export type Design = {
  method: Method;
  /** Antal tryckfärger (1–4). Fyrfärgsmetoder är alltid fyra, gravyr alltid en ton. */
  colors: number;
  shape: Shape;
  /** Placeringszon (se zonesFor) eller "egen" när någon dragit trycket på produkten. */
  zone: string;
  point?: Vec3;
  normal?: Vec3;
  /** Tryckets bredd i cm. */
  sizeCm: number;
  /** Egen logga eller eget motiv; saknas = det som studion öppnades med. */
  logo?: string;
  logoDark?: string;
  /** Ett ordmärke i stället för loggan; varje klubb får det med sitt eget namn, sina färger och sitt märke. */
  wordmark?: WordmarkSpec;
  /** Fler tryckpositioner, var och en med egen metod, placering och storlek. */
  extra?: Placement[];
  /** Ett namn per plagg, tryckt på en egen position. */
  names?: Names;
};

export type Placement = Omit<Design, "extra" | "names" | "logo" | "logoDark" | "wordmark">;
export type Names = { list: string[]; zone: string; sizeCm: number; point?: Vec3; normal?: Vec3 };

/** Det som sparas när någon anpassat en produkt: designen, produktfärgen och bilden från studion. */
export type Customized = { design: Design; color: string; mockupUrl: string };

export const NAME_UNIT = 29;
export const NAME_SETUP = 250;

type MethodInfo = { label: string; blurb: string; setupPerColor: number; unitPerColor: number; fixedColors?: number; maxColors: number; days: number };

export const METHOD_INFO: Record<Method, MethodInfo> = {
  dtg: { label: "DTG", blurb: "Fyrfärg direkt på plagget, även små upplagor", setupPerColor: 0, unitPerColor: 39, fixedColors: 4, maxColors: 4, days: 4 },
  screentryck: { label: "Screentryck", blurb: "Klara färger, bäst från 50 st", setupPerColor: 350, unitPerColor: 6, maxColors: 4, days: 9 },
  transfer: { label: "Transfer", blurb: "Skarpa detaljer, även små upplagor", setupPerColor: 250, unitPerColor: 9, maxColors: 4, days: 5 },
  brodyr: { label: "Brodyr", blurb: "Exklusiv, tålig och upphöjd", setupPerColor: 300, unitPerColor: 12, maxColors: 4, days: 11 },
  gravyr: { label: "Gravyr", blurb: "Permanent, ton i ton i materialet", setupPerColor: 300, unitPerColor: 14, fixedColors: 1, maxColors: 1, days: 7 },
  digitaltryck: { label: "Digitaltryck", blurb: "Fyrfärg, foton och övertoningar", setupPerColor: 400, unitPerColor: 16, fixedColors: 4, maxColors: 4, days: 6 },
  sublimering: { label: "Sublimering", blurb: "Fotokvalitet runt hela ytan", setupPerColor: 0, unitPerColor: 25, fixedColors: 4, maxColors: 4, days: 6 },
};

const fullColor = (m: Method) => lookOf(m) === "digitaltryck";

const tier = (qty: number) => (qty >= 250 ? 0.7 : qty >= 100 ? 0.8 : qty >= 50 ? 0.9 : 1);

export function colorsOf(d: Pick<Design, "method" | "colors">) {
  const info = METHOD_INFO[d.method];
  return info.fixedColors ?? Math.min(info.maxColors, Math.max(1, Math.round(d.colors)));
}

export const colorText = (p: Pick<Design, "method" | "colors">) => (fullColor(p.method) ? "fyrfärg" : p.method === "gravyr" ? "ton i ton" : `${colorsOf(p)} ${colorsOf(p) === 1 ? "färg" : "färger"}`);

function placementPrice(d: Placement, qty: number) {
  const info = METHOD_INFO[d.method];
  // Fyrfärg prissätts som en kanal oavsett motiv; brodyr blir dyrare över 8 cm.
  const channels = fullColor(d.method) ? 1 : colorsOf(d);
  const sizeFactor = d.method === "brodyr" && d.sizeCm > 8 ? 1.4 : 1;
  return { perUnit: Math.round(info.unitPerColor * channels * tier(qty) * sizeFactor), setup: info.setupPerColor * channels };
}

/** Alla tryckpositioner plus namn; varje position har sin egen startkostnad. */
export function markingPrice(d: Design, qty: number) {
  const parts = [d, ...(d.extra ?? [])].map((p) => placementPrice(p, qty));
  const names = d.names?.list.length ? { perUnit: NAME_UNIT, setup: NAME_SETUP } : { perUnit: 0, setup: 0 };
  return {
    perUnit: parts.reduce((s, p) => s + p.perUnit, 0) + names.perUnit,
    setup: parts.reduce((s, p) => s + p.setup, 0) + names.setup,
  };
}

/** Kamerariktning mot produkten och förskjutning i andelar av modellens storlek; modellerna har framsidan mot +Z. */
export type Zone = { id: string; label: string; dir: Vec3; offset: [number, number]; sizeCm?: number };

const Z = (id: string, label: string, dir: Vec3, offset: [number, number] = [0, 0], sizeCm?: number): Zone => ({ id, label, dir, offset, sizeCm });

const ZONES: Record<NwProduct["kind"], Zone[]> = {
  top: [Z("brost", "Mitt på bröstet", [0, 0, 1], [0, 0.18]), Z("vanster", "Vänster bröst", [0, 0, 1], [0.12, 0.22], 9), Z("rygg", "Ryggen", [0, 0, -1], [0, 0.15]), Z("arm", "Ärmen", [1, 0, 0], [0, 0.25], 8)],
  cap: [Z("front", "Framsida", [0, 0, 1], [0, 0.12]), Z("sida", "Sidan", [1, 0, 0], [0, 0.1]), Z("bak", "Baksida", [0, 0, -1], [0, 0.05])],
  beanie: [Z("front", "Framsida", [0, 0, 1], [0, -0.15]), Z("sida", "Sidan", [1, 0, 0], [0, -0.15])],
  bag: [Z("front", "Framsida", [0, 0, 1], [0, 0]), Z("ovre", "Övre framsida", [0, 0, 1], [0, 0.2]), Z("sida", "Sidan", [1, 0, 0], [0, 0])],
  drink: [Z("front", "Framsida", [0, 0, 1], [0, 0]), Z("bak", "Baksida", [0, 0, -1], [0, 0])],
  pen: [Z("skaft", "Skaftet", [0, 0, 1], [0, 0])],
  book: [Z("framsida", "Framsidan", [0, 0, 1], [0, 0]), Z("hörn", "Nedre hörnet", [0, 0, 1], [0.2, -0.3])],
  flat: [Z("mitt", "Mitten", [0, 1, 0], [0, 0]), Z("hörn", "Hörnet", [0, 1, 0], [0.3, 0.3])],
  box: [Z("lock", "Locket", [0, 1, 0], [0, 0]), Z("front", "Framsidan", [0, 0, 1], [0, 0])],
  tech: [Z("front", "Framsidan", [0, 0, 1], [0, 0]), Z("ovan", "Ovansidan", [0, 1, 0], [0, 0])],
  textile: [Z("mitt", "Mitten", [0, 0, 1], [0, 0]), Z("hörn", "Hörnet", [0, 0, 1], [0.3, -0.3])],
  lanyard: [Z("band", "Bandet", [0, 0, 1], [0, 0.2])],
  umbrella: [Z("panel", "Panelen", [0, 0.6, 1], [0, 0.25]), Z("ovan", "Toppen", [0, 1, 0], [0, 0])],
  booth: [Z("front", "Framsidan", [0, 0, 1], [0, 0]), Z("topp", "Ovankant", [0, 0, 1], [0, 0.3])],
};

const METHODS_FOR: Record<NwProduct["kind"], Method[]> = {
  top: ["dtg", "brodyr", "screentryck", "transfer"],
  cap: ["brodyr", "transfer", "screentryck"],
  beanie: ["brodyr", "transfer"],
  bag: ["screentryck", "transfer", "brodyr", "digitaltryck"],
  drink: ["gravyr", "screentryck", "digitaltryck"],
  pen: ["gravyr", "screentryck", "digitaltryck"],
  book: ["digitaltryck", "screentryck", "gravyr"],
  flat: ["digitaltryck", "screentryck"],
  box: ["digitaltryck", "screentryck", "gravyr"],
  tech: ["gravyr", "digitaltryck", "screentryck"],
  textile: ["brodyr", "digitaltryck", "transfer"],
  lanyard: ["screentryck", "transfer", "digitaltryck"],
  umbrella: ["screentryck", "transfer", "digitaltryck"],
  booth: ["digitaltryck", "screentryck"],
};

const methodId = (label: string) => (METHODS as readonly string[]).find((m) => m === label.toLowerCase()) as Method | undefined;

/** Produktens egen standardmetod först; keramikmuggen går inte att gravera. */
export function methodsFor(p: NwProduct): Method[] {
  const own = methodId(p.printArea.method);
  const list = own ? [own, ...METHODS_FOR[p.kind].filter((m) => m !== own)] : METHODS_FOR[p.kind];
  return own === "sublimering" ? list.filter((m) => m !== "gravyr") : list;
}

const facesUp = (dir: Vec3) => dir[1] === 1 && dir[2] === 0;

/** Zonen som katalogens produktbild och standardtryck bygger på. */
function mainZone(p: NwProduct, zones: Zone[]) {
  if (p.kind === "top") return p.zone.offset[0] !== 0 ? "vanster" : "brost";
  return (facesUp(p.zone.dir) ? zones.find((z) => facesUp(z.dir)) : zones[0])?.id ?? zones[0].id;
}

/** Placeringszonerna, med katalogens finjusterade huvudplacering. Produkter som ligger ner får ovansidan först. */
export function zonesFor(p: NwProduct): Zone[] {
  const base = ZONES[p.kind];
  const zones = facesUp(p.zone.dir) && !base.some((z) => facesUp(z.dir)) ? [Z("ovan", "Ovansidan", [0, 1, 0]), ...base] : base;
  const main = mainZone(p, zones);
  const sorted = [...zones.filter((z) => z.id === main), ...zones.filter((z) => z.id !== main)];
  return sorted.map((z) => (z.id === main ? { ...z, dir: p.zone.dir, offset: p.zone.offset } : z));
}

/** Största verkliga måttet i cm; 3D-modellerna normaliseras till det. */
export const sizeCmFor = (p: NwProduct) => (/reflex/i.test(p.name) ? 7 : p.sizeCm);
export const maxSizeCm = (p: NwProduct) => Math.max(4, Math.round(sizeCmFor(p) * 0.45));

type Spot = { zone: string; sizeCm: number };

/** Två tryck i fasta zoner krockar när de vetter åt samma håll och sitter närmare än halva bredderna. */
export function zonesClash(p: NwProduct, a: Spot, b: Spot) {
  const zones = zonesFor(p);
  const za = zones.find((z) => z.id === a.zone);
  const zb = zones.find((z) => z.id === b.zone);
  if (!za || !zb) return false;
  if (za.id === zb.id) return true;
  if (za.dir.some((v, i) => v !== zb.dir[i])) return false;
  const cm = Math.hypot(za.offset[0] - zb.offset[0], za.offset[1] - zb.offset[1]) * sizeCmFor(p);
  return cm < (a.sizeCm + b.sizeCm) / 2;
}

/** Första zonen där ett nytt tryck i sin standardstorlek får plats utan att röra de andra. */
export function freeZone(p: NwProduct, placed: Spot[], prefer?: string) {
  const zones = zonesFor(p);
  const sizeIn = (z: Zone) => z.sizeCm ?? placed[0]?.sizeCm ?? Math.round(sizeCmFor(p) * 0.2);
  const fits = (z: Zone) => !placed.some((s) => zonesClash(p, { zone: z.id, sizeCm: sizeIn(z) }, s));
  const used = new Set(placed.map((s) => s.zone));
  return zones.find((z) => z.id === prefer && fits(z)) ?? zones.find(fits) ?? zones.find((z) => !used.has(z.id)) ?? zones[0];
}

export function defaultDesign(p: NwProduct, method?: Method): Design {
  const methods = methodsFor(p);
  const m = method && methods.includes(method) ? method : methods[0];
  return { method: m, colors: METHOD_INFO[m].fixedColors ?? 1, shape: "original", zone: zonesFor(p)[0].id, sizeCm: Math.min(maxSizeCm(p), Math.max(2, Math.round(p.printCm))) };
}

export const zoneLabel = (p: NwProduct, id: string) => (id === "egen" ? "Egen placering" : (zonesFor(p).find((z) => z.id === id)?.label ?? id));

const placementSummary = (p: NwProduct, d: Placement) =>
  [METHOD_INFO[d.method].label, colorText(d), zoneLabel(p, d.zone), d.shape === "original" ? null : SHAPE_LABEL[d.shape], `${d.sizeCm} cm`].filter(Boolean).join(" · ");

export function designSummary(p: NwProduct, d: Design) {
  const parts = [placementSummary(p, d), ...(d.extra ?? []).map((x) => `+ ${placementSummary(p, x)}`)];
  if (d.names?.list.length) parts.push(`+ namn på ${d.names.list.length} st (${zoneLabel(p, d.names.zone)})`);
  return parts.join(" · ");
}

/** En rad per tryckposition, till korrektur och produktion. */
export function placementRows(p: NwProduct, d: Design) {
  const rows = [d, ...(d.extra ?? [])].map((x, i) => ({
    label: i === 0 ? "Tryck" : `Tryck ${i + 1}`,
    zone: zoneLabel(p, x.zone),
    method: METHOD_INFO[x.method].label,
    colors: colorText(x),
    size: `${x.sizeCm} cm bred`,
    shape: SHAPE_LABEL[x.shape],
  }));
  if (d.names?.list.length) rows.push({ label: "Namn", zone: zoneLabel(p, d.names.zone), method: "Transfer", colors: "1 färg", size: `${d.names.sizeCm} cm bred`, shape: `${d.names.list.length} namn` });
  return rows;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function addWorkdays(from: Date, days: number) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let left = days; left > 0; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() % 6 !== 0) left--;
  }
  return d;
}

/** Korrektur, produktion per metod och frakt, i arbetsdagar. */
const workdays = (d: Design | undefined, method: Method) => 1 + METHOD_INFO[method].days + 2 + (d?.extra?.length ? 1 : 0) + (d?.names?.list.length ? 1 : 0);

export type Delivery = { date: string; days: number; method: Method };

export function estimate(p: NwProduct, d: Design | undefined, today: Date): Delivery {
  const method = d?.method ?? methodsFor(p)[0];
  const days = workdays(d, method);
  return { date: iso(addWorkdays(today, days)), days, method };
}

/** När datumet inte hinns: den snabbaste metoden för produkten som hinner, om någon. */
export function fasterOption(p: NwProduct, d: Design | undefined, needBy: string, today: Date): Delivery | null {
  const current = d?.method ?? methodsFor(p)[0];
  const options = methodsFor(p)
    .filter((m) => m !== current)
    .map((m) => ({ method: m, days: workdays(d, m) }))
    .sort((a, b) => a.days - b.days)
    .map((o) => ({ ...o, date: iso(addWorkdays(today, o.days)) }))
    .filter((o) => o.date <= needBy);
  return options[0] ?? null;
}

export const fmtWeekday = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).replace(/\.$/, "");

/** Tryckfiler som får sparas i en design: uppladdade filer, klubbarnas märken och återförsäljarnas loggor. */
export const ART_URL = /^(\/api\/v1\/files\/[0-9a-f-]{36}\.(png|jpg|svg)|\/api\/v1\/brand\/[a-z0-9-]+\/[a-z0-9-]+\.png|\/newwave\/(resellers|clubs)\/[a-z0-9-]+\/[a-z0-9-]+\.png)$/;

const vec = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as Vec3) : undefined);
const art = (v: unknown) => (typeof v === "string" && ART_URL.test(v) ? v : undefined);
const clampSize = (p: NwProduct, v: unknown, fallback: number) => Math.min(maxSizeCm(p), Math.max(2, Math.round(Number(v) || fallback)));

function cleanPlacement(p: NwProduct, raw: unknown): Placement | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Partial<Design>;
  const method = methodsFor(p).find((m) => m === d.method);
  if (!method) return undefined;
  const zone = typeof d.zone === "string" && (d.zone === "egen" || zonesFor(p).some((z) => z.id === d.zone)) ? d.zone : zonesFor(p)[0].id;
  return {
    method,
    colors: colorsOf({ method, colors: Number(d.colors) || 1 }),
    shape: SHAPES.find((s) => s === d.shape) ?? "original",
    zone,
    point: zone === "egen" ? vec(d.point) : undefined,
    normal: zone === "egen" ? vec(d.normal) : undefined,
    sizeCm: clampSize(p, d.sizeCm, p.printCm),
  };
}

/** Serverns vakt: behåll bara kända värden från en design som skickats från webbläsaren. */
export function sanitizeDesign(p: NwProduct, raw: unknown): Design | undefined {
  const main = cleanPlacement(p, raw);
  if (!main) return undefined;
  const d = raw as Partial<Design>;
  const extra = (Array.isArray(d.extra) ? d.extra : []).slice(0, 3).map((x) => cleanPlacement(p, x)).filter((x): x is Placement => Boolean(x));
  const n = d.names;
  const list = n && Array.isArray(n.list) ? n.list.map((s) => String(s).trim().slice(0, 30)).filter(Boolean).slice(0, 2000) : [];
  const names = list.length && n ? { list, zone: String(n.zone ?? "rygg").slice(0, 20), sizeCm: clampSize(p, n.sizeCm, 8), point: vec(n.point), normal: vec(n.normal) } : undefined;
  const wordmark = cleanSpec(d.wordmark);
  return { ...main, logo: wordmark ? undefined : art(d.logo), logoDark: wordmark ? undefined : art(d.logoDark), wordmark, extra: extra.length ? extra : undefined, names };
}

export const sanitizeColor = (p: NwProduct, v: unknown) => (isHex(v) ? v.toUpperCase() : p.garmentHex);
