/**
 * Banor som absoluta flytt, linjer och kubiska kurvor – det enda PDF och PostScript behöver. SVG:s övriga kommandon
 * (H, V, S, Q, T och bågar) räknas om hit när banan läses.
 */

export type Seg = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];
/** a b c d e f som i SVG:s matrix(): x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];
export type Box = { x: number; y: number; w: number; h: number };

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const nums = (s: string) => (s.match(NUMBER) ?? []).map(Number);

/** SVG:s transform-attribut som en matris. */
export function parseTransform(raw: string | undefined): Matrix {
  let m = IDENTITY;
  if (!raw) return m;
  for (const [, op, args] of raw.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = nums(args);
    let t: Matrix = IDENTITY;
    if (op === "matrix" && v.length === 6) t = v as Matrix;
    else if (op === "translate") t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (op === "scale") t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (op === "rotate") {
      const a = ((v[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (op === "skewX") t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (op === "skewY") t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = multiply(m, t);
  }
  return m;
}

/** En elliptisk båge som kubiska kurvor (SVG-specens bilaga F.6), högst 90° per kurva. */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number): Seg[] {
  if (rx === 0 || ry === 0) return [["L", x2, y2]];
  const [sin, cos] = [Math.sin((phi * Math.PI) / 180), Math.cos((phi * Math.PI) / 180)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: Seg[] = [];
  for (let i = 0; i < parts; i++) {
    const [a, b] = [t1 + i * step, t1 + (i + 1) * step];
    const [p0, p3, d0, d3] = [point(a), point(b), deriv(a), deriv(b)];
    out.push(["C", p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], i === parts - 1 ? x2 : p3[0], i === parts - 1 ? y2 : p3[1]]);
  }
  return out;
}

/** Läser SVG:s d-attribut till absoluta M, L, C och Z. */
export function parsePath(d: string): Seg[] {
  const out: Seg[] = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  let i = 0;
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let prevCubic: [number, number] | null = null;
  let prevQuad: [number, number] | null = null;
  let cmd = "";
  const num = () => Number(tokens[i++]);
  const more = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  // Bågens flaggor kan stå ihop med nästa tal ("a1 1 0 01.5 2"); delas upp här.
  const flag = () => {
    const t = tokens[i];
    if (t.length > 1 && (t[0] === "0" || t[0] === "1") && !t.startsWith("0.") && !t.startsWith("1.")) {
      tokens.splice(i, 1, t[0], t.slice(1));
    }
    return num() !== 0;
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase() && cmd !== "z";
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const C = cmd.toUpperCase();
    if (C === "Z") {
      out.push(["Z"]);
      [x, y] = [sx, sy];
      prevCubic = prevQuad = null;
      continue;
    }
    if (!more()) break;
    if (C === "M") {
      [x, y] = [ox + num(), oy + num()];
      [sx, sy] = [x, y];
      out.push(["M", x, y]);
      cmd = rel ? "l" : "L";
      prevCubic = prevQuad = null;
      continue;
    }
    if (C === "L") {
      [x, y] = [ox + num(), oy + num()];
      out.push(["L", x, y]);
      prevCubic = prevQuad = null;
    } else if (C === "H") {
      x = ox + num();
      out.push(["L", x, y]);
      prevCubic = prevQuad = null;
    } else if (C === "V") {
      y = oy + num();
      out.push(["L", x, y]);
      prevCubic = prevQuad = null;
    } else if (C === "C" || C === "S") {
      let x1: number, y1: number;
      if (C === "C") [x1, y1] = [ox + num(), oy + num()];
      else [x1, y1] = prevCubic ? [2 * x - prevCubic[0], 2 * y - prevCubic[1]] : [x, y];
      const [x2, y2, ex, ey] = [ox + num(), oy + num(), ox + num(), oy + num()];
      out.push(["C", x1, y1, x2, y2, ex, ey]);
      prevCubic = [x2, y2];
      prevQuad = null;
      [x, y] = [ex, ey];
    } else if (C === "Q" || C === "T") {
      let qx: number, qy: number;
      if (C === "Q") [qx, qy] = [ox + num(), oy + num()];
      else [qx, qy] = prevQuad ? [2 * x - prevQuad[0], 2 * y - prevQuad[1]] : [x, y];
      const [ex, ey] = [ox + num(), oy + num()];
      out.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      prevQuad = [qx, qy];
      prevCubic = null;
      [x, y] = [ex, ey];
    } else if (C === "A") {
      const [rx, ry, phi] = [num(), num(), num()];
      const large = flag();
      const sweep = flag();
      const [ex, ey] = [ox + num(), oy + num()];
      out.push(...arcToCubics(x, y, rx, ry, phi, large, sweep, ex, ey));
      prevCubic = prevQuad = null;
      [x, y] = [ex, ey];
    } else break;
  }
  return out;
}

export function transformPath(segs: Seg[], m: Matrix): Seg[] {
  if (m === IDENTITY) return segs;
  const p = (x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;
  return segs.map((s) => {
    if (s[0] === "Z") return s;
    if (s[0] === "C") return ["C", ...p(s[1], s[2]), ...p(s[3], s[4]), ...p(s[5], s[6])];
    return [s[0], ...p(s[1], s[2])];
  });
}

/** Ytan som banan täcker, räknad på ändpunkter och kontrollpunkter – kurvorna ligger alltid inom den. */
export function pathBounds(segs: Seg[]): Box | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of segs)
    for (let k = 1; k < s.length; k += 2) {
      const [x, y] = [s[k] as number, s[k + 1] as number];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const unionBox = (a: Box | null, b: Box | null): Box | null => {
  if (!a) return b;
  if (!b) return a;
  const [x0, y0] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
};

const fmt = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

export function pathString(segs: Seg[], decimals = 2): string {
  return segs.map((s) => s[0] + (s.length > 1 ? s.slice(1).map((n) => fmt(n as number, decimals)).join(" ") : "")).join("");
}
