import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Potrace } from "potrace";
import sharp from "sharp";
import type { Word } from "./importSvg";

/**
 * Gör om en design som inte är SVG till en SVG som importen kan dela upp och läsagenten tolka.
 * AI- och PDF-filer blir vektorer med pdftocairo (poppler), med orden och typsnittsnamnen bredvid – texten blir former.
 * Bilder vektoriseras: färgerna delas upp och varje sammanhängande form ritas om med potrace, störst först så att det
 * som ligger ovanpå hamnar ovanpå. Bokstäverna hålls ihop till ord i importen (describeSvg), som för AI-filer.
 */

export class ConvertError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}
export type Converted = { svg: string; source: "vector" | "image"; words: Word[]; fonts: string[] };

const run = promisify(execFile);
const TOOL = { timeout: 30_000, maxBuffer: 30_000_000 };
const MAX_SVG = 8_000_000;
const MAX_PIXELS = 80_000_000;

export async function convertDesign(buf: Buffer): Promise<Converted> {
  const head = buf.subarray(0, 1024).toString("latin1");
  if (head.includes("%PDF-")) return fromPdf(buf);
  if (head.startsWith("%!PS")) throw new ConvertError("Filen är sparad i ett gammalt Illustrator- eller EPS-format. Spara som AI med ”Skapa PDF-kompatibel fil” ikryssat, eller exportera som SVG.");
  return fromImage(buf);
}

const round = (svg: string, decimals: number) => svg.replace(/-?\d+\.\d{3,}/g, (n) => String(Number(Number(n).toFixed(decimals))));
const ENTITY: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

async function fromPdf(buf: Buffer): Promise<Converted> {
  const dir = await mkdtemp(join(tmpdir(), "nw-design-"));
  try {
    const file = join(dir, "in.pdf");
    await writeFile(file, buf);
    try {
      await run("pdftocairo", ["-svg", "-f", "1", "-l", "1", file, join(dir, "out.svg")], TOOL);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new ConvertError("AI- och PDF-filer går inte att läsa på servern just nu – exportera designen som SVG.", 503);
      throw new ConvertError("Kunde inte öppna filen. Spara den som AI med ”Skapa PDF-kompatibel fil” ikryssat, som PDF eller som SVG.");
    }
    const [svg, layout, fontList] = await Promise.all([
      readFile(join(dir, "out.svg"), "utf8"),
      run("pdftotext", ["-f", "1", "-l", "1", "-bbox-layout", file, "-"], TOOL).then((r) => r.stdout, () => ""),
      run("pdffonts", ["-f", "1", "-l", "1", file], TOOL).then((r) => r.stdout, () => ""),
    ]);
    const words = textRuns(layout);
    if (/saved without PDF Content/i.test(words.map((w) => w.text).join(" "))) throw new ConvertError("AI-filen är sparad utan PDF-innehåll. Spara den igen med ”Skapa PDF-kompatibel fil” ikryssat, eller exportera som SVG.");
    const fonts = [
      ...new Set(
        fontList
          .split("\n")
          .slice(2)
          .map((l) => l.split(/\s+/)[0]?.replace(/^[A-Z]{6}\+/, "") ?? "")
          .filter((f) => f && f !== "[none]"),
      ),
    ].slice(0, 20);
    const out = round(svg, 2);
    if (out.length > MAX_SVG) throw new ConvertError("Designen är för tung att läsa – ta bort inbäddade bilder eller exportera som SVG.");
    return { svg: out, source: "vector", words: words.slice(0, 400), fonts };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Glyphs = { text: string; x0: number; y0: number; x1: number; y1: number };

/**
 * Orden i filen som de syns. Spärrad text, skrivstil och text i båge kommer ur pdftotext tecken för tecken – ofta som
 * egna rader – så tecken i samma block som har samma storlek, ligger i höjd och står kant i kant blir ett ord igen.
 */
function textRuns(layout: string): Word[] {
  const runs: { text: string; parts: Glyphs[] }[] = [];
  for (const block of layout.matchAll(/<block[^>]*>([\s\S]*?)<\/block>/g)) {
    const glyphs: Glyphs[] = [...block[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((m) => ({ text: m[5].replace(/&\w+;/g, (e) => ENTITY[e] ?? e), x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]) }))
      .sort((a, b) => a.x0 - b.x0);
    const open: { text: string; parts: Glyphs[] }[] = [];
    for (const g of glyphs) {
      const h = g.y1 - g.y0;
      const into = open.find((r) => {
        const last = r.parts.at(-1)!;
        const lh = last.y1 - last.y0;
        return Math.abs(h - lh) <= 0.15 * Math.max(h, lh) && Math.min(g.y1, last.y1) - Math.max(g.y0, last.y0) >= 0.5 * Math.min(h, lh) && g.x0 - last.x1 <= 0.35 * h;
      });
      if (into) {
        const gap = g.x0 - into.parts.at(-1)!.x1;
        into.text += (gap > 0.08 * h ? " " : "") + g.text;
        into.parts.push(g);
      } else open.push({ text: g.text, parts: [g] });
    }
    runs.push(...open);
  }
  return runs.slice(0, 200).map((r) => ({ text: r.text.slice(0, 80), boxes: r.parts.slice(0, 80).map((g) => [g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0] as [number, number, number, number]) }));
}

/** Bilden ritas om i den här storleken – små bilder förstoras så att kanterna blir mjuka kurvor och inte trappsteg. */
const SIDE = 1600;
const MAX_COLORS = 10;
const MAX_SHAPES = 1500;
type Rgb = [number, number, number];
type Comp = { index: number; label: number; area: number; x0: number; y0: number; x1: number; y1: number; filled: number; path: string };

const d2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

async function fromImage(buf: Buffer): Promise<Converted> {
  const meta = await sharp(buf, { limitInputPixels: MAX_PIXELS })
    .metadata()
    .catch(() => null);
  if (!meta?.width || !meta.height || !["png", "jpeg", "webp"].includes(meta.format ?? "")) throw new ConvertError("Filen går inte att läsa. Välj SVG, AI, PDF, PNG eller JPG.");
  if (Math.max(meta.width, meta.height) < 300) throw new ConvertError("Bilden är för liten – välj en som är minst 1000 pixlar bred.");
  const { data, info } = await sharp(buf, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize(SIDE, SIDE, { fit: "inside", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [W, H] = [info.width, info.height];
  const n = W * H;
  const px = (p: number): Rgb => [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];

  // Bakgrunden: genomskinligt om kanten är genomskinlig, annars kantens vanligaste färg – överallt, även inne i bokstäver.
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, n - W + x);
  for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);
  const clear = border.filter((p) => data[p * 4 + 3] < 128).length > border.length / 2;
  let paper: Rgb | null = null;
  if (!clear) {
    const bins = new Map<number, [number, number, number, number]>();
    for (const p of border) {
      const [r, g, b] = px(p);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const s = bins.get(key) ?? [0, 0, 0, 0];
      bins.set(key, [s[0] + 1, s[1] + r, s[2] + g, s[3] + b]);
    }
    const [c, r, g, b] = [...bins.values()].sort((x, y) => y[0] - x[0])[0];
    paper = [r / c, g / c, b / c];
  }
  const isBg = (p: number) => data[p * 4 + 3] < 128 || (paper !== null && d2(px(p), paper) < 48 ** 2);

  // Färgerna: de vanligaste färgklustren bland designens pixlar.
  const hist = new Map<number, { n: number; sum: Rgb; used: boolean }>();
  let fg = 0;
  for (let p = 0; p < n; p++) {
    if (isBg(p)) continue;
    fg++;
    const [r, g, b] = px(p);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const h = hist.get(key) ?? { n: 0, sum: [0, 0, 0] as Rgb, used: false };
    h.n++;
    h.sum[0] += r;
    h.sum[1] += g;
    h.sum[2] += b;
    hist.set(key, h);
  }
  if (fg < n * 0.002) throw new ConvertError("Hittade ingen design i bilden.");
  const bins = [...hist.values()].sort((a, b) => b.n - a.n);
  const mean = (h: { n: number; sum: Rgb }): Rgb => [h.sum[0] / h.n, h.sum[1] / h.n, h.sum[2] / h.n];
  let palette: Rgb[] = [];
  for (let tries = 0; tries < 200 && palette.length < MAX_COLORS; tries++) {
    const seed = bins.find((b) => !b.used);
    if (!seed || seed.n < fg * 0.0005) break;
    const at = mean(seed);
    const acc = { n: 0, sum: [0, 0, 0] as Rgb };
    for (const b of bins) {
      if (b.used || d2(mean(b), at) > 40 ** 2) continue;
      b.used = true;
      acc.n += b.n;
      for (let k = 0; k < 3; k++) acc.sum[k] += b.sum[k];
    }
    if (acc.n >= fg * 0.003) palette.push(mean(acc));
  }
  if (!palette.length) throw new ConvertError("Hittade ingen design i bilden.");

  const label = new Int16Array(n).fill(-1);
  /**
   * Varje pixel får närmaste färg. En kantpixel är en blandning av två färger – grått mellan svart text och vit botten –
   * och hamnar hos den av de två den ligger närmast på blandningen, annars kan den likna en helt annan färg mer.
   */
  const assign = () => {
    const ends = paper ? [...palette, paper] : palette;
    let near = 0;
    for (let p = 0; p < n; p++) {
      if (isBg(p)) {
        label[p] = -1;
        continue;
      }
      const c = px(p);
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < ends.length; k++) {
        const d = d2(c, ends[k]);
        if (d < bd) [bd, best] = [d, k];
      }
      if (bd > 30 ** 2)
        for (let a = 0; a < ends.length; a++)
          for (let b = a + 1; b < ends.length; b++) {
            const [A, B] = [ends[a], ends[b]];
            const dir: Rgb = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
            const len = dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2 || 1;
            const t = Math.min(1, Math.max(0, ((c[0] - A[0]) * dir[0] + (c[1] - A[1]) * dir[1] + (c[2] - A[2]) * dir[2]) / len));
            const d = d2(c, [A[0] + t * dir[0], A[1] + t * dir[1], A[2] + t * dir[2]]);
            if (d < bd) [bd, best] = [d, t < 0.5 ? a : b];
          }
      label[p] = best === palette.length ? -1 : best;
      if (bd < 60 ** 2) near++;
    }
    return near;
  };
  if (assign() < fg * 0.8) throw new ConvertError("Bilden ser ut som ett foto eller har övertoningar. Välj en design med rena färger, eller ladda upp SVG eller AI.");
  majority(label, W, H);

  // Kantfärger – blandningen mellan två färger längs kanterna – har nästan inga pixlar inne i en yta; de tas bort.
  const inner = new Array<number>(palette.length).fill(0);
  const total = new Array<number>(palette.length).fill(0);
  const exact: Rgb[] = palette.map(() => [0, 0, 0]);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      const l = label[p];
      if (l < 0) continue;
      total[l]++;
      if (label[p - 1] === l && label[p + 1] === l && label[p - W] === l && label[p + W] === l) {
        inner[l]++;
        for (let k = 0; k < 3; k++) exact[l][k] += data[p * 4 + k];
      }
    }
  const keep = palette.map((_, k) => total[k] > 0 && inner[k] / total[k] >= 0.25);
  if (keep.some((k) => !k)) {
    palette = palette.flatMap((_, k) => (keep[k] ? [exact[k].map((v) => v / inner[k]) as Rgb] : []));
    if (!palette.length) throw new ConvertError("Hittade ingen design i bilden.");
    assign();
    majority(label, W, H);
  } else palette = palette.map((_, k) => exact[k].map((v) => v / Math.max(1, inner[k])) as Rgb);

  const comps = components(label, W, H);
  const minArea = Math.max(6, n * 3e-6);
  const kept = comps.list.filter((c) => c.area >= minArea);
  if (kept.length > MAX_SHAPES) throw new ConvertError("Bilden har för många små detaljer för att läsas – välj en renare version, eller ladda upp SVG eller AI.");

  for (const c of kept) c.path = await trace(c, comps.id, label, W, H, palette[c.label]);
  const drawn = kept.filter((c) => c.path).sort((a, b) => b.filled - a.filled);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${drawn.map((c) => c.path).join("")}</svg>`;
  if (svg.length > MAX_SVG) throw new ConvertError("Bilden har för många detaljer för att läsas – välj en renare version, eller ladda upp SVG eller AI.");
  return { svg, source: "image", words: [], fonts: [] };
}

/** Byter en pixel mot grannarnas färg när minst sex av åtta grannar har samma, så att brus och enstaka kantpixlar försvinner. */
function majority(label: Int16Array, W: number, H: number) {
  const src = label.slice();
  const counts = new Map<number, number>();
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      counts.clear();
      for (const q of [p - W - 1, p - W, p - W + 1, p - 1, p + 1, p + W - 1, p + W, p + W + 1]) counts.set(src[q], (counts.get(src[q]) ?? 0) + 1);
      for (const [l, c] of counts)
        if (c >= 6 && l !== src[p]) {
          label[p] = l;
          break;
        }
    }
}

/** Sammanhängande ytor av samma färg (åtta grannar). */
function components(label: Int16Array, W: number, H: number) {
  const id = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const list: Comp[] = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] < 0 || id[start] >= 0) continue;
    const me = list.length;
    const c: Comp = { index: me, label: label[start], area: 0, x0: W, y0: H, x1: 0, y1: 0, filled: 0, path: "" };
    let top = 0;
    stack[top++] = start;
    id[start] = me;
    while (top) {
      const p = stack[--top];
      const [x, y] = [p % W, (p / W) | 0];
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (id[q] < 0 && label[q] === c.label) {
            id[q] = me;
            stack[top++] = q;
          }
        }
    }
    list.push(c);
  }
  return { id, list };
}

const PAD = 2;

/**
 * Ritar om en yta som en bana. Hål som andra färger fyller täpps till – ytan läggs under dem, så att det inte blir
 * glipor mellan färgerna – medan hål där bakgrunden syns (insidan av ett O) står kvar.
 */
async function trace(c: Comp, id: Int32Array, label: Int16Array, W: number, H: number, color: Rgb) {
  const [cw, ch] = [c.x1 - c.x0 + 1 + 2 * PAD, c.y1 - c.y0 + 1 + 2 * PAD];
  const at = (x: number, y: number) => {
    const [gx, gy] = [x + c.x0 - PAD, y + c.y0 - PAD];
    return gx < 0 || gy < 0 || gx >= W || gy >= H ? -1 : gy * W + gx;
  };
  // 1 = ytan, 2 = utanför, 0 = hål som ännu inte är avgjort
  const m = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const g = at(x, y);
      if (g >= 0 && id[g] === c.index) m[y * cw + x] = 1;
    }
  const stack = new Int32Array(cw * ch);
  const fill = (start: number, to: number, seen?: number[]) => {
    let top = 0;
    stack[top++] = start;
    m[start] = to;
    while (top) {
      const p = stack[--top];
      seen?.push(p);
      const [x, y] = [p % cw, (p / cw) | 0];
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const q = ny * cw + nx;
        if (m[q] === 0) {
          m[q] = to;
          stack[top++] = q;
        }
      }
    }
  };
  fill(0, 2);
  for (let p = 0; p < m.length; p++) {
    if (m[p] !== 0) continue;
    const hole: number[] = [];
    fill(p, 3, hole);
    const open = hole.some((q) => {
      const g = at(q % cw, (q / cw) | 0);
      return g < 0 || label[g] < 0;
    });
    for (const q of hole) m[q] = open ? 2 : 1;
  }
  const gray = Buffer.alloc(cw * ch, 255);
  let filled = 0;
  for (let p = 0; p < m.length; p++)
    if (m[p] === 1) {
      gray[p] = 0;
      filled++;
    }
  c.filled = filled;
  const png = await sharp(gray, { raw: { width: cw, height: ch, channels: 1 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const tag = await new Promise<string>((resolve, reject) => {
    const p = new Potrace({ turdSize: 2, alphaMax: 1, optCurve: true, optTolerance: 0.2, threshold: 128, blackOnWhite: true });
    p.loadImage(png, (err) => (err ? reject(err) : resolve(p.getPathTag(hex(color)))));
  });
  const d = /\sd="([^"]+)"/.exec(tag)?.[1]?.trim();
  if (!d) return "";
  return `<path d="${round(d, 1)}" fill="${hex(color)}" fill-rule="evenodd" transform="translate(${c.x0 - PAD} ${c.y0 - PAD})"/>`;
}
