import sharp from "sharp";
import { sanitizeArt } from "./art";
import { FONTS, type FontId, type FontRole } from "./fonts";
import { textShape } from "./render";
import type { ColorSlot, TextLayerT } from "./schema";

/**
 * Typsnittsmatchningen: texten i en importerad design är ofta former, och typsnittet går inte att läsa ur filen. Här
 * ritas samma text i varje licensierat typsnitt – med spärrning eller bredd räknad så att proportionerna blir
 * originalets – och jämförs pixel för pixel med originalets bokstäver. Ingen AI, och samma svar varje gång.
 */

/** `paint` är bokstävernas färgplats: bara den mäts, så att en skugga eller kontur i en annan färg inte räknas som bokstäver. */
export type MatchPart = { text: string; svg: string; viewBox: [number, number, number, number]; rotate?: number; prefer?: FontRole; paint?: ColorSlot };
export type MatchOption = { font: FontId; label: string; score: number; case: "upper" | "asis"; tracking?: [number, number]; condense?: number; skew?: number; arc?: number; rotate?: number };
/** Agentens bedömning av stilen väger in när inget typsnitt är tydligt närmast – men syns inte i procenten. */
const PREFER = 0.06;

/** Höjderna jämförelsen görs i – fin för formen, grov för helhetsintrycket; bredden följer originalets proportioner. */
const H = 56;
const COARSE = 14;
const RASTER = 180;
const SKEWS = [0, 12];
const REFINE = [-6, 6, 12, 18];
/** Bågarna som provas när originalets text är böjd, och hur böjd den måste vara för att räknas som en båge. */
const ARCS = [15, 30, 45, 60, 80];
const ARC_REFINE = [-20, -12, -6, 6, 12];
const BENT = 0.06;
/** Grader som en text måste luta för att räknas som lutad – kursiv stil ger själv någon grad. */
const TILTED = 3;
const ROTATE_REFINE = [-2, -1, 1, 2];

type Ink = { fine: Float32Array; coarse: Float32Array; aspect: number; weight: number };
type Size = { w: number; h: number };
const sizesFor = (aspect: number) => ({ fine: { w: Math.min(480, Math.max(8, Math.round(H * aspect))), h: H }, coarse: { w: Math.min(120, Math.max(2, Math.round(COARSE * aspect))), h: COARSE } });

/** Ritar en SVG, beskär till bläcket och skalar till samma storlekar som originalet: bläck 0–1 per pixel i två skalor. */
async function inkOf(doc: string, sizes?: { fine: Size; coarse: Size }): Promise<Ink | null> {
  try {
    // Bläckets kanter letas upp här: sharps trim lämnar ibland hela bilden orörd.
    const { data, info } = await sharp(Buffer.from(doc)).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    let [x0, y0, x1, y1] = [info.width, info.height, -1, -1];
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * info.channels] < 215) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    const aspect = (x1 - x0 + 1) / (y1 - y0 + 1);
    const { fine, coarse } = sizes ?? sizesFor(aspect);
    const crop = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    const scaled = async ({ w, h }: Size) => {
      const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).extract(crop).resize(w, h, { fit: "fill" }).blur(1).extractChannel(0).raw().toBuffer();
      return Float32Array.from(out, (v) => (255 - v) / 255);
    };
    const [f, c] = await Promise.all([scaled(fine), scaled(coarse)]);
    return { fine: f, coarse: c, aspect, weight: c.reduce((sum, v) => sum + v, 0) / c.length };
  } catch {
    return null;
  }
}

const docOf = (inner: string, [x, y, w, h]: [number, number, number, number]) => {
  const pad = Math.max(w, h) * 0.04;
  const [vx, vy, vw, vh] = [x - pad, y - pad, w + pad * 2, h + pad * 2];
  const scale = Math.min(RASTER / vh, 1600 / vw);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${Math.max(1, Math.round(vw * scale))}" height="${Math.max(1, Math.round(vh * scale))}"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>${inner}</svg>`;
};

/** Hur mycket texten böjer sig: mitten jämfört med ändarna, i delar av höjden – positivt när mitten ligger högre. */
function bendOf(ink: Float32Array, { w, h }: Size) {
  const middle = (x0: number, x1: number) => {
    let [sum, mass] = [0, 0];
    for (let y = 0; y < h; y++)
      for (let x = Math.floor(x0 * w); x < Math.max(Math.floor(x0 * w) + 1, Math.floor(x1 * w)); x++) {
        sum += ink[y * w + x] * y;
        mass += ink[y * w + x];
      }
    return mass ? sum / mass : h / 2;
  };
  return ((middle(0, 0.2) + middle(0.8, 1)) / 2 - middle(0.4, 0.6)) / h;
}

/** Hur många grader texten lutar: lutningen hos en rät linje genom bläcket, tillbakaräknad till originalets proportioner. */
function tiltOf(ink: Float32Array, { w, h }: Size, aspect: number) {
  let [m, sx, sy] = [0, 0, 0];
  for (let i = 0; i < ink.length; i++) [m, sx, sy] = [m + ink[i], sx + ink[i] * (i % w), sy + ink[i] * Math.floor(i / w)];
  if (!m) return 0;
  const [cx, cy] = [sx / m, sy / m];
  let [xy, xx] = [0, 0];
  for (let i = 0; i < ink.length; i++) {
    const dx = (i % w) - cx;
    [xy, xx] = [xy + ink[i] * dx * (Math.floor(i / w) - cy), xx + ink[i] * dx * dx];
  }
  return xx ? (Math.atan(((xy / xx) * (w / h)) / aspect) * 180) / Math.PI : 0;
}

/** Mjuk överlappning mellan två bläckbilder i samma storlek. */
function overlap(a: Float32Array, b: Float32Array) {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    both += Math.min(a[i], b[i]);
    either += Math.max(a[i], b[i]);
  }
  return either ? both / either : 0;
}
const ratio = (a: number, b: number) => (Math.max(a, b) ? Math.min(a, b) / Math.max(a, b) : 1);

/**
 * Hur lika två texter ser ut: formen i fin skala, helhetsintrycket i grov skala, hur tung skriften är och proportionerna.
 * Den grova skalan väger lika mycket som den fina, så att ett typsnitt med samma rytm och tyngd vinner även när ingen
 * bokstav är identisk – som en retroskrift mot de skrivstilar som finns.
 */
function similarity(a: Ink, b: Ink) {
  return Math.sqrt(overlap(a.fine, b.fine) * overlap(a.coarse, b.coarse)) * Math.sqrt(ratio(a.weight, b.weight)) * Math.sqrt(ratio(a.aspect, b.aspect));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (n: number) => Math.round(n * 100) / 100;

function layerFor(font: FontId, upper: boolean, part: MatchPart, extra: Partial<TextLayerT> = {}): TextLayerT {
  return { kind: "text", slot: "name", font, case: upper ? "upper" : "asis", color: "ink", box: { x: 0, y: 0, w: 1000, h: 300 }, align: "center", valign: "middle", maxLines: 1, ...(part.rotate ? { rotate: part.rotate } : {}), ...extra };
}

/** Spärrning eller bredd som ger originalets proportioner i det här typsnittet. Skrivstil spärras inte – bokstäverna ska hänga ihop. */
async function proportion(base: TextLayerT, font: FontId, text: string, target: number): Promise<Partial<TextLayerT>> {
  const aspect = async (l: TextLayerT) => {
    const s = await textShape(l, text);
    return s ? s.w / s.h : 0;
  };
  const a0 = await aspect(base);
  if (!a0 || Math.abs(a0 - target) / target < 0.04) return {};
  const script = FONTS[font].role === "script";
  if (!script && target > a0 && [...text].length > 1) {
    const a1 = await aspect({ ...base, tracking: [0.5, 0.5] });
    if (a1 > a0) {
      const t = r2(clamp((0.5 * (target - a0)) / (a1 - a0), 0, 1.2));
      return t >= 0.02 ? { tracking: [t, t] } : {};
    }
  }
  let c = clamp(target / a0, script ? 0.7 : 0.6, script ? 1.35 : 1.3);
  const a1 = await aspect({ ...base, condense: c });
  if (a1) c = clamp(c * (target / a1), script ? 0.7 : 0.6, script ? 1.35 : 1.3);
  return Math.abs(c - 1) >= 0.02 ? { condense: r2(c) } : {};
}

async function score(part: MatchPart, original: Ink, sizes: { fine: Size; coarse: Size }, font: FontId, upper: boolean, skew: number, arc = 0) {
  const base = layerFor(font, upper, part, { ...(skew ? { skew } : {}), ...(arc ? { arc } : {}) });
  const fit = await proportion(base, font, part.text, original.aspect);
  const layer = { ...base, ...fit };
  const shape = await textShape(layer, part.text);
  if (!shape) return null;
  const ink = await inkOf(docOf(`<path d="${shape.d}" fill="#000"/>`, [shape.x, shape.y, shape.w, shape.h]), sizes);
  if (!ink) return null;
  return { font, label: FONTS[font].label, score: similarity(original, ink), case: upper ? "upper" : "asis", ...(skew ? { skew } : {}), ...(arc ? { arc } : {}), ...(part.rotate ? { rotate: part.rotate } : {}), ...(layer.tracking ? { tracking: layer.tracking } : {}), ...(layer.condense ? { condense: layer.condense } : {}) } satisfies MatchOption;
}

/** Bågen som ger originalets böjning, mätt på ett typsnitt med jämn tyngd; 0 när texten är rak. */
async function arcFor(part: MatchPart, original: Ink, sizes: { fine: Size; coarse: Size }, upper: boolean) {
  const want = bendOf(original.fine, sizes.fine);
  if (Math.abs(want) < BENT || [...part.text].length < 3) return 0;
  let best = { arc: 0, off: Math.abs(want) };
  for (const a of ARCS.map((a) => a * Math.sign(want))) {
    const shape = await textShape(layerFor("archivo-black", upper, part, { arc: a }), part.text);
    const ink = shape && (await inkOf(docOf(`<path d="${shape.d}" fill="#000"/>`, [shape.x, shape.y, shape.w, shape.h]), sizes));
    const off = ink ? Math.abs(bendOf(ink.fine, sizes.fine) - want) : Infinity;
    if (off < best.off) best = { arc: a, off };
  }
  return best.arc;
}

/**
 * Lutningen i grader för ett ord som saknar lutning från importen. Bokstävernas egna former – en stor versal först, höga
 * staplar – drar den räta linjen, så samma text ritas rak i ett jämnt typsnitt med den uppmätta lutningen och skillnaden
 * räknas bort.
 */
async function rotationFor(part: MatchPart, original: Ink, sizes: { fine: Size; coarse: Size }, upper: boolean) {
  const seen = tiltOf(original.fine, sizes.fine, original.aspect);
  if (Math.abs(seen) < 1) return 0;
  const shape = await textShape(layerFor("archivo-black", upper, { ...part, rotate: seen }), part.text);
  const ink = shape && (await inkOf(docOf(`<path d="${shape.d}" fill="#000"/>`, [shape.x, shape.y, shape.w, shape.h]), sizes));
  const rotate = Math.round(ink ? seen * 2 - tiltOf(ink.fine, sizes.fine, ink.aspect) : seen);
  return Math.abs(rotate) >= TILTED ? clamp(rotate, -45, 45) : 0;
}

/** De typsnitt som liknar originalet mest, bäst först, med spärrning, bredd och lutning som ger samma form. */
export async function matchText(given: MatchPart, limit = Object.keys(FONTS).length): Promise<MatchOption[]> {
  const safe = sanitizeArt(given.svg);
  if (!safe || !given.text.trim()) return [];
  const letters = safe.replace(/\{(primary|secondary|ink|paper|on)\}/g, (_, slot: ColorSlot) => (given.paint ? slot === given.paint : slot !== "paper") ? "#000000" : "#ffffff");
  const original = await inkOf(docOf(letters, given.viewBox));
  if (!original) return [];
  const sizes = sizesFor(original.aspect);
  const upper = /\p{L}/u.test(given.text) && given.text === given.text.toLocaleUpperCase("sv-SE");
  const part = given.rotate === undefined ? { ...given, rotate: (await rotationFor(given, original, sizes, upper)) || undefined } : given;
  const arc = await arcFor(part, original, sizes, upper);
  const fonts = Object.keys(FONTS) as FontId[];
  // Rak text provas alltid – en lutad skrivstil kan se böjd ut utan att vara det.
  const arcs = arc ? [0, arc] : [0];
  const tried = await Promise.all(fonts.flatMap((f) => (FONTS[f].role === "script" ? [0] : SKEWS).flatMap((k) => arcs.map((a) => score(part, original, sizes, f, upper, k, a)))));
  const best = new Map<FontId, MatchOption>();
  const keep = (o: MatchOption | null) => {
    if (o && o.score > (best.get(o.font)?.score ?? -1)) best.set(o.font, o);
  };
  const rank = (o: MatchOption) => o.score + (part.prefer && FONTS[o.font].role === part.prefer ? PREFER : 0);
  tried.forEach(keep);
  // Böjd text är känsligare för bågen, så fler typsnitt får finjusteras.
  const top = [...best.values()].sort((a, b) => rank(b) - rank(a)).slice(0, arc ? 6 : 3);
  const refined = await Promise.all(
    top.flatMap((o) => [
      ...REFINE.map((d) => score(part, original, sizes, o.font, upper, clamp((o.skew ?? 0) + d, -30, 30), o.arc ?? 0)),
      ...(o.arc ? ARC_REFINE.map((d) => score(part, original, sizes, o.font, upper, o.skew ?? 0, clamp(o.arc! + d, -120, 120))) : []),
      ...(part !== given && part.rotate ? ROTATE_REFINE.map((d) => score({ ...part, rotate: part.rotate! + d }, original, sizes, o.font, upper, o.skew ?? 0, o.arc ?? 0)) : []),
    ]),
  );
  refined.forEach(keep);
  return [...best.values()]
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, limit)
    .map((o) => ({ ...o, score: Math.round(Math.min(1, o.score) * 100) }));
}
