import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { printFit, printOnPhoto, type Surface, surface } from "@/lib/newwave/printSurface";
import { type Flat, recolor, toSvg } from "@/lib/newwave/vector/svg";
import { emblemSet } from "./emblem";
import { type GrasrotProduct, type Placement, type ProductColor, type ProductId } from "./products";
import { SCARF_MM, scarfDesign } from "./scarf";
import { grasrotWordmark } from "./wordmark";

/**
 * Produktbilderna: fotot av den tomma produkten färgas i plaggfärgen och klubbens grafik läggs på tryckytan i exakt
 * storlek med fotots ljus och veck. Grafiken är alltid tryckfilernas egen vektor – ingen bildmodell ritar om märket.
 */

export const MOCKUP_SIZE = 1024;
/** Lasergravyren tar fram det borstade stålet under lacken. */
const STEEL = "#C9CBCC";

type Photo = {
  src: string;
  pxPerMm: number;
  /** Mitten av motivets ruta på fotot, i pixlar. */
  at: [number, number];
  top?: boolean;
  bend?: number;
  rx?: number;
  round?: { r: number; e: number };
  /** Var produkten är på fotot: tyget mot vit bakgrund, eller flaskans lackade kropp. */
  body: "fabric" | { x0: number; x1: number; y0: number; y1: number; corner: number };
  /** Kepsens skärm under sömmen, i pixlar från toppen. */
  visorY?: number;
};

const PHOTOS: Record<Exclude<ProductId, "halsduk">, Photo> = {
  tshirt: { src: "tee.jpg", pxPerMm: 0.91, at: [511, 386], top: true, bend: 20, body: "fabric" },
  hoodie: { src: "hoodie.jpg", pxPerMm: 0.74, at: [512, 530], bend: 18, body: "fabric" },
  keps: { src: "cap.jpg", pxPerMm: 3.6, at: [512, 432], bend: 55, rx: 6, body: "fabric", visorY: 592 },
  flaska: { src: "bottle.jpg", pxPerMm: 2.69, at: [512, 590], round: { r: 94 / MOCKUP_SIZE, e: 4 }, body: { x0: 419, x1: 605, y0: 319, y1: 901, corner: 18 } },
};

export type Rgb = [number, number, number];
export const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (px: Uint8Array | Uint8ClampedArray, i: number) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Färgar den gråa eller vita produkten i `hex` där `mask` säger att produkten är, med fotots ljus och skuggor kvar.
 * `width` är bildens bredd; `color(x, y)` ger färgen per pixel, så att en keps kan ha en annan skärm.
 */
export function dye(px: Uint8Array | Uint8ClampedArray, width: number, mask: Float32Array, color: (x: number, y: number) => Rgb, melange = false) {
  let [sum, n] = [0, 0];
  for (let i = 0; i < mask.length; i++)
    if (mask[i] > 0.6) {
      sum += lum(px, i * 4);
      n++;
    }
  const ref = n ? sum / n : 0.5;
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    if (m <= 0) continue;
    const [x, y] = [i % width, Math.floor(i / width)];
    // Kantpixlarna är tyg blandat med bakgrunden; utan tak blir de en ljus rand runt plagget.
    let shade = Math.min(1.3, lum(px, i * 4) / ref);
    if (melange) shade *= 1 + ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000 - 0.5) * 0.14;
    const t = color(x, y);
    // Ljusa färger tål inte fotots hela kontrast – högdagrarna slår i taket och tyget ser ut som metall.
    const light = (0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]) / 255;
    const s = 1 + (shade - 1) * (1 - 0.45 * light);
    for (let k = 0; k < 3; k++) px[i * 4 + k] = px[i * 4 + k] * (1 - m) + clamp(t[k] * s + (s - 1) * 38 * (1 - light), 0, 255) * m;
  }
}

function bodyMask(px: Uint8Array | Uint8ClampedArray, size: number, body: Photo["body"]) {
  const mask = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (body === "fabric") mask[i] = clamp((0.97 - lum(px, i * 4)) / 0.3);
      else {
        // Flaskans kropp: en rektangel med rundade nederhörn och mjuk kant.
        const dx = Math.max(body.x0 + body.corner - x, x - (body.x1 - body.corner), 0);
        const dy = Math.max(y - (body.y1 - body.corner), 0);
        const out = dx && dy ? Math.hypot(dx, dy) - body.corner : Math.max(body.x0 - x, x - body.x1, body.y0 - y, y - body.y1);
        mask[i] = clamp(0.5 - out / 1.5);
      }
    }
  return mask;
}

/** Vektorn som PNG med genomskinlig bakgrund, `width` pixlar bred. */
export async function rasterize(flat: Flat, width: number) {
  const { w, h } = flat.box;
  const height = Math.max(1, Math.round((width * h) / w));
  const svg = toSvg(flat).replace("<svg ", `<svg width="${Math.round(width)}" height="${height}" `);
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Motivet som det ser ut på produkten: gravyren i stålets ton, allt annat i tryckfilens färger. */
export async function placementArt(id: string, p: Placement): Promise<Flat | null> {
  if (p.art === "halsduk") return scarfDesign(id);
  if (p.art === "ordmarke") return (await grasrotWordmark(id, p.variant))?.flat ?? null;
  const set = await emblemSet(id);
  if (!set) return null;
  return p.method === "lasergravyr" ? recolor(set.solid, () => STEEL) : set[p.variant];
}

/** Trycket på en kvadratisk bild: ytan, grafiken och om produkten är mörk. */
export async function printOn(img: { data: Uint8Array | Uint8ClampedArray; size: number }, s: Surface, flat: Flat, o: { dark: boolean; soft: boolean }) {
  const fit = printFit(s, flat.box.w / flat.box.h, img.size);
  const logo = await rasterize(flat, Math.max(2, fit.w * 2));
  return printOnPhoto(s, { data: img.data, width: img.size, height: img.size }, { data: logo.data, width: logo.info.width, height: logo.info.height }, o);
}

const photos = new Map<string, Promise<Buffer>>();
const photo = (src: string) => {
  let p = photos.get(src);
  if (!p) {
    const job = readFile(path.join(process.cwd(), "public", "newwave", "grasrot", src)).then((buf) => sharp(buf).resize(MOCKUP_SIZE, MOCKUP_SIZE).ensureAlpha().raw().toBuffer());
    job.catch(() => photos.get(src) === job && photos.delete(src));
    photos.set(src, job);
    p = job;
  }
  return p;
};

/** Produkten i en färg med standarddesignen, som JPEG. */
export async function productMockup(id: string, product: GrasrotProduct, color: ProductColor, quality = 86): Promise<Buffer | null> {
  const placement = product.design(color);
  if (product.id === "halsduk") return scarfMockup(id, quality);
  const flat = await placementArt(id, placement);
  if (!flat) return null;
  const ph = PHOTOS[product.id];
  const S = MOCKUP_SIZE;
  const px = new Uint8ClampedArray(await photo(ph.src));
  const [main, visor] = [rgbOf(color.hex), color.visor ? rgbOf(color.visor) : null];
  dye(px, S, bodyMask(px, S, ph.body), (_x, y) => (visor && ph.visorY && y > ph.visorY ? visor : main), color.id === "ash-grey");

  const [wMm, hMm] = placement.box;
  const s = surface({ cx: ph.at[0] / S, cy: ph.at[1] / S, w: (wMm * ph.pxPerMm) / S, h: (hMm * ph.pxPerMm) / S, bend: ph.bend ?? 0, rx: ph.rx ?? 0, top: Boolean(ph.top), ...(ph.round && { round: ph.round }) });
  const out = await printOn({ data: px, size: S }, s, flat, { dark: color.dark, soft: ph.body === "fabric" });
  return sharp(Buffer.from(out.buffer), { raw: { width: S, height: S, channels: 4 } }).jpeg({ quality, mozjpeg: true }).toBuffer();
}

/** Halsduken snett över bilden med fransar och vävstruktur. */
export async function scarfMockup(id: string, quality = 86): Promise<Buffer | null> {
  const flat = await scarfDesign(id);
  if (!flat) return null;
  const S = MOCKUP_SIZE;
  const [W, H] = SCARF_MM;
  const k = 0.88;
  const base = flat.shapes[0]?.fill ?? "#111111";
  const paths = toSvg(flat).replace(/^<svg[^>]*>|<\/svg>$/g, "");
  const fringe = (x0: number, dir: number) =>
    Array.from({ length: 30 }, (_, i) => {
      const y = 4 + i * 4.75;
      return `<path d="M${x0} ${y}q${dir * 9} ${i % 2 ? 2 : -2} ${dir * 22} ${i % 3 ? 1 : -1}" stroke="${base}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
    }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
<pattern id="weave" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1.4" fill="#000" opacity=".09"/><rect width="1.2" height="3" fill="#fff" opacity=".06"/></pattern>
<filter id="shadow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
<linearGradient id="light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
</defs>
<rect width="${S}" height="${S}" fill="#FFFFFF"/>
<g transform="translate(${S / 2} ${S / 2}) rotate(-24) scale(${k}) translate(${-W / 2} ${-H / 2})">
<rect x="6" y="16" width="${W}" height="${H}" fill="#000" opacity=".28" filter="url(#shadow)"/>
${fringe(0, -1)}${fringe(W, 1)}
${paths}
<rect width="${W}" height="${H}" fill="url(#weave)"/>
<rect width="${W}" height="${H}" fill="url(#light)"/>
</g></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality, mozjpeg: true }).toBuffer();
}
