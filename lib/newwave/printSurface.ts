/**
 * Var trycket sitter på produktfotot. Platta ytor anges med sina fyra hörn uppmätta på fotot (`quad`), så att loggan
 * följer produktens kanter i perspektiv. Runda och mjuka produkter (muggar, flaskor, kepsar, plagg) anges som en yta i 3D:
 * mitt och storlek i andelar av fotots bredd, lutning i grader och böjning. `printOnPhoto` lägger loggan på ytan och låter
 * fotots eget ljus, skuggor och veck synas i trycket; samma funktion körs på servern och i webbläsaren.
 */
type Pt = [number, number];
/** Övre vänstra, övre högra, nedre högra och nedre vänstra hörnet, sett som loggan ska läsas. */
type Quad = [Pt, Pt, Pt, Pt];

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
  /** Den platta ytans hörn; loggan läggs i mitten och täcker `fill` av ytan. */
  quad?: Quad;
  /** Rund produkt med lodrät axel genom `cx`: radien på fotot och hur mycket uppifrån kameran ser den, i grader. */
  round?: { r: number; e: number };
  fill: number;
};

export type SurfaceInput =
  | (Pick<Surface, "cx" | "cy" | "w" | "h"> & Partial<Pick<Surface, "rx" | "ry" | "rz" | "bend" | "top" | "round">>)
  /** `aspect` är ytans verkliga bredd genom höjd, när den syns förkortad på fotot. */
  | { quad: Quad; fill?: number; aspect?: number };

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function surface(s: SurfaceInput): Surface {
  const flat = { rx: 0, ry: 0, rz: 0, bend: 0, top: false, fill: 1 };
  if (!("quad" in s)) return { ...flat, ...s };
  const q = s.quad;
  const across = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const fill = s.fill ?? 1;
  const w = across * fill;
  const aspect = s.aspect ?? across / ((dist(q[0], q[3]) + dist(q[1], q[2])) / 2);
  return { ...flat, cx: q.reduce((a, p) => a + p[0], 0) / 4, cy: q.reduce((a, p) => a + p[1], 0) / 4, w, h: w / aspect, quad: q, fill };
}

/** Höjs när renderingen ändras, så att sparade bilder ritas om. */
export const MOCKUP_VERSION = 7;
/** Kamerans avstånd i fotobredder. */
const PERSPECTIVE = 3;
const rad = (d: number) => (d * Math.PI) / 180;

/** Perspektivavbildningen från enhetskvadraten till fyrhörningen. */
function homography([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad) {
  const [dx1, dx2, dx3] = [x1 - x2, x3 - x2, x0 - x1 + x2 - x3];
  const [dy1, dy2, dy3] = [y1 - y2, y3 - y2, y0 - y1 + y2 - y3];
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const h = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  const [a, b, d, e] = [x1 - x0 + g * x1, x3 - x0 + h * x3, y1 - y0 + g * y1, y3 - y0 + h * y3];
  return (u: number, v: number) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + x0) / w, y: (d * u + e * v + y0) / w };
  };
}

/** En punkt i tryckytan (u, v från 0 till 1) till fotot, i andelar av fotots bredd. */
function projector(s: Surface) {
  if (s.quad) {
    const map = homography(s.quad);
    return (u: number, v: number) => map(0.5 + (u - 0.5) * s.fill, 0.5 + (v - 0.5) * s.fill);
  }
  if (s.round) {
    const { r, e } = s.round;
    const lift = r * Math.sin(rad(e));
    return (u: number, v: number) => {
      const t = Math.max(-1.45, Math.min(1.45, ((u - 0.5) * s.w) / r));
      return { x: s.cx + r * Math.sin(t), y: s.cy + (v - 0.5) * s.h * Math.cos(rad(e)) - lift * (1 - Math.cos(t)) };
    };
  }
  return (u: number, v: number) => project(s, u, v);
}

function project(s: Surface, u: number, v: number) {
  const x0 = (u - 0.5) * s.w;
  let y = (v - 0.5) * s.h;
  let x = x0;
  let z = 0;
  if (s.bend) {
    const r = s.w / rad(s.bend);
    x = r * Math.sin(x0 / r);
    z = r * Math.cos(x0 / r) - r;
  }
  const [ry, rx, rz] = [rad(s.ry), rad(s.rx), rad(s.rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: s.cx + x * k, y: s.cy + y * k };
}

/** Loggans storlek i pixlar när den ryms i ytan på ett foto som är `size` brett. */
export function printFit(s: Surface, ratio: number, size: number) {
  const [W, H] = [s.w * size, s.h * size];
  return W / H > ratio ? { w: H * ratio, h: H } : { w: W, h: W / ratio };
}

export type Rgba = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };

/** Gaussliknande oskärpa (fyra boxpass) av en kvadratisk gråskala. */
function blur(src: Float32Array, size: number, r: number) {
  let cur = src;
  const n = 2 * r + 1;
  const clamp = (i: number) => (i < 0 ? 0 : i >= size ? size - 1 : i);
  for (let pass = 0; pass < 4; pass++) {
    const out = new Float32Array(cur.length);
    const [step, stride] = pass % 2 ? [size, 1] : [1, size];
    for (let line = 0; line < size; line++) {
      const base = line * stride;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += cur[base + clamp(i) * step];
      for (let i = 0; i < size; i++) {
        out[base + i * step] = acc / n;
        acc += cur[base + clamp(i + r + 1) * step] - cur[base + clamp(i - r) * step];
      }
    }
    cur = out;
  }
  return cur;
}

/** Loggan förvrängd till ytan, som ett förmultiplicerat RGBA-lager lika stort som fotot. */
function warp(s: Surface, logo: Rgba, size: number) {
  const fit = printFit(s, logo.width / logo.height, size);
  const [W, H] = [s.w * size, s.h * size];
  const ox = (W - fit.w) / 2;
  const oy = s.top ? 0 : (H - fit.h) / 2;
  const layer = new Float32Array(size * size * 4);
  const hits = new Float32Array(size * size);
  const place = projector(s);
  for (let j = 0; j < logo.height; j++) {
    for (let i = 0; i < logo.width; i++) {
      const k = (j * logo.width + i) * 4;
      const p = place((ox + ((i + 0.5) / logo.width) * fit.w) / W, (oy + ((j + 0.5) / logo.height) * fit.h) / H);
      const px = Math.floor(p.x * size);
      const py = Math.floor(p.y * size);
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const o = py * size + px;
      const a = logo.data[k + 3] / 255;
      layer[o * 4] += logo.data[k] * a;
      layer[o * 4 + 1] += logo.data[k + 1] * a;
      layer[o * 4 + 2] += logo.data[k + 2] * a;
      layer[o * 4 + 3] += a;
      hits[o] += 1;
    }
  }
  for (let o = 0; o < hits.length; o++) if (hits[o] > 1) for (let c = 0; c < 4; c++) layer[o * 4 + c] /= hits[o];
  return layer;
}

/** Lagret läst förskjutet längs tygets veck, med bilinjär interpolation så att tunna linjer hålls hela. */
function displace(layer: Float32Array, size: number, dx: Float32Array, dy: Float32Array) {
  const out = new Float32Array(layer.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!dx[i] && !dy[i] && !layer[i * 4 + 3]) continue;
      const sx = Math.min(size - 1.001, Math.max(0, x - dx[i]));
      const sy = Math.min(size - 1.001, Math.max(0, y - dy[i]));
      const [x0, y0] = [Math.floor(sx), Math.floor(sy)];
      const [fx, fy] = [sx - x0, sy - y0];
      const a = (y0 * size + x0) * 4;
      const b = a + 4;
      const c = a + size * 4;
      const d = c + 4;
      for (let k = 0; k < 4; k++)
        out[i * 4 + k] = (layer[a + k] * (1 - fx) + layer[b + k] * fx) * (1 - fy) + (layer[c + k] * (1 - fx) + layer[d + k] * fx) * fy;
    }
  return out;
}

/**
 * Produktfotot med loggan tryckt på ytan, som RGBA i fotots storlek. `photo` ska vara kvadratiskt; `logo` skalad till
 * ungefär dubbla `printFit`-storleken. Ljusa produkter får trycket som multiply, så tyg och glans syns igenom; på mörka
 * får tryckfärgen fotots ljus och skuggor. `soft` förskjuter trycket längs vecken på tyg.
 */
export function printOnPhoto(s: Surface, photo: Rgba, logo: Rgba, o: { dark: boolean; soft: boolean }) {
  const size = photo.width;
  const px = photo.data;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < lum.length; i++) lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;

  let layer = warp(s, logo, size);
  if (o.soft) {
    const g = blur(lum, size, Math.max(2, Math.round(size * 0.012)));
    const [gain, max] = [size * 1.2, size * 0.004];
    const [dx, dy] = [new Float32Array(lum.length), new Float32Array(lum.length)];
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        dx[i] = Math.max(-max, Math.min(max, ((g[i + 1] - g[i - 1]) / 2) * gain));
        dy[i] = Math.max(-max, Math.min(max, ((g[i + size] - g[i - size]) / 2) * gain));
      }
    layer = displace(layer, size, dx, dy);
  }

  const near = o.dark ? blur(lum, size, Math.max(1, Math.round(size * 0.003))) : null;
  const wide = o.dark ? blur(lum, size, Math.max(2, Math.round(size * 0.035))) : null;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    out[i * 4 + 3] = 255;
    const a = Math.min(1, layer[i * 4 + 3]);
    if (a < 0.004) {
      [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]] = [r, g, b];
      continue;
    }
    const ink = [layer[i * 4] / layer[i * 4 + 3], layer[i * 4 + 1] / layer[i * 4 + 3], layer[i * 4 + 2] / layer[i * 4 + 3]];
    if (near && wide) {
      const light = Math.min(1.4, Math.max(0.55, (near[i] + 0.05) / (wide[i] + 0.05))) ** 0.8;
      const k = a * 0.94;
      out[i * 4] = r * (1 - k) + ink[0] * light * k;
      out[i * 4 + 1] = g * (1 - k) + ink[1] * light * k;
      out[i * 4 + 2] = b * (1 - k) + ink[2] * light * k;
    } else {
      out[i * 4] = r * (1 - a + (a * ink[0]) / 255);
      out[i * 4 + 1] = g * (1 - a + (a * ink[1]) / 255);
      out[i * 4 + 2] = b * (1 - a + (a * ink[2]) / 255);
    }
  }
  return out;
}
