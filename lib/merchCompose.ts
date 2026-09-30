import { loadImage } from "./compose";
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

function fitArt(art: HTMLCanvasElement, box: LibraryEntry["box"], curved: boolean, coverage: number) {
  const scale = Math.min((box.w * coverage) / art.width, (box.h * coverage) / art.height);
  const w = Math.max(1, Math.round(art.width * scale));
  const h = Math.max(1, Math.round(art.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (!curved) {
    ctx.drawImage(art, 0, 0, w, h);
  } else {
    const k = 0.9;
    const norm = Math.asin(k);
    for (let dx = 0; dx < w; dx++) {
      const u = (dx / (w - 1 || 1)) * 2 - 1;
      const sx = ((Math.asin(u * k) / norm + 1) / 2) * (art.width - 1);
      ctx.drawImage(art, Math.floor(sx), 0, 1, art.height, dx, 0, 1, h);
    }
  }
  return c;
}

export async function composeMerch(opts: {
  product: MerchProduct;
  entry: LibraryEntry;
  blankUrl: string;
  artUrl: string;
  size?: number;
}): Promise<string> {
  const { product, entry } = opts;
  const [blank, artImg] = await Promise.all([loadImage(opts.blankUrl), loadImage(opts.artUrl)]);
  const W = entry.width;
  const H = entry.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(blank, 0, 0, W, H);

  const art = fitArt(trimmed(artImg), entry.box, product.curved, product.art === "crest" ? 0.85 : 0.92);
  const ox = Math.round(entry.box.x + (entry.box.w - art.width) / 2);
  const oy = Math.round(entry.box.y + (entry.box.h - art.height) / 2);
  const base = ctx.getImageData(ox, oy, art.width, art.height);
  const ink = art.getContext("2d")!.getImageData(0, 0, art.width, art.height).data;
  const px = base.data;

  const lum = (i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const samples: number[] = [];
  for (let i = 0; i < px.length; i += 4 * 7) samples.push(lum(i));
  samples.sort((a, b) => a - b);
  const ref = samples[Math.floor(samples.length * 0.7)] || 230;

  const engraved = product.finish !== "print";
  const tone = engraved ? (product.engraveInk ?? "rgba(120,120,125,0.35)").match(/[\d.]+/g)!.map(Number) : null;

  for (let i = 0; i < px.length; i += 4) {
    const a = ink[i + 3] / 255;
    if (a <= 0.02) continue;
    const x = (i / 4) % art.width;
    const edge = product.curved ? 1 - 0.28 * Math.pow(Math.abs((x / art.width) * 2 - 1), 3) : 1;
    if (tone) {
      const inkLum = (0.299 * ink[i] + 0.587 * ink[i + 1] + 0.114 * ink[i + 2]) / 255;
      const strength = a * tone[3] * (1 - inkLum * 0.35) * edge;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(tone[c] * strength + px[i + c] * (1 - strength));
    } else {
      const shade = Math.min(1.1, Math.max(0.45, lum(i) / ref)) * edge;
      const alpha = a * 0.96;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(Math.min(255, ink[i + c] * shade) * alpha + px[i + c] * (1 - alpha));
    }
  }
  ctx.putImageData(base, ox, oy);

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
