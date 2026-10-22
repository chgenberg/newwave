import { sanitizeArt } from "./art";
import { type FontRole, roleFromFamily } from "./fonts";
import { splitName } from "./names";
import type { MatchPart } from "./match";
import type { ColorSlot, Layer, TemplateInput } from "./schema";

/**
 * Gör om en SVG till en mall. Körs i webbläsaren, som kan mäta text och grupper.
 * Lagren känns igen på namnen name, name1, name2, monogram, tagline, sport, year, ornament och icon; färgrutor som heter
 * primary och secondary talar om vilka färger som är klubbens. En fil utan sådana namn beskrivs i stället för läsagenten
 * (describeSvg), och agentens tolkning – vilken del som är vad och vilka färger som är klubbens – ger mallen.
 * AI-, PDF- och bildfiler görs först om till SVG på servern (convert.ts) och går sedan samma väg.
 */

export type TextRole = "name" | "name1" | "name2" | "monogram" | "tagline" | "sport" | "year";
type Role = TextRole | "ornament" | "icon" | "primary" | "secondary";
type Box = { x: number; y: number; w: number; h: number };
/**
 * Mallen, och det som behövs för att jämföra den med originalet: texterna och klubbfärgerna som står i filen, filen
 * ritad över exakt mallens duk, och originalets bokstäver för varje text som är former – för typsnittsmatchningen.
 */
export type Imported = {
  template: TemplateInput;
  sample: Partial<Record<TextRole, string>>;
  notes: string[];
  original: { image: string; colors: string[]; glyphs: (MatchPart & { slot: TextRole; picked?: boolean })[] };
};

/** Det läsagenten och Craft kan säga om en del av designen. */
export const READ_ROLES = ["name", "name1", "name2", "monogram", "tagline", "sport", "year", "ornament", "icon", "ignore"] as const;
export type ReadRole = (typeof READ_ROLES)[number];
export const READ_ROLE_LABEL: Record<ReadRole, string> = {
  name: "Hela namnet",
  name1: "Namn 1 (IFK)",
  name2: "Namn 2 (Göteborg)",
  monogram: "Monogram",
  tagline: "Rad (Sedan 1904)",
  sport: "Sport",
  year: "Årtal",
  ornament: "Dekor",
  icon: "Klubbmärket",
  ignore: "Ta bort",
};
/** En del av designen som agenten får se: ruta i ett koordinatsystem där designens långsida är 1000. */
export type Candidate = { i: number; kind: "text" | "group" | "shape" | "image"; text: string; box: [number, number, number, number]; colors: string[]; shapes: number };
/** Typsnittets stil för text som är ritad som former – den går inte att läsa ur filen, så agenten eller Craft anger den. */
export type TextStyle = { font: FontRole; upper: boolean; picked?: boolean };
export type Reading = { roles: Record<number, ReadRole>; colors: Record<string, ColorSlot>; styles?: Record<number, TextStyle>; texts?: Record<number, string>; club?: string };
export type Described = { svg: string; candidates: Candidate[]; image: string; annotated: string };
/** Ett ord i filen med rutorna för dess tecken i filens koordinater – från en AI- eller PDF-fil, där texten annars bara är former. */
export type Word = { text: string; boxes: [number, number, number, number][] };
/** Filen saknar namngivna lager – då får läsagenten tolka den. */
export class NoLayerNames extends Error {}
export const defaultStyle = (role: ReadRole): TextStyle => (role === "name2" ? { font: "script", upper: false } : { font: "caps", upper: true });
export const isTextRole = (role: string) => TEXT_ROLES.has(role as Role);
/** Rutornas färger i agentens bild, så att listan i Craft kan visa samma färg vid samma nummer. */
export const PART_HUES = ["#FF2D55", "#00C7BE", "#FFCC00", "#AF52DE", "#34C759", "#FF9500", "#0A84FF"];

const ALIAS: Record<string, Role> = {
  name: "name", namn: "name", fullname: "name", heltnamn: "name",
  name1: "name1", namn1: "name1",
  name2: "name2", namn2: "name2",
  monogram: "monogram",
  tagline: "tagline", rad: "tagline",
  sport: "sport", sporten: "sport",
  year: "year", ar: "year", artal: "year", est: "year",
  ornament: "ornament", ornaments: "ornament", dekor: "ornament",
  icon: "icon", ikon: "icon", marke: "icon", crest: "icon",
  primary: "primary", primar: "primary",
  secondary: "secondary", sekundar: "secondary",
};
const TEXT_ROLES = new Set<Role>(["name", "name1", "name2", "monogram", "tagline", "sport", "year"]);
const MAX_FILE = 8_000_000;
const ART_TAGS = new Set(["g", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);
const GRAPHIC = new Set(["g", "svg", "text", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "image"]);
const MAX_CANDIDATES = 48;
const MAX_OPENED = 1500;
const MAX_ART = 190_000;
const MAX_LAYERS = 40;
const SVG_NS = "http://www.w3.org/2000/svg";
const MARK = "data-nw-c";
/** Ett tecken ur en AI- eller PDF-fil: pdftocairo ritar text som <use> av former med id glyph-…. */
const GLYPH = "data-nw-glyph";
/** Texten i en del där texten är former, från filens ord. */
const SAID = "data-nw-text";
/** Hur många grader ordet lutar, när texten är former. */
const TILT = "data-nw-tilt";

/** Illustrator skriver lagret "name_1" som id="name_x5F_1_1_"; data-name har det riktiga namnet. */
function roleOf(el: Element): Role | null {
  for (const raw of [el.getAttribute("data-name"), el.getAttribute("inkscape:label"), el.id]) {
    if (!raw) continue;
    const key = raw
      .toLowerCase()
      .replace(/_x5f_/g, "_")
      .replace(/_\d+_$/, "")
      .normalize("NFD")
      .replace(/[^a-z0-9]/g, "");
    if (ALIAS[key]) return ALIAS[key];
  }
  return null;
}

function hexOf(css: string): string | null {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(css.trim());
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const dist = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const union = (boxes: Box[]) =>
  boxes.reduce<Box | null>((u, b) => (u ? { x: Math.min(u.x, b.x), y: Math.min(u.y, b.y), w: Math.max(u.x + u.w, b.x + b.w) - Math.min(u.x, b.x), h: Math.max(u.y + u.h, b.y + b.h) - Math.min(u.y, b.y) } : b), null);

/** Användningar av samma form (<use>) blir kopior på plats, så att varje del går att mäta och färga som de andra. */
function inlineUses(doc: XMLDocument) {
  doc.querySelectorAll("use").forEach((u) => {
    const ref = (u.getAttribute("href") ?? u.getAttribute("xlink:href") ?? "").trim();
    const target = ref.startsWith("#") ? doc.getElementById(ref.slice(1)) : null;
    if (!target || target.contains(u)) return;
    const num = (a: string) => parseFloat(u.getAttribute(a) ?? "") || 0;
    const g = doc.createElementNS(SVG_NS, "g");
    let place = `translate(${num("x")} ${num("y")})`;
    if (target.tagName.toLowerCase() === "symbol") {
      const vb = (target.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        const [w, h] = [num("width") || vb[2], num("height") || vb[3]];
        const s = Math.min(w / vb[2], h / vb[3]);
        place = `translate(${num("x") + (w - vb[2] * s) / 2 - vb[0] * s} ${num("y") + (h - vb[3] * s) / 2 - vb[1] * s}) scale(${s})`;
      }
    }
    g.setAttribute("transform", `${u.getAttribute("transform") ?? ""} ${place}`.trim());
    if (/^glyph/.test(ref.slice(1))) g.setAttribute(GLYPH, "");
    for (const a of ["class", "style", "fill", "stroke", "opacity", "data-name", "id"]) {
      const v = u.getAttribute(a);
      if (v !== null) g.setAttribute(a, v);
    }
    for (const child of target.tagName.toLowerCase() === "symbol" ? [...target.childNodes] : [target]) {
      const clone = child.cloneNode(true);
      if (clone instanceof Element) [clone, ...clone.querySelectorAll("[id]")].forEach((n) => n.removeAttribute("id"));
      g.appendChild(clone);
    }
    u.replaceWith(g);
  });
}

function parse(text: string): XMLDocument {
  if (text.length > MAX_FILE) throw new Error("Filen är för stor – max 8 MB.");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.tagName.toLowerCase() !== "svg") throw new Error("Filen är inte en giltig SVG. Exportera från Illustrator med Arkiv → Exportera → Exportera som → SVG.");
  inlineUses(doc);
  doc.querySelectorAll("script, style[src], foreignObject, iframe, a, use").forEach((n) => n.remove());
  // Inget i filen får hämta något: inbäddade bilder (data:) får vara kvar, textbanor får bara peka inom filen, allt annat tappar länken.
  doc.querySelectorAll("*").forEach((n) =>
    [...n.attributes].forEach((a) => {
      const tag = n.tagName.toLowerCase();
      const v = a.value.trim();
      const allowed = (tag === "textpath" && v.startsWith("#")) || (tag === "image" && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(v));
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !allowed)) n.removeAttribute(a.name);
    }),
  );
  return doc;
}

async function mounted<T>(doc: XMLDocument, run: (svg: SVGSVGElement) => T | Promise<T>): Promise<T> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // Opacity och inte visibility: visibility ärvs och skulle få varje del i filen att se dold ut.
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:3000px;height:3000px;opacity:0;pointer-events:none;contain:strict";
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    return await run(svg);
  } finally {
    host.remove();
  }
}

/** Mätverktyg för den monterade filen: rutor i rotens koordinater. */
function measurer(svg: SVGSVGElement) {
  const rootInv = svg.getScreenCTM()?.inverse();
  if (!rootInv) throw new Error("Kunde inte läsa filen.");
  const toRoot = (el: SVGGraphicsElement) => rootInv.multiply(el.getScreenCTM() ?? new DOMMatrix());
  /** Text mäts tecken för tecken: getBBox tar med banans början och tecken som inte fick plats på den. */
  const localBox = (el: SVGGraphicsElement): Box => {
    if (el instanceof SVGTextContentElement && el.getNumberOfChars()) {
      let b: Box | null = null;
      for (let i = 0; i < el.getNumberOfChars(); i++) {
        const r = el.getExtentOfChar(i);
        if (!r.width || !r.height) continue;
        b = union([...(b ? [b] : []), { x: r.x, y: r.y, w: r.width, h: r.height }]);
      }
      if (b) return b;
    }
    const r = el.getBBox();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const boxOf = (el: SVGGraphicsElement): Box | null => {
    const lb = localBox(el);
    if (!lb.w && !lb.h) return null;
    const m = toRoot(el);
    const pts = [new DOMPoint(lb.x, lb.y), new DOMPoint(lb.x + lb.w, lb.y), new DOMPoint(lb.x, lb.y + lb.h), new DOMPoint(lb.x + lb.w, lb.y + lb.h)].map((p) => p.matrixTransform(m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  return { toRoot, boxOf };
}

const visible = (el: Element) => {
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0;
};
const graphicKids = (el: Element) => [...el.children].filter((c) => GRAPHIC.has(c.tagName.toLowerCase()) && visible(c)) as SVGGraphicsElement[];

/** Färgerna som syns i en del, vanligast först. */
function paintsOf(els: Element[]) {
  const count = new Map<string, number>();
  for (const n of els.flatMap((el) => [el, ...el.querySelectorAll("*")])) {
    if (!ART_TAGS.has(n.tagName.toLowerCase()) && !["text", "tspan", "textpath"].includes(n.tagName.toLowerCase())) continue;
    const cs = getComputedStyle(n);
    for (const hex of [hexOf(cs.fill), cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0 ? hexOf(cs.stroke) : null]) if (hex) count.set(hex, (count.get(hex) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}

/** Ritar filen, beskuren till designen, som PNG. Med `boxes` ritas numrerade rutor ovanpå, på grå botten så att både vitt och svart syns. */
async function snapshot(svg: SVGSVGElement, frame: Box, boxes?: { i: number; box: Box }[], exact = false): Promise<string> {
  const pad = exact ? 0 : Math.max(frame.w, frame.h) * 0.04;
  const view = { x: frame.x - pad, y: frame.y - pad, w: frame.w + 2 * pad, h: frame.h + 2 * pad };
  const k = (exact ? 1200 : 1024) / Math.max(view.w, view.h);
  const [w, h] = [Math.round(view.w * k), Math.round(view.h * k)];
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.removeAttribute("style");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    if (!exact) {
      ctx.fillStyle = boxes ? "#8E8E8E" : "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    if (boxes) {
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.textBaseline = "top";
      for (const { i, box } of boxes) {
        const [x, y, bw, bh] = [(box.x - view.x) * k, (box.y - view.y) * k, box.w * k, box.h * k];
        ctx.strokeStyle = PART_HUES[i % PART_HUES.length];
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, Math.max(2, bw), Math.max(2, bh));
        const label = String(i);
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = PART_HUES[i % PART_HUES.length];
        ctx.fillRect(x, Math.max(0, y - 18), tw, 18);
        ctx.fillStyle = "#000000";
        ctx.fillText(label, x + 4, Math.max(0, y - 17));
      }
    }
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Unit = { els: SVGGraphicsElement[]; b: Box; said?: string };
const saidOf = (us: Unit[]) => us.map((u) => u.said).filter(Boolean).join(" ") || undefined;
const area = (b: Box) => b.w * b.h;
const touches = (a: Box, b: Box, m: number) => a.x - m <= b.x + b.w && b.x - m <= a.x + a.w && a.y - m <= b.y + b.h && b.y - m <= a.y + a.h;

const hasLiveText = (el: Element) => el.tagName.toLowerCase() === "text" || Boolean(el.querySelector("text"));
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Ett ord som stiger eller faller: lutningen i grader när tecknen ligger på en rak linje, annars 0. */
function tiltOf(word: Word) {
  if (word.boxes.length < 3) return 0;
  const pts = word.boxes.map(([x, y, w, h]) => [x + w / 2, y + h / 2]);
  const [mx, my] = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const [sxx, sxy, syy] = pts.reduce((s, [x, y]) => [s[0] + (x - mx) ** 2, s[1] + (x - mx) * (y - my), s[2] + (y - my) ** 2], [0, 0, 0]);
  if (!sxx || !syy || (sxy * sxy) / (sxx * syy) < 0.9) return 0;
  const deg = Math.round((Math.atan(sxy / sxx) * 180) / Math.PI);
  return Math.abs(deg) >= 1 && Math.abs(deg) <= 45 ? deg : 0;
}

/**
 * Tecknen i filens ord slås ihop till ordet, med ordets text. Ett tecken hör till ordet vars ruta det ligger i och vars
 * höjd stämmer bäst – rutorna är typsnittets hela höjd och kan nå in över annan text. Så hålls skrivstil, text i båge
 * och spärrad text ihop, hur olika höga bokstäverna än är. Dekor som inte är tecken räknas aldrig till ett ord.
 */
function joinWords(units: Unit[], words: Word[]): Unit[] {
  if (!words.length) return units;
  const byWord = new Map<number, Unit[]>();
  const rest: Unit[] = [];
  for (const u of units) {
    let best = -1;
    let most = 0.25;
    if (area(u.b) > 0 && u.els.every((el) => el.closest(`[${GLYPH}]`) || el.querySelector(`[${GLYPH}]`)))
      words.forEach((w, k) => {
        for (const [x, y, bw, bh] of w.boxes) {
          const score = (overlap(u.b, { x, y, w: bw, h: bh }) / area(u.b)) * (Math.min(u.b.h, bh) / Math.max(u.b.h, bh));
          if (score > most) [most, best] = [score, k];
        }
      });
    if (best < 0) rest.push(u);
    else byWord.set(best, [...(byWord.get(best) ?? []), u]);
  }
  const joined = [...byWord].map(([k, us]) => {
    const tilt = tiltOf(words[k]);
    if (tilt) us[0].els[0].setAttribute(TILT, String(tilt));
    return { els: us.flatMap((u) => u.els), b: union(us.map((u) => u.b))!, said: words[k].text };
  });
  return [...rest, ...joined].sort((a, b) => (a.els[0].compareDocumentPosition(b.els[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/**
 * Bokstäver som är former – i en AI-fil eller en vektoriserad bild – hålls ihop till ord: samma färg, ungefär samma höjd,
 * överlappar på höjden och står nära varandra. Prickarna i Å, Ä och Ö och små ytor inne i ordet följer med.
 * Levande text och ytor som täcker mer än en fjärdedel av designen lämnas som de är.
 */
function joinRows(units: Unit[], frame: Box): Unit[] {
  const color = units.map((u) => paintsOf(u.els)[0] ?? "");
  const free = units.map((u) => !u.els.some(hasLiveText) && area(u.b) <= area(frame) * 0.25);
  const parent = units.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) {
      if (!free[i] || !free[j] || !color[i] || color[i] !== color[j]) continue;
      const [a, b] = [units[i].b, units[j].b];
      const [lo, hi] = [Math.min(a.h, b.h), Math.max(a.h, b.h)];
      if (lo <= 0 || hi / lo > 1.8) continue;
      if (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) < 0.5 * lo) continue;
      // Spärrad text som "S E D A N  1 9 0 4" har luft på mer än en bokstavshöjd mellan orden.
      if (Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w) > 1.2 * hi) continue;
      parent[find(i)] = find(j);
    }
  const groups = new Map<number, number[]>();
  units.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const boxOfGroup = (g: number[]) => union(g.map((i) => units[i].b))!;
  const rows = [...groups.values()].filter((g) => g.length > 1);
  const rowBox = new Map(rows.map((r) => [r, boxOfGroup(r)]));
  // Minst först, så att prickarna i Ö fäster vid ordet och inte tvärtom.
  for (const [key, g] of [...groups].sort((a, b) => boxOfGroup(a[1]).h - boxOfGroup(b[1]).h)) {
    if (!g.every((i) => free[i])) continue;
    const gb = boxOfGroup(g);
    const cx = gb.x + gb.w / 2;
    const row = rows
      .filter((r) => {
        const b = rowBox.get(r)!;
        if (r === g || cx < b.x || cx > b.x + b.w || gb.h >= b.h) return false;
        const inside = gb.x >= b.x && gb.x + gb.w <= b.x + b.w && gb.y >= b.y && gb.y + gb.h <= b.y + b.h;
        const accent = g.every((i) => color[i] === color[r[0]] && units[i].b.w < 0.4 * b.h) && gb.h < 0.3 * b.h && gb.y + gb.h >= b.y - 0.3 * b.h && gb.y < b.y;
        return inside || accent;
      })
      .sort((a, b) => a.length - b.length)[0];
    if (!row) continue;
    row.push(...g);
    groups.delete(key);
    if (rowBox.has(g)) rows.splice(rows.indexOf(g), 1);
  }
  return [...groups.values()]
    .map((g) => g.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map((g) => ({ els: g.flatMap((i) => units[i].els), b: boxOfGroup(g), said: saidOf(g.map((i) => units[i])) }));
}

/**
 * En platt fil – hundratals former bredvid varandra, som en AI-fil eller en vektoriserad bild – slås ihop till högst
 * MAX_CANDIDATES delar: först det som överlappar (bitarna i ett märke), sedan det som ligger allt närmare varandra.
 * Ytor som täcker mer än en fjärdedel av designen (bakgrund, stora sköldar) slås aldrig ihop med något.
 */
function mergeUnits(units: Unit[], frame: Box): Unit[] {
  const big = (u: Unit) => area(u.b) > area(frame) * 0.25;
  for (const step of [0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32]) {
    if (units.length <= MAX_CANDIDATES) return units;
    const m = step * Math.max(frame.w, frame.h);
    const parent = units.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < units.length; i++)
      for (let j = i + 1; j < units.length; j++) if (!big(units[i]) && !big(units[j]) && touches(units[i].b, units[j].b, m)) parent[find(i)] = find(j);
    const groups = new Map<number, Unit>();
    units.forEach((u, i) => {
      const g = groups.get(find(i));
      groups.set(find(i), g ? { els: [...g.els, ...u.els], b: union([g.b, u.b])!, said: saidOf([g, u]) } : u);
    });
    units = [...groups.values()];
  }
  if (units.length > MAX_CANDIDATES) throw new Error("Designen har för många separata delar för att läsas – gruppera den i Illustrator och försök igen.");
  return units;
}

/**
 * Delar upp en fil utan namngivna lager i delar som läsagenten kan peka på. De största grupperna öppnas först tills det
 * blir för många delar, så att text och märke som ligger i samma grupp ändå hamnar i var sin del; en platt fil slås i
 * stället ihop (mergeUnits). Delarna märks i filen (data-nw-c), så att importSvg hittar dem igen med agentens tolkning.
 * `words` är filens ord när texten är former; formerna i ett ord blir en del med ordets text (joinWords).
 */
export async function describeSvg(text: string, words: Word[] = []): Promise<Described> {
  return mounted(parse(text), async (svg) => {
    const { boxOf } = measurer(svg);
    const boxes = new Map<Element, Box | null>();
    const box = (el: SVGGraphicsElement) => (boxes.has(el) ? boxes.get(el)! : (boxes.set(el, boxOf(el)), boxes.get(el)!));
    const size = (el: SVGGraphicsElement) => (box(el)?.w ?? 0) * (box(el)?.h ?? 0);
    const whole = svg.getBBox();
    let list = graphicKids(svg);
    for (;;) {
      const groups = list.filter((el) => ["g", "svg"].includes(el.tagName.toLowerCase()) && graphicKids(el).length).sort((a, b) => size(b) - size(a));
      // En grupp som täcker mer än en fjärdedel av designen (en urklippsgrupp runt allt) är inte en del – den öppnas alltid.
      const open =
        groups.find((g) => size(g) > whole.width * whole.height * 0.25 && list.length - 1 + graphicKids(g).length <= MAX_OPENED) ??
        groups.find((g) => list.length - 1 + graphicKids(g).length <= MAX_CANDIDATES);
      if (!open) break;
      const at = list.indexOf(open);
      list = [...list.slice(0, at), ...graphicKids(open), ...list.slice(at + 1)];
    }
    const drawn = list.flatMap((el) => {
      const b = box(el);
      return b && (b.w > 0 || b.h > 0) && (paintsOf([el]).length || el.tagName.toLowerCase() === "image") ? [{ els: [el], b }] : [];
    });
    const frame = union(drawn.map((p) => p.b));
    if (!frame || frame.w < 1) throw new Error("Hittade inget att rita i filen.");
    const parts = mergeUnits(joinRows(joinWords(drawn, words), frame), frame);
    const s = 1000 / Math.max(frame.w, frame.h);
    const r = (n: number) => Math.round(n);
    const candidates: Candidate[] = parts.map((p, i) => {
      const { els, b } = p;
      const tag = els[0].tagName.toLowerCase();
      els.forEach((el) => el.setAttribute(MARK, String(i)));
      const hasText = els.some(hasLiveText);
      const content = (hasText ? els.map((el) => el.textContent ?? "").join(" ") : (p.said ?? "")).replace(/\s+/g, " ").trim().slice(0, 80);
      if (content && !hasText) els[0].setAttribute(SAID, content);
      return {
        i,
        kind: hasText ? "text" : els.length > 1 ? "group" : tag === "image" ? "image" : ["g", "svg"].includes(tag) ? "group" : "shape",
        text: content,
        box: [r((b.x - frame.x) * s), r((b.y - frame.y) * s), Math.max(1, r(b.w * s)), Math.max(1, r(b.h * s))],
        colors: paintsOf(els).slice(0, 4),
        shapes: els.reduce((sum, el) => sum + (ART_TAGS.has(el.tagName.toLowerCase()) ? 1 : el.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line").length), 0),
      };
    });
    const [image, annotated] = await Promise.all([snapshot(svg, frame), snapshot(svg, frame, parts.map((p, i) => ({ i, box: p.b })))]);
    return { svg: new XMLSerializer().serializeToString(svg), candidates, image, annotated };
  });
}

/** Läser filen till en mall: med namngivna lager som de heter, annars med läsagentens tolkning av describeSvg-filen. */
export async function importSvg(text: string, fileName: string, reading?: Reading): Promise<Imported> {
  return mounted(parse(text), async (svg) => {
    const { frame, ...imported } = measure(svg, fileName, reading);
    return { ...imported, original: { ...imported.original, image: await snapshot(svg, frame, undefined, true) } };
  });
}

function measure(svg: SVGSVGElement, fileName: string, reading?: Reading): Omit<Imported, "original"> & { frame: Box; original: Omit<Imported["original"], "image"> } {
  const notes: string[] = [];
  const { toRoot, boxOf } = measurer(svg);

  const found = new Map<Role, SVGGraphicsElement[]>();
  if (reading) {
    for (const [i, role] of Object.entries(reading.roles)) {
      const els = role === "ignore" ? [] : [...svg.querySelectorAll<SVGGraphicsElement>(`[${MARK}="${Number(i)}"]`)];
      if (els.length) found.set(role as Role, [...(found.get(role as Role) ?? []), ...els]);
    }
    if (![...found.keys()].some((r) => TEXT_ROLES.has(r) || r === "icon")) throw new Error("Markera minst namnet eller klubbmärket.");
  } else {
    svg.querySelectorAll("g, text, rect, path, circle, ellipse, polygon").forEach((el) => {
      const role = roleOf(el);
      if (role && !found.has(role)) found.set(role, [el as SVGGraphicsElement]);
    });
    if (!["name", "name1", "name2"].some((r) => found.has(r as Role))) throw new NoLayerNames("Hittade inga lager som heter name, name1 eller name2.");
  }

  // Färgerna: agentens tolkning eller namngivna färgrutor först, sedan namnets färg, och svart och vitt som ink och paper.
  const slotOf = new Map<string, ColorSlot>(Object.entries(reading?.colors ?? {}).map(([hex, slot]) => [hex.toUpperCase(), slot]));
  const fillOf = (el: Element) => hexOf(getComputedStyle(el).fill);
  for (const role of ["primary", "secondary"] as const) {
    const sw = found.get(role)?.[0];
    const hex = sw && fillOf(sw.tagName.toLowerCase() === "g" ? (sw.querySelector("rect, path, circle, polygon") ?? sw) : sw);
    if (hex) slotOf.set(hex, role);
  }
  const textEl = (el: SVGGraphicsElement) => (el.tagName.toLowerCase() === "text" ? el : el.querySelector("text")) as SVGTextElement | null;
  /** Levande text först; annars delen överst – bokstäverna, inte skuggan eller konturen som ritas under dem. */
  const lead = (role: Role) => {
    const els = found.get(role) ?? [];
    return els.find((e) => textEl(e)) ?? els.at(-1);
  };
  const firstPaint = (el: SVGGraphicsElement) => {
    const t = textEl(el);
    return fillOf(t?.querySelector("tspan") ?? t ?? el.querySelector("path, rect, polygon") ?? el);
  };
  const main = lead("name2") ?? lead("name");
  const n2 = main && firstPaint(main);
  const n1 = lead("name1") && firstPaint(lead("name1")!);
  const has = (slot: ColorSlot) => [...slotOf.values()].includes(slot);
  if (n2 && !slotOf.has(n2) && !has("primary")) slotOf.set(n2, "primary");
  if (n1 && !slotOf.has(n1) && !has("secondary") && lum(n1) > 0.12 && lum(n1) < 0.94) slotOf.set(n1, "secondary");
  const slot = (hex: string | null): ColorSlot => {
    if (!hex) return "ink";
    const direct = slotOf.get(hex);
    if (direct) return direct;
    if (lum(hex) < 0.12) return "ink";
    if (lum(hex) > 0.94) return "paper";
    const near = [...slotOf.entries()].filter(([, s]) => s === "primary" || s === "secondary").sort((a, b) => dist(a[0], hex) - dist(b[0], hex))[0];
    return near ? near[1] : "primary";
  };

  // Text mäts på själva texten, inte gruppen – där kan den osynliga banan för text på bana ligga. Delarna ritas i filens ordning.
  const parts = (["name", "name1", "name2", "monogram", "tagline", "sport", "year", "ornament", "icon"] as const)
    .flatMap((role) => {
      const els = found.get(role) ?? [];
      const box = union(els.flatMap((el) => boxOf(role === "ornament" || role === "icon" ? el : (textEl(el) ?? el)) ?? []));
      return els.length && box ? [{ role, els, box }] : [];
    })
    .sort((a, b) => (a.els[0].compareDocumentPosition(b.els[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const all = union(parts.map((p) => p.box));
  if (!all || all.w < 1) throw new Error("Lagren i filen är tomma.");
  const s = 1000 / all.w;
  const place = (b: Box) => ({ x: r1((b.x - all.x) * s), y: r1((b.y - all.y) * s), w: Math.max(1, r1(b.w * s)), h: Math.max(1, r1(b.h * s)) });

  const sample: Imported["sample"] = {};
  const glyphs: Imported["original"]["glyphs"] = [];
  const spacingOf = rawSpacing(svg);
  const layers: Layer[] = [];
  for (const { role, els, box } of parts) {
    if (role === "icon") {
      layers.push({ kind: "icon", box: place(box) });
      continue;
    }
    if (role === "ornament") {
      // Ett lager rymmer MAX_ART tecken grafik; detaljrik dekor delas på flera lager i samma ordning.
      const chunks: { svg: string; b: Box }[] = [];
      for (const el of els) {
        const art = ornamentArt(el, toRoot, slot, notes);
        const b = boxOf(el);
        if (!art || !b) continue;
        const last = chunks.at(-1);
        if (last && last.svg.length + art.length <= MAX_ART) {
          last.svg += art;
          last.b = union([last.b, b])!;
        } else chunks.push({ svg: art, b });
      }
      for (const c of chunks) layers.push({ kind: "art", box: place(c.b), viewBox: [r1(c.b.x), r1(c.b.y), Math.max(0.01, r1(c.b.w)), Math.max(0.01, r1(c.b.h))], svg: c.svg });
      continue;
    }
    const style = els.map((el) => reading?.styles?.[Number(el.getAttribute(MARK))]).find(Boolean);
    const top = topCopies(els, boxOf, reading);
    const said = els.map((el) => el.getAttribute(SAID)).find(Boolean) ?? readText(top, boxOf, reading);
    const tilt = Number(els.map((el) => el.getAttribute(TILT)).find(Boolean) ?? 0);
    const layer = textLayer(role, lead(role)!, box, place(box), toRoot, slot, s, notes, sample, spacingOf, { style, said, tilt });
    if (layer.kind === "text" && !els.some((el) => textEl(el)) && said) {
      const svgText = top.map((el) => ornamentArt(el, toRoot, slot, [])).join("");
      if (svgText && svgText.length <= MAX_ART) glyphs.push({ slot: role, text: said.slice(0, 60), svg: svgText, paint: layer.color, viewBox: [r1(box.x), r1(box.y), Math.max(0.01, r1(box.w)), Math.max(0.01, r1(box.h))], ...(tilt ? { rotate: tilt } : {}), ...(style ? { prefer: style.font, picked: style.picked } : {}) });
    }
    layers.push(layer);
  }
  if (layers.length > MAX_LAYERS) throw new Error("Designen har för många delar för en mall – slå ihop dekoren i färre grupper.");

  const club = splitName(reading?.club ?? "");
  const n = [...(sample.name2 || splitName(sample.name ?? "").name2 || sample.name1 || club.name2 || "Klubbnamn")].length;
  const base = fileName.replace(/\.(svg|ai|pdf|png|jpe?g|webp)$/i, "").trim() || "Importerad mall";
  const id =
    base
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34) || "import";
  return {
    template: { id: id.length < 2 ? `${id}-mall` : id, name: base.slice(0, 40), style: "Import", height: Math.max(100, r1(all.h * s)), layers, fit: { ideal: [Math.max(1, n - 3), Math.min(40, n + 3)], max: Math.min(60, n + 8) }, source: "import" },
    sample,
    notes: [...new Set(notes)],
    frame: all,
    original: { colors: (["primary", "secondary"] as const).flatMap((c) => [...slotOf.entries()].find(([, v]) => v === c)?.[0] ?? []), glyphs },
  };
}

/**
 * Skugga och kontur är samma ord en gång till, nästan på samma plats. Bara kopian överst räknas – den som syns – så att
 * texten inte blir "TÖLÖTÖLÖ" och typsnittet mäts mot bokstäverna och inte mot skuggan.
 */
function topCopies(els: SVGGraphicsElement[], boxOf: (el: SVGGraphicsElement) => Box | null, reading?: Reading) {
  const markOf = (el: SVGGraphicsElement) => (el.hasAttribute(MARK) ? Number(el.getAttribute(MARK)) : NaN);
  const marks = new Map<number, { box: Box; els: SVGGraphicsElement[] }>();
  for (const el of els) {
    const i = markOf(el);
    const b = boxOf(el);
    if (!Number.isFinite(i) || !b) continue;
    const m = marks.get(i);
    marks.set(i, m ? { box: union([m.box, b])!, els: [...m.els, el] } : { box: b, els: [el] });
  }
  const area = (b: Box) => b.w * b.h;
  const shared = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const text = (i: number) => reading?.texts?.[i]?.trim().toLocaleLowerCase("sv-SE") ?? "";
  const kept: [number, Box][] = [];
  for (const [i, m] of [...marks].reverse()) {
    const copy = kept.some(([j, b]) => text(i) === text(j) && shared(m.box, b) > 0.6 * Math.min(area(m.box), area(b)));
    if (!copy) kept.push([i, m.box]);
  }
  const keep = new Set(kept.map(([i]) => i));
  return els.filter((el) => {
    const i = markOf(el);
    return !Number.isFinite(i) || keep.has(i);
  });
}

/** Agentens text per del, vänster till höger – delar som ligger tätt (ett svängt D och resten av ordet) blir ett ord. */
function readText(els: SVGGraphicsElement[], boxOf: (el: SVGGraphicsElement) => Box | null, reading?: Reading) {
  const marks = new Map<number, Box>();
  for (const el of els) {
    const i = Number(el.getAttribute(MARK));
    const b = boxOf(el);
    if (b && reading?.texts?.[i]?.trim()) marks.set(i, union([marks.get(i) ?? b, b])!);
  }
  const said = [...marks].sort((a, b) => a[1].x - b[1].x);
  return said.reduce((out, [i, b], k) => {
    const prev = said[k - 1]?.[1];
    const tight = prev && b.x - (prev.x + prev.w) < 0.25 * Math.max(b.h, prev.h);
    return out + (k && !tight ? " " : "") + reading!.texts![i].trim();
  }, "");
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function textLayer(
  role: TextRole,
  el: SVGGraphicsElement,
  box: Box,
  placed: Box,
  toRoot: (el: SVGGraphicsElement) => DOMMatrix,
  slot: (hex: string | null) => ColorSlot,
  scale: number,
  notes: string[],
  sample: Imported["sample"],
  spacingOf: (el: Element) => number | null,
  outlined: { style?: TextStyle; said: string; tilt: number },
): Layer {
  const t = (el.tagName.toLowerCase() === "text" ? el : el.querySelector("text")) as SVGTextElement | null;
  if (!t) {
    const style = outlined.style ?? defaultStyle(role);
    if (outlined.said) sample[role] = outlined.said;
    notes.push(
      outlined.style
        ? "Texten i filen är former och inte levande text – typsnittet väljs i samma stil. Stämmer stilen inte, byt den vid delen."
        : "Texten i filen är former och inte levande text – mallen gissar typsnitt. Välj stil vid delen, eller exportera med levande text.",
    );
    return {
      kind: "text",
      slot: role,
      font: `role:${style.font}`,
      case: style.upper ? "upper" : "asis",
      color: slot(hexOf(getComputedStyle(el.querySelector("path") ?? el).fill)),
      box: placed,
      align: "center",
      valign: "middle",
      maxLines: 1,
      ...(outlined.tilt ? { rotate: outlined.tilt } : {}),
    };
  }
  const span = t.querySelector("tspan") ?? t;
  const cs = getComputedStyle(span);
  const content = (t.textContent ?? "").replace(/\s+/g, " ").trim();
  if (content) sample[role] = content;
  const upper = /\p{L}/u.test(content) && content === content.toLocaleUpperCase("sv-SE");
  const size = parseFloat(cs.fontSize) || 16;
  const spacing = parseFloat(cs.letterSpacing) || spacingOf(span) || spacingOf(t) || 0;
  const em = spacing / size;
  const m = toRoot(t);
  const rotate = Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
  const lines = new Set([...t.querySelectorAll("tspan")].map((s) => s.getAttribute("y")).filter(Boolean)).size;
  const stroke = hexOf(cs.stroke);
  const strokeWidth = parseFloat(cs.strokeWidth) || 0;
  const arc = textPathArc(t, [...content].length);
  const layer: Layer = {
    kind: "text",
    slot: role,
    font: `role:${roleFromFamily(`${cs.fontFamily} ${cs.fontWeight}`)}`,
    case: upper ? "upper" : "asis",
    color: slot(hexOf(cs.fill)),
    box: placed,
    align: "center",
    valign: "middle",
    maxLines: lines > 1 ? 2 : 1,
    ...(em > 0.01 ? { tracking: [Math.min(1, r2(em)), Math.min(1, r2(em * 0.5))] as [number, number] } : {}),
    ...(Math.abs(rotate) >= 1 && Math.abs(rotate) <= 45 ? { rotate } : {}),
    ...(arc ? { arc } : {}),
    ...(stroke && strokeWidth > 0 ? { outline: { color: slot(stroke), width: Math.min(60, Math.max(0.5, r1((strokeWidth / 2) * scale * Math.hypot(m.a, m.b)))) } } : {}),
  };
  if (role === "name2" && !box.w) notes.push("Namn 2 är tomt.");
  return layer;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Illustrator skriver spärrning utan enhet (letter-spacing:12), som webbläsaren inte godtar; läs den ur stilmallen. */
function rawSpacing(svg: SVGSVGElement) {
  const css = [...svg.querySelectorAll("style")].map((st) => st.textContent ?? "").join("\n");
  const byClass = new Map<string, number>();
  for (const m of css.matchAll(/\.([\w-]+)\s*\{[^}]*letter-spacing\s*:\s*(-?[\d.]+)\s*;?[^}]*\}/g)) byClass.set(m[1], Number(m[2]));
  return (el: Element) => {
    const inline = /letter-spacing\s*:\s*(-?[\d.]+)/.exec(el.getAttribute("style") ?? "")?.[1] ?? el.getAttribute("letter-spacing");
    if (inline && Number.isFinite(Number(inline))) return Number(inline);
    for (const c of el.classList) if (byClass.has(c)) return byClass.get(c)!;
    return null;
  };
}

/** Text på en bana blir en båge: hur mycket banan vrider sig från början till slut, omräknat till tio tecken som motorn. */
function textPathArc(t: SVGTextElement, chars: number): number | undefined {
  const tp = t.querySelector("textPath");
  const ref = tp?.getAttribute("href") ?? tp?.getAttribute("xlink:href");
  const path = ref?.startsWith("#") ? (t.ownerDocument.getElementById(ref.slice(1)) as SVGPathElement | null) : null;
  if (!path || typeof path.getTotalLength !== "function") return undefined;
  const len = path.getTotalLength();
  if (len < 1) return undefined;
  const at = (d: number) => path.getPointAtLength(Math.min(len, Math.max(0, d)));
  const angle = (d: number) => {
    const [a, b] = [at(d - 1), at(d + 1)];
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };
  let turn = Math.abs(angle(len - 1) - angle(1));
  if (turn > 180) turn = 360 - turn;
  if (turn < 3) return undefined;
  const [p0, p1, mid] = [at(0), at(len), at(len / 2)];
  const sign = mid.y < (p0.y + p1.y) / 2 ? 1 : -1;
  const factor = Math.min(1.2, Math.max(0.35, chars / 10));
  return Math.max(-240, Math.min(240, Math.round((sign * turn) / factor)));
}

/** Ornamentet som rena former med klubbfärgernas platshållare; klasser och stilar skrivs ut som attribut först. */
function ornamentArt(el: SVGGraphicsElement, toRoot: (el: SVGGraphicsElement) => DOMMatrix, slot: (hex: string | null) => ColorSlot, notes: string[]) {
  const clone = el.cloneNode(true) as SVGGraphicsElement;
  const src = [el, ...el.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  const drop: Element[] = [];
  let gradient = false;
  src.forEach((o, i) => {
    const c = dst[i];
    const tag = c.tagName.toLowerCase();
    if (!ART_TAGS.has(tag) || !visible(o)) {
      if (tag === "text") notes.push("Fast text i dekoren följer inte med – bara klubbens egna texter byts ut.");
      drop.push(c);
      return;
    }
    const cs = getComputedStyle(o);
    if (cs.clipPath && cs.clipPath !== "none") notes.push("Dekoren har en urklippsmask – den följer inte med, så former kan sticka ut utanför sin kant.");
    const paint = (v: string) => {
      if (!v || v === "none") return "none";
      if (v.startsWith("url(")) {
        gradient = true;
        return "{primary}";
      }
      const hex = hexOf(v);
      return hex ? `{${slot(hex)}}` : "none";
    };
    for (const a of [...c.attributes]) if (!["d", "points", "transform", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "fill-rule"].includes(a.name)) c.removeAttribute(a.name);
    if (tag !== "g") {
      c.setAttribute("fill", paint(cs.fill));
      const stroke = paint(cs.stroke);
      if (stroke !== "none") {
        c.setAttribute("stroke", stroke);
        c.setAttribute("stroke-width", String(parseFloat(cs.strokeWidth) || 1));
        c.setAttribute("stroke-linejoin", cs.strokeLinejoin === "round" || cs.strokeLinejoin === "bevel" ? cs.strokeLinejoin : "miter");
      }
      if (cs.fillRule === "evenodd") c.setAttribute("fill-rule", "evenodd");
      const op = parseFloat(cs.opacity);
      if (op < 1) c.setAttribute("opacity", String(r2(op)));
    }
  });
  drop.forEach((d) => d.remove());
  if (gradient) notes.push("Dekoren har övertoningar – de blir klubbens huvudfärg.");
  const m = toRoot(el);
  clone.removeAttribute("transform");
  const inner = [...clone.childNodes].map((n) => (n.nodeType === 1 ? new XMLSerializer().serializeToString(n) : "")).join("");
  const own = clone.tagName.toLowerCase() === "g" ? inner : new XMLSerializer().serializeToString(clone);
  const svg = `<g transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((n) => r2(n)).join(" ")})">${own.replace(/\s+xmlns(:\w+)?="[^"]*"/g, "")}</g>`;
  if (svg.length > MAX_ART) {
    notes.push("En del av dekoren är för detaljerad för en mall och togs bort – förenkla den i filen.");
    return "";
  }
  const safe = sanitizeArt(svg);
  if (!safe) {
    notes.push("Dekoren innehåller något som inte stöds och togs bort.");
    return "";
  }
  return safe;
}
