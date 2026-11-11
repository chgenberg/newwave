import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Font, parse } from "opentype.js";
import sharp, { type OverlayOptions } from "sharp";
import { MIN_TEXT_MM, ROW_H_MM, SCARF, STITCH_W_MM, deltaE, hexToRgb, type Rgb } from "./scarf";
import { ASPECT, BITMAPS, FONT_FILES, ICON_BOX, ICONS, L_MM, W_MM, bandRows, type Content, type Face, type Fill, type FontKey, type NordicBand, type ScarfDesign, type Section, type Stripe, type TextStyle, type Yarn } from "./scarfDesign";

/**
 * Stickmotorn: gör om en design till maskor för OPEK 365.
 *
 * Mönster (ränder, rutor, bårder, toning) räknas ut direkt per maska, så att de blir exakta.
 * Text, ikoner och sköld ritas som vektorer i millimeter, rastreras fyra gånger tätare än maskorna och
 * varje maska får den färg som flest av dess sexton provpunkter har – inga blandfärger från kantutjämning.
 */

const ROWS = SCARF.rows;
const SIDE = SCARF.side;
const NEEDLES = SCARF.needles;
const SS = 4;
const PX_X = (ROWS * SS) / L_MM;
const PX_Y = (SIDE * SS) / W_MM;

export type KnitAssets = { crest?: Buffer | null; portrait?: Buffer | null; art?: Buffer | null };
export type FaceKnit = { cells: Uint8Array; protect: Uint8Array; texts: number[]; margins: number[] };
export type Knitted = {
  /** 240 × 1210 maskor, rad för rad som maskinen stickar dem. */
  cells: Uint8Array;
  /** Maskor som hör till ett avsiktligt raster (bård, toning, porträtt) och inte räknas som lösa maskor. */
  protect: Uint8Array;
  palette: string[];
  faces: [FaceKnit, FaceKnit];
  minTextMm: number | null;
  /** Minsta avståndet i mm mellan text eller sköld och en långsida. */
  minMarginMm: number | null;
  backReads: "hold-up" | "turn-over";
};

// --- Typsnitt ----------------------------------------------------------------

const FONT_DIR = path.join(process.cwd(), "assets", "fonts", "wordmark");
const fonts = new Map<FontKey, Promise<Font>>();
function loadFont(key: FontKey) {
  let f = fonts.get(key);
  if (!f) {
    f = readFile(path.join(FONT_DIR, FONT_FILES[key])).then((buf) => parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
    f.catch(() => fonts.delete(key));
    fonts.set(key, f);
  }
  return f;
}

// --- Fyllningar --------------------------------------------------------------

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function stripeAt(stripes: Stripe[], t: number) {
  const total = stripes.reduce((n, s) => n + s.mm, 0) || 1;
  let u = ((t % total) + total) % total;
  for (const s of stripes) {
    if (u < s.mm) return s.yarn;
    u -= s.mm;
  }
  return stripes[stripes.length - 1].yarn;
}

const frac = (n: number) => n - Math.floor(n);
const bit = (rows: readonly string[], j: number, i: number) => rows[j]?.[i] === "#";

type Cell = { yarn: Yarn; pattern: boolean };
/** `xl` och `rl` är mm och maskrader från sektionens start, `y` och `s` mm och maska från halsdukens övre långsida. */
type FillFn = (xl: number, y: number, rl: number, s: number) => Cell;

/** Hur många motiv som ryms tvärs över, och var det första börjar. */
function across(h: number, gap: number) {
  const n = Math.max(1, Math.floor((SIDE + gap) / (h + gap)));
  return { period: h + gap, offset: Math.floor((SIDE - (n * h + (n - 1) * gap)) / 2), span: n * h + (n - 1) * gap };
}

function nordicFn(ground: Yarn, bands: NordicBand[]): FillFn {
  const plan = bands.map((b) => {
    if ("line" in b) return { rows: bandRows(b), at: () => b.line };
    if ("space" in b) return { rows: bandRows(b), at: () => ground };
    const art = BITMAPS[b.bitmap];
    const [h, w] = [art.length, art[0].length];
    const pad = b.pad ?? 2;
    const continuous = b.bitmap === "sicksack";
    const a = across(h, continuous ? 0 : 3);
    return {
      rows: bandRows(b),
      at: (rl: number, s: number) => {
        const i = Math.floor(rl / ASPECT) - pad;
        const sy = continuous ? s : s - a.offset;
        if (i < 0 || i >= w || sy < 0 || (!continuous && sy >= a.span)) return ground;
        return bit(art, sy % a.period, i) ? b.yarn : ground;
      },
    };
  });
  const total = plan.reduce((n, p) => n + p.rows, 0) || 1;
  return (_xl, _y, rl, s) => {
    let u = ((rl % total) + total) % total;
    for (const p of plan) {
      if (u < p.rows) return { yarn: p.at(u, s), pattern: true };
      u -= p.rows;
    }
    return { yarn: ground, pattern: true };
  };
}

function fillFn(fill: Fill, lengthMm: number): FillFn {
  const flat = (yarn: Yarn): Cell => ({ yarn, pattern: false });
  switch (fill.kind) {
    case "solid":
      return () => flat(fill.yarn);
    case "bars":
      return (xl) => flat(stripeAt(fill.stripes, xl));
    case "hoops":
      return (_xl, y) => flat(stripeAt(fill.stripes, y));
    case "diagonal":
      return (xl, y) => flat(stripeAt(fill.stripes, (xl + (fill.dir ?? 1) * y) * Math.SQRT1_2));
    case "chevron":
      return (xl, y) => flat(stripeAt(fill.stripes, xl + (fill.dir ?? 1) * Math.abs(y - W_MM / 2)));
    case "zigzag":
      return (xl, y) => flat(stripeAt(fill.stripes, y + fill.ampMm * (Math.abs(frac(xl / fill.waveMm) - 0.5) * 4 - 1)));
    case "waves":
      return (xl, y) => flat(stripeAt(fill.stripes, y + fill.ampMm * Math.sin((Math.PI * 2 * xl) / fill.waveMm)));
    case "checker":
      return (xl, y) => flat(fill.yarns[(Math.floor(xl / fill.mm) + Math.floor(y / fill.mm)) & 1]);
    case "diamonds": {
      const half = 1.7 * Math.hypot(1 / fill.wMm, 1 / fill.hMm);
      return (xl, y) => {
        const yc = y - W_MM / 2;
        const [u, v] = [xl / fill.wMm + yc / fill.hMm, xl / fill.wMm - yc / fill.hMm];
        if (fill.line !== undefined && (Math.abs(frac(u) - 0.5) < half || Math.abs(frac(v) - 0.5) < half)) return flat(fill.line);
        return flat(fill.yarns[(Math.floor(u) + Math.floor(v)) & 1]);
      };
    }
    case "fade":
      return (xl, _y, rl, s) => {
        const t = Math.max(0, Math.min(1, xl / lengthMm));
        const eased = t * t * (3 - 2 * t);
        return { yarn: BAYER[rl & 7][s & 7] < Math.round(eased * 64) ? fill.to : fill.from, pattern: true };
      };
    case "tile": {
      const art = BITMAPS[fill.bitmap];
      const [h, w] = [art.length, art[0].length];
      const gap = fill.gap ?? Math.max(3, Math.round(h * 0.7));
      const a = across(h, gap);
      const periodX = w + gap;
      return (_xl, _y, rl, s) => {
        const px = Math.floor(rl / ASPECT);
        const col = Math.floor(px / periodX);
        const sy = s - a.offset + (fill.brick && col & 1 ? Math.floor(a.period / 2) : 0);
        const j = ((sy % a.period) + a.period) % a.period;
        return { yarn: bit(art, j, px % periodX) ? fill.yarn : fill.ground, pattern: true };
      };
    }
    case "nordic":
      return nordicFn(fill.ground, fill.bands);
  }
}

// --- Sektioner ---------------------------------------------------------------

type Placed = { sec: Section; x0: number; x1: number; r0: number; r1: number };

function layout(face: Face): Placed[] {
  const fixed = face.sections.reduce((n, s) => n + (s.mm ?? 0), 0);
  const flex = face.sections.reduce((n, s) => n + (s.mm === undefined ? (s.flex ?? 1) : 0), 0);
  const unit = flex ? Math.max(0, L_MM - fixed) / flex : 0;
  const scale = flex ? 1 : L_MM / (fixed || 1);
  let x = 0;
  return face.sections.map((sec, i) => {
    const w = sec.mm === undefined ? (sec.flex ?? 1) * unit : sec.mm * scale;
    const r0 = Math.round(x / ROW_H_MM);
    x += w;
    const r1 = i === face.sections.length - 1 ? ROWS : Math.min(ROWS, Math.round(x / ROW_H_MM));
    return { sec, x0: r0 * ROW_H_MM, x1: r1 * ROW_H_MM, r0, r1 };
  });
}

// --- Text som kurvor ---------------------------------------------------------

type Box = { x: number; y: number; w: number; h: number };
type Line = { d: string; marks: string; x0: number; y0: number; x1: number; y1: number; cap: number };

const esc = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * En rad som kurvor i typsnittets enheter (1000 per em), baslinjen på y = 0.
 * Versala Å, Ä och Ö ritas som A och O med egna prickar och ring: tunga rubriktypsnitt lägger annars
 * prickarna så tätt mot bokstaven att de försvinner i stickningen. `min` är minsta mått i enheter.
 */
function lineShape(font: Font, raw: string, min: { gap: number; dot: number; hole: number }): Line {
  const text = raw.trim();
  const custom = /[ÅÄÖ]/.test(text) && text === text.toLocaleUpperCase("sv-SE");
  const base = custom ? text.replace(/[ÅÄ]/g, "A").replace(/Ö/g, "O") : text;
  const p = font.getPath(base, 0, 0, 1000);
  const bb = p.getBoundingBox();
  const cap = -font.getPath("H", 0, 0, 1000).getBoundingBox().y1 || 700;
  let [x0, y0, x1] = [bb.x1, bb.y1, bb.x2];
  const y1 = bb.y2;
  let marks = "";
  if (custom) {
    const gap = Math.max(cap * 0.085, min.gap);
    const dotH = Math.max(cap * 0.16, min.dot);
    const dotW = Math.max(cap * 0.15, min.dot);
    const ring = Math.max(cap * 0.11, min.dot * 0.62);
    const top = -cap - gap;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch !== "Å" && ch !== "Ä" && ch !== "Ö") continue;
      const left = font.getAdvanceWidth(base.slice(0, i), 1000);
      const cw = font.getAdvanceWidth(base.slice(0, i + 1), 1000) - left;
      const mid = left + cw / 2;
      if (ch === "Å") {
        const cy = top - ring;
        marks += `M${esc(mid - ring)} ${esc(cy)}A${esc(ring)} ${esc(ring)} 0 1 0 ${esc(mid + ring)} ${esc(cy)}A${esc(ring)} ${esc(ring)} 0 1 0 ${esc(mid - ring)} ${esc(cy)}Z`;
        // Stor ring får ett hål, ritat åt andra hållet; en liten stickas som en fylld prick.
        const hole = ring * 0.46;
        if (hole >= min.hole) marks += `M${esc(mid - hole)} ${esc(cy)}A${esc(hole)} ${esc(hole)} 0 1 1 ${esc(mid + hole)} ${esc(cy)}A${esc(hole)} ${esc(hole)} 0 1 1 ${esc(mid - hole)} ${esc(cy)}Z`;
        y0 = Math.min(y0, cy - ring);
      } else {
        const sep = Math.max(dotW * 1.9, cw * 0.36);
        for (const cx of [mid - sep / 2, mid + sep / 2]) marks += `M${esc(cx - dotW / 2)} ${esc(top - dotH)}H${esc(cx + dotW / 2)}V${esc(top)}H${esc(cx - dotW / 2)}Z`;
        y0 = Math.min(y0, top - dotH);
        x0 = Math.min(x0, mid - sep / 2 - dotW / 2);
        x1 = Math.max(x1, mid + sep / 2 + dotW / 2);
      }
    }
  }
  return { d: p.toPathData(1), marks, x0, y0, x1, y1, cap };
}

/** Passar in en rad i rutan och ger SVG samt versalhöjden i mm. Med `cap` får raden exakt den versalhöjden, centrerad på versalerna. */
function fitLine(font: Font, text: string, style: TextStyle, box: Box, palette: string[], cap?: number): { svg: string; capMm: number; top: number; bottom: number } {
  const outline = style.outline === undefined ? 0 : 3.4;
  const inner = { x: box.x + outline, y: box.y + outline, w: Math.max(1, box.w - outline * 2), h: Math.max(1, box.h - outline * 2) };
  let line = lineShape(font, text, { gap: 0, dot: 0, hole: Infinity });
  let sx = 1;
  let sy = 1;
  let shadow = 0;
  for (let pass = 0; pass < 3; pass++) {
    const [bw, bh] = [line.x1 - line.x0 || 1, line.y1 - line.y0 || 1];
    sy = cap ? Math.min(cap / line.cap, inner.w / bw) : Math.min((inner.h - shadow) / bh, (inner.w - shadow) / bw);
    sx = style.stretch ? Math.min((inner.w - shadow) / bw, sy * 1.25) : sy;
    shadow = style.shadow === undefined ? 0 : Math.max(3.2, line.cap * sy * 0.07);
    // Prickar minst två maskor, luften under dem minst en och en halv.
    line = lineShape(font, text, { gap: 2.4 / sy, dot: 3.4 / sy, hole: 2.6 / sy });
  }
  const [bw, bh] = [line.x1 - line.x0, line.y1 - line.y0];
  const tx = inner.x + (inner.w - shadow - bw * sx) / 2 - line.x0 * sx;
  const ty = cap ? inner.y + (inner.h + line.cap * sy) / 2 : inner.y + (inner.h - shadow - bh * sy) / 2 - line.y0 * sy;
  const d = line.d + line.marks;
  const at = (dx: number, dy: number) => `transform="translate(${esc(tx + dx)} ${esc(ty + dy)}) scale(${sx.toFixed(6)} ${sy.toFixed(6)})"`;
  let svg = "";
  if (style.shadow !== undefined) svg += `<path d="${d}" fill="${palette[style.shadow]}" ${at(shadow, shadow)}/>`;
  if (style.outline !== undefined)
    svg += `<path d="${d}" fill="${palette[style.outline]}" stroke="${palette[style.outline]}" stroke-width="${esc((outline * 2) / sy)}" stroke-linejoin="round" ${at(0, 0)}/>`;
  svg += `<path d="${d}" fill="${palette[style.yarn]}" ${at(0, 0)}/>`;
  return { svg, capMm: line.cap * sy, top: ty + line.y0 * sy - outline, bottom: ty + line.y1 * sy + outline + shadow };
}

// --- Innehåll ----------------------------------------------------------------

type Overlay = { svg: string[]; rasters: OverlayOptions[]; texts: number[]; margins: number[]; direct: ((face: FaceKnit) => void)[] };

function nearest(palette: Rgb[], allowed: number[], r: number, g: number, b: number) {
  let best = allowed[0];
  let bestD = Infinity;
  for (const i of allowed) {
    const p = palette[i];
    const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/**
 * Lägger en bild (sköld eller ritat motiv) i rutan, reducerad till de tillåtna garnerna.
 * Har bildens ytterkant samma färg som bottnen under den (`ground`) läggs en platta i `plate` bakom, så att formen syns.
 */
async function placeImage(image: Buffer, box: Box, palette: string[], yarns: Yarn[] | undefined, out: Overlay, plate?: { yarn: Yarn; ground: Yarn[] }) {
  const trimmed = await sharp(image).trim({ threshold: 8 }).png().toBuffer().catch(() => image);
  const meta = await sharp(trimmed).metadata();
  const ar = (meta.width || 1) / (meta.height || 1);
  const rgb = palette.map(hexToRgb);
  const allowed = yarns?.length ? yarns : rgb.map((_, i) => i);

  const render = async (b: Box) => {
    const [w, h] = ar > b.w / b.h ? [b.w, b.w / ar] : [b.h * ar, b.h];
    const [pw, ph] = [Math.max(4, Math.round(w * PX_X)), Math.max(4, Math.round(h * PX_Y))];
    const { data } = await sharp(trimmed).ensureAlpha().resize(pw, ph, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const idx = new Int16Array(pw * ph).fill(-1);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) {
        data[i + 3] = 0;
        continue;
      }
      const v = nearest(rgb, allowed, data[i], data[i + 1], data[i + 2]);
      idx[i / 4] = v;
      data.set(rgb[v], i);
      data[i + 3] = 255;
    }
    return { data, idx, w, h, pw, ph };
  };

  let r = await render(box);
  if (plate && plate.ground.length) {
    // Vilket garn dominerar längs bildens ytterkant?
    const edge = new Array<number>(palette.length).fill(0);
    let total = 0;
    for (let y = 0; y < r.ph; y++) {
      for (let x = 0; x < r.pw; x++) {
        const v = r.idx[y * r.pw + x];
        if (v < 0) continue;
        const open = x === 0 || y === 0 || x === r.pw - 1 || y === r.ph - 1 || r.idx[y * r.pw + x - 1] < 0 || r.idx[y * r.pw + x + 1] < 0 || r.idx[(y - 1) * r.pw + x] < 0 || r.idx[(y + 1) * r.pw + x] < 0;
        if (open) {
          edge[v]++;
          total++;
        }
      }
    }
    // Samma garn som bottnen, eller ett som ligger så nära att kanten ändå försvinner (två röda nyanser).
    const lost = edge.reduce((n, count, v) => (plate.ground.some((g) => v === g || deltaE(palette[v], palette[g]) < 25) ? n + count : n), 0);
    if (lost > total * 0.45) {
      const m = Math.min(9, box.h * 0.06);
      const inner = { x: box.x + m, y: box.y + m, w: box.w - m * 2, h: box.h - m * 2 };
      r = await render(inner);
      const [px, py] = [box.x + (box.w - r.w) / 2 - m, box.y + (box.h - r.h) / 2 - m];
      out.svg.push(`<rect x="${esc(px)}" y="${esc(py)}" width="${esc(r.w + m * 2)}" height="${esc(r.h + m * 2)}" rx="${esc(Math.min(r.w, r.h) / 2 + m)}" fill="${palette[plate.yarn]}"/>`);
    }
  }
  const y = box.y + (box.h - r.h) / 2;
  out.margins.push(y, W_MM - y - r.h);
  out.rasters.push({
    input: await sharp(r.data, { raw: { width: r.pw, height: r.ph, channels: 4 } }).png().toBuffer(),
    left: Math.round((box.x + (box.w - r.w) / 2) * PX_X),
    top: Math.round(y * PX_Y),
  });
}

/** Fotot stickat i gråskala med felspridning, i en oval ram. */
function portraitInto(grey: Buffer, w: number, h: number, r0: number, s0: number, palette: string[], yarns: Yarn[], frame: Yarn) {
  const ramp = yarns
    .map((idx) => {
      const [r, g, b] = hexToRgb(palette[idx]);
      return { idx, lum: r * 0.299 + g * 0.587 + b * 0.114 };
    })
    .sort((a, b) => a.lum - b.lum);
  const sorted = Array.from(grey).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.04)] ?? 0;
  const hi = Math.max(lo + 1, sorted[Math.floor(sorted.length * 0.96)] ?? 255);
  const [minL, maxL] = [ramp[0].lum, ramp[ramp.length - 1].lum];
  const buf = new Float32Array(w * h);
  for (let i = 0; i < buf.length; i++) {
    const t = Math.max(0, Math.min(1, (grey[i] - lo) / (hi - lo)));
    buf[i] = minL + Math.pow(t * t * (3 - 2 * t), 0.9) * (maxL - minL);
  }
  return (face: FaceKnit) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dist = ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2;
        if (dist > 1) continue;
        const at = (r0 + x) * SIDE + s0 + y;
        if (dist > 0.88) {
          face.cells[at] = frame;
          face.protect[at] = 0;
          continue;
        }
        const k = y * w + x;
        let best = ramp[0];
        for (const t of ramp) if (Math.abs(buf[k] - t.lum) < Math.abs(buf[k] - best.lum)) best = t;
        face.cells[at] = best.idx;
        face.protect[at] = 1;
        const err = (buf[k] - best.lum) * 0.85;
        if (x + 1 < w) buf[k + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) buf[k + w - 1] += (err * 3) / 16;
          buf[k + w] += (err * 5) / 16;
          if (x + 1 < w) buf[k + w + 1] += (err * 1) / 16;
        }
      }
    }
  };
}

async function addContent(c: Content, box: Box, palette: string[], assets: KnitAssets, out: Overlay, ground: Yarn[], caps?: Map<string, number>) {
  switch (c.kind) {
    case "text": {
      const font = await loadFont(c.font);
      const lines = c.lines.map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      // Roterad text passas in i en liggande ruta runt origo och vrids sedan ett kvarts varv.
      const b: Box = c.rotate ? { x: -box.h / 2, y: -box.w / 2, w: box.h, h: box.w } : box;
      const gap = lines.length > 1 ? Math.min(14, b.h * 0.09) : 0;
      const subH = lines.length > 1 ? b.h * (c.sub ?? 0.26) : 0;
      const mainH = b.h - (lines.length - 1) * (subH + gap);
      let y = b.y;
      const parts: string[] = [];
      let [top, bottom] = [Infinity, -Infinity];
      lines.forEach((text, i) => {
        const h = i === 0 ? mainH : subH;
        const fit = fitLine(font, text, i === 0 ? c : { ...c, stretch: false, shadow: undefined }, { x: i === 0 ? b.x : b.x + b.w * 0.06, y, w: i === 0 ? b.w : b.w * 0.88, h }, palette, i === 0 && c.group ? caps?.get(c.group) : undefined);
        parts.push(fit.svg);
        out.texts.push(fit.capMm);
        [top, bottom] = [Math.min(top, fit.top), Math.max(bottom, fit.bottom)];
        y += h + gap;
      });
      if (c.rotate) {
        out.svg.push(`<g transform="translate(${esc(box.x + box.w / 2)} ${esc(box.y + box.h / 2)}) rotate(-90)">${parts.join("")}</g>`);
        out.margins.push(box.y, W_MM - box.y - box.h);
      } else {
        // Glesa rader centreras tillsammans i höjdled.
        const shift = (b.y + b.h - bottom - (top - b.y)) / 2;
        out.svg.push(`<g transform="translate(0 ${esc(shift)})">${parts.join("")}</g>`);
        out.margins.push(top + shift, W_MM - bottom - shift);
      }
      return;
    }
    case "icon": {
      const n = Math.max(1, c.count ?? 1);
      const [iw, ih] = ICON_BOX[c.icon] ?? [100, 100];
      const k = Math.min(box.h / ih, box.w / n / iw);
      const [w, h] = [iw * k, ih * k];
      const gap = n > 1 ? Math.min(w * 0.3, (box.w - w * n) / (n - 1)) : 0;
      const x0 = box.x + (box.w - (w * n + gap * (n - 1))) / 2;
      const y0 = box.y + (box.h - h) / 2;
      for (let i = 0; i < n; i++) {
        const t = `transform="translate(${esc(x0 + i * (w + gap))} ${esc(y0)}) scale(${k.toFixed(5)})"`;
        if (c.outline !== undefined) out.svg.push(`<path d="${ICONS[c.icon]}" fill="${palette[c.outline]}" stroke="${palette[c.outline]}" stroke-width="${esc(6.8 / k)}" stroke-linejoin="round" ${t}/>`);
        out.svg.push(`<path d="${ICONS[c.icon]}" fill="${palette[c.yarn]}" fill-rule="evenodd" ${t}/>`);
      }
      out.margins.push(y0, W_MM - y0 - h);
      return;
    }
    case "crest":
      if (assets.crest) await placeImage(assets.crest, box, palette, c.yarns, out, c.plate === undefined ? undefined : { yarn: c.plate, ground });
      return;
    case "art":
      if (assets.art) await placeImage(assets.art, box, palette, c.yarns, out);
      return;
    case "roster": {
      const font = await loadFont(c.font);
      const players = c.players.map((p) => p.trim().toLocaleUpperCase("sv-SE")).filter(Boolean).slice(0, 18);
      const title = c.title?.trim();
      let top = box.y;
      if (title) {
        const t = fitLine(font, title, { font: c.font, yarn: c.accent }, { x: box.x + box.w * 0.05, y: box.y, w: box.w * 0.9, h: 30 }, palette);
        out.svg.push(t.svg);
        out.texts.push(t.capMm);
        top += 40;
      }
      // Två, tre eller fyra rader – den uppställning som ger störst text. Alla namn får samma versalhöjd.
      const widths = players.map((p) => {
        const shape = lineShape(font, p, { gap: 0, dot: 0, hole: Infinity });
        return (shape.x1 - shape.x0 || 1) / shape.cap;
      });
      const plan = [2, 3, 4]
        .map((rows) => {
          const cols = Math.max(1, Math.ceil(players.length / rows));
          const [colW, rowH] = [box.w / cols, (box.y + box.h - top) / rows];
          return { rows, colW, rowH, cap: Math.min(rowH * 0.5, ...widths.map((w) => (colW - 22) / w)) };
        })
        .sort((a, b) => b.cap - a.cap)[0];
      const { rows, colW, rowH, cap } = plan;
      players.forEach((p, i) => {
        const [col, row] = [Math.floor(i / rows), i % rows];
        const t = fitLine(font, p, { font: c.font, yarn: c.yarn }, { x: box.x + col * colW + 11, y: top + row * rowH, w: colW - 22, h: rowH }, palette, cap);
        out.svg.push(t.svg);
        out.texts.push(t.capMm);
      });
      out.margins.push(box.y, W_MM - box.y - box.h);
      return;
    }
    case "portrait": {
      if (!assets.portrait || c.yarns.length < 2) return;
      const [r0, r1] = [Math.round(box.x / ROW_H_MM), Math.round((box.x + box.w) / ROW_H_MM)];
      const [s0, s1] = [Math.round(box.y / STITCH_W_MM), Math.round((box.y + box.h) / STITCH_W_MM)];
      const [w, h] = [r1 - r0, s1 - s0];
      if (w < 12 || h < 12) return;
      const meta = await sharp(assets.portrait).metadata();
      const [iw, ih] = [meta.width || 1, meta.height || 1];
      const ar = box.w / box.h;
      const [sw, sh] = iw / ih > ar ? [Math.round(ih * ar), ih] : [iw, Math.round(iw / ar)];
      const grey = await sharp(assets.portrait)
        .extract({ left: Math.floor((iw - sw) / 2), top: Math.floor((ih - sh) * 0.18), width: sw, height: sh })
        .resize(w, h, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer();
      out.direct.push(portraitInto(grey, w, h, r0, s0, palette, c.yarns, c.frame));
      out.margins.push(box.y, W_MM - box.y - box.h);
      return;
    }
  }
}

// --- En sida -----------------------------------------------------------------

async function knitFace(face: Face, palette: string[], assets: KnitAssets, clean = false): Promise<FaceKnit> {
  const out: FaceKnit = { cells: new Uint8Array(ROWS * SIDE), protect: new Uint8Array(ROWS * SIDE), texts: [], margins: [] };
  const placed = layout(face);
  const overlay: Overlay = { svg: [], rasters: [], texts: out.texts, margins: out.margins, direct: [] };

  const boxOf = (p: Placed): Box => {
    const [px, py] = p.sec.pad ?? [10, 16];
    return { x: p.x0 + px, y: py, w: Math.max(4, p.x1 - p.x0 - px * 2), h: W_MM - py * 2 };
  };
  // Texter i samma grupp provas först var för sig; alla får sedan den minsta versalhöjden.
  const caps = new Map<string, number>();
  for (const p of placed) {
    const c = p.sec.content;
    if (c?.kind !== "text" || !c.group) continue;
    const probe: Overlay = { svg: [], rasters: [], texts: [], margins: [], direct: [] };
    await addContent(c, boxOf(p), palette, assets, probe, []);
    if (probe.texts.length) caps.set(c.group, Math.min(caps.get(c.group) ?? Infinity, probe.texts[0]));
  }

  for (const [i, p] of placed.entries()) {
    const fn = fillFn(p.sec.fill, p.x1 - p.x0);
    const edge = face.edge && i >= (face.edge.skip ?? 0) && i < placed.length - (face.edge.skip ?? 0) ? face.edge.stripes : null;
    const edgeMm = edge?.reduce((n, s) => n + s.mm, 0) ?? 0;
    for (let r = p.r0; r < p.r1; r++) {
      const rl = p.sec.through ? r : p.sec.flip ? p.r1 - 1 - r : r - p.r0;
      const xl = (rl + 0.5) * ROW_H_MM;
      for (let s = 0; s < SIDE; s++) {
        const y = (s + 0.5) * STITCH_W_MM;
        const cell = fn(xl, y, rl, s);
        const d = Math.min(y, W_MM - y);
        const yarn = edge && d < edgeMm ? stripeAt(edge, d) : -1;
        out.cells[r * SIDE + s] = yarn >= 0 ? yarn : cell.yarn;
        out.protect[r * SIDE + s] = yarn >= 0 ? 0 : cell.pattern ? 1 : 0;
      }
    }
    if (p.sec.content) {
      const f = p.sec.fill;
      const ground = f.kind === "solid" ? [f.yarn] : f.kind === "tile" ? [f.ground, f.yarn] : [];
      await addContent(p.sec.content, boxOf(p), palette, assets, overlay, ground, caps);
    }
  }

  if (overlay.svg.length || overlay.rasters.length) {
    const [w, h] = [ROWS * SS, SIDE * SS];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${L_MM} ${W_MM}" preserveAspectRatio="none" shape-rendering="crispEdges">${overlay.svg.join("")}</svg>`;
    const { data } = await sharp(Buffer.from(svg)).resize(w, h, { fit: "fill" }).ensureAlpha().composite(overlay.rasters).raw().toBuffer({ resolveWithObject: true });
    const rgb = palette.map(hexToRgb);
    const all = rgb.map((_, i) => i);
    const cache = new Map<number, number>();
    const votes = new Uint8Array(palette.length);
    for (let r = 0; r < ROWS; r++) {
      for (let s = 0; s < SIDE; s++) {
        votes.fill(0);
        let ink = 0;
        for (let dy = 0; dy < SS; dy++) {
          let o = ((s * SS + dy) * w + r * SS) * 4;
          for (let dx = 0; dx < SS; dx++, o += 4) {
            if (data[o + 3] < 128) continue;
            const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
            let v = cache.get(key);
            if (v === undefined) {
              v = nearest(rgb, all, data[o], data[o + 1], data[o + 2]);
              cache.set(key, v);
            }
            votes[v]++;
            ink++;
          }
        }
        if (ink * 2 < SS * SS) continue;
        let best = 0;
        for (let i = 1; i < votes.length; i++) if (votes[i] > votes[best]) best = i;
        out.cells[r * SIDE + s] = best;
        out.protect[r * SIDE + s] = 0;
      }
    }
  }
  for (const paint of overlay.direct) paint(out);
  tidy(out, clean);
  return out;
}

/**
 * En ensam maska i ett rent fält (rester från kanter i text och sköld) får grannarnas färg.
 * Med `strong` städas alla maskor som saknar granne i samma färg – för märken med så tunna linjer att de annars
 * blir prickar i stickningen.
 */
function tidy(face: FaceKnit, strong = false) {
  const c = face.cells;
  for (let pass = 0; pass < (strong ? 2 : 1); pass++) {
    for (let r = 1; r < ROWS - 1; r++) {
      for (let s = 1; s < SIDE - 1; s++) {
        const i = r * SIDE + s;
        if (face.protect[i]) continue;
        const v = c[i];
        const [a, b, d, e] = [c[i - 1], c[i + 1], c[i - SIDE], c[i + SIDE]];
        if (a === v || b === v || d === v || e === v) continue;
        if (a === b && a === d && a === e) c[i] = a;
        else if (strong) c[i] = a === b || a === d || a === e ? a : b === d || b === e ? b : d === e ? d : a;
      }
    }
  }
}

// --- Hela halsduken ----------------------------------------------------------

/**
 * Så ligger sidorna i stickfilen (240 × 1210, en pixel per maska, rad 1 överst):
 * – Framsidan i kolumn 1–120, vriden ett kvarts varv medurs: texten läses uppifrån och ner.
 * – Baksidan i kolumn 121–240. "hold-up": vriden ett kvarts varv moturs, så att den läses rätt bakifrån när
 *   halsduken hålls upp. "turn-over": vriden medurs som framsidan, så att den läses rätt när halsduken vänds över långsidan.
 * Båda sidorna är rena vridningar – ingen är spegelvänd – eftersom mönstret går runt tubens utsida.
 */
export function machineIndex(side: 0 | 1, r: number, s: number, backReads: "hold-up" | "turn-over") {
  if (side === 0) return r * NEEDLES + (SIDE - 1 - s);
  return backReads === "hold-up" ? (ROWS - 1 - r) * NEEDLES + SIDE + s : r * NEEDLES + (NEEDLES - 1 - s);
}

/** `clean` städar bort alla ensamma maskor utanför raster och bårder; används när maskinkontrollen annars varnar. */
export async function knitDesign(design: ScarfDesign, assets: KnitAssets = {}, opts: { clean?: boolean } = {}): Promise<Knitted> {
  const full = design.palette.slice(0, SCARF.maxColors).map((h) => h.toUpperCase());
  const backReads = design.backReads ?? "hold-up";
  const faces = (await Promise.all([knitFace(design.front, full, assets, opts.clean), knitFace(design.back, full, assets, opts.clean)])) as [FaceKnit, FaceKnit];

  // Garner som inte fick en enda maska tas bort, så att garnlistan bara innehåller det som ska trädas på maskinen.
  const used = new Array<boolean>(full.length).fill(false);
  for (const f of faces) for (let i = 0; i < f.cells.length; i++) used[Math.min(f.cells[i], full.length - 1)] = true;
  const remap = new Uint8Array(full.length);
  const palette: string[] = [];
  full.forEach((hex, i) => {
    if (!used[i]) return;
    remap[i] = palette.length;
    palette.push(hex);
  });
  for (const f of faces) for (let i = 0; i < f.cells.length; i++) f.cells[i] = remap[Math.min(f.cells[i], full.length - 1)];

  const cells = new Uint8Array(NEEDLES * ROWS);
  const protect = new Uint8Array(NEEDLES * ROWS);
  faces.forEach((f, side) => {
    for (let r = 0; r < ROWS; r++) {
      for (let s = 0; s < SIDE; s++) {
        const at = machineIndex(side as 0 | 1, r, s, backReads);
        cells[at] = f.cells[r * SIDE + s];
        protect[at] = f.protect[r * SIDE + s];
      }
    }
  });
  const texts = faces.flatMap((f) => f.texts);
  const margins = faces.flatMap((f) => f.margins);
  return { cells, protect, palette, faces, minTextMm: texts.length ? Math.min(...texts) : null, minMarginMm: margins.length ? Math.min(...margins) : null, backReads };
}

// --- Förhandsvisning ---------------------------------------------------------

const ROW_PX = 6;
const STITCH_PX = 8;
const FRINGE_PX = 150;

let tile: Promise<Buffer> | null = null;
/** En maska som ett liggande V. Läggs som multiplicerat lager över garnfärgerna. */
function stitchTile() {
  tile ??= sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ROW_PX}" height="${STITCH_PX}"><rect width="${ROW_PX}" height="${STITCH_PX}" fill="#D2D2D2"/><ellipse cx="3" cy="2.1" rx="3.1" ry="1.75" fill="#FBFBFB" transform="rotate(31 3 2.1)"/><ellipse cx="3" cy="5.9" rx="3.1" ry="1.75" fill="#F3F3F3" transform="rotate(-31 3 5.9)"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
  return tile;
}

/** En sida som platt bild, en pixel per maska, liggande (1210 × 120). */
export function faceRgb(face: FaceKnit, palette: string[]) {
  const pal = palette.map(hexToRgb);
  const out = Buffer.alloc(ROWS * SIDE * 3);
  for (let r = 0; r < ROWS; r++) for (let s = 0; s < SIDE; s++) out.set(pal[face.cells[r * SIDE + s]] ?? pal[0], (s * ROWS + r) * 3);
  return out;
}

/** En sida som den ser ut stickad, med fransar i ändradernas garnfärger. `width` är bildens bredd i pixlar. */
export async function facePreview(face: FaceKnit, palette: string[], width = 2400): Promise<Buffer> {
  const [w, h] = [ROWS * ROW_PX, SIDE * STITCH_PX];
  const body = await sharp(faceRgb(face, palette), { raw: { width: ROWS, height: SIDE, channels: 3 } })
    .resize(w, h, { fit: "fill", kernel: "nearest" })
    .composite([{ input: await stitchTile(), tile: true, blend: "multiply" }])
    .png()
    .toBuffer();
  const strands: string[] = [];
  const n = 40;
  for (const [end, r] of [
    [0, 0],
    [1, ROWS - 1],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const hex = palette[face.cells[r * SIDE + Math.min(SIDE - 1, Math.floor(((k + 0.5) * SIDE) / n))]] ?? palette[0];
      const y = ((k + 0.5) * h) / n;
      const len = FRINGE_PX * (0.86 + 0.14 * Math.abs(Math.sin(k * 12.9898 + end * 4.1)));
      const sway = Math.sin(k * 7.31 + end) * 5;
      const [x0, x1] = end === 0 ? [FRINGE_PX + 2, FRINGE_PX - len] : [FRINGE_PX + w - 2, FRINGE_PX + w + len];
      strands.push(`<path d="M${x0} ${y.toFixed(1)}Q${(x0 + x1) / 2} ${(y + sway).toFixed(1)} ${x1.toFixed(1)} ${(y + sway * 1.6).toFixed(1)}" stroke="#00000030" stroke-width="${(h / n) * 0.82}" stroke-linecap="round" fill="none"/>`);
      strands.push(`<path d="M${x0} ${y.toFixed(1)}Q${(x0 + x1) / 2} ${(y + sway).toFixed(1)} ${x1.toFixed(1)} ${(y + sway * 1.6).toFixed(1)}" stroke="${hex}" stroke-width="${(h / n) * 0.62}" stroke-linecap="round" fill="none"/>`);
    }
  }
  const full = w + FRINGE_PX * 2;
  const fringe = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${full}" height="${h}">${strands.join("")}</svg>`);
  return sharp({ create: { width: full, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: fringe, left: 0, top: 0 },
      { input: body, left: FRINGE_PX, top: 0 },
    ])
    .png()
    .toBuffer()
    .then((buf) => sharp(buf).resize({ width }).png().toBuffer());
}

/** Fram- och baksida under varandra på vit botten, för korrektur och galleri. */
export async function sheetPreview(knit: Knitted, width = 2400): Promise<Buffer> {
  const [front, back] = await Promise.all(knit.faces.map((f) => facePreview(f, knit.palette, width)));
  const h = (await sharp(front).metadata()).height || 1;
  const gap = Math.round(h * 0.16);
  return sharp({ create: { width, height: h * 2 + gap, channels: 3, background: "#FFFFFF" } })
    .composite([
      { input: front, left: 0, top: 0 },
      { input: back, left: 0, top: h + gap },
    ])
    .removeAlpha()
    .png()
    .toBuffer();
}

export { MIN_TEXT_MM };
