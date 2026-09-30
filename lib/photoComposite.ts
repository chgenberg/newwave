import sharp from "sharp";

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
};

const isMarker = (r: number, g: number, b: number) => g > 120 && g > r * 1.5 && g > b * 1.5 && r < 150 && b < 150;

type Point = { x: number; y: number };
export type Marker = {
  width: number;
  height: number;
  box: { x: number; y: number; w: number; h: number };
  quad: [Point, Point, Point, Point];
  maskPng: Buffer;
};

function extreme(points: Point[], score: (p: Point) => number): Point {
  const top = [...points].sort((a, b) => score(b) - score(a)).slice(0, 40);
  return { x: top.reduce((s, p) => s + p.x, 0) / top.length, y: top.reduce((s, p) => s + p.y, 0) / top.length };
}

export async function detectMarker(photo: Buffer): Promise<Marker | null> {
  const { data, info } = await sharp(photo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0, px = 0; px < W * H; i += 3, px++) {
    if (isMarker(data[i], data[i + 1], data[i + 2])) {
      xs.push(px % W);
      ys.push(Math.floor(px / W));
    }
  }
  if (xs.length < W * H * 0.01) return null;
  const x0 = percentile(xs, 0.005), x1 = percentile(xs, 0.995);
  const y0 = percentile(ys, 0.005), y1 = percentile(ys, 0.995);
  if (x1 - x0 < W * 0.08 || y1 - y0 < H * 0.05) return null;

  const inside: Point[] = [];
  for (let k = 0; k < xs.length; k += 2) if (xs[k] >= x0 && xs[k] <= x1 && ys[k] >= y0 && ys[k] <= y1) inside.push({ x: xs[k], y: ys[k] });
  const quad: Marker["quad"] = [
    extreme(inside, (p) => -(p.x + p.y)),
    extreme(inside, (p) => p.x - p.y),
    extreme(inside, (p) => p.x + p.y),
    extreme(inside, (p) => p.y - p.x),
  ];

  const R = 10;
  const alpha = Buffer.alloc(W * H * 4, 255);
  for (let y = Math.max(0, y0 - R); y < Math.min(H, y1 + R); y++) {
    for (let x = Math.max(0, x0 - R); x < Math.min(W, x1 + R); x++) alpha[(y * W + x) * 4 + 3] = 0;
  }
  const maskPng = await sharp(alpha, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return { width: W, height: H, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, quad, maskPng };
}

type Mat = [number, number, number, number, number, number, number, number, number];

function squareToQuad([p0, p1, p2, p3]: Marker["quad"]): Mat {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(det) < 1e-9 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
  const h = Math.abs(det) < 1e-9 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

function invert(m: Mat): Mat {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

async function luminance(img: Buffer, W: number, H: number, sigma: number) {
  const pipe = sharp(img).resize(W, H, { fit: "fill" }).removeAlpha().greyscale();
  const { data } = await (sigma > 0.3 ? pipe.blur(sigma) : pipe).raw().toBuffer({ resolveWithObject: true });
  return data;
}

export async function printOntoFabric(
  blank: Buffer,
  print: Buffer,
  marker: Marker,
  opts: { ink?: "light" | "dark"; anchor?: "top" | "center"; width?: number } = {},
): Promise<Buffer> {
  const { width: W, height: H, quad } = marker;
  const ink = opts.ink ?? "light";
  const { data: base } = await sharp(blank).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [soft, fold] = await Promise.all([luminance(blank, W, H, 1.2), luminance(blank, W, H, 5)]);

  const qW = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const qH = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;

  const trimmed = await sharp(print).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const aspect = meta.height! / meta.width!;
  const pw = Math.min(opts.width ?? 0.88, (0.92 * qH) / (qW * aspect));
  const ph = (pw * qW * aspect) / qH;
  const u0 = (1 - pw) / 2;
  const v0 = (opts.anchor ?? "top") === "top" ? Math.min(0.06, 1 - ph) : (1 - ph) / 2;

  const PW = Math.max(8, Math.round(qW * pw * 1.25));
  const PH = Math.max(8, Math.round(PW * aspect));
  const art = await sharp(trimmed).resize(PW, PH, { fit: "fill" }).blur(0.6).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const A = art.data;

  const sample = (x: number, y: number, out: number[]) => {
    const fx = Math.min(PW - 1.001, Math.max(0, x)), fy = Math.min(PH - 1.001, Math.max(0, y));
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const i00 = (iy * PW + ix) * 4, i10 = i00 + 4, i01 = i00 + PW * 4, i11 = i01 + 4;
    for (let c = 0; c < 4; c++) {
      const top = A[i00 + c] * (1 - tx) + A[i10 + c] * tx;
      const bot = A[i01 + c] * (1 - tx) + A[i11 + c] * tx;
      out[c] = top * (1 - ty) + bot * ty;
    }
  };

  const toSquare = invert(squareToQuad(quad));
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const bx0 = Math.max(0, Math.floor(Math.min(...xs)) - 12), bx1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 12);
  const by0 = Math.max(0, Math.floor(Math.min(...ys)) - 12), by1 = Math.min(H - 1, Math.ceil(Math.max(...ys)) + 12);

  const foldSamples: number[] = [];
  for (let y = by0; y <= by1; y += 4) for (let x = bx0; x <= bx1; x += 4) foldSamples.push(fold[y * W + x]);
  const foldMean = foldSamples.reduce((s, v) => s + v, 0) / foldSamples.length;
  const ref = percentile(foldSamples, 0.75) || 230;
  const displace = qW * 0.028;

  const out = Buffer.from(base);
  const px = [0, 0, 0, 0];
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const li = y * W + x;
      const d = (fold[li] - foldMean) / 255;
      const sx = x + d * displace;
      const sy = y + d * displace * 0.7;
      const [a, b, c, dd, e, f, g, h, i] = toSquare;
      const wq = g * sx + h * sy + i;
      const u = (a * sx + b * sy + c) / wq;
      const v = (dd * sx + e * sy + f) / wq;
      const pu = (u - u0) / pw, pv = (v - v0) / ph;
      if (pu < 0 || pu > 1 || pv < 0 || pv > 1) continue;
      sample(pu * (PW - 1), pv * (PH - 1), px);
      let alpha = (px[3] / 255) * 0.97;
      if (alpha <= 0.01) continue;

      const o = li * 3;
      if (ink === "light") {
        alpha *= 1 - smoothstep(0.8, 0.95, Math.min(px[0], px[1], px[2]) / 255);
        if (alpha <= 0.01) continue;
        for (let k = 0; k < 3; k++) {
          const inkC = (px[k] + (255 - px[k]) * 0.05) / 255;
          out[o + k] = Math.round(base[o + k] * (1 - alpha + alpha * inkC));
        }
      } else {
        const shade = Math.min(1.08, Math.max(0.4, soft[li] / ref));
        const grain = (soft[li] - fold[li]) * 0.6;
        for (let k = 0; k < 3; k++) {
          const c2 = Math.min(255, Math.max(0, px[k] * 0.93 * shade + grain));
          out[o + k] = Math.round(c2 * alpha + base[o + k] * (1 - alpha));
        }
      }
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
