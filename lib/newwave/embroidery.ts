/**
 * Brodyr: tatamifyllning på ett rutnät med 0,4 mm radavstånd och maskinfilen i Tajima DST,
 * formatet nästan alla brodyrmaskiner läser. DST sparar bara stygn, hopp och färgbyten – trådfärgerna står i stygnplanen.
 */

export const ROW_MM = 0.4;
const FILL_MM = 3;
const UNDERLAY_MM = 2.5;
const UNDERLAY_EVERY = 4;
/** Ett tråd- och nålbyte syr runt 750 stygn i minuten på en vanlig flerhuvudsmaskin. */
export const STITCHES_PER_MIN = 750;
/** Ovantråd per 1 000 stygn, ungefär. */
export const METERS_PER_1000 = 5;

type Pt = [number, number];
type Run = { r: number; a: number; b: number; done?: boolean };

export type ThreadBlock = { hex: string; stitches: number; jumps: number; paths: Pt[][] };
export type Embroidery = { dst: Buffer; blocks: ThreadBlock[]; stitches: number; jumps: number; widthMm: number; heightMm: number };

function rowRuns(mask: Uint8Array, w: number, h: number, every: number): Run[] {
  const out: Run[] = [];
  for (let r = 0; r < h; r += every) {
    for (let x = 0; x < w; ) {
      if (!mask[r * w + x]) {
        x++;
        continue;
      }
      const a = x;
      while (x < w && mask[r * w + x]) x++;
      if (x - a >= 2) out.push({ r, a, b: x - 1 });
    }
  }
  return out;
}

/** Kedjar rader nedåt genom överlappande segment så att maskinen syr sammanhängande fält med få hopp. */
function chains(runs: Run[], every: number) {
  const byRow = new Map<number, Run[]>();
  for (const run of runs) byRow.set(run.r, [...(byRow.get(run.r) ?? []), run]);
  const out: Run[][] = [];
  let at: Pt = [0, 0];
  for (let left = runs.length; left > 0; ) {
    let start: Run | null = null;
    let best = Infinity;
    for (const run of runs) {
      if (run.done) continue;
      const d = Math.hypot(run.r - at[1], Math.min(Math.abs(run.a - at[0]), Math.abs(run.b - at[0])));
      if (d < best) [best, start] = [d, run];
    }
    const chain: Run[] = [];
    for (let cur = start; cur; ) {
      cur.done = true;
      left--;
      chain.push(cur);
      const c: Run = cur;
      cur = (byRow.get(c.r + every) ?? []).filter((n) => !n.done && n.a <= c.b + 1 && n.b >= c.a - 1).sort((m, n) => m.a - n.a)[0] ?? null;
    }
    const last = chain[chain.length - 1];
    at = [chain.length % 2 ? last.b : last.a, last.r];
    out.push(chain);
  }
  return out;
}

/** Stygnen i en kedja: fram och tillbaka rad för rad, förskjutna i tegelmönster så att fältet blir jämnt. */
function stitchChain(chain: Run[], len: number, from: Pt, swap: boolean): Pt[] {
  const pts: Pt[] = [];
  const put = (x: number, y: number) => pts.push(swap ? [y, x] : [x, y]);
  const startLeft = Math.abs(chain[0].a * ROW_MM - (swap ? from[1] : from[0])) <= Math.abs((chain[0].b + 1) * ROW_MM - (swap ? from[1] : from[0]));
  chain.forEach((run, i) => {
    const right = startLeft ? i % 2 === 0 : i % 2 === 1;
    const y = (run.r + 0.5) * ROW_MM;
    const [x0, x1] = [run.a * ROW_MM, (run.b + 1) * ROW_MM];
    const [s, e] = right ? [x0, x1] : [x1, x0];
    if (pts.length) {
      const px = pts[pts.length - 1][swap ? 1 : 0];
      const gap = Math.abs(s - px);
      for (let k = 1; k * len < gap; k++) put(px + Math.sign(s - px) * k * len, y);
    }
    put(s, y);
    const phase = ((run.r % 3) * len) / 3;
    const inner: number[] = [];
    for (let x = Math.ceil((x0 - phase) / len) * len + phase; x < x1; x += len) if (x - x0 > len * 0.35 && x1 - x > len * 0.35) inner.push(x);
    (right ? inner : inner.reverse()).forEach((x) => put(x, y));
    put(e, y);
  });
  return pts;
}

const erode = (mask: Uint8Array, w: number, h: number) => {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w] ? 1 : 0;
    }
  return out;
};

const transpose = (mask: Uint8Array, w: number, h: number) => {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = mask[y * w + x];
  return out;
};

type Cmd = { x: number; y: number; jump: boolean } | { color: true };

function dstRecord(dx: number, dy: number, jump: boolean) {
  let [b0, b1, b2] = [0, 0, 0x03 | (jump ? 0x80 : 0)];
  let x = dx;
  let y = -dy;
  if (x > 40) [b2, x] = [b2 | 0x04, x - 81];
  if (x < -40) [b2, x] = [b2 | 0x08, x + 81];
  if (x > 13) [b1, x] = [b1 | 0x04, x - 27];
  if (x < -13) [b1, x] = [b1 | 0x08, x + 27];
  if (x > 4) [b0, x] = [b0 | 0x04, x - 9];
  if (x < -4) [b0, x] = [b0 | 0x08, x + 9];
  if (x > 1) [b1, x] = [b1 | 0x01, x - 3];
  if (x < -1) [b1, x] = [b1 | 0x02, x + 3];
  if (x > 0) b0 |= 0x01;
  if (x < 0) b0 |= 0x02;
  if (y > 40) [b2, y] = [b2 | 0x20, y - 81];
  if (y < -40) [b2, y] = [b2 | 0x10, y + 81];
  if (y > 13) [b1, y] = [b1 | 0x20, y - 27];
  if (y < -13) [b1, y] = [b1 | 0x10, y + 27];
  if (y > 4) [b0, y] = [b0 | 0x20, y - 9];
  if (y < -4) [b0, y] = [b0 | 0x10, y + 9];
  if (y > 1) [b1, y] = [b1 | 0x80, y - 3];
  if (y < -1) [b1, y] = [b1 | 0x40, y + 3];
  if (y > 0) b0 |= 0x80;
  if (y < 0) b0 |= 0x40;
  return [b0, b1, b2];
}

/** Tajima DST: 512 bytes huvud och tre bytes per stygn, i 0,1 mm med högst 12,1 mm per post. */
function encodeDst(name: string, cmds: Cmd[]) {
  const recs: number[] = [];
  let [cx, cy] = [0, 0];
  let [minX, maxX, minY, maxY] = [0, 0, 0, 0];
  let colors = 0;
  for (const c of cmds) {
    if ("color" in c) {
      recs.push(0, 0, 0xc3);
      colors++;
      continue;
    }
    const [tx, ty] = [Math.round(c.x * 10), Math.round(c.y * 10)];
    const [sx, sy] = [cx, cy];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) / 121));
    for (let s = 1; s <= steps; s++) {
      const nx = sx + Math.round(((tx - sx) * s) / steps);
      const ny = sy + Math.round(((ty - sy) * s) / steps);
      recs.push(...dstRecord(nx - cx, ny - cy, c.jump || s < steps));
      [cx, cy] = [nx, ny];
    }
    [minX, maxX, minY, maxY] = [Math.min(minX, cx), Math.max(maxX, cx), Math.min(minY, -cy), Math.max(maxY, -cy)];
  }
  recs.push(0, 0, 0xf3);
  const sign = (v: number) => `${v < 0 ? "-" : "+"}${String(Math.abs(v)).padStart(5)}`;
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").slice(0, 16).padEnd(16);
  const head =
    `LA:${ascii}\r` +
    `ST:${String(recs.length / 3).padStart(7)}\r` +
    `CO:${String(colors).padStart(3)}\r` +
    `+X:${String(maxX).padStart(5)}\r-X:${String(-minX).padStart(5)}\r+Y:${String(maxY).padStart(5)}\r-Y:${String(-minY).padStart(5)}\r` +
    `AX:${sign(cx)}\rAY:${sign(-cy)}\rMX:+${"0".padStart(5)}\rMY:+${"0".padStart(5)}\rPD:******\r`;
  const header = Buffer.alloc(512, 0x20);
  header.write(head, 0, "latin1");
  header[head.length] = 0x1a;
  return Buffer.concat([header, Buffer.from(recs)]);
}

/**
 * Syr varje trådfärg för sig: först ett glest underlag på tvären som håller tyget, sedan tatamifyllningen.
 * `layers` är en mask per tråd på rutnätet (1 = sy), i den ordning de ska sys.
 */
export function embroider(name: string, layers: { hex: string; mask: Uint8Array }[], w: number, h: number): Embroidery {
  const [ox, oy] = [(w * ROW_MM) / 2, (h * ROW_MM) / 2];
  const cmds: Cmd[] = [];
  const blocks: ThreadBlock[] = [];
  let at: Pt = [ox, oy];
  layers.forEach((layer, li) => {
    if (li > 0) cmds.push({ color: true });
    const block: ThreadBlock = { hex: layer.hex, stitches: 0, jumps: 0, paths: [] };
    const passes = [
      { mask: transpose(erode(layer.mask, w, h), w, h), w: h, h: w, every: UNDERLAY_EVERY, len: UNDERLAY_MM, swap: true },
      { mask: layer.mask, w, h, every: 1, len: FILL_MM, swap: false },
    ];
    for (const pass of passes) {
      for (const chain of chains(rowRuns(pass.mask, pass.w, pass.h, pass.every), pass.every)) {
        const pts = stitchChain(chain, pass.len, at, pass.swap);
        if (!pts.length) continue;
        const far = Math.hypot(pts[0][0] - at[0], pts[0][1] - at[1]) > 1.2;
        if (far || !cmds.length) {
          cmds.push({ x: pts[0][0] - ox, y: pts[0][1] - oy, jump: true });
          block.jumps++;
        }
        for (const p of pts) cmds.push({ x: p[0] - ox, y: p[1] - oy, jump: false });
        if (!pass.swap) block.paths.push(pts);
        block.stitches += pts.length;
        at = pts[pts.length - 1];
      }
    }
    blocks.push(block);
  });
  return {
    dst: encodeDst(name, cmds),
    blocks,
    stitches: blocks.reduce((s, b) => s + b.stitches, 0),
    jumps: blocks.reduce((s, b) => s + b.jumps, 0),
    widthMm: w * ROW_MM,
    heightMm: h * ROW_MM,
  };
}

const shade = (hex: string, f: number) =>
  `#${[1, 3, 5].map((i) => Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("")}`;

/** Stygnbilden som SVG i mm: varje tråd som en linje med mörkare kant, på plaggets färg. */
export function stitchSvg(e: Embroidery, garmentHex: string, pxPerMm = 12) {
  const [W, H] = [e.widthMm + 4, e.heightMm + 4];
  const d = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${(x + 2).toFixed(2)} ${(y + 2).toFixed(2)}`).join("");
  const paths = e.blocks
    .map((b) => {
      const all = b.paths.map(d).join("");
      return `<path d="${all}" stroke="${shade(b.hex, 0.62)}" stroke-width="0.44"/><path d="${all}" stroke="${b.hex}" stroke-width="0.3"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * pxPerMm)}" height="${Math.round(H * pxPerMm)}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${garmentHex}"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}
