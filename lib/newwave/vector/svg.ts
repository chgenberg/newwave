import { type Box, IDENTITY, type Matrix, multiply, parsePath, parseTransform, pathBounds, pathString, type Seg, transformPath, unionBox } from "./path";

/**
 * En SVG som platta färgytor: varje form blir en absolut bana med en färg, i ritordning. Det är vad PDF- och EPS-filerna
 * skrivs från, och det tryckerierna kräver – allt som inte går att trycka som det är (text som inte är konturer,
 * bilder, streck, genomskinlighet, övertoningar, klippbanor) räknas upp i `issues` i stället för att tyst bli fel.
 */

export type Shape = { segs: Seg[]; fill: string; rule: "nonzero" | "evenodd" };
export type Flat = { shapes: Shape[]; box: Box; issues: string[] };

type Node = { tag: string; attrs: Record<string, string>; kids: Node[]; text: string };

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITY[e] ?? m)));

function parseXml(src: string): Node {
  const root: Node = { tag: "#root", attrs: {}, kids: [], text: "" };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of src.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += decode(m[6]);
    else if (m[3]) {
      if (m[2] === "/") {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs: Record<string, string> = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
      const node: Node = { tag: m[3].replace(/^svg:/, ""), attrs, kids: [], text: "" };
      top.kids.push(node);
      if (!m[5]) stack.push(node);
    }
  }
  return root;
}

const NAMED: Record<string, string> = { black: "#000000", white: "#FFFFFF", red: "#FF0000", green: "#008000", blue: "#0000FF", yellow: "#FFFF00", gray: "#808080", grey: "#808080", navy: "#000080" };

/** En CSS-färg som #RRGGBB; null för none och för det som inte är en platt färg. */
export function cssColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join("")}`.toUpperCase();
  const rgb = /^rgba?\(([^)]*)\)$/.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    const ch = parts.map((p) => Math.max(0, Math.min(255, Math.round(p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p)))));
    if (ch.length === 3 && ch.every((c) => Number.isFinite(c))) return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return NAMED[v] ?? null;
}

type Paint = { fill: string; rule: string; fillOpacity: number; opacity: number; stroke: string; strokeWidth: string; display: string; visibility: string; color: string };
const INHERITED: (keyof Paint)[] = ["fill", "rule", "fillOpacity", "stroke", "strokeWidth", "visibility", "color"];
const PROP: Record<string, keyof Paint> = { fill: "fill", "fill-rule": "rule", "fill-opacity": "fillOpacity", opacity: "opacity", stroke: "stroke", "stroke-width": "strokeWidth", display: "display", visibility: "visibility", color: "color" };
const START: Paint = { fill: "#000000", rule: "nonzero", fillOpacity: 1, opacity: 1, stroke: "none", strokeWidth: "1", display: "inline", visibility: "visible", color: "#000000" };

function declarations(css: string) {
  const out: Record<string, string> = {};
  for (const d of css.split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
  }
  return out;
}

/** Klassreglerna i <style>, som Illustrator skriver dem (.cls-1{fill:#0e467b}). */
function classRules(root: Node) {
  const rules = new Map<string, Record<string, string>>();
  const visit = (n: Node) => {
    if (n.tag === "style")
      for (const r of n.text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g))
        for (const sel of r[1].split(",")) {
          const cls = /^\s*\.([\w-]+)\s*$/.exec(sel)?.[1];
          if (cls) rules.set(cls, { ...rules.get(cls), ...declarations(r[2]) });
        }
    n.kids.forEach(visit);
  };
  visit(root);
  return rules;
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;

function rectPath(a: Record<string, string>) {
  const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => parseFloat(a[k] ?? "0") || 0);
  if (w <= 0 || h <= 0) return "";
  let rx = parseFloat(a.rx ?? a.ry ?? "0") || 0;
  let ry = parseFloat(a.ry ?? a.rx ?? "0") || 0;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}

const SKIP = new Set(["defs", "symbol", "clipPath", "mask", "pattern", "linearGradient", "radialGradient", "title", "desc", "metadata", "style", "filter", "marker", "font", "font-face"]);

export function flattenSvg(src: string): Flat {
  const root = parseXml(src);
  const rules = classRules(root);
  const byId = new Map<string, Node>();
  const index = (n: Node) => {
    if (n.attrs.id) byId.set(n.attrs.id, n);
    n.kids.forEach(index);
  };
  index(root);
  const shapes: Shape[] = [];
  const issues = new Set<string>();

  const paintOf = (n: Node, parent: Paint): Paint => {
    const p: Paint = { ...START };
    for (const k of INHERITED) (p as Record<string, unknown>)[k] = parent[k];
    const apply = (decl: Record<string, string>) => {
      for (const [k, v] of Object.entries(decl)) {
        const key = PROP[k];
        if (!key || v === "inherit") continue;
        if (key === "fillOpacity" || key === "opacity") p[key] = Math.max(0, Math.min(1, parseFloat(v)));
        else (p as Record<string, unknown>)[key] = v;
      }
    };
    apply(Object.fromEntries(Object.entries(n.attrs).filter(([k]) => k in PROP)));
    for (const cls of (n.attrs.class ?? "").split(/\s+/)) if (rules.has(cls)) apply(rules.get(cls)!);
    if (n.attrs.style) apply(declarations(n.attrs.style));
    p.opacity *= parent.opacity;
    return p;
  };

  const draw = (d: string, m: Matrix, p: Paint) => {
    if (p.visibility === "hidden") return;
    if (p.stroke !== "none" && cssColor(p.stroke) && parseFloat(p.strokeWidth) > 0) issues.add("Streck som inte är konverterade till ytor (Objekt › Bana › Konturlinje)");
    if (p.fill === "none") return;
    let fill = p.fill === "currentColor" ? cssColor(p.color) : cssColor(p.fill);
    if (!fill && /^url\(/.test(p.fill)) {
      issues.add("Övertoning – tryck kräver platta färger");
      const grad = byId.get(/#([^)'"]+)/.exec(p.fill)?.[1] ?? "");
      const stop = grad?.kids.find((k) => k.tag === "stop");
      fill = stop ? cssColor(stop.attrs["stop-color"] ?? declarations(stop.attrs.style ?? "")["stop-color"] ?? "") : null;
    }
    if (!fill) return;
    if (p.opacity * p.fillOpacity < 0.999) issues.add("Genomskinlighet – tryck kräver täckande färger");
    const segs = transformPath(parsePath(d), m);
    if (segs.length) shapes.push({ segs, fill, rule: p.rule === "evenodd" ? "evenodd" : "nonzero" });
  };

  const walk = (n: Node, m: Matrix, parent: Paint, depth: number) => {
    if (depth > 40) return;
    const p = paintOf(n, parent);
    if (p.display === "none") return;
    const mm = n.attrs.transform ? multiply(m, parseTransform(n.attrs.transform)) : m;
    if (n.attrs["clip-path"] && n.attrs["clip-path"] !== "none") issues.add("Klippbana – släpp klippmasker innan export");
    if (n.attrs.mask && n.attrs.mask !== "none") issues.add("Mask – tryck kräver platta ytor");
    switch (n.tag) {
      case "path":
        if (n.attrs.d) draw(n.attrs.d, mm, p);
        return;
      case "rect":
        draw(rectPath(n.attrs), mm, p);
        return;
      case "circle": {
        const r = parseFloat(n.attrs.r ?? "0");
        if (r > 0) draw(ellipsePath(parseFloat(n.attrs.cx ?? "0") || 0, parseFloat(n.attrs.cy ?? "0") || 0, r, r), mm, p);
        return;
      }
      case "ellipse": {
        const [rx, ry] = [parseFloat(n.attrs.rx ?? "0"), parseFloat(n.attrs.ry ?? "0")];
        if (rx > 0 && ry > 0) draw(ellipsePath(parseFloat(n.attrs.cx ?? "0") || 0, parseFloat(n.attrs.cy ?? "0") || 0, rx, ry), mm, p);
        return;
      }
      case "polygon":
      case "polyline": {
        const pts = (n.attrs.points ?? "").match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
        if (pts.length >= 4) draw(`M${pts.slice(0, 2).join(" ")}L${pts.slice(2).join(" ")}Z`, mm, p);
        return;
      }
      case "line":
        if (p.stroke !== "none") issues.add("Streck som inte är konverterade till ytor (Objekt › Bana › Konturlinje)");
        return;
      case "text":
      case "tspan":
      case "textPath":
        if (n.text.trim() || n.kids.length) issues.add("Text som inte är konverterad till konturer (Text › Skapa konturer)");
        return;
      case "image":
        issues.add("Inbäddad bild – tryckfilen måste vara ren vektor");
        return;
      case "use": {
        const ref = byId.get((n.attrs.href ?? n.attrs["xlink:href"] ?? "").replace(/^#/, ""));
        if (!ref) return;
        const at = multiply(mm, [1, 0, 0, 1, parseFloat(n.attrs.x ?? "0") || 0, parseFloat(n.attrs.y ?? "0") || 0]);
        if (ref.tag === "symbol") for (const k of ref.kids) walk(k, at, p, depth + 1);
        else walk(ref, at, p, depth + 1);
        return;
      }
      case "svg": {
        // Ett inre <svg> (som konstlagren i ett ordmärke) har egen ruta och viewBox, centrerad och skalad att rymmas.
        const vb = (n.attrs.viewBox ?? "").split(/[\s,]+/).map(Number);
        const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => parseFloat(n.attrs[k] ?? "") || 0);
        let at = mm;
        if (depth > 0 && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0) {
          const k = Math.min(w / vb[2], h / vb[3]);
          at = multiply(mm, [k, 0, 0, k, x + (w - vb[2] * k) / 2 - vb[0] * k, y + (h - vb[3] * k) / 2 - vb[1] * k]);
        } else if (depth > 0) at = multiply(mm, [1, 0, 0, 1, x, y]);
        for (const k of n.kids) walk(k, at, p, depth + 1);
        return;
      }
      default:
        if (SKIP.has(n.tag)) return;
        for (const k of n.kids) walk(k, mm, p, depth + 1);
    }
  };
  for (const k of root.kids) walk(k, IDENTITY, START, 0);
  let box: Box | null = null;
  for (const s of shapes) box = unionBox(box, pathBounds(s.segs));
  return { shapes, box: box ?? { x: 0, y: 0, w: 0, h: 0 }, issues: [...issues] };
}

/** Färgerna i ritordning, var och en en gång. */
export const colorsOf = (flat: Pick<Flat, "shapes">) => [...new Set(flat.shapes.map((s) => s.fill))];

/** Formerna inom en ruta – som ett av flera märken på samma sida i en PDF. */
export function crop(flat: Flat, area: Box): Flat {
  const inside = (b: Box | null) => b && b.x >= area.x && b.y >= area.y && b.x + b.w <= area.x + area.w && b.y + b.h <= area.y + area.h;
  const shapes = flat.shapes.filter((s) => inside(pathBounds(s.segs)));
  let box: Box | null = null;
  for (const s of shapes) box = unionBox(box, pathBounds(s.segs));
  return { shapes, box: box ?? { x: 0, y: 0, w: 0, h: 0 }, issues: flat.issues };
}

/** Byter färger enligt `map`; null tar bort formen (en utsparing där plagget syns igenom). */
export function recolor(flat: Flat, map: (hex: string) => string | null): Flat {
  return { ...flat, shapes: flat.shapes.flatMap((s) => (map(s.fill) === null ? [] : [{ ...s, fill: map(s.fill)! }])) };
}

/** Normaliserad SVG: bara banor med platt färg, ramad tätt kring formerna. */
export function toSvg(flat: Flat, opts: { widthMm?: number; decimals?: number } = {}) {
  const { x, y, w, h } = flat.box;
  const size = opts.widthMm ? ` width="${opts.widthMm}mm" height="${Number(((opts.widthMm * h) / w).toFixed(2))}mm"` : "";
  const paths = flat.shapes.map((s) => `<path d="${pathString(s.segs, opts.decimals ?? 2)}" fill="${s.fill}"${s.rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[x, y, w, h].map((n) => Number(n.toFixed(2))).join(" ")}"${size}>${paths.join("")}</svg>`;
}
