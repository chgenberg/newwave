import sharp from "sharp";

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
};

const isMarker = (r: number, g: number, b: number) => g > 120 && g > r * 1.5 && g > b * 1.5 && r < 150 && b < 150;

export type Marker = { width: number; height: number; box: { x: number; y: number; w: number; h: number }; maskPng: Buffer };

export async function detectMarker(photo: Buffer): Promise<Marker | null> {
  const { data, info } = await sharp(photo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const xs: number[] = [];
  const ys: number[] = [];
  const mask = new Uint8Array(W * H);
  for (let i = 0, px = 0; px < W * H; i += 3, px++) {
    if (isMarker(data[i], data[i + 1], data[i + 2])) {
      mask[px] = 1;
      xs.push(px % W);
      ys.push(Math.floor(px / W));
    }
  }
  if (xs.length < W * H * 0.01) return null;
  const x0 = percentile(xs, 0.005), x1 = percentile(xs, 0.995);
  const y0 = percentile(ys, 0.005), y1 = percentile(ys, 0.995);
  if (x1 - x0 < W * 0.08 || y1 - y0 < H * 0.05) return null;

  const R = 10;
  const alpha = Buffer.alloc(W * H * 4, 255);
  for (let y = Math.max(0, y0 - R); y < Math.min(H, y1 + R); y++) {
    for (let x = Math.max(0, x0 - R); x < Math.min(W, x1 + R); x++) alpha[(y * W + x) * 4 + 3] = 0;
  }
  const maskPng = await sharp(alpha, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return { width: W, height: H, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, maskPng };
}

export async function printOntoFabric(blank: Buffer, print: Buffer, marker: Marker, coverage = 0.98): Promise<Buffer> {
  const { width: W, height: H, box } = marker;
  const { data } = await sharp(blank).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const samples: number[] = [];
  for (let y = box.y; y < box.y + box.h; y += 3) for (let x = box.x; x < box.x + box.w; x += 3) samples.push(lum((y * W + x) * 3));
  const ref = percentile(samples, 0.7) || 230;

  const trimmed = await sharp(print).trim().png().toBuffer();
  const art = await sharp(trimmed)
    .resize({ width: Math.round(box.w * coverage), height: Math.round(box.h * coverage), fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ox = Math.round(box.x + (box.w - art.info.width) / 2);
  const oy = Math.round(box.y + (box.h - art.info.height) / 2);

  const out = Buffer.from(data);
  for (let y = 0; y < art.info.height; y++) {
    for (let x = 0; x < art.info.width; x++) {
      const pi = (y * art.info.width + x) * 4;
      const a = (art.data[pi + 3] / 255) * 0.96;
      if (a <= 0) continue;
      const px = ((oy + y) * W + (ox + x)) * 3;
      if (px < 0 || px >= out.length) continue;
      const shade = Math.min(1.12, Math.max(0.45, lum(px) / ref));
      for (let c = 0; c < 3; c++) {
        const ink = Math.min(255, art.data[pi + c] * shade);
        out[px + c] = Math.round(ink * a + data[px + c] * (1 - a));
      }
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}
