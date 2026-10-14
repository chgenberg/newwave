import { CELLS, ROW_H_MM, SCARF, STITCH_W_MM, hexToRgb } from "./scarf";

export type Template = "klassisk" | "smeknamn" | "arena" | "motiv" | "personlig" | "trupp" | "portratt" | "autograf";

export const TEMPLATES: { id: Template; label: string; hint: string }[] = [
  { id: "klassisk", label: "Klassisk", hint: "Klubbnamn, sköld och ränder" },
  { id: "smeknamn", label: "Smeknamn", hint: "Det fansen säger" },
  { id: "arena", label: "Arenan", hint: "Hemmaplanen och året" },
  { id: "motiv", label: "Motiv", hint: "Agentens slogan" },
  { id: "personlig", label: "Personlig", hint: "Eget namn och nummer" },
  { id: "trupp", label: "Truppen", hint: "Spelarnas namn och nummer längs hela halsduken" },
  { id: "portratt", label: "Porträtt", hint: "Fotorealistiskt stickat porträtt i gråskala" },
  { id: "autograf", label: "Autograf", hint: "Signatur som du ritar eller skriver" },
];

export const DEFAULT_ROSTER = [
  "1 LINDKVIST",
  "3 SVENSSON",
  "4 BERG",
  "6 ERIKSSON",
  "7 NILSSON",
  "8 LARSSON",
  "9 HOLM",
  "10 EKSTRÖM",
  "11 DAHL",
  "14 KARLSSON",
  "17 STRÖM",
  "21 NYMAN",
].join("\n");

export type Stroke = [number, number][];

/** Colours are indexes into the scarf palette. */
export type SideSpec = {
  template: Template;
  bg: number;
  ink: number;
  accent: number;
  line1: string;
  line2: string;
  number: string;
  roster: string;
  strokes: Stroke[];
  crest: boolean;
};

export type ComposeInput = {
  palette: string[];
  front: SideSpec;
  back: SideSpec;
  crest: HTMLImageElement | null;
  portrait?: HTMLImageElement | null;
  font: string;
  scriptFont?: string;
};

export type Composed = { cells: Uint8Array; minTextMm: number | null };

const PX_PER_MM = 4;
const L = SCARF.lengthMm;
const W = SCARF.widthMm;

type Ctx = CanvasRenderingContext2D;

/** Draws one side lying flat: x runs along the 135 cm length, y across the 18 cm width (millimetres). */
function drawSide(ctx: Ctx, side: SideSpec, input: ComposeInput, texts: number[]) {
  const col = (i: number) => input.palette[i] ?? input.palette[0];
  ctx.save();
  ctx.scale(PX_PER_MM, PX_PER_MM);
  ctx.fillStyle = col(side.bg);
  ctx.fillRect(0, 0, L, W);

  const bands = [
    [side.ink, 20],
    [side.bg, 9],
    [side.accent, 9],
    [side.bg, 9],
    [side.ink, 20],
  ] as const;
  let x = 0;
  for (const [c, w] of bands) {
    ctx.fillStyle = col(c);
    ctx.fillRect(x, 0, w, W);
    ctx.fillRect(L - x - w, 0, w, W);
    x += w;
  }

  const crestBox = { x: x + 14, w: 150 };
  if (side.crest && input.crest) {
    drawContain(ctx, input.crest, crestBox.x, 16, crestBox.w, W - 32);
    drawContain(ctx, input.crest, L - crestBox.x - crestBox.w, 16, crestBox.w, W - 32);
  }
  const mid = side.crest && input.crest ? { x0: crestBox.x + crestBox.w + 28, x1: L - crestBox.x - crestBox.w - 28 } : { x0: x + 24, x1: L - x - 24 };
  const span = mid.x1 - mid.x0;
  ctx.fillStyle = col(side.ink);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  if (side.template === "trupp") {
    drawRoster(ctx, side, input, mid, texts);
  } else if (side.template === "portratt") {
    drawPortraitSide(ctx, side, input, mid, texts);
  } else if (side.template === "autograf") {
    drawAutographSide(ctx, side, input, mid, texts);
  } else if (side.template === "personlig" && side.number.trim()) {
    const numW = span * 0.3;
    const numCap = fitText(ctx, side.number.trim(), input.font, numW, 128);
    drawText(ctx, side.number.trim(), input.font, numCap, mid.x0 + numW / 2, W / 2);
    texts.push(numCap);
    ctx.fillStyle = col(side.accent);
    ctx.fillRect(mid.x0 + numW + 10, 34, 3, W - 68);
    ctx.fillStyle = col(side.ink);
    const nameX0 = mid.x0 + numW + 26;
    drawTwoLines(ctx, side.line1, side.line2, input.font, nameX0, mid.x1 - nameX0, 74, 96, texts);
  } else {
    drawTwoLines(ctx, side.line1, side.line2, input.font, mid.x0, span, 82, 112, texts);
  }
  ctx.restore();
}

function drawRoster(ctx: Ctx, side: SideSpec, input: ComposeInput, mid: { x0: number; x1: number }, texts: number[]) {
  const players = side.roster
    .split(/\r?\n|,/)
    .map((s) => s.trim().toLocaleUpperCase("sv-SE"))
    .filter(Boolean)
    .slice(0, 18);
  const cols = Math.max(1, Math.ceil(players.length / 3));
  const rows = Math.min(3, Math.max(1, Math.ceil(players.length / cols)));
  const title = side.line1.trim();
  const topY = title ? 48 : 22;
  if (title) {
    const tCap = fitText(ctx, title, input.font, (mid.x1 - mid.x0) * 0.9, 22);
    ctx.fillStyle = input.palette[side.accent] ?? input.palette[side.ink];
    drawText(ctx, title, input.font, tCap, (mid.x0 + mid.x1) / 2, 26);
    texts.push(tCap);
  }
  const colW = (mid.x1 - mid.x0) / cols;
  const rowH = (W - topY - 14) / rows;
  const maxCap = Math.min(26, rowH * 0.62);
  ctx.fillStyle = input.palette[side.ink] ?? input.palette[0];
  players.forEach((p, idx) => {
    const c = Math.floor(idx / rows);
    const r = idx % rows;
    const cap = fitText(ctx, p, input.font, colW - 14, maxCap);
    drawText(ctx, p, input.font, cap, mid.x0 + (c + 0.5) * colW, topY + (r + 0.5) * rowH);
    texts.push(cap);
  });
}

const PORTRAIT_W_MM = 186;
const PORTRAIT_H_MM = W - 12;

/** Draws a realistic knitted greyscale portrait (matching the IMS/OPEK 365 look) in an oval frame and the player/supporter name beside it. */
function drawPortraitSide(ctx: Ctx, side: SideSpec, input: ComposeInput, mid: { x0: number; x1: number }, texts: number[]) {
  const x0 = mid.x0 + 6;
  const y0 = (W - PORTRAIT_H_MM) / 2;
  if (input.portrait) {
    const face = smoothGreyscalePortrait(input.portrait, Math.round(PORTRAIT_W_MM * PX_PER_MM), Math.round(PORTRAIT_H_MM * PX_PER_MM));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x0 + PORTRAIT_W_MM / 2, y0 + PORTRAIT_H_MM / 2, PORTRAIT_W_MM / 2, PORTRAIT_H_MM / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(face, x0, y0, PORTRAIT_W_MM, PORTRAIT_H_MM);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = input.palette[side.ink] ?? "#FFFFFF";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(x0 + PORTRAIT_W_MM / 2, y0 + PORTRAIT_H_MM / 2, PORTRAIT_W_MM / 2 - 1.5, PORTRAIT_H_MM / 2 - 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const tx0 = x0 + PORTRAIT_W_MM + 20;
  const span = Math.max(80, mid.x1 - tx0);
  ctx.fillStyle = input.palette[side.ink] ?? input.palette[0];
  drawTwoLines(ctx, side.line1, side.line2, input.font, tx0, span, 68, 90, texts);
}

/** High-resolution greyscale portrait with soft contrast stretch, matching how fine jacquard portraits look on a knitted scarf. */
function smoothGreyscalePortrait(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, w, h);
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const targetAr = w / h;
  const srcAr = iw / ih;
  const [sw, sh] = srcAr > targetAr ? [ih * targetAr, ih] : [iw, iw / targetAr];
  g.drawImage(img, (iw - sw) / 2, (ih - sh) * 0.18, sw, sh, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  const lums = new Float32Array(w * h);
  for (let i = 0; i < lums.length; i++) lums[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  const sample: number[] = [];
  for (let i = 0; i < lums.length; i += 13) sample.push(lums[i]);
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.03)] ?? 0;
  const hi = Math.max(lo + 1, sample[Math.floor(sample.length * 0.97)] ?? 255);
  for (let i = 0; i < lums.length; i++) {
    const t = Math.max(0, Math.min(1, (lums[i] - lo) / (hi - lo)));
    const sCurve = t * t * (3 - 2 * t);
    const v = Math.round(14 + Math.pow(sCurve, 0.92) * 234);
    const o = i * 4;
    d[o] = v;
    d[o + 1] = v;
    d[o + 2] = Math.min(255, v + 3);
    d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * Knits a photo directly into the stitch grid using Floyd–Steinberg error-diffusion dithering across the palette's greyscale/neutral yarns
 * (plus dark/light endpoints), matching how an IMS/OPEK 365 renders photorealistic faces.
 */
function knitPortraitIntoGrid(
  cells: Uint8Array,
  sideIndex: 0 | 1,
  side: SideSpec,
  palette: string[],
  img: HTMLImageElement,
  midX0Mm: number,
) {
  const rgb = palette.map(hexToRgb);
  const tones = rgb
    .map(([r, g, b], idx) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      return { idx, r, g, b, lum, sat };
    })
    .filter((t, _, all) => t.sat < 0.28 || t.lum === Math.min(...all.map((a) => a.lum)) || t.lum === Math.max(...all.map((a) => a.lum)))
    .sort((a, b) => a.lum - b.lum);
  const ramp = tones.length >= 2 ? tones : rgb.map(([r, g, b], idx) => ({ idx, r, g, b, lum: r * 0.299 + g * 0.587 + b * 0.114, sat: 0 })).sort((a, b) => a.lum - b.lum);

  const r0 = Math.max(0, Math.round((midX0Mm + 6) / ROW_H_MM));
  const rCount = Math.min(SCARF.rows - r0, Math.round(PORTRAIT_W_MM / ROW_H_MM));
  const cMargin = Math.round(((W - PORTRAIT_H_MM) / 2) / STITCH_W_MM);
  const c0 = cMargin;
  const cCount = SCARF.side - cMargin * 2;
  if (rCount <= 8 || cCount <= 8) return;

  const samp = document.createElement("canvas");
  samp.width = rCount;
  samp.height = cCount;
  const g = samp.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, rCount, cCount);
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const targetAr = PORTRAIT_W_MM / PORTRAIT_H_MM;
  const srcAr = iw / ih;
  const [sw, sh] = srcAr > targetAr ? [ih * targetAr, ih] : [iw, iw / targetAr];
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) * 0.18;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, rCount, cCount);
  const data = g.getImageData(0, 0, rCount, cCount).data;

  const raw: number[] = new Array(rCount * cCount);
  for (let i = 0; i < raw.length; i++) raw[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  const sorted = [...raw].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.04)] ?? 0;
  const hi = Math.max(lo + 1, sorted[Math.floor(sorted.length * 0.96)] ?? 255);

  const minL = ramp[0].lum;
  const maxL = ramp[ramp.length - 1].lum;
  const buf = new Float32Array(rCount * cCount);
  for (let i = 0; i < raw.length; i++) {
    const t = Math.max(0, Math.min(1, (raw[i] - lo) / (hi - lo)));
    const sCurve = t * t * (3 - 2 * t);
    const gamma = Math.pow(sCurve, 0.9);
    buf[i] = minL + gamma * (maxL - minL);
  }

  for (let y = 0; y < cCount; y++) {
    for (let x = 0; x < rCount; x++) {
      const dx = (x + 0.5 - rCount / 2) / (rCount / 2);
      const dy = (y + 0.5 - cCount / 2) / (cCount / 2);
      const dist = dx * dx + dy * dy;
      if (dist > 1) continue;
      const k = y * rCount + x;
      if (dist > 0.86) {
        cells[(r0 + x) * SCARF.needles + sideIndex * SCARF.side + (c0 + y)] = side.ink;
        continue;
      }
      const old = buf[k];
      let best = ramp[0];
      let bestD = Math.abs(old - best.lum);
      for (let i = 1; i < ramp.length; i++) {
        const d = Math.abs(old - ramp[i].lum);
        if (d < bestD) [best, bestD] = [ramp[i], d];
      }
      cells[(r0 + x) * SCARF.needles + sideIndex * SCARF.side + (c0 + y)] = best.idx;
      const err = (old - best.lum) * 0.85;
      if (x + 1 < rCount) buf[k + 1] += (err * 7) / 16;
      if (y + 1 < cCount) {
        if (x > 0) buf[k + rCount - 1] += (err * 3) / 16;
        buf[k + rCount] += (err * 5) / 16;
        if (x + 1 < rCount) buf[k + rCount + 1] += (err * 1) / 16;
      }
    }
  }
}

function drawAutographSide(ctx: Ctx, side: SideSpec, input: ComposeInput, mid: { x0: number; x1: number }, texts: number[]) {
  const span = mid.x1 - mid.x0;
  const sub = side.line2.trim();
  const sigTop = 18;
  const sigH = sub ? W - 64 : W - 36;
  ctx.strokeStyle = input.palette[side.ink] ?? "#FFFFFF";
  ctx.fillStyle = input.palette[side.ink] ?? "#FFFFFF";
  if (side.strokes.length) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    for (const s of side.strokes) {
      if (!s.length) continue;
      ctx.beginPath();
      s.forEach(([nx, ny], i) => {
        const px = mid.x0 + 20 + nx * (span - 40);
        const py = sigTop + ny * sigH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (s.length === 1) ctx.lineTo(mid.x0 + 20 + s[0][0] * (span - 40) + 0.5, sigTop + s[0][1] * sigH);
      ctx.stroke();
    }
    ctx.restore();
    texts.push(28);
  } else if (side.line1.trim()) {
    const fam = input.scriptFont ?? input.font;
    const cap = fitText(ctx, side.line1.trim(), fam, span * 0.86, sigH * 0.72);
    drawText(ctx, side.line1.trim(), fam, cap, (mid.x0 + mid.x1) / 2, sigTop + sigH / 2);
    texts.push(cap);
  }
  if (sub) {
    const subCap = fitText(ctx, sub, input.font, span * 0.75, 22);
    drawText(ctx, sub, input.font, subCap, (mid.x0 + mid.x1) / 2, W - 22);
    texts.push(subCap);
  }
}

function drawContain(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const [dw, dh] = ar > w / h ? [w, w / ar] : [h * ar, h];
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Actual cap height of the font as a fraction of `font-size`, measured from `H`. */
function fontCap(ctx: Ctx, font: string) {
  ctx.font = `400 100px ${font}`;
  return (ctx.measureText("H").actualBoundingBoxAscent || 75) / 100;
}

const stripNordic = (s: string) => s.replace(/[ÅÄ]/g, "A").replace(/Ö/g, "O");

/** Height of our custom-drawn Å ring or Ä/Ö dots + the gap above the letter body, in mm. */
function accentExtraMm(text: string, cap: number) {
  if (!/[ÅÄÖ]/.test(text)) return 0;
  const gap = Math.max(3.2, cap * 0.08);
  const dotH = /[Å]/.test(text) ? Math.max(5.2, cap * 0.2) : Math.max(4.2, cap * 0.16);
  return gap + dotH;
}

/** Total vertical height (mm) of `text` at `cap`, including our Å/Ä/Ö marks or any font diacritics/descenders. */
function totalInkMm(ctx: Ctx, text: string, font: string, cap: number) {
  if (/[ÅÄÖ]/.test(text)) return cap + accentExtraMm(text, cap);
  ctx.font = `400 ${cap / fontCap(ctx, font)}px ${font}`;
  const m = ctx.measureText(text);
  return Math.max(cap, (m.actualBoundingBoxAscent || cap) + (m.actualBoundingBoxDescent || 0));
}

/** Largest cap height (mm) whose width fits `maxW` and whose total ink height (with Å/Ä/Ö marks) fits `maxTotalH`. */
function fitText(ctx: Ctx, text: string, font: string, maxW: number, maxTotalH: number) {
  const capShare = fontCap(ctx, font);
  ctx.font = `400 100px ${font}`;
  const w = ctx.measureText(stripNordic(text)).width || 1;
  let cap = Math.min(maxTotalH, (maxW / w) * 100 * capShare);
  for (let i = 0; i < 3; i++) {
    const tot = totalInkMm(ctx, text, font, cap);
    if (tot > maxTotalH) cap *= maxTotalH / tot;
  }
  return Math.max(4, cap);
}

/**
 * Centres the full ink box (including diacritics) on `(cx, cy)`.
 * Upper-case Å, Ä, Ö are drawn as A/O plus crisp block marks with a clear stitch gap, because condensed display fonts put paper-thin marks right on the cap line.
 */
function drawText(ctx: Ctx, text: string, font: string, cap: number, cx: number, cy: number) {
  const px = cap / fontCap(ctx, font);
  ctx.font = `400 ${px}px ${font}`;
  if (!/[ÅÄÖ]/.test(text)) {
    const m = ctx.measureText(text);
    const asc = m.actualBoundingBoxAscent || cap;
    const desc = m.actualBoundingBoxDescent || 0;
    ctx.fillText(text, cx, cy + (asc - desc) / 2);
    return;
  }
  const base = stripNordic(text);
  const extra = accentExtraMm(text, cap);
  const tot = cap + extra;
  const baseY = cy + tot / 2;
  ctx.fillText(base, cx, baseY);

  ctx.save();
  ctx.textAlign = "left";
  const totalW = ctx.measureText(base).width;
  const x0 = cx - totalW / 2;
  const gap = Math.max(3.2, cap * 0.08);
  const dotH = Math.max(4.2, cap * 0.16);
  const dotW = Math.max(3.8, cap * 0.15);
  const ringR = Math.max(2.6, cap * 0.1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "Å" && ch !== "Ä" && ch !== "Ö") continue;
    const left = x0 + ctx.measureText(base.slice(0, i)).width;
    const cw = ctx.measureText(base[i]).width;
    const midX = left + cw / 2;
    if (ch === "Å") {
      const cyRing = baseY - cap - gap - ringR;
      ctx.beginPath();
      ctx.arc(midX, cyRing, ringR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const top = baseY - cap - gap - dotH;
      const sep = Math.max(dotW + 2.4, cw * 0.38);
      ctx.fillRect(midX - sep / 2 - dotW / 2, top, dotW, dotH);
      ctx.fillRect(midX + sep / 2 - dotW / 2, top, dotW, dotH);
    }
  }
  ctx.restore();
}

/** Draws a headline + optional subline inside the 180 mm scarf height, leaving clear margin above Å/Ä/Ö marks. */
function drawTwoLines(ctx: Ctx, rawMain: string, rawSub: string, font: string, x0: number, span: number, maxMainH: number, maxAloneH: number, texts: number[]) {
  const main = rawMain.trim();
  const sub = rawSub.trim();
  if (!main) return;
  const cx = x0 + span / 2;
  const availH = W - 36;
  if (!sub) {
    const cap = fitText(ctx, main, font, span, Math.min(maxAloneH, availH));
    drawText(ctx, main, font, cap, cx, W / 2);
    texts.push(cap);
    return;
  }
  const gap = 16;
  const subCap = fitText(ctx, sub, font, span * 0.85, 25);
  const subInk = totalInkMm(ctx, sub, font, subCap);
  const cap = fitText(ctx, main, font, span, Math.min(maxMainH, availH - gap - subInk));
  const mainInk = totalInkMm(ctx, main, font, cap);
  const top = (W - (mainInk + gap + subInk)) / 2;
  drawText(ctx, main, font, cap, cx, top + mainInk / 2);
  drawText(ctx, sub, font, subCap, cx, top + mainInk + gap + subInk / 2);
  texts.push(cap, subCap);
}

function nearestIndex(palette: [number, number, number][], r: number, g: number, b: number, a: number, bg: number) {
  if (a < 128) return bg;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/** Renders both sides in millimetres, then samples every stitch: 3×3 points per stitch, majority colour wins. */
export function composeScarf(input: ComposeInput): Composed {
  const canvas = document.createElement("canvas");
  canvas.width = L * PX_PER_MM;
  canvas.height = W * PX_PER_MM;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgb = input.palette.map(hexToRgb);
  const cells = new Uint8Array(CELLS);
  const texts: number[] = [];
  const pick = [0.2, 0.5, 0.8];
  const votes = new Array(rgb.length).fill(0);

  for (const [s, side] of [input.front, input.back].entries()) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSide(ctx, side, input, texts);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let r = 0; r < SCARF.rows; r++) {
      for (let c = 0; c < SCARF.side; c++) {
        votes.fill(0);
        for (const fx of pick) {
          for (const fy of pick) {
            const px = Math.min(canvas.width - 1, Math.floor((r + fx) * ROW_H_MM * PX_PER_MM));
            const py = Math.min(canvas.height - 1, Math.floor((c + fy) * STITCH_W_MM * PX_PER_MM));
            const o = (py * canvas.width + px) * 4;
            votes[nearestIndex(rgb, data[o], data[o + 1], data[o + 2], data[o + 3], side.bg)]++;
          }
        }
        let best = 0;
        for (let i = 1; i < votes.length; i++) if (votes[i] > votes[best]) best = i;
        cells[r * SCARF.needles + s * SCARF.side + c] = best;
      }
    }
    if (side.template === "portratt" && input.portrait) {
      const midX0 = side.crest && input.crest ? 67 + 14 + 150 + 28 : 67 + 24;
      knitPortraitIntoGrid(cells, s as 0 | 1, side, input.palette, input.portrait, midX0);
    }
  }
  return { cells, minTextMm: texts.length ? Math.min(...texts) : null };
}

const ROW_PX = 6;
const STITCH_PX = 8;

/** Greyscale knit texture for one stitch: a "V" lying along the scarf, multiplied onto the yarn colours. */
function stitchTile() {
  const t = document.createElement("canvas");
  t.width = ROW_PX;
  t.height = STITCH_PX;
  const g = t.getContext("2d")!;
  g.fillStyle = "#B4B4B4";
  g.fillRect(0, 0, ROW_PX, STITCH_PX);
  for (const [cy, rot] of [
    [2.1, 0.55],
    [5.9, -0.55],
  ] as const) {
    const grad = g.createLinearGradient(0, cy - 2, 0, cy + 2);
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(1, "#E2E2E2");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(3, cy, 3.1, 1.75, rot, 0, Math.PI * 2);
    g.fill();
  }
  return t;
}

/**
 * Realistic knitted-scarf preview of one side.
 * When `input` is provided, draws the high-resolution scarf artwork directly and overlays fine knitted yarn texture so crests, portraits and lettering look like a real knitted scarf photo.
 */
export function renderKnit(
  canvas: HTMLCanvasElement,
  cells: Uint8Array,
  palette: string[],
  side: 0 | 1,
  targetWidth?: number,
  input?: ComposeInput,
) {
  let art: HTMLCanvasElement;
  if (input) {
    art = document.createElement("canvas");
    art.width = L * PX_PER_MM;
    art.height = W * PX_PER_MM;
    const actx = art.getContext("2d")!;
    drawSide(actx, side === 0 ? input.front : input.back, input, []);
  } else {
    art = document.createElement("canvas");
    art.width = SCARF.rows;
    art.height = SCARF.side;
    const fctx = art.getContext("2d")!;
    const img = fctx.createImageData(SCARF.rows, SCARF.side);
    const rgb = palette.map(hexToRgb);
    for (let r = 0; r < SCARF.rows; r++) {
      for (let c = 0; c < SCARF.side; c++) {
        const p = rgb[cells[r * SCARF.needles + side * SCARF.side + c]] ?? rgb[0];
        const o = (c * SCARF.rows + r) * 4;
        img.data[o] = p[0];
        img.data[o + 1] = p[1];
        img.data[o + 2] = p[2];
        img.data[o + 3] = 255;
      }
    }
    fctx.putImageData(img, 0, 0);
  }

  let src = document.createElement("canvas");
  src.width = SCARF.rows * ROW_PX;
  src.height = SCARF.side * STITCH_PX;
  const ctx = src.getContext("2d")!;
  ctx.imageSmoothingEnabled = Boolean(input);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, 0, 0, src.width, src.height);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ctx.createPattern(stitchTile(), "repeat")!;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const goal = targetWidth && targetWidth < src.width ? Math.round(targetWidth) : src.width;
  while (src.width / 2 >= goal) {
    const half = document.createElement("canvas");
    half.width = Math.round(src.width / 2);
    half.height = Math.round(src.height / 2);
    const h = half.getContext("2d")!;
    h.imageSmoothingQuality = "high";
    h.drawImage(src, 0, 0, half.width, half.height);
    src = half;
  }
  canvas.width = goal;
  canvas.height = Math.round((goal * src.height) / src.width);
  const out = canvas.getContext("2d")!;
  out.imageSmoothingQuality = "high";
  out.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/** 240×1210 pixel canvas where every pixel is one stitch; exported as PNG or JPG for Seger. */
export function renderPatternCanvas(cells: Uint8Array, palette: string[]) {
  const c = document.createElement("canvas");
  c.width = SCARF.needles;
  c.height = SCARF.rows;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(SCARF.needles, SCARF.rows);
  const rgb = palette.map(hexToRgb);
  for (let i = 0; i < cells.length; i++) {
    const p = rgb[cells[i]] ?? rgb[0];
    const o = i * 4;
    img.data[o] = p[0];
    img.data[o + 1] = p[1];
    img.data[o + 2] = p[2];
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function cellsToBase64(cells: Uint8Array) {
  let s = "";
  for (let i = 0; i < cells.length; i += 0x8000) s += String.fromCharCode(...cells.subarray(i, i + 0x8000));
  return btoa(s);
}
