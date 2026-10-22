import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Font, parse } from "opentype.js";
import sharp from "sharp";
import { readAsset } from "@/lib/newwave/asset";
import { cleanArt } from "./art";
import { FONTS, fontFor } from "./fonts";
import { monogramFor, nextJubilee, splitName, taglineFor } from "./names";
import type { ColorSlot, Layer, ShapeLayerT, Template, TextLayerT, TextSlot } from "./schema";
import type { WordmarkNames, WordmarkVariant } from "./spec";

/**
 * Ritar en ordmärkesmall för en klubb till ren SVG. Texten blir vektorbanor direkt ur typsnittsfilen, så resultatet
 * ser likadant ut i webbläsaren, i sharp och i tryck – oavsett vilka typsnitt som finns installerade.
 */


/** `names` är klubbens egen namndelning, godkänd i klubbportalen. */
export type WordmarkClub = { id: string; name: string; colors: readonly string[]; logo?: string; logoDark?: string; founded?: number; sports?: readonly string[]; names?: WordmarkNames };
export type WordmarkInput = {
  name1?: string;
  name2?: string;
  team?: string;
  player?: string;
  number?: string;
  icon: boolean;
  ornament: boolean;
  variant: WordmarkVariant;
  worn?: boolean;
  /** Lagren tonar in ett i taget, för webben och sociala medier. */
  animate?: boolean;
};
export type Rendered = { svg: string; width: number; height: number };

type Pt = [number, number];
type Cmd = { t: "M" | "L" | "Q" | "C" | "Z"; p: Pt[] };
type Box = { x0: number; y0: number; x1: number; y1: number };

const EM = 1000;
const FONT_DIR = path.join(process.cwd(), "assets", "fonts", "wordmark");
const fonts = new Map<string, Promise<Font>>();

function loadFont(id: keyof typeof FONTS) {
  let f = fonts.get(id);
  if (!f) {
    f = readFile(path.join(FONT_DIR, FONTS[id].file)).then((buf) => parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
    fonts.set(id, f);
  }
  return f;
}

// --- Geometri ---------------------------------------------------------------

const r2 = (n: number) => Math.round(n * 100) / 100;
const map = (cmds: Cmd[], f: (p: Pt) => Pt): Cmd[] => cmds.map((c) => ({ t: c.t, p: c.p.map(f) }));
const toD = (cmds: Cmd[]) => cmds.map((c) => c.t + c.p.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" ")).join("");

function bboxOf(cmds: Cmd[]): Box | null {
  let b: Box | null = null;
  for (const c of cmds)
    for (const [x, y] of c.p) b = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  return b;
}
const union = (a: Box | null, b: Box | null): Box | null => (!a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const grow = (b: Box | null, by: number): Box | null => (b ? { x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by } : b);

/** Böjer runt en cirkel: x längs baslinjen (centrerad kring 0), y uppåt negativt. Plus = båge, minus = leende. */
function arcWarp(cmds: Cmd[], width: number, deg: number): Cmd[] {
  if (!deg || width <= 0) return cmds;
  const R = width / ((Math.abs(deg) * Math.PI) / 180);
  return map(cmds, ([x, y]) => {
    const a = x / R;
    if (deg > 0) {
      const r = R - y;
      return [r * Math.sin(a), R - r * Math.cos(a)];
    }
    const r = R + y;
    return [r * Math.sin(a), -R + r * Math.cos(a)];
  });
}

function tilt(cmds: Cmd[], rotate = 0, skew = 0): Cmd[] {
  if (!rotate && !skew) return cmds;
  const k = Math.tan((skew * Math.PI) / 180);
  const a = (rotate * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  return map(cmds, ([x, y]) => {
    const sx = x - y * k;
    return [sx * cos - y * sin, sx * sin + y * cos];
  });
}

/** Raka kanter delas upp så att de kan böjas. */
function polygon(points: Pt[], steps = 12): Cmd[] {
  const out: Cmd[] = [{ t: "M", p: [points[0]] }];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    for (let s = 1; s <= steps; s++) out.push({ t: "L", p: [[ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]] });
  }
  out.push({ t: "Z", p: [] });
  return out;
}

function circle(cx: number, cy: number, r: number): Cmd[] {
  const k = 0.5523 * r;
  return [
    { t: "M", p: [[cx + r, cy]] },
    { t: "C", p: [[cx + r, cy + k], [cx + k, cy + r], [cx, cy + r]] },
    { t: "C", p: [[cx - k, cy + r], [cx - r, cy + k], [cx - r, cy]] },
    { t: "C", p: [[cx - r, cy - k], [cx - k, cy - r], [cx, cy - r]] },
    { t: "C", p: [[cx + k, cy - r], [cx + r, cy - k], [cx + r, cy]] },
    { t: "Z", p: [] },
  ];
}

/** Rektangel med helt rundade kortsidor, som kapseln runt lagnamnet på en hjälmtröja. */
function stadium(x: number, y: number, w: number, h: number): Cmd[] {
  const r = Math.min(h, w) / 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 16;
    pts.push([x + w - r + r * Math.cos(a), y + r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 16;
    pts.push([x + r + r * Math.cos(a), y + r + r * Math.sin(a)]);
  }
  return polygon(pts, Math.max(1, Math.round((w - 2 * r) / 40)));
}

/** Ett blad i en lagerkrans: spetsig ellips längs riktningen `dir`. */
function leaf(cx: number, cy: number, len: number, wid: number, dir: number): Cmd[] {
  const [c, s] = [Math.cos(dir), Math.sin(dir)];
  const pts: Pt[] = Array.from({ length: 24 }, (_, i) => {
    const t = (i / 24) * Math.PI * 2;
    const [px, py] = [(len / 2) * Math.cos(t), (wid / 2) * Math.sin(t) * Math.abs(Math.sin(t)) ** 0.15 * (Math.cos(t) > 0 ? 1 - 0.35 * Math.cos(t) : 1)];
    return [cx + px * c - py * s, cy + px * s + py * c];
  });
  return polygon(pts, 1);
}

// --- Färger -----------------------------------------------------------------

const hexRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
const luminance = (hex: string) => {
  const [r, g, b] = hexRgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Klubbens färger anpassade till plagget. Huvudfärgen måste synas tydligt mot tyget; andrafärgen får vara svagare
 * (gult på vitt), men måste skilja sig från huvudfärgen. Annars tar svart eller vitt över. "on" är text på huvudfärgen.
 */
export function paletteFor(colors: readonly string[], variant: WordmarkVariant): Record<ColorSlot, string> {
  const valid = colors.filter((c) => HEX.test(c)).map((c) => c.toUpperCase());
  if (variant === "club") return clubPalette(valid);
  const paper = variant === "dark" ? "#111111" : "#FFFFFF";
  const ink = variant === "dark" ? "#FFFFFF" : "#111111";
  const primary = valid.find((c) => contrast(c, paper) >= 2) ?? ink;
  const secondary = valid.find((c) => c !== primary && contrast(c, paper) >= 1.1 && contrast(c, primary) >= 1.3) ?? neutral(primary, variant);
  const on = contrast("#FFFFFF", primary) >= contrast("#111111", primary) ? "#FFFFFF" : "#111111";
  return { primary, secondary, ink, paper, on };
}

/** Huvudfärgen som bakgrund: bokstäverna i vitt eller svart, andrafärgen bara där den syns mot bakgrunden. */
function clubPalette(valid: string[]): Record<ColorSlot, string> {
  const paper = valid[0] ?? "#111111";
  const ink = contrast("#FFFFFF", paper) >= contrast("#111111", paper) ? "#FFFFFF" : "#111111";
  const secondary = valid.find((c) => c !== paper && contrast(c, paper) >= 1.8) ?? ink;
  return { primary: ink, secondary, ink, paper, on: paper };
}

/** Mörk bakgrund i varianten; klubbvarianten följer huvudfärgen. */
export const isDarkVariant = (colors: readonly string[], variant: WordmarkVariant) => (variant === "club" ? luminance(paletteFor(colors, variant).paper) < 0.4 : variant === "dark");

function neutral(primary: string, variant: WordmarkVariant) {
  const ink = variant === "dark" ? "#FFFFFF" : "#111111";
  return contrast(ink, primary) >= 1.3 ? ink : variant === "dark" ? "#9A9A9A" : "#6F6B63";
}

/** Text måste gå att läsa: en svag andrafärg (gult på vitt) räcker till kontur och ornament men inte till bokstäverna. */
function textFill(colors: Record<ColorSlot, string>, slot: ColorSlot) {
  return slot === "secondary" && contrast(colors.secondary, colors.paper) < 2.5 ? colors.ink : colors[slot];
}

// --- Text -------------------------------------------------------------------

function lineCmds(font: Font, text: string, trackingEm: number) {
  const k = EM / font.unitsPerEm;
  const cmds: Cmd[] = [];
  let x = 0;
  let prev: ReturnType<Font["charToGlyph"]> | null = null;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    if (prev) {
      const kern = font.getKerningValue(prev, g);
      if (Number.isFinite(kern)) x += kern * k;
    }
    for (const c of g.getPath(x, 0, EM).commands) {
      if (c.type === "M" || c.type === "L") cmds.push({ t: c.type, p: [[c.x, c.y]] });
      else if (c.type === "Q") cmds.push({ t: "Q", p: [[c.x1, c.y1], [c.x, c.y]] });
      else if (c.type === "C") cmds.push({ t: "C", p: [[c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]] });
      else cmds.push({ t: "Z", p: [] });
    }
    x += (g.advanceWidth ?? 0) * k + trackingEm * EM;
    prev = g;
  }
  const width = Math.max(0, x - trackingEm * EM);
  return { cmds: map(cmds, ([px, py]) => [px - width / 2, py]), width };
}

function trackingFor(layer: TextLayerT, chars: number) {
  if (!layer.tracking) return 0;
  const [loose, tight] = layer.tracking;
  const t = Math.min(1, Math.max(0, (chars - 4) / 8));
  return loose + (tight - loose) * t;
}

/** Delar namnet i två rader där det blir jämnast. */
function balance(text: string): [string, string] | null {
  const words = text.split(" ");
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  for (let i = 1; i < words.length; i++) {
    const pair: [string, string] = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    if (!best || Math.max(...pair.map((s) => s.length)) < Math.max(...best.map((s) => s.length))) best = pair;
  }
  return best;
}

/** Välver raden med bokstäverna upprätt; x är centrerat kring 0 och baslinjen ligger på 0. */
function warpLine(cmds: Cmd[], width: number, warp: TextLayerT["warp"]): Cmd[] {
  const b = bboxOf(cmds);
  if (!warp?.amount || !b || width <= 0) return cmds;
  const { kind, amount } = warp;
  const mid = b.y0 / 2;
  return map(cmds, ([x, y]) => {
    const u = Math.min(1, Math.abs(x) / (width / 2));
    const k = amount * (1 - u * u);
    if (kind === "bridge") return [x, y * (1 + k)];
    if (kind === "arch") return [x, y + b.y0 * k];
    return [x, mid + (y - mid) * (1 + k)];
  });
}

function setLines(font: Font, lines: string[], layer: TextLayerT, chars: number) {
  const tracking = trackingFor(layer, chars);
  const narrow = layer.condense ?? 1;
  const shaped = lines.map((l) => {
    const line = lineCmds(font, l, tracking);
    const width = line.width * narrow;
    const cmds = narrow === 1 ? line.cmds : map(line.cmds, ([x, y]) => [x * narrow, y]);
    return arcWarp(warpLine(cmds, width, layer.warp), width, (layer.arc ?? 0) * Math.min(1.2, Math.max(0.35, [...l].length / 10)));
  });
  let out: Cmd[] = shaped[0];
  if (shaped.length > 1) {
    const a = bboxOf(shaped[0]);
    const b = bboxOf(shaped[1]);
    if (a && b) out = [...shaped[0], ...map(shaped[1], ([x, y]) => [x, y + (a.y1 - b.y0) + 0.12 * EM])];
  }
  return tilt(out, layer.rotate, layer.skew);
}

/** Skalar och flyttar banorna så att de fyller rutan utan att gå utanför den. */
function fitInto(cmds: Cmd[], box: { x: number; y: number; w: number; h: number }, align: TextLayerT["align"], valign: TextLayerT["valign"]) {
  const b = bboxOf(cmds);
  if (!b) return { cmds, scale: 0 };
  const scale = Math.min(box.w / Math.max(1, b.x1 - b.x0), box.h / Math.max(1, b.y1 - b.y0));
  const w = (b.x1 - b.x0) * scale;
  const left = align === "left" ? box.x : align === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const room = box.h - (b.y1 - b.y0) * scale;
  const top = box.y + (valign === "top" ? 0 : valign === "bottom" ? room : room / 2);
  return { cmds: map(cmds, ([x, y]) => [left + (x - b.x0) * scale, top + (y - b.y0) * scale]), scale };
}

async function textLayer(layer: TextLayerT, text: string) {
  const font = await loadFont(fontFor(layer.font));
  const shown = layer.case === "upper" ? text.toLocaleUpperCase("sv-SE") : layer.case === "lower" ? text.toLocaleLowerCase("sv-SE") : text;
  const chars = [...shown].length;
  let best = fitInto(setLines(font, [shown], layer, chars), layer.box, layer.align, layer.valign);
  const split = layer.maxLines > 1 ? balance(shown) : null;
  if (split) {
    const two = fitInto(setLines(font, split, layer, chars), layer.box, layer.align, layer.valign);
    if (two.scale > best.scale * 1.18) best = two;
  }
  return best.cmds;
}

// --- Former -----------------------------------------------------------------

/** Formen ritad kring baslinjen (x -w/2..w/2, y -h..0), böjd och flyttad in i sin ruta. */
function shapeCmds(layer: ShapeLayerT): { color: number; cmds: Cmd[]; evenodd?: boolean }[] {
  const { w, h } = layer.box;
  const parts: { color: number; cmds: Cmd[]; evenodd?: boolean }[] = [];
  const half = w / 2;
  switch (layer.shape) {
    case "checker": {
      const rows = layer.rows ?? 2;
      const cols = layer.count ?? 11;
      const cw = w / cols;
      const ch = h / rows;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if ((r + c) % 2 === 0) {
            const x = -half + c * cw;
            const y = -h + r * ch;
            parts.push({ color: r, cmds: polygon([[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]], 4) });
          }
      break;
    }
    case "stripes": {
      const n = layer.count ?? 3;
      const sh = h / (2 * n - 1);
      for (let i = 0; i < n; i++) {
        const y = -h + i * 2 * sh;
        parts.push({ color: i, cmds: polygon([[-half, y], [half, y], [half, y + sh], [-half, y + sh]], 24) });
      }
      break;
    }
    case "stars": {
      const n = layer.count ?? 3;
      const r = Math.min(h / 2, w / n / 2.4);
      for (let i = 0; i < n; i++) {
        const cx = n === 1 ? 0 : -half + r + (i * (w - 2 * r)) / (n - 1);
        const pts: Pt[] = Array.from({ length: 10 }, (_, k) => {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 ? r * 0.42 : r;
          return [cx + rr * Math.cos(a), -h / 2 + rr * Math.sin(a)];
        });
        parts.push({ color: i, cmds: polygon(pts, 1) });
      }
      break;
    }
    case "rule": {
      const t = Math.max(2, h * 0.16);
      parts.push({ color: 0, cmds: polygon([[-half, -h / 2 - t / 2], [half, -h / 2 - t / 2], [half, -h / 2 + t / 2], [-half, -h / 2 + t / 2]], 24) });
      break;
    }
    case "diamond":
      parts.push({ color: 0, cmds: polygon([[0, -h], [Math.min(half, h / 2), -h / 2], [0, 0], [-Math.min(half, h / 2), -h / 2]], 1) });
      break;
    case "banner": {
      const n = Math.min(h * 0.38, w * 0.08);
      parts.push({ color: 0, cmds: polygon([[-half, -h], [half, -h], [half - n, -h / 2], [half, 0], [-half, 0], [-half + n, -h / 2]], 16) });
      break;
    }
    case "ring": {
      const r = Math.min(w, h) / 2;
      const t = r * 0.07;
      parts.push({ color: 0, evenodd: true, cmds: [...circle(0, -h / 2, r), ...circle(0, -h / 2, r - t)] });
      if ((layer.count ?? 1) > 1) parts.push({ color: 1, evenodd: true, cmds: [...circle(0, -h / 2, r - t * 2), ...circle(0, -h / 2, r - t * 2.6)] });
      break;
    }
    case "disc":
      parts.push({ color: 0, cmds: circle(0, -h / 2, Math.min(w, h) / 2) });
      break;
    case "swash": {
      const N = 48;
      const top: Pt[] = [];
      const bottom: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = -half + u * w;
        const yc = -h * (0.2 + 0.8 * u * u);
        const th = h * 0.32 * Math.sin(Math.PI * u) ** 0.8;
        top.push([x, yc - th / 2]);
        bottom.push([x, yc + th / 2]);
      }
      parts.push({ color: 0, cmds: polygon([...top, ...bottom.reverse()], 1) });
      break;
    }
    case "pill":
    case "plate": {
      const t = h * 0.085;
      if (layer.shape === "plate") parts.push({ color: 0, cmds: stadium(-half, -h, w, h) });
      else {
        parts.push({ color: 0, evenodd: true, cmds: [...stadium(-half, -h, w, h), ...stadium(-half + t, -h + t, w - 2 * t, h - 2 * t)] });
        if ((layer.rows ?? 1) > 1) parts.push({ color: 1, evenodd: true, cmds: [...stadium(-half + t * 1.9, -h + t * 1.9, w - 3.8 * t, h - 3.8 * t), ...stadium(-half + t * 2.4, -h + t * 2.4, w - 4.8 * t, h - 4.8 * t)] });
      }
      break;
    }
    case "laurel": {
      const n = layer.count ?? 9;
      const R = (Math.min(w, h) / 2) * 0.86;
      const L = R * 0.5;
      for (const side of [1, -1])
        for (let i = 0; i < n; i++) {
          const th = ((22 + (i * 128) / Math.max(1, n - 1)) * Math.PI) / 180;
          const [cx, cy] = [side * R * Math.sin(th), -h / 2 + R * Math.cos(th)];
          const dir = Math.atan2(-Math.sin(th), side * Math.cos(th)) - side * 0.55;
          parts.push({ color: i % 2, cmds: leaf(cx, cy, L, L * 0.42, dir) });
        }
      break;
    }
    case "burst": {
      const n = layer.count ?? 28;
      const r = Math.min(w, h) / 2;
      const pts: Pt[] = Array.from({ length: n * 2 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / n;
        const rr = k % 2 ? r * 0.78 : r;
        return [rr * Math.cos(a), -h / 2 + rr * Math.sin(a)];
      });
      parts.push({ color: 0, cmds: polygon(pts, 1) });
      break;
    }
    case "pennant": {
      const band = w * 0.13;
      parts.push({ color: 0, cmds: polygon([[-half + band, -h], [half, -h * 0.5], [-half + band, 0]], 16) });
      parts.push({ color: 1, cmds: polygon([[-half, -h], [-half + band * 0.82, -h], [-half + band * 0.82, 0], [-half, 0]], 8) });
      break;
    }
    case "tail": {
      const N = 64;
      const top: Pt[] = [];
      const bottom: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = -half + u * w;
        const hook = Math.max(0, (u - 0.86) / 0.14) ** 2;
        const yc = -h * (0.28 + 0.26 * u + 0.42 * hook);
        const grow = Math.min(1, u / 0.3) ** 0.7;
        const fade = 1 - Math.max(0, (u - 0.8) / 0.2) ** 1.3;
        const th = h * 0.44 * grow * fade;
        top.push([x, yc - th / 2]);
        bottom.push([x, yc + th / 2]);
      }
      parts.push({ color: 0, cmds: polygon([...top, ...bottom.reverse()], 1) });
      break;
    }
    case "bars": {
      const thick = h * 0.58;
      const thin = h * 0.18;
      parts.push({ color: 0, cmds: polygon([[-half, -h], [half, -h], [half, -h + thick], [-half, -h + thick]], 24) });
      parts.push({ color: 1, cmds: polygon([[-half, -thin], [half, -thin], [half, 0], [-half, 0]], 24) });
      break;
    }
    case "shield":
      parts.push({
        color: 0,
        cmds: [
          { t: "M", p: [[-half, -h]] },
          { t: "L", p: [[half, -h]] },
          { t: "L", p: [[half, -h * 0.42]] },
          { t: "Q", p: [[half, -h * 0.08], [0, 0]] },
          { t: "Q", p: [[-half, -h * 0.08], [-half, -h * 0.42]] },
          { t: "Z", p: [] },
        ],
      });
      break;
  }
  const flat = ["ring", "disc", "shield", "laurel", "burst"].includes(layer.shape);
  return parts.map((part) => {
    const bent = flat ? part.cmds : arcWarp(part.cmds, w, layer.arc ?? 0);
    const turned = tilt(bent, layer.rotate, layer.skew);
    return { ...part, cmds: map(turned, ([x, y]) => [x + layer.box.x + half, y + layer.box.y + h]) };
  });
}

// --- Märket -----------------------------------------------------------------

async function crestImage(club: WordmarkClub, dark: boolean) {
  const url = (dark && club.logoDark) || club.logo;
  const raw = url ? await readAsset(url) : null;
  if (!raw) return null;
  const png = await sharp(raw).trim().resize(900, 900, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const meta = await sharp(png).metadata();
  return { href: `data:image/png;base64,${png.toString("base64")}`, w: meta.width ?? 1, h: meta.height ?? 1 };
}

// --- Slitet tryck ------------------------------------------------------------

/**
 * Nött vintagetryck: grovt brus ger blekta fläckar och fint brus sprickor i färgen. Bruset ligger i mallens
 * enheter, så slitaget ser likadant ut i en tumnagel och i tryckfilen.
 */
function wornFilter(id: string, [x, y, w, h]: number[]) {
  const gray = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1";
  return (
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="3" seed="3"/><feColorMatrix type="matrix" values="${gray}" result="patches"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="8"/><feColorMatrix type="matrix" values="${gray}" result="cracks"/>` +
    `<feComposite in="patches" in2="cracks" operator="arithmetic" k2="0.65" k3="0.5"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -14 0 0 0 10.2" result="ink"/>` +
    `<feComposite in="SourceGraphic" in2="ink" operator="in"/></filter>`
  );
}

// --- Hela märket ------------------------------------------------------------

export function textsFor(club: WordmarkClub, input: Pick<WordmarkInput, "name1" | "name2" | "team" | "player" | "number">, now = new Date().getFullYear()): Record<TextSlot, string> {
  const split = splitName(club.name);
  const own = input.name1 ?? input.name2 ?? club.names?.name1 ?? club.names?.name2;
  const parts = { name1: input.name1 ?? club.names?.name1 ?? split.name1, name2: input.name2 ?? club.names?.name2 ?? split.name2 };
  // Monogrammet läses i namnets ordning: rättade namn följer klubbens, så att "IF" + "Åsa" blir ÅIF och inte IFÅ.
  const typeFirst = Boolean(split.name1) && club.name.trim().toUpperCase().startsWith(split.name1.toUpperCase());
  const spoken = own === undefined ? club.name : typeFirst ? `${parts.name1} ${parts.name2}` : `${parts.name2} ${parts.name1}`;
  const year = club.founded ? String(club.founded) : "";
  const jubilee = club.founded ? nextJubilee(club.founded, now) : null;
  return {
    ...parts,
    tagline: taglineFor(club),
    monogram: monogramFor(parts, spoken),
    sport: input.team ?? club.sports?.[0] ?? "",
    est: year && "Est.",
    year,
    player: input.player ?? "Namn",
    number: input.number ?? "10",
    jubilee: jubilee ? `${jubilee.years} år` : "",
    span: jubilee ? `${year}–${jubilee.year}` : "",
  };
}

/** Mallen kräver text som klubben saknar, t.ex. jubileum utan grundandeår. */
export const lacksText = (template: Pick<Template, "needs">, texts: Record<TextSlot, string>) => (template.needs ?? []).some((slot) => !texts[slot].trim());

export async function renderWordmark(template: Template, club: WordmarkClub, input: WordmarkInput): Promise<Rendered> {
  const colors = paletteFor(club.colors, input.variant);
  const texts = textsFor(club, input);
  const crest = input.icon && template.layers.some((l) => l.kind === "icon") ? await crestImage(club, isDarkVariant(club.colors, input.variant)) : null;
  const out: string[] = [];
  const defs: string[] = [];
  let box: Box | null = null;

  for (const layer of template.layers as Layer[]) {
    const parts: string[] = [];
    if (layer.kind === "text") {
      const text = texts[layer.slot].trim();
      if (!text) continue;
      const cmds = await textLayer(layer, text);
      const b = bboxOf(cmds);
      const id = `t${defs.length}`;
      defs.push(`<path id="${id}" d="${toD(cmds)}"/>`);
      const copy = (fill: string, stroke: number, dx = 0, dy = 0) =>
        `<use href="#${id}" fill="${fill}"${stroke ? ` stroke="${fill}" stroke-width="${r2(stroke * 2)}" stroke-linejoin="round"` : ""}${dx || dy ? ` transform="translate(${r2(dx)} ${r2(dy)})"` : ""}/>`;
      const outlines = layer.outline ? [layer.outline].flat() : [];
      const total = outlines.reduce((sum, o) => sum + o.width, 0);
      if (layer.shadow) {
        const { color, dx, dy, solid } = layer.shadow;
        const steps = solid ? Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2.5)) : 1;
        for (let i = steps; i >= 1; i--) parts.push(copy(colors[color], total, (dx * i) / steps, (dy * i) / steps));
        const g = grow(b, total);
        box = union(box, g && { x0: g.x0 + Math.min(0, dx), y0: g.y0 + Math.min(0, dy), x1: g.x1 + Math.max(0, dx), y1: g.y1 + Math.max(0, dy) });
      }
      let width = total;
      for (const o of [...outlines].reverse()) {
        parts.push(copy(o.color === layer.color ? textFill(colors, o.color) : colors[o.color], width));
        width -= o.width;
      }
      parts.push(copy(textFill(colors, layer.color), 0));
      box = union(box, grow(b, total));
    } else if (layer.kind === "shape") {
      if (!input.ornament) continue;
      for (const part of shapeCmds(layer)) {
        parts.push(`<path d="${toD(part.cmds)}" fill="${colors[layer.colors[part.color % layer.colors.length]]}"${part.evenodd ? ' fill-rule="evenodd"' : ""}/>`);
        box = union(box, bboxOf(part.cmds));
      }
    } else if (layer.kind === "icon") {
      if (!crest) continue;
      const s = Math.min(layer.box.w / crest.w, layer.box.h / crest.h);
      const [w, h] = [crest.w * s, crest.h * s];
      const [x, y] = [layer.box.x + (layer.box.w - w) / 2, layer.box.y + (layer.box.h - h) / 2];
      parts.push(`<image href="${crest.href}" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" preserveAspectRatio="xMidYMid meet"/>`);
      box = union(box, { x0: x, y0: y, x1: x + w, y1: y + h });
    } else if (layer.kind === "art") {
      if (!input.ornament) continue;
      const art = cleanArt(layer.svg, colors);
      if (!art) continue;
      const [vx, vy, vw, vh] = layer.viewBox;
      parts.push(`<svg x="${layer.box.x}" y="${layer.box.y}" width="${layer.box.w}" height="${layer.box.h}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" overflow="visible">${art}</svg>`);
      box = union(box, { x0: layer.box.x, y0: layer.box.y, x1: layer.box.x + layer.box.w, y1: layer.box.y + layer.box.h });
    }
    if (parts.length) out.push(parts.join(""));
  }

  const b = box ?? { x0: 0, y0: 0, x1: 1000, y1: template.height };
  const pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.03;
  const [vx, vy, vw, vh] = [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2];
  if (input.worn) defs.push(wornFilter("worn", [vx, vy, vw, vh]));
  const layers = input.animate ? out.map((o, i) => `<g class="nw-in" style="animation-delay:${(0.15 + i * 0.16).toFixed(2)}s">${o}</g>`).join("") : out.join("");
  const style = input.animate
    ? `<style>@keyframes nw-in{from{opacity:0;transform:translateY(${r2(vh * 0.05)}px) scale(.96)}to{opacity:1;transform:none}}.nw-in{animation:nw-in .75s cubic-bezier(.2,.7,.2,1) both;transform-box:fill-box;transform-origin:center}@media (prefers-reduced-motion:reduce){.nw-in{animation:none}}</style>`
    : "";
  const body = style + (defs.length ? `<defs>${defs.join("")}</defs>` : "") + (input.worn ? `<g filter="url(#worn)">${layers}</g>` : layers);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(vx)} ${r2(vy)} ${r2(vw)} ${r2(vh)}" width="${r2(vw)}" height="${r2(vh)}">${body}</svg>`,
    width: vw,
    height: vh,
  };
}

/** PNG med transparent bakgrund, `size` pixlar på längsta sidan. */
export async function wordmarkPng(r: Rendered, size: number) {
  const scale = size / Math.max(r.width, r.height);
  const svg = r.svg.replace(/ width="[^"]+" height="[^"]+">/, ` width="${Math.round(r.width * scale)}" height="${Math.round(r.height * scale)}">`);
  return sharp(Buffer.from(svg), { limitInputPixels: 80_000_000 }).png({ compressionLevel: 8 }).toBuffer();
}
