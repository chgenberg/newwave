/**
 * Hur väl en mall återskapar originalet den importerades från, 0–100: mallen ritad med originalets egna texter och
 * färger jämförs pixel för pixel med filen – formerna först, färgerna sedan. Klubbmärkets ruta räknas inte, där sitter
 * varje klubbs eget märke. Körs i webbläsaren, utan AI.
 */

type Box = { x: number; y: number; w: number; h: number };

const W = 240;
/** Mer än så här från vitt räknas som tryck. */
const INK = 0.12;
const BLUR = 2;

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bilden gick inte att läsa."));
    img.src = src;
  });

function pixels(img: HTMLImageElement, h: number, drawH: number, skip: Box[]) {
  const c = document.createElement("canvas");
  [c.width, c.height] = [W, h];
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, h);
  g.drawImage(img, 0, 0, W, drawH);
  g.fillStyle = "#fff";
  for (const b of skip) g.fillRect((b.x / 1000) * W, (b.y / 1000) * W, (b.w / 1000) * W, (b.h / 1000) * W);
  return g.getImageData(0, 0, W, h).data;
}

function inkOf(px: Uint8ClampedArray) {
  const ink = new Float32Array(px.length / 4);
  for (let i = 0; i < ink.length; i++) {
    const [r, g, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    ink[i] = 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > INK || Math.max(r, g, b) - Math.min(r, g, b) > 40 ? 1 : 0;
  }
  return ink;
}

/** Mjukar upp kanterna, så att en bokstav som ligger en pixel fel inte räknas som helt fel. */
function blur(src: Float32Array, h: number) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++) {
      let [sum, n] = [0, 0];
      for (let dy = -BLUR; dy <= BLUR; dy++)
        for (let dx = -BLUR; dx <= BLUR; dx++) {
          const [xx, yy] = [x + dx, y + dy];
          if (xx < 0 || yy < 0 || xx >= W || yy >= h) continue;
          sum += src[yy * W + xx];
          n++;
        }
      out[y * W + x] = sum / n;
    }
  return out;
}

/**
 * `original` är filen som bild över hela duken (1000 enheter bred, `originalHeight` hög), `preview` mallen ritad på
 * samma duk (`height` hög). `skip` är rutorna för klubbmärket.
 */
export async function likeness(original: string, preview: string, opts: { height: number; originalHeight: number; skip: Box[] }) {
  const [a, b] = await Promise.all([load(original), load(preview)]);
  const h = Math.max(1, Math.round((Math.max(opts.height, opts.originalHeight) / 1000) * W));
  const pa = pixels(a, h, (opts.originalHeight / 1000) * W, opts.skip);
  const pb = pixels(b, h, (opts.height / 1000) * W, opts.skip);
  const [ia, ib] = [inkOf(pa), inkOf(pb)];
  const [sa, sb] = [blur(ia, h), blur(ib, h)];
  let [both, either, shared, off] = [0, 0, 0, 0];
  for (let i = 0; i < sa.length; i++) {
    both += Math.min(sa[i], sb[i]);
    either += Math.max(sa[i], sb[i]);
    if (ia[i] && ib[i]) {
      shared++;
      off += Math.hypot(pa[i * 4] - pb[i * 4], pa[i * 4 + 1] - pb[i * 4 + 1], pa[i * 4 + 2] - pb[i * 4 + 2]) / 441;
    }
  }
  if (!either) return 100;
  const shape = both / either;
  const color = shared ? 1 - off / shared : 0;
  return Math.round(100 * shape ** 0.75 * color ** 0.25);
}
