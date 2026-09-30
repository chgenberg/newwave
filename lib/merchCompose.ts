import { loadImage } from "./compose";
import { apply, invert, squareToQuad, type Point } from "./homography";
import type { LibraryEntry, MerchProduct } from "./merch";

function trimmed(img: HTMLImageElement) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return c;
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function scaled(art: HTMLCanvasElement, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Bilinear sample with alpha-weighted colour so edges don't pick up dark fringes. */
function sample(img: ImageData, x: number, y: number, out: number[]) {
  const { width: w, height: h, data } = img;
  out[0] = out[1] = out[2] = out[3] = 0;
  if (x < -1 || y < -1 || x > w || y > h) return;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= h) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i;
      if (xx < 0 || xx >= w) continue;
      const wgt = (i ? fx : 1 - fx) * wy;
      const k = (yy * w + xx) * 4;
      const al = data[k + 3] * wgt;
      r += data[k] * al;
      g += data[k + 1] * al;
      b += data[k + 2] * al;
      a += al;
    }
  }
  if (a <= 0) return;
  out[0] = r / a;
  out[1] = g / a;
  out[2] = b / a;
  out[3] = a / 255;
}

function blurred(lum: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += lum[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += lum[y * w + Math.min(w - 1, x + r + 1)] - lum[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export async function composeMerch(opts: {
  product: MerchProduct;
  entry: LibraryEntry;
  blankUrl: string;
  artUrl: string;
  size?: number;
  artScale?: number;
}): Promise<string> {
  const { product, entry } = opts;
  const { box } = entry;
  const surface = product.surface;
  const [blank, artImg] = await Promise.all([loadImage(opts.blankUrl), loadImage(opts.artUrl)]);
  const W = entry.width;
  const H = entry.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(blank, 0, 0, W, H);

  const art = trimmed(artImg);
  const coverage = (product.art === "crest" ? 0.85 : surface.kind === "cylinder" ? 0.98 : 0.92) * (opts.artScale ?? 1);
  const quad = surface.kind === "flat" && entry.quad?.length === 4 ? (entry.quad.map(([x, y]) => ({ x, y })) as [Point, Point, Point, Point]) : null;
  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const faceW = quad ? (len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2 : box.w;
  const faceH = quad ? (len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2 : box.h;
  const R = surface.kind === "cylinder" ? surface.radius * box.w : 0;
  const maxWidth = R ? 2 * R * Math.asin(Math.min(0.9, (box.w * coverage) / (2 * R))) : faceW * coverage;
  const k = Math.min(maxWidth / art.width, (faceH * coverage) / art.height);
  const aw = Math.max(1, Math.round(art.width * k));
  const ah = Math.max(1, Math.round(art.height * k));
  const src = scaled(art, aw, ah);

  const cx = box.x + box.w / 2;
  const top = box.y + (box.h - ah) / 2;
  const halfW = R ? R * Math.sin(aw / (2 * R)) : aw / 2;
  const lift = surface.kind === "cylinder" ? surface.sag * R : 0;
  const fold = surface.kind === "fabric" ? 10 : 0;
  const toFace = quad ? invert(squareToQuad(quad)) : null;
  const [rx0, rx1, ry0, ry1] = quad
    ? [
        Math.max(0, Math.floor(Math.min(...quad.map((q) => q.x)))),
        Math.min(W, Math.ceil(Math.max(...quad.map((q) => q.x)))),
        Math.max(0, Math.floor(Math.min(...quad.map((q) => q.y)))),
        Math.min(H, Math.ceil(Math.max(...quad.map((q) => q.y)))),
      ]
    : [
        Math.max(0, Math.floor(cx - halfW - fold - 2)),
        Math.min(W, Math.ceil(cx + halfW + fold + 2)),
        Math.max(0, Math.floor(top - lift - fold - 2)),
        Math.min(H, Math.ceil(top + ah + fold + 2)),
      ];
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  const base = ctx.getImageData(rx0, ry0, rw, rh);
  const px = base.data;

  const lum = new Float32Array(rw * rh);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const soft = surface.kind === "fabric" ? blurred(lum, rw, rh, Math.max(3, Math.round(box.w / 45))) : null;

  const engraved = product.finish !== "print";
  const tone = engraved ? (product.engraveInk ?? "rgba(120,120,125,0.35)").match(/[\d.]+/g)!.map(Number) : null;
  const knockWhite = !engraved && product.variant === "light";
  const embroidered = product.art === "crest";
  const s = [0, 0, 0, 0];
  const shadow = [0, 0, 0, 0];

  const at = [0, 0, 1];
  const mapTo = (x: number, y: number, ref: number) => {
    const X = rx0 + x + 0.5;
    const Y = ry0 + y + 0.5;
    let ax: number, ay: number, density = 1;
    if (surface.kind === "cylinder") {
      const u = (X - cx) / R;
      if (Math.abs(u) >= 1) return false;
      const theta = Math.asin(u);
      const cos = Math.cos(theta);
      ax = theta * R + aw / 2;
      ay = Y - top + lift * (1 - cos);
      density = smoothstep(0.08, 0.4, cos) * (0.82 + 0.18 * cos);
    } else if (soft) {
      const i = y * rw + x;
      const gx = (soft[y * rw + Math.min(rw - 1, x + 1)] - soft[y * rw + Math.max(0, x - 1)]) / 2;
      const gy = (soft[Math.min(rh - 1, y + 1) * rw + x] - soft[Math.max(0, y - 1) * rw + x]) / 2;
      const f = (surface as { folds: number }).folds * 2.2;
      ax = X - (cx - aw / 2) + Math.max(-fold, Math.min(fold, gx * f));
      ay = Y - top + Math.max(-fold, Math.min(fold, gy * f + ((soft[i] - ref) / 255) * box.w * 0.012));
    } else if (toFace) {
      const f = apply(toFace, X, Y);
      if (f.x < 0 || f.x > 1 || f.y < 0 || f.y > 1) return false;
      ax = (f.x - 0.5) * faceW + aw / 2;
      ay = (f.y - 0.5) * faceH + ah / 2;
    } else {
      ax = X - (cx - aw / 2);
      ay = Y - top;
    }
    at[0] = ax;
    at[1] = ay;
    at[2] = density;
    return true;
  };

  let ref = 230;
  const footprint: number[] = [];
  for (let y = 0; y < rh; y += 3) {
    for (let x = 0; x < rw; x += 3) {
      if (!mapTo(x, y, 0)) continue;
      sample(src, at[0] - 0.5, at[1] - 0.5, s);
      if (s[3] > 0.1) footprint.push(lum[y * rw + x]);
    }
  }
  if (footprint.length) ref = footprint.sort((a, b) => a - b)[Math.floor(footprint.length * 0.7)];

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (!mapTo(x, y, ref)) continue;
      sample(src, at[0] - 0.5, at[1] - 0.5, s);
      let a = s[3] * at[2];
      if (embroidered && a < 0.98) {
        sample(src, at[0] - 1.5, at[1] - 3, shadow);
        const p = (y * rw + x) * 4;
        const dim = 1 - 0.35 * shadow[3] * (1 - a);
        for (let c = 0; c < 3; c++) px[p + c] *= dim;
      }
      if (a <= 0.02) continue;
      if (knockWhite) a *= 1 - smoothstep(0.82, 0.96, Math.min(s[0], s[1], s[2]) / 255);
      if (a <= 0.02) continue;
      const p = (y * rw + x) * 4;
      if (tone) {
        const inkLum = (0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2]) / 255;
        const strength = a * tone[3] * (1 - inkLum * 0.35);
        for (let c = 0; c < 3; c++) px[p + c] = Math.round(tone[c] * strength + px[p + c] * (1 - strength));
      } else {
        const l = lum[y * rw + x];
        const shade = embroidered
          ? Math.min(1.15, Math.max(0.55, 0.9 + ((l - ref) / ref) * 1.6))
          : Math.min(1.08, Math.max(0.3, l / ref));
        const alpha = a * 0.95;
        for (let c = 0; c < 3; c++) {
          const ink = knockWhite ? (s[c] / 255) * px[p + c] * Math.min(1, 255 / ref) : Math.min(255, s[c] * shade);
          px[p + c] = Math.round(ink * alpha + px[p + c] * (1 - alpha));
        }
      }
    }
  }
  ctx.putImageData(base, rx0, ry0);

  const all = ctx.getImageData(0, 0, W, H);
  const d = all.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    if (m <= 236) continue;
    const t = Math.min(1, (m - 236) / 14);
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] + (255 - d[i + c]) * t);
  }
  ctx.putImageData(all, 0, 0);

  const size = opts.size ?? 900;
  if (size === W) return canvas.toDataURL("image/jpeg", 0.9);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = Math.round((H / W) * size);
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.9);
}
