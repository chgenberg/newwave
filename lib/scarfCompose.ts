import { CELLS, ROW_H_MM, SCARF, STITCH_W_MM, hexToRgb } from "./scarf";

export type Template = "klassisk" | "smeknamn" | "arena" | "motiv" | "personlig";

export const TEMPLATES: { id: Template; label: string; hint: string }[] = [
  { id: "klassisk", label: "Klassisk", hint: "Klubbnamn, sköld och ränder" },
  { id: "smeknamn", label: "Smeknamn", hint: "Det fansen säger" },
  { id: "arena", label: "Arenan", hint: "Hemmaplanen och året" },
  { id: "motiv", label: "Motiv", hint: "Agentens slogan" },
  { id: "personlig", label: "Personlig", hint: "Eget namn och nummer" },
];

/** Colours are indexes into the scarf palette. */
export type SideSpec = { template: Template; bg: number; ink: number; accent: number; line1: string; line2: string; number: string; crest: boolean };

export type ComposeInput = {
  palette: string[];
  front: SideSpec;
  back: SideSpec;
  crest: HTMLImageElement | null;
  font: string;
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

  if (side.template === "personlig" && side.number.trim()) {
    const numW = span * 0.3;
    const numCap = fitText(ctx, side.number.trim(), input.font, numW, 128);
    drawText(ctx, side.number.trim(), input.font, numCap, mid.x0 + numW / 2, W / 2);
    texts.push(numCap);
    ctx.fillStyle = col(side.accent);
    ctx.fillRect(mid.x0 + numW + 10, 34, 3, W - 68);
    ctx.fillStyle = col(side.ink);
    const nameX0 = mid.x0 + numW + 26;
    const nameCap = fitText(ctx, side.line1, input.font, mid.x1 - nameX0, side.line2 ? 74 : 96);
    if (side.line2) {
      const subCap = fitText(ctx, side.line2, input.font, mid.x1 - nameX0, 24);
      drawText(ctx, side.line1, input.font, nameCap, (nameX0 + mid.x1) / 2, W / 2 - subCap / 2 - 6);
      drawText(ctx, side.line2, input.font, subCap, (nameX0 + mid.x1) / 2, W / 2 + nameCap / 2 + 10);
      texts.push(subCap);
    } else {
      drawText(ctx, side.line1, input.font, nameCap, (nameX0 + mid.x1) / 2, W / 2);
    }
    texts.push(nameCap);
  } else {
    const main = side.line1.trim();
    const sub = side.line2.trim();
    if (main) {
      const capMax = sub ? 82 : 112;
      const cap = fitText(ctx, main, input.font, span, capMax);
      if (sub) {
        const subCap = fitText(ctx, sub, input.font, span * 0.8, 24);
        const gap = 12;
        const top = (W - cap - gap - subCap) / 2;
        drawText(ctx, main, input.font, cap, (mid.x0 + mid.x1) / 2, top + cap / 2);
        drawText(ctx, sub, input.font, subCap, (mid.x0 + mid.x1) / 2, top + cap + gap + subCap / 2);
        texts.push(subCap);
      } else {
        drawText(ctx, main, input.font, cap, (mid.x0 + mid.x1) / 2, W / 2);
      }
      texts.push(cap);
    }
  }
  ctx.restore();
}

function drawContain(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const [dw, dh] = ar > w / h ? [w, w / ar] : [h * ar, h];
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Cap height of upper-case block letters as a share of the font size. */
const CAP = 0.73;

/** Largest cap height (mm) that fits `maxW` and `maxCap`. */
function fitText(ctx: Ctx, text: string, font: string, maxW: number, maxCap: number) {
  ctx.font = `400 100px ${font}`;
  const w = ctx.measureText(text).width || 1;
  const sizeForW = (maxW / w) * 100;
  return Math.max(4, Math.min(maxCap, sizeForW * CAP));
}

function drawText(ctx: Ctx, text: string, font: string, cap: number, cx: number, cy: number) {
  ctx.font = `400 ${cap / CAP}px ${font}`;
  ctx.fillText(text, cx, cy + cap / 2);
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

/** Knit-texture preview of one side, lying horizontally. Halves in steps down to `targetWidth` so the stitch texture doesn't moiré. */
export function renderKnit(canvas: HTMLCanvasElement, cells: Uint8Array, palette: string[], side: 0 | 1, targetWidth?: number) {
  const flat = document.createElement("canvas");
  flat.width = SCARF.rows;
  flat.height = SCARF.side;
  const fctx = flat.getContext("2d")!;
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

  let src = document.createElement("canvas");
  src.width = SCARF.rows * ROW_PX;
  src.height = SCARF.side * STITCH_PX;
  const ctx = src.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(flat, 0, 0, src.width, src.height);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = ctx.createPattern(stitchTile(), "repeat")!;
  ctx.fillRect(0, 0, src.width, src.height);
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

export function cellsToBase64(cells: Uint8Array) {
  let s = "";
  for (let i = 0; i < cells.length; i += 0x8000) s += String.fromCharCode(...cells.subarray(i, i + 0x8000));
  return btoa(s);
}
