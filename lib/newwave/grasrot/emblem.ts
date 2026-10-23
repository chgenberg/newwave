import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Potrace } from "potrace";
import sharp from "sharp";
import { deltaE2000, hexToLab } from "@/lib/pantone";
import { hexToRgb, rgbToHex } from "@/lib/scarf";
import { convertDesign } from "@/lib/newwave/wordmark/convert";
import { readData, writeData } from "@/lib/newwave/workspace";
import { type Box, type Matrix, parsePath, pathString, transformPath } from "@/lib/newwave/vector/path";
import { colorsOf, type Flat, flattenSvg, recolor, toSvg } from "@/lib/newwave/vector/svg";
import { grasrotClub } from "./clubs";

/**
 * Klubbmärket i de tre varianter New Wave Group kräver:
 * - original: full färg, som klubben ritat det;
 * - solid: en färg där det som inte trycks är riktiga hål – för gravyr, brodyr i en färg och enfärgstryck;
 * - negativ: soliden i vitt för mörka plagg och produkter; hålen låter plaggets färg bära det som var vitt.
 * Levererade vektorfiler går alltid först. Saknas solid räknas den fram ur originalet: varje form får motsatt tillstånd
 * mot formen den ligger på (figur och grund), så att alla kanter som syns i färg också syns i en färg.
 */

export const VARIANTS = ["original", "solid", "negativ"] as const;
export type Variant = (typeof VARIANTS)[number];

export type EmblemQuality = {
  /** vektor = klubbens eller New Wave Groups egen fil; bild = vektoriserad från den största bilden som fanns. */
  kind: "vektor" | "bild";
  px?: number;
  /** Godkänd för produktion utan original: vektorfil, eller en bild som är minst 800 px. */
  ready: boolean;
  note: string;
};

export type EmblemSet = Record<Variant, Flat> & { quality: EmblemQuality; auto: { solid: boolean } };

const DIR = (id: string) => path.join(process.cwd(), "assets", "grasrot", id);
/** Cachen nycklas på källans innehåll och VERSION, som höjs när vektoriseringen eller figur–grund-regeln ändras. */
const VERSION = 1;
const cacheKey = (id: string, variant: Variant, ...sources: (string | Buffer)[]) => {
  const hash = createHash("sha1");
  for (const s of sources) hash.update(s);
  return `newwave/grasrot/${id}/${variant}-v${VERSION}-${hash.digest("hex").slice(0, 12)}.svg`;
};
async function cached(key: string, make: () => Promise<Flat>): Promise<Flat> {
  const hit = await readData(key, { shared: true });
  if (hit) return flattenSvg(hit);
  const flat = await make();
  await writeData(key, toSvg(flat), { shared: true });
  return flat;
}

const SHARP_PX = 800;
const PAPER = "#FFFFFF";
export const SOLID_INK = "#000000";
export const NEGATIVE_INK = "#FFFFFF";
const dark = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
};

async function original(id: string): Promise<{ flat: Flat; quality: EmblemQuality; source: string | Buffer }> {
  const dir = DIR(id);
  if (existsSync(path.join(dir, "original.svg"))) {
    const source = await readFile(path.join(dir, "original.svg"), "utf8");
    const flat = flattenSvg(source);
    const quality: EmblemQuality = { kind: "vektor", ready: flat.issues.length === 0, note: flat.issues.length ? flat.issues.join(" · ") : "Vektorfil – klar för tryck" };
    return { flat, quality, source };
  }
  const png = await readFile(path.join(dir, "emblem.png"));
  const meta = await sharp(png).metadata();
  const px = Math.max(meta.width ?? 0, meta.height ?? 0);
  const quality: EmblemQuality = {
    kind: "bild",
    px,
    ready: px >= SHARP_PX,
    note: px >= SHARP_PX ? `Vektoriserad från en bild på ${px} px – granska kanterna mot originalet` : `Provisorisk: bara ${px} px fanns – klubbens originalfil (AI, EPS, PDF eller SVG) behövs för tryck`,
  };
  const flat = await cached(cacheKey(id, "original", png), async () => {
    // Små bilder förstoras först; vektoriseringen kräver minst 300 px och ger mjukare kurvor av en större bild.
    const input = px < 1000 ? await sharp(png).resize({ width: Math.round(((meta.width ?? px) * 1000) / px), kernel: "lanczos3" }).png().toBuffer() : png;
    return simplify(flattenSvg((await convertDesign(input)).svg));
  });
  return { flat, quality, source: png };
}

/** Pixelrutnätet varianterna ritas och spåras om i: märkets ruta med lite marginal, 2400 px på längsta sidan. */
type Grid = { box: Box; s: number; pad: number; W: number; H: number };
function grid(box: Box, side = 2400): Grid {
  const s = side / Math.max(box.w, box.h);
  const pad = 8;
  return { box, s, pad, W: Math.round(box.w * s) + 2 * pad, H: Math.round(box.h * s) + 2 * pad };
}

/** 1 där formerna trycks, 0 där de inte gör det; senare former täcker tidigare som i originalet. */
async function inkMask(flat: Flat, ink: (i: number) => boolean, g: Grid): Promise<Uint8Array> {
  const m: Matrix = [g.s, 0, 0, g.s, g.pad - g.box.x * g.s, g.pad - g.box.y * g.s];
  const paths = flat.shapes.map((sh, i) => `<path d="${pathString(transformPath(sh.segs, m), 2)}" fill="${ink(i) ? "#000" : "#fff"}"${sh.rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}"><rect width="100%" height="100%" fill="#fff"/>${paths}</svg>`;
  const raw = await sharp(Buffer.from(svg)).flatten({ background: "#fff" }).greyscale().raw().toBuffer();
  return Uint8Array.from(raw, (v) => (v < 128 ? 1 : 0));
}

/** Märket i färg, där varje pixel fått sin närmaste färgklass (0 = papperet; vitt räknas som papper). */
async function classify(flat: Flat, palette: string[], g: Grid) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}" viewBox="${g.box.x - g.pad / g.s} ${g.box.y - g.pad / g.s} ${g.W / g.s} ${g.H / g.s}">${toSvg(flat).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
  const raw = await sharp(Buffer.from(svg)).flatten({ background: PAPER }).removeAlpha().raw().toBuffer();
  const labs = palette.map(hexToLab);
  const memo = new Map<number, number>();
  const cls = new Uint8Array(g.W * g.H);
  for (let p = 0; p < cls.length; p++) {
    const key = (raw[3 * p] << 16) | (raw[3 * p + 1] << 8) | raw[3 * p + 2];
    let c = memo.get(key);
    if (c === undefined) {
      const lab = hexToLab(rgbToHex([raw[3 * p], raw[3 * p + 1], raw[3 * p + 2]]));
      const d = labs.map((l) => deltaE2000(lab, l));
      c = d.indexOf(Math.min(...d));
      memo.set(key, c);
    }
    cls[p] = c;
  }
  return cls;
}

/** Hur stor del av märkets ruta varje färg täcker och hur bred den är i snitt (2·yta/omkrets, i px av 600), störst först. */
export async function colorAreas(flat: Flat): Promise<{ hex: string; share: number; width: number }[]> {
  const cols = colorsOf(flat);
  const g = grid(flat.box, 600);
  const cls = await classify(flat, [PAPER, ...cols], g);
  const area = new Array<number>(cols.length + 1).fill(0);
  const edge = new Array<number>(cols.length + 1).fill(0);
  for (let p = 0; p < cls.length; p++) {
    area[cls[p]]++;
    for (const q of [p % g.W < g.W - 1 ? p + 1 : -1, p + g.W < cls.length ? p + g.W : -1])
      if (q >= 0 && cls[q] !== cls[p]) {
        edge[cls[p]]++;
        edge[cls[q]]++;
      }
  }
  return cols.map((hex, i) => ({ hex, share: area[i + 1] / cls.length, width: (2 * area[i + 1]) / Math.max(1, edge[i + 1]) })).sort((a, b) => b.share - a.share);
}

/**
 * Vektoriserade bilder får skuggningar och kantblandningar som egna färger, men i tryck blir varje färg ett eget schablon
 * eller en egen tråd. En färg som nästan inte går att skilja från en större (ΔE00 under 10), eller som bara finns som
 * hårfina strimlor längs kanterna (medelbredd under 3 px av 600) nära en större färg, får den större färgen.
 * Vitt räknas alltid som en större färg.
 */
async function simplify(flat: Flat): Promise<Flat> {
  const into = new Map<string, string>();
  const kept = [{ hex: PAPER, lab: hexToLab(PAPER) }];
  for (const row of await colorAreas(flat)) {
    const lab = hexToLab(row.hex);
    const near = kept.map((k) => ({ k, d: deltaE2000(lab, k.lab) })).sort((a, b) => a.d - b.d)[0];
    if (near.d < 10 || (row.width < 3 && near.d < 30)) into.set(row.hex, near.k.hex);
    else kept.push({ hex: row.hex, lab });
  }
  return recolor(flat, (hex) => into.get(hex) ?? hex);
}

/**
 * Figur och grund på synliga färgytor, som en formgivare gör en enfärgsversion: ytan utanför märket är papper och varje
 * yta får motsatt tillstånd mot ytan den ligger i. Tillståndet följer alltså hur märket ser ut, inte hur filen är byggd –
 * samma blå form kan vara tryckt ring ytterst och omålad grund innanför en vit linje. Hårfina rester av kantutjämning
 * och vektorisering räknas till grannytan, så att de inte vänder allt innanför.
 */
async function solidMask(flat: Flat): Promise<Uint8Array & { grid: Grid }> {
  const palette = [PAPER];
  for (const hex of colorsOf(flat)) if (palette.every((c) => deltaE2000(hexToLab(c), hexToLab(hex)) >= 10)) palette.push(hex);
  const lo = grid(flat.box, 1000);
  const cls = await classify(flat, palette, lo);
  const { W, H } = lo;
  const comp = new Int32Array(W * H).fill(-1);
  const size: number[] = [];
  const edge: number[] = [];
  const compCls: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < comp.length; start++) {
    if (comp[start] >= 0) continue;
    const id = size.length;
    size.push(0);
    edge.push(0);
    compCls.push(cls[start]);
    comp[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      size[id]++;
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < comp.length ? p + W : -1]) {
        if (q < 0 || cls[q] !== cls[start]) edge[id]++;
        else if (comp[q] < 0) {
          comp[q] = id;
          stack.push(q);
        }
      }
    }
  }
  const border = new Map<number, Map<number, number>>();
  const touch = (a: number, b: number) => {
    const m = border.get(a) ?? new Map<number, number>();
    m.set(b, (m.get(b) ?? 0) + 1);
    border.set(a, m);
  };
  for (let p = 0; p < comp.length; p++) {
    const x = p % W;
    for (const q of [x < W - 1 ? p + 1 : -1, p + W < comp.length ? p + W : -1])
      if (q >= 0 && comp[q] !== comp[p]) {
        touch(comp[p], comp[q]);
        touch(comp[q], comp[p]);
      }
  }
  // Medelbredd = 2·yta/omkrets; under 2,5 px av 1000 är det en kantrest, inte en del av märket.
  const noise = size.map((n, i) => n < 50 || (2 * n) / edge[i] < 2.5);
  const rep = size.map((_, i) => {
    if (!noise[i]) return i;
    const best = [...(border.get(i) ?? [])].filter(([j]) => !noise[j]).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : i;
  });
  const graph = new Map<number, Set<number>>();
  for (const [a, m] of border)
    for (const b of m.keys())
      if (rep[a] !== rep[b]) {
        graph.set(rep[a], (graph.get(rep[a]) ?? new Set()).add(rep[b]));
        graph.set(rep[b], (graph.get(rep[b]) ?? new Set()).add(rep[a]));
      }
  const depth = new Array<number>(size.length).fill(Number.POSITIVE_INFINITY);
  const queue: number[] = [];
  for (let p = 0; p < comp.length; p++) {
    const x = p % W;
    if (x === 0 || x === W - 1 || p < W || p >= comp.length - W) {
      const r = rep[comp[p]];
      if (depth[r] !== 0) {
        depth[r] = 0;
        queue.push(r);
      }
    }
  }
  // En tunn linje i papperets färg som helt omsluter en stor grundyta i samma färg som ytan utanför linjen är en springa,
  // inte en yta: grundytan fortsätter i springans tillstånd. Så gör formgivare en enfärgad sköld – ytterringen fylld och
  // mitten öppen. Bokstäver med vit kantlinje är inte grundytor och behåller sitt tillstånd.
  const gap = (a: number, b: number) =>
    compCls[a] === 0 &&
    size[b] > 0.05 * W * H &&
    (2 * size[a]) / edge[a] < 0.02 * Math.max(W, H) &&
    [...(graph.get(a) ?? [])].some((c) => depth[c] === depth[a] - 1 && compCls[c] === compCls[b]) &&
    ![...(graph.get(b) ?? [])].some((c) => depth[c] < depth[a]);
  // 0-1-sökning: samma färgklass över gränsen (eller en springa) = samma djup, annan färgklass = ett steg djupare.
  while (queue.length) {
    const a = queue.shift() as number;
    for (const b of graph.get(a) ?? []) {
      const same = compCls[a] === compCls[b] || gap(a, b);
      const d = depth[a] + (same ? 0 : 1);
      if (d < depth[b]) {
        depth[b] = d;
        if (same) queue.unshift(b);
        else queue.push(b);
      }
    }
  }
  const inkOf = (c: number) => depth[rep[c]] % 2 === 1;
  const hi = grid(flat.box);
  const hiCls = await classify(flat, palette, hi);
  const k = lo.s / hi.s;
  const mask = new Uint8Array(hi.W * hi.H) as Uint8Array & { grid: Grid };
  for (let y = 0; y < hi.H; y++)
    for (let x = 0; x < hi.W; x++) {
      const p = y * hi.W + x;
      const lx = Math.min(W - 1, Math.max(0, Math.round(lo.pad + (x - hi.pad) * k)));
      const ly = Math.min(H - 1, Math.max(0, Math.round(lo.pad + (y - hi.pad) * k)));
      const centre = comp[ly * W + lx];
      let hit = compCls[centre] === hiCls[p] ? centre : -1;
      for (let dy = -1; hit < 0 && dy <= 1; dy++)
        for (let dx = -1; hit < 0 && dx <= 1; dx++) {
          const [nx, ny] = [lx + dx, ly + dy];
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && compCls[comp[ny * W + nx]] === hiCls[p]) hit = comp[ny * W + nx];
        }
      // En detalj som är för tunn för den grova bilden ligger på ytan runt sig och får motsatt tillstånd.
      mask[p] = (hit >= 0 ? inkOf(hit) : !inkOf(centre)) ? 1 : 0;
    }
  mask.grid = hi;
  return mask;
}

/** Spårar masken till en enda bana med jämnt–udda-fyllning, så att allt som inte trycks är riktiga hål. */
async function trace(mask: Uint8Array, g: Grid, fill: string): Promise<Flat> {
  const png = await sharp(Buffer.from(mask.map((v) => (v ? 0 : 255))), { raw: { width: g.W, height: g.H, channels: 1 } }).png().toBuffer();
  const d = await new Promise<string>((resolve, reject) => {
    const p = new Potrace({ turdSize: 4, alphaMax: 1, optCurve: true, optTolerance: 0.2, threshold: 128, blackOnWhite: true });
    p.loadImage(png, (err) => (err ? reject(err) : resolve(/\sd="([^"]+)"/.exec(p.getPathTag(fill))?.[1] ?? "")));
  });
  const back: Matrix = [1 / g.s, 0, 0, 1 / g.s, g.box.x - g.pad / g.s, g.box.y - g.pad / g.s];
  return flattenSvg(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathString(transformPath(parsePath(d), back), 3)}" fill="${fill}" fill-rule="evenodd"/></svg>`);
}

/** Lägger märket centrerat i en ruta; en levererad variant kan vara utklippt ur ett annat ställe i samma dokument. */
export function fit(flat: Flat, box: Box): Flat {
  const s = Math.min(box.w / flat.box.w, box.h / flat.box.h);
  const m: Matrix = [s, 0, 0, s, box.x + (box.w - flat.box.w * s) / 2 - flat.box.x * s, box.y + (box.h - flat.box.h * s) / 2 - flat.box.y * s];
  return { ...flat, box, shapes: flat.shapes.map((sh) => ({ ...sh, segs: transformPath(sh.segs, m) })) };
}

/** Förslag på solid ur originalet, som en enda bana med riktiga hål. */
export async function autoSolid(flat: Flat): Promise<Flat> {
  const mask = await solidMask(flat);
  return trace(mask, mask.grid, SOLID_INK);
}

const sets = new Map<string, Promise<EmblemSet>>();

async function build(id: string): Promise<EmblemSet> {
  const { flat, quality, source } = await original(id);
  const g = grid(flat.box);
  const given = path.join(DIR(id), "solid.svg");
  let solid: Flat;
  if (existsSync(given)) {
    const raw = fit(flattenSvg(await readFile(given, "utf8")), flat.box);
    solid = raw.shapes.every((sh) => dark(sh.fill)) ? recolor(raw, () => SOLID_INK) : await trace(await inkMask(raw, (i) => dark(raw.shapes[i].fill), g), g, SOLID_INK);
  } else
    solid = await cached(cacheKey(id, "solid", source), () => autoSolid(flat));
  return { original: flat, solid, negativ: recolor(solid, () => NEGATIVE_INK), quality, auto: { solid: !existsSync(given) } };
}

/** Klubbens märke i alla tre varianter; null för klubbar utanför Gräsrot 360. */
export function emblemSet(id: string): Promise<EmblemSet> | null {
  if (!grasrotClub(id)) return null;
  let p = sets.get(id);
  if (!p) {
    p = build(id);
    p.catch(() => sets.delete(id));
    sets.set(id, p);
  }
  return p;
}
