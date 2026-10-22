import { COLOR_SLOTS, type ColorSlot } from "./schema";

/**
 * Vektorgrafik från en importerad mall släpps bara igenom som enkla former med siffror i attributen och färger som
 * {primary} osv. Allt byggs om från grunden, så inget skript, ingen länk och ingen extern bild kan följa med.
 */

const TAGS = new Set(["g", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?$/i;
const PATH = /^[\d\s.,eE+\-MmLlHhVvCcSsQqTtAaZz]*$/;
const TRANSFORM = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[\d\s.,eE+-]*\)\s*,?)*$/;
const PAINT = new RegExp(`^(?:none|\\{(?:${COLOR_SLOTS.join("|")})\\})$`);
const ATTRS: Record<string, RegExp> = {
  d: PATH,
  points: PATH,
  transform: TRANSFORM,
  fill: PAINT,
  stroke: PAINT,
  "fill-rule": /^(?:nonzero|evenodd)$/,
  "clip-rule": /^(?:nonzero|evenodd)$/,
  "stroke-linejoin": /^(?:miter|round|bevel)$/,
  "stroke-linecap": /^(?:butt|round|square)$/,
  ...Object.fromEntries(["x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-miterlimit"].map((a) => [a, NUMBER])),
};
const MAX = 200_000;

/** Bygger om fragmentet med bara tillåtna element och attribut; null om något annat finns i det. */
export function sanitizeArt(svg: string): string | null {
  if (svg.length > MAX) return null;
  const out: string[] = [];
  const open: string[] = [];
  const re = /<\s*(\/?)\s*([a-zA-Z]+)((?:\s+[a-zA-Z:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)\s*>/g;
  let last = 0;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    if (svg.slice(last, m.index).trim()) return null;
    last = re.lastIndex;
    const [, closing, rawTag, attrs, self] = m;
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) return null;
    if (closing) {
      if (open.pop() !== tag) return null;
      out.push(`</${tag}>`);
      continue;
    }
    const kept: string[] = [];
    for (const a of attrs.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) {
      const [name, value] = [a[1].toLowerCase(), a[2].trim()];
      const rule = ATTRS[name];
      if (!rule) continue;
      if (!rule.test(value)) return null;
      kept.push(`${name}="${value}"`);
    }
    out.push(`<${tag}${kept.length ? ` ${kept.join(" ")}` : ""}${self ? "/" : ""}>`);
    if (!self) open.push(tag);
  }
  if (svg.slice(last).trim() || open.length) return null;
  return out.join("");
}

/** Det renade fragmentet med klubbens färger på platshållarnas plats. */
export function cleanArt(svg: string, colors: Record<ColorSlot, string>) {
  const safe = sanitizeArt(svg);
  return safe ? safe.replace(/\{(primary|secondary|ink|paper|on)\}/g, (_, slot: ColorSlot) => colors[slot]) : null;
}
