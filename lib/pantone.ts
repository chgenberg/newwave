import { PANTONE_C } from "./pantoneData";
import { hexToRgb, rgbToHex } from "./scarf";

/**
 * Pantone Solid Coated som referens för tryckerier: närmaste Pantone till en skärmfärg (CIEDE2000 i CIELAB D50, samma
 * ljus som Pantones egna värden), uppslag på kod och ett CMYK-förslag. Klubbens låsta kulörer går alltid före förslagen.
 */

/** Neon (801–814, 901–942), metallic (871–877, 8001–8965, 10101–) och pastell (9020–9603) föreslås aldrig för en vanlig färg. */
const special = (code: string) => {
  const n = Number(code);
  return (n >= 801 && n <= 814) || (n >= 871 && n <= 877) || (n >= 901 && n <= 942) || n >= 8001;
};

export type Lab = [number, number, number];
export type Cmyk = [number, number, number, number];
export type PantoneMatch = { code: string; hex: string; deltaE: number };

const WHITE: Lab = [100, 0, 0];
let library: { code: string; lab: Lab; special: boolean }[] | null = null;
const all = () =>
  (library ??= PANTONE_C.split(";").map((entry) => {
    const [code, lab] = entry.split(":");
    return { code: `PANTONE ${code} C`, lab: lab.split(",").map(Number) as Lab, special: special(code) };
  }));

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const D50 = [0.96422, 1, 0.82521];

/** sRGB (D65) → XYZ → Bradford till D50 → CIELAB. */
export function hexToLab(hex: string): Lab {
  const [R, G, B] = hexToRgb(hex).map((v) => lin(v / 255));
  const [x, y, z] = [R * 0.4124564 + G * 0.3575761 + B * 0.1804375, R * 0.2126729 + G * 0.7151522 + B * 0.072175, R * 0.0193339 + G * 0.119192 + B * 0.9503041];
  const xyz = [1.0478112 * x + 0.0228866 * y - 0.050127 * z, 0.0295424 * x + 0.9904844 * y - 0.0170491 * z, -0.0092345 * x + 0.0150436 * y + 0.7521316 * z];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = xyz.map((v, i) => f(v / D50[i]));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB D50 → sRGB, med färger utanför skärmens omfång klippta. */
export function labToHex([L, a, b]: Lab): string {
  const fy = (L + 16) / 116;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const [x, y, z] = [inv(fy + a / 500) * D50[0], inv(fy) * D50[1], inv(fy - b / 200) * D50[2]];
  const [X, Y, Z] = [0.9555766 * x - 0.0230393 * y + 0.0631636 * z, -0.0282895 * x + 1.0099416 * y + 0.0210077 * z, 0.0122982 * x - 0.020483 * y + 1.3299098 * z];
  const rgb = [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
  return rgbToHex(rgb.map((v) => Math.round(Math.min(1, Math.max(0, gamma(v))) * 255)) as [number, number, number]);
}

/** CIEDE2000 (Sharma, Wu & Dalal 2005). */
export function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const [a1p, a2p] = [(1 + G) * a1, (1 + G) * a2];
  const [C1p, C2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const [h1p, h2p] = [hue(b1, a1p), hue(b2, a2p)];
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) hpm = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Närmaste Pantone ur standardfärgerna; rent vitt blir "White", som tryckerier anger vit färg. */
export function nearestPantone(hex: string): PantoneMatch {
  const lab = hexToLab(hex);
  const white = deltaE2000(lab, WHITE);
  let best = all()[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of all()) {
    if (p.special) continue;
    const d = deltaE2000(lab, p.lab);
    if (d < bestD) [best, bestD] = [p, d];
  }
  if (white < bestD) return { code: "White", hex: "#FFFFFF", deltaE: Math.round(white * 10) / 10 };
  return { code: best.code, hex: labToHex(best.lab), deltaE: Math.round(bestD * 10) / 10 };
}

/** Pantone på kod: "PANTONE 2738 C", "2738 C" eller "2738". */
export function pantone(code: string): { code: string; lab: Lab; hex: string } | null {
  const key = `PANTONE ${code
    .trim()
    .replace(/^PANTONE\s+/i, "")
    .replace(/\s+C$/i, "")} C`.toUpperCase();
  const hit = all().find((p) => p.code.toUpperCase() === key);
  return hit ? { code: hit.code, lab: hit.lab, hex: labToHex(hit.lab) } : null;
}

/**
 * CMYK-förslag med full svartersättning, avrundat till hela procent. Tryckeriets profil avgör det slutliga värdet –
 * därför går klubbens egna CMYK-värden (som New Wave Groups profilark) alltid före.
 */
export function cmykSuggestion(hex: string): Cmyk {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [...[r, g, b].map((v) => Math.round(((1 - v - k) / (1 - k)) * 100)), Math.round(k * 100)] as Cmyk;
}
