import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { type Quad, surface } from "@/lib/newwave/printSurface";
import { type Flat, recolor } from "@/lib/newwave/vector/svg";
import { emblemSet } from "./emblem";
import { placementArt, printOn, rasterize } from "./mockup";
import { type GrasrotProduct, type ProductColor, type ProductId } from "./products";
import { grasrotWordmark } from "./wordmark";

/**
 * Bildmodellen ritar om små märken med förvrängd text. Herobildens klubbmärken byts därför mot tryckfilernas: varje
 * märke på fotot är uppmätt (mitt, storlek och vridning, i herobildens pixlar), det gamla målas bort med omgivningens
 * ljus och korn, och märket trycks på med fotots ljus precis som i webbshopens produktbilder. Mätningen görs en gång
 * per foto med scripts/grasrot-hero-marks.ts och sparas bredvid fotot.
 */

export type HeroMark = { product: ProductId; cx: number; cy: number; w: number; h: number; rz: number };
export const marksFile = (id: string) => path.join(process.cwd(), "assets", "grasrot", id, "herobild-marken.json");

export async function heroMarks(id: string): Promise<HeroMark[]> {
  const raw = await readFile(marksFile(id), "utf8").catch(() => null);
  return raw ? (JSON.parse(raw) as HeroMark[]) : [];
}

/** Klubbmärket som det ser ut på produkten: halsdukens är negativt, ordmärkets i ordmärkets färg. */
export async function markArt(id: string, product: GrasrotProduct, color: ProductColor): Promise<Flat | null> {
  const set = await emblemSet(id);
  if (!set) return null;
  if (product.id === "halsduk") return set.negativ;
  const placement = product.design(color);
  if (placement.art !== "ordmarke") return placementArt(id, placement);
  if (placement.variant !== "original") return set[placement.variant];
  const wordmark = await grasrotWordmark(id, "original");
  return wordmark && recolor(set.solid, () => wordmark.colors[0]);
}

/** Märkets hörn, i bildpunkter. */
export function markQuad(m: Pick<HeroMark, "cx" | "cy" | "w" | "h" | "rz">): Quad {
  const [c, s] = [Math.cos((m.rz * Math.PI) / 180), Math.sin((m.rz * Math.PI) / 180)];
  const at = (u: number, v: number): [number, number] => [m.cx + u * c - v * s, m.cy + u * s + v * c];
  return [at(-m.w / 2, -m.h / 2), at(m.w / 2, -m.h / 2), at(m.w / 2, m.h / 2), at(-m.w / 2, m.h / 2)];
}

/** Separerbar boxoskärpa i tre pass av en gråskala `w` × `h`. */
function blur(src: Float32Array, w: number, h: number, r: number) {
  let cur = src;
  for (let pass = 0; pass < 6; pass++) {
    const horizontal = pass % 2 === 0;
    const out = new Float32Array(cur.length);
    const [lines, len] = horizontal ? [h, w] : [w, h];
    for (let line = 0; line < lines; line++) {
      const at = (i: number) => (horizontal ? line * w + Math.min(len - 1, Math.max(0, i)) : Math.min(len - 1, Math.max(0, i)) * w + line);
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += cur[at(i)];
      for (let i = 0; i < len; i++) {
        out[at(i)] = acc / (2 * r + 1);
        acc += cur[at(i + r + 1)] - cur[at(i - r)];
      }
    }
    cur = out;
  }
  return cur;
}

/** Största värdet inom `r` bildpunkter (kvadratiskt), så att även tunn text i märket får en bred marginal. */
function dilate(src: Float32Array, w: number, h: number, r: number) {
  const pass = (from: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(from.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = -r; k <= r; k++) {
          const [xx, yy] = horizontal ? [x + k, y] : [x, y + k];
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && from[yy * w + xx] > v) v = from[yy * w + xx];
        }
        out[y * w + x] = v;
      }
    return out;
  };
  return pass(pass(src, true), false);
}

const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());

/** Byter ett märke på fotot (RGBA, `W` brett) mot `flat`. */
async function stamp(px: Uint8ClampedArray, W: number, H: number, m: HeroMark, flat: Flat, o: { dark: boolean; soft: boolean }) {
  const S = Math.min(W, H, Math.round(Math.max(m.w, m.h) * 1.8));
  const x0 = Math.max(0, Math.min(W - S, Math.round(m.cx - S / 2)));
  const y0 = Math.max(0, Math.min(H - S, Math.round(m.cy - S / 2)));
  const crop = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) crop.set(px.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + S) * 4), y * S * 4);
  const q = markQuad({ ...m, cx: m.cx - x0, cy: m.cy - y0 }).map(([x, y]) => [x / S, y / S]) as Quad;
  const s = surface({ quad: q, aspect: flat.box.w / flat.box.h });

  // Var märket sitter: svart märke på vitt, utvidgat så att det gamla märkets kanter också målas bort.
  const white = new Uint8ClampedArray(S * S * 4).fill(255);
  const sil = await printOn({ data: white, size: S }, s, recolor(flat, () => "#000000"), { dark: false, soft: false });
  const grow = Math.max(2, Math.round(Math.max(m.w, m.h) * 0.1));
  const raw = new Float32Array(S * S);
  for (let i = 0; i < raw.length; i++) raw[i] = 1 - sil[i * 4] / 255;
  const mask = blur(dilate(raw, S, S, grow), S, S, Math.max(1, grow >> 2));

  // Det gamla märket ersätts av omgivningen: normaliserad oskärpa av det som ligger utanför, plus fotots korn.
  const keep = mask.map((v) => 1 - v);
  const wide = blur(keep, S, S, Math.max(4, Math.round(Math.max(m.w, m.h) * 0.22)));
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(S * S);
    for (let i = 0; i < ch.length; i++) ch[i] = crop[i * 4 + c];
    const fine = blur(ch, S, S, 1);
    let [grain, n] = [0, 0];
    for (let i = 0; i < ch.length; i++)
      if (keep[i] > 0.99) {
        grain += (ch[i] - fine[i]) ** 2;
        n++;
      }
    const sigma = n ? Math.sqrt(grain / n) : 0;
    const fill = blur(ch.map((v, i) => v * keep[i]), S, S, Math.max(4, Math.round(Math.max(m.w, m.h) * 0.22)));
    for (let i = 0; i < ch.length; i++) {
      if (mask[i] <= 0) continue;
      const v = fill[i] / Math.max(1e-4, wide[i]) + gauss() * sigma;
      crop[i * 4 + c] = ch[i] * (1 - mask[i]) + v * mask[i];
    }
  }

  const out = await printOn({ data: crop, size: S }, s, flat, o);
  for (let y = 0; y < S; y++) px.set(out.subarray(y * S * 4, (y + 1) * S * 4), ((y0 + y) * W + x0) * 4);
}

/** Herobilden med tryckfilernas klubbmärken i stället för bildmodellens. */
export async function stampMarks(jpg: Buffer, id: string, products: GrasrotProduct[], colors: Record<string, ProductColor>, marks: HeroMark[]): Promise<Buffer> {
  if (!marks.length) return jpg;
  const { data, info } = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  for (const m of marks) {
    const product = products.find((p) => p.id === m.product);
    const color = product && colors[product.id];
    const flat = color && (await markArt(id, product, color));
    if (!flat) continue;
    const dark = product.id === "halsduk" || color.dark;
    await stamp(px, info.width, info.height, m, flat, { dark, soft: product.id !== "flaska" });
  }
  return sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width: info.width, height: info.height, channels: 4 } })
    .removeAlpha()
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/** Märket som gråskala för mätningen. */
async function template(flat: Flat, width: number) {
  const r = await rasterize(flat, width);
  const { width: w, height: h } = r.info;
  const gray = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    alpha[i] = r.data[i * 4 + 3] / 255;
    gray[i] = (0.2126 * r.data[i * 4] + 0.7152 * r.data[i * 4 + 1] + 0.0722 * r.data[i * 4 + 2]) / 255;
  }
  return { gray, alpha, w, h };
}

/**
 * Mäter upp märket på fotot nära gissningen: den mitt, storlek och vridning där tryckfilens märke stämmer bäst med
 * fotot (normaliserad korrelation). Gissningen – mitt, bredd och höjd som märket syns på fotot – behöver bara ligga
 * inom en femtedel av märkets storlek.
 */
export async function measureMark(gray: Float32Array, W: number, H: number, guess: HeroMark, flat: Flat): Promise<HeroMark & { score: number }> {
  const t = await template(flat, 320);
  const span = Math.max(guess.w, guess.h) * 1.7;
  const [wx0, wy0] = [Math.max(0, Math.round(guess.cx - span / 2)), Math.max(0, Math.round(guess.cy - span / 2))];
  const [wx1, wy1] = [Math.min(W, Math.round(guess.cx + span / 2)), Math.min(H, Math.round(guess.cy + span / 2))];
  const ring: number[] = [];
  for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) if (y === wy0 || y === wy1 - 1 || x === wx0 || x === wx1 - 1) ring.push(gray[y * W + x]);
  ring.sort((a, b) => a - b);
  const bg = ring[ring.length >> 1];

  const score = (c: HeroMark) => {
    const [co, si] = [Math.cos((-c.rz * Math.PI) / 180), Math.sin((-c.rz * Math.PI) / 180)];
    let [sa, sb, saa, sbb, sab, n] = [0, 0, 0, 0, 0, 0];
    for (let y = wy0; y < wy1; y += 2)
      for (let x = wx0; x < wx1; x += 2) {
        const [dx, dy] = [x - c.cx, y - c.cy];
        const u = (dx * co - dy * si) / c.w + 0.5;
        const v = (dx * si + dy * co) / c.h + 0.5;
        let a = bg;
        if (u >= 0 && u < 1 && v >= 0 && v < 1) {
          const k = Math.floor(v * t.h) * t.w + Math.floor(u * t.w);
          a = t.alpha[k] * t.gray[k] + (1 - t.alpha[k]) * bg;
        }
        const b = gray[y * W + x];
        sa += a;
        sb += b;
        saa += a * a;
        sbb += b * b;
        sab += a * b;
        n++;
      }
    const cov = sab / n - (sa / n) * (sb / n);
    return cov / Math.sqrt(Math.max(1e-9, (saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2)));
  };

  // Grovt: storlek och läge med gissningens proportion; sedan fint: vridning, proportion och läge.
  const base = Math.max(guess.w, guess.h);
  let best = { ...guess, score: -2 };
  const step = Math.max(1, Math.round(base * 0.04));
  for (let k = 0.75; k <= 1.3; k += 0.05)
    for (let dy = -base * 0.2; dy <= base * 0.2; dy += step)
      for (let dx = -base * 0.2; dx <= base * 0.2; dx += step) {
        const c = { ...guess, cx: guess.cx + dx, cy: guess.cy + dy, w: guess.w * k, h: guess.h * k };
        const sc = score(c);
        if (sc > best.score) best = { ...c, score: sc };
      }
  for (let round = 0; round < 3; round++) {
    const from = best;
    for (const rz of [-6, -3, 0, 3, 6].map((d) => from.rz + d / (round + 1)))
      for (const sx of [0.94, 1, 1.06].map((f) => 1 + (f - 1) / (round + 1)))
        for (const sy of [0.94, 1, 1.06].map((f) => 1 + (f - 1) / (round + 1)))
          for (const dy of [-1, 0, 1])
            for (const dx of [-1, 0, 1]) {
              const c = { ...from, cx: from.cx + dx * step, cy: from.cy + dy * step, w: from.w * sx, h: from.h * sy, rz };
              const sc = score(c);
              if (sc > best.score) best = { ...c, score: sc };
            }
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { product: guess.product, cx: r1(best.cx), cy: r1(best.cy), w: r1(best.w), h: r1(best.h), rz: r1(best.rz), score: Math.round(best.score * 1000) / 1000 };
}
