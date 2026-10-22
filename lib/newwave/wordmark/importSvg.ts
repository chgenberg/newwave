import { sanitizeArt } from "./art";
import { roleFromFamily } from "./fonts";
import type { ColorSlot, Layer, TemplateInput } from "./schema";

/**
 * Gör om en SVG-export från Illustrator till en mall. Körs i webbläsaren, som kan mäta text och grupper.
 * Lagren känns igen på namnen name1, name2, tagline, sport, year, ornament och icon; färgrutor som heter primary och secondary
 * talar om vilka färger som är klubbens. Allt annat i filen ignoreras.
 */

type Role = "name1" | "name2" | "tagline" | "sport" | "year" | "ornament" | "icon" | "primary" | "secondary";
type Box = { x: number; y: number; w: number; h: number };
export type Imported = { template: TemplateInput; sample: { name1: string; name2: string }; notes: string[] };

const ALIAS: Record<string, Role> = {
  name1: "name1", namn1: "name1",
  name2: "name2", namn2: "name2",
  tagline: "tagline", rad: "tagline",
  sport: "sport", sporten: "sport",
  year: "year", ar: "year", artal: "year", est: "year",
  ornament: "ornament", ornaments: "ornament", dekor: "ornament",
  icon: "icon", ikon: "icon", marke: "icon", crest: "icon",
  primary: "primary", primar: "primary",
  secondary: "secondary", sekundar: "secondary",
};
const MAX_FILE = 3_000_000;
const ART_TAGS = new Set(["g", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);

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

export async function importSvg(text: string, fileName: string): Promise<Imported> {
  if (text.length > MAX_FILE) throw new Error("Filen är för stor – max 3 MB.");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.tagName.toLowerCase() !== "svg") throw new Error("Filen är inte en giltig SVG. Exportera från Illustrator med Arkiv → Exportera → Exportera som → SVG.");
  doc.querySelectorAll("script, style[src], foreignObject, iframe, a, use").forEach((n) => n.remove());
  // Inget i filen får hämta något: bilder behåller sin storlek men tappar länken, textbanor får bara peka inom filen.
  doc.querySelectorAll("*").forEach((n) =>
    [...n.attributes].forEach((a) => {
      const internal = n.tagName.toLowerCase() === "textpath" && a.value.trim().startsWith("#");
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !internal)) n.removeAttribute(a.name);
    }),
  );

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:3000px;height:3000px;visibility:hidden;pointer-events:none;contain:strict";
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    return measure(svg, fileName);
  } finally {
    host.remove();
  }
}

function measure(svg: SVGSVGElement, fileName: string): Imported {
  const notes: string[] = [];
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
        b = b ? { x: Math.min(b.x, r.x), y: Math.min(b.y, r.y), w: Math.max(b.x + b.w, r.x + r.width) - Math.min(b.x, r.x), h: Math.max(b.y + b.h, r.y + r.height) - Math.min(b.y, r.y) } : { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      if (b) return b;
    }
    const r = el.getBBox();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const boxOf = (el: SVGGraphicsElement): Box | null => {
    const lb = localBox(el);
    const b = { x: lb.x, y: lb.y, width: lb.w, height: lb.h };
    if (!b.width && !b.height) return null;
    const m = toRoot(el);
    const pts = [new DOMPoint(b.x, b.y), new DOMPoint(b.x + b.width, b.y), new DOMPoint(b.x, b.y + b.height), new DOMPoint(b.x + b.width, b.y + b.height)].map((p) => p.matrixTransform(m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  const found = new Map<Role, SVGGraphicsElement>();
  svg.querySelectorAll("g, text, rect, path, circle, ellipse, polygon").forEach((el) => {
    const role = roleOf(el);
    if (role && !found.has(role)) found.set(role, el as SVGGraphicsElement);
  });
  if (!found.has("name1") && !found.has("name2")) throw new Error("Hittade inga lager som heter name1 eller name2. Namnge lagren enligt guiden och exportera igen.");

  // Färgerna: namngivna färgrutor först, sedan färgen på Namn 2 och Namn 1, och svart och vitt som ink och paper.
  const slotOf = new Map<string, ColorSlot>();
  const fillOf = (el: Element) => hexOf(getComputedStyle(el).fill);
  for (const role of ["primary", "secondary"] as const) {
    const sw = found.get(role);
    const hex = sw && fillOf(sw.tagName.toLowerCase() === "g" ? (sw.querySelector("rect, path, circle, polygon") ?? sw) : sw);
    if (hex) slotOf.set(hex, role);
  }
  const textEl = (el: SVGGraphicsElement) => (el.tagName.toLowerCase() === "text" ? el : el.querySelector("text")) as SVGTextElement | null;
  const firstPaint = (el: SVGGraphicsElement) => {
    const t = textEl(el);
    return fillOf(t?.querySelector("tspan") ?? t ?? el.querySelector("path, rect, polygon") ?? el);
  };
  const n2 = found.get("name2") && firstPaint(found.get("name2")!);
  const n1 = found.get("name1") && firstPaint(found.get("name1")!);
  const has = (slot: ColorSlot) => [...slotOf.values()].includes(slot);
  if (n2 && !slotOf.has(n2) && !has("primary")) slotOf.set(n2, "primary");
  if (n1 && !slotOf.has(n1) && !has("secondary") && lum(n1) > 0.12 && lum(n1) < 0.94) slotOf.set(n1, "secondary");
  const slot = (hex: string | null): ColorSlot => {
    if (!hex) return "ink";
    const direct = slotOf.get(hex);
    if (direct) return direct;
    if (lum(hex) < 0.12) return "ink";
    if (lum(hex) > 0.94) return "paper";
    const near = [...slotOf.entries()].sort((a, b) => dist(a[0], hex) - dist(b[0], hex))[0];
    return near ? near[1] : "primary";
  };

  // Text mäts på själva texten, inte gruppen – där kan den osynliga banan för text på bana ligga.
  const parts = (["name1", "name2", "tagline", "sport", "year", "ornament", "icon"] as const).flatMap((role) => {
    const el = found.get(role);
    const measured = el && (role === "ornament" || role === "icon" ? el : (textEl(el) ?? el));
    const box = measured && boxOf(measured);
    return el && box ? [{ role, el, box }] : [];
  });
  const all = parts.reduce<Box | null>((u, p) => (u ? { x: Math.min(u.x, p.box.x), y: Math.min(u.y, p.box.y), w: Math.max(u.x + u.w, p.box.x + p.box.w) - Math.min(u.x, p.box.x), h: Math.max(u.y + u.h, p.box.y + p.box.h) - Math.min(u.y, p.box.y) } : p.box), null);
  if (!all || all.w < 1) throw new Error("Lagren i filen är tomma.");
  const s = 1000 / all.w;
  const place = (b: Box) => ({ x: r1((b.x - all.x) * s), y: r1((b.y - all.y) * s), w: Math.max(1, r1(b.w * s)), h: Math.max(1, r1(b.h * s)) });

  const sample = { name1: "", name2: "" };
  const spacingOf = rawSpacing(svg);
  const layers: Layer[] = [];
  for (const { role, el, box } of parts) {
    if (role === "icon") {
      layers.push({ kind: "icon", box: place(box) });
      continue;
    }
    if (role === "ornament") {
      const art = ornamentArt(el, box, toRoot, slot, notes);
      if (art) layers.push({ kind: "art", box: place(box), viewBox: [r1(box.x), r1(box.y), Math.max(0.01, r1(box.w)), Math.max(0.01, r1(box.h))], svg: art });
      continue;
    }
    layers.push(textLayer(role, el, box, place(box), toRoot, slot, s, notes, sample, spacingOf));
  }

  const n = [...(sample.name2 || sample.name1 || "Klubbnamn")].length;
  const base = fileName.replace(/\.svg$/i, "").trim() || "Importerad mall";
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
    notes,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function textLayer(
  role: "name1" | "name2" | "tagline" | "sport" | "year",
  el: SVGGraphicsElement,
  box: Box,
  placed: Box,
  toRoot: (el: SVGGraphicsElement) => DOMMatrix,
  slot: (hex: string | null) => ColorSlot,
  scale: number,
  notes: string[],
  sample: { name1: string; name2: string },
  spacingOf: (el: Element) => number | null,
): Layer {
  const t = (el.tagName.toLowerCase() === "text" ? el : el.querySelector("text")) as SVGTextElement | null;
  const fallback = role === "name2" ? "role:script" : "role:caps";
  if (!t) {
    notes.push(`${role} är konverterad till banor – mallen gissar typsnitt. Exportera med levande text för bästa resultat.`);
    return { kind: "text", slot: role, font: fallback, case: role === "name2" ? "asis" : "upper", color: slot(hexOf(getComputedStyle(el.querySelector("path") ?? el).fill)), box: placed, align: "center", valign: "middle", maxLines: 1 };
  }
  const span = t.querySelector("tspan") ?? t;
  const cs = getComputedStyle(span);
  const content = (t.textContent ?? "").replace(/\s+/g, " ").trim();
  if (role === "name1" || role === "name2") sample[role] = content;
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
function ornamentArt(el: SVGGraphicsElement, box: Box, toRoot: (el: SVGGraphicsElement) => DOMMatrix, slot: (hex: string | null) => ColorSlot, notes: string[]) {
  const clone = el.cloneNode(true) as SVGGraphicsElement;
  const src = [el, ...el.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  const drop: Element[] = [];
  let gradient = false;
  src.forEach((o, i) => {
    const c = dst[i];
    const tag = c.tagName.toLowerCase();
    if (!ART_TAGS.has(tag)) {
      drop.push(c);
      return;
    }
    const cs = getComputedStyle(o);
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
  if (gradient) notes.push("Ornamentet har övertoningar – de blir klubbens huvudfärg.");
  const m = toRoot(el);
  clone.removeAttribute("transform");
  const inner = [...clone.childNodes].map((n) => (n.nodeType === 1 ? new XMLSerializer().serializeToString(n) : "")).join("");
  const own = clone.tagName.toLowerCase() === "g" ? inner : new XMLSerializer().serializeToString(clone);
  const svg = `<g transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((n) => r2(n)).join(" ")})">${own.replace(/\s+xmlns(:\w+)?="[^"]*"/g, "")}</g>`;
  const safe = sanitizeArt(svg);
  if (!safe) {
    notes.push("Ornamentet innehåller något som inte stöds och togs bort.");
    return null;
  }
  if (!box.w) return null;
  return safe;
}
