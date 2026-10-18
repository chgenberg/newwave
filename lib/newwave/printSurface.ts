/**
 * Var trycket sitter på produktfotot, som en yta i 3D: mitt och storlek i andelar av fotots bredd, lutning i grader och
 * böjning för runda produkter (muggar, flaskor, kepsar). Samma modell ritas med CSS 3D i webbläsaren (`surfaceLayer`)
 * och pixel för pixel när en bild ska sparas (`warpPrint`), så att förhandsvisning och fil ser likadana ut.
 */
export type Surface = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Lutning bakåt (överkanten bort från kameran). */
  rx: number;
  /** Vridning i sidled (positiv: ytan vänds åt höger). */
  ry: number;
  /** Rotation i bildplanet. */
  rz: number;
  /** Hur många grader av en cylinder trycket täcker; 0 är plant. */
  bend: number;
  /** Loggan överst i ytan i stället för i mitten, som på bröstet. */
  top: boolean;
};

export type SurfaceInput = Pick<Surface, "cx" | "cy" | "w" | "h"> & Partial<Omit<Surface, "cx" | "cy" | "w" | "h">>;
export const surface = (s: SurfaceInput): Surface => ({ rx: 0, ry: 0, rz: 0, bend: 0, top: false, ...s });

/** Kamerans avstånd i fotobredder; samma i CSS och i pixelversionen. */
export const PERSPECTIVE = 3;
const SHADE = 0.45;
const STRIPS = 14;
const rad = (d: number) => (d * Math.PI) / 180;

const shadeAt = (t: number) => 1 - SHADE * (1 - Math.cos(t));

/** En punkt i tryckytan (u, v från 0 till 1) till fotot, i andelar av fotots bredd, med hur mörk ytan är där. */
export function project(s: Surface, u: number, v: number) {
  const x0 = (u - 0.5) * s.w;
  let y = (v - 0.5) * s.h;
  let x = x0;
  let z = 0;
  let shade = 1;
  if (s.bend) {
    const r = s.w / rad(s.bend);
    const t = x0 / r;
    x = r * Math.sin(t);
    z = r * Math.cos(t) - r;
    shade = shadeAt(t);
  }
  const [ry, rx, rz] = [rad(s.ry), rad(s.rx), rad(s.rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: s.cx + x * k, y: s.cy + y * k, shade };
}

const cq = (v: number) => `${(v * 100).toFixed(3)}cqw`;

/**
 * CSS för ytan: en hållare i ytans mitt med perspektiv, ett plan med lutningen och remsor som böjs runt cylindern.
 * Kräver att föräldern är en container (`container-type: inline-size`) lika bred som fotot.
 */
export function surfaceLayer(s: Surface) {
  const n = s.bend ? STRIPS : 1;
  const sw = s.w / n;
  const r = s.bend ? s.w / rad(s.bend) : 0;
  return {
    holder: { left: `${s.cx * 100}%`, top: `${s.cy * 100}%`, perspective: cq(PERSPECTIVE) },
    plane: { left: cq(-s.w / 2), top: cq(-s.h / 2), width: cq(s.w), height: cq(s.h), transform: `rotateZ(${s.rz}deg) rotateX(${s.rx}deg) rotateY(${s.ry}deg)` },
    strips: Array.from({ length: n }, (_, i) => {
      const t = s.bend ? (i + 0.5 - n / 2) * (sw / r) : 0;
      return {
        strip: {
          left: `calc(50% - ${cq(sw / 2)})`,
          width: n > 1 ? `calc(${cq(sw)} + 0.6px)` : cq(sw),
          transform: s.bend ? `translateZ(${cq(-r)}) rotateY(${((t * 180) / Math.PI).toFixed(3)}deg) translateZ(${cq(r)})` : undefined,
          filter: s.bend ? `brightness(${shadeAt(t).toFixed(3)})` : undefined,
        },
        image: { left: cq(-i * sw), width: cq(s.w), objectPosition: s.top ? "center top" : "center" },
      };
    }),
  };
}

/** Loggans storlek i pixlar när den ryms i ytan på ett foto som är `size` brett. */
export function printFit(s: Surface, ratio: number, size: number) {
  const [W, H] = [s.w * size, s.h * size];
  return W / H > ratio ? { w: H * ratio, h: H } : { w: W, h: W / ratio };
}

type Rgba = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };

/**
 * Loggan förvrängd till ytan, som ett genomskinligt RGBA-lager lika stort som fotot. `logo` ska vara skalad till ungefär
 * dubbla `printFit`-storleken, så att varje pixel i lagret får flera prover.
 */
export function warpPrint(s: Surface, logo: Rgba, size: number) {
  const fit = printFit(s, logo.width / logo.height, size);
  const [W, H] = [s.w * size, s.h * size];
  const ox = (W - fit.w) / 2;
  const oy = s.top ? 0 : (H - fit.h) / 2;
  const sum = new Float32Array(size * size * 4);
  const hits = new Float32Array(size * size);
  for (let j = 0; j < logo.height; j++) {
    for (let i = 0; i < logo.width; i++) {
      const k = (j * logo.width + i) * 4;
      const a = logo.data[k + 3] / 255;
      const u = (ox + ((i + 0.5) / logo.width) * fit.w) / W;
      const v = (oy + ((j + 0.5) / logo.height) * fit.h) / H;
      const p = project(s, u, v);
      const px = Math.floor(p.x * size);
      const py = Math.floor(p.y * size);
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const o = py * size + px;
      sum[o * 4] += logo.data[k] * a * p.shade;
      sum[o * 4 + 1] += logo.data[k + 1] * a * p.shade;
      sum[o * 4 + 2] += logo.data[k + 2] * a * p.shade;
      sum[o * 4 + 3] += a;
      hits[o] += 1;
    }
  }
  const out = new Uint8ClampedArray(size * size * 4);
  for (let o = 0; o < size * size; o++) {
    const a = sum[o * 4 + 3];
    if (!hits[o] || !a) continue;
    out[o * 4] = sum[o * 4] / a;
    out[o * 4 + 1] = sum[o * 4 + 1] / a;
    out[o * 4 + 2] = sum[o * 4 + 2] / a;
    out[o * 4 + 3] = (a / hits[o]) * 255;
  }
  return out;
}
