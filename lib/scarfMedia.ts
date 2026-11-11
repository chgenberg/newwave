import type { Font, PathCommand } from "opentype.js";
import sharp from "sharp";
import { deltaE, hexToRgb, rgbToHex } from "./scarf";
import type { ImageChannel, ScarfCopy } from "./scarfChannels";
import { FONT_FILES } from "./scarfDesign";
import { loadFontFile } from "./scarfEngine";
import type { ScarfIdea } from "./scarfRecipes";

/**
 * Kanalbilderna för ett valt motiv: Instagram, Facebook, LinkedIn och hemsidans banner, samt stillbilderna som
 * filmerna klipps av. Varje bild är en SVG som sätts ihop av fotot, halsduken som den blir stickad, märket och
 * texterna, och sedan görs om till en bild. All text ritas som konturer ur typsnittsfilerna, så att bilderna
 * blir likadana på alla datorer.
 */

const LABEL_FONT = "jockey-one.ttf";
const PAPER = "#F4F4F6";
const INK = "#1D1D1F";

export type Look = {
  /** Bakgrunden som halsduken och texten ligger på – en av klubbens färger som halsduken syns mot. */
  stage: string;
  onStage: string;
  accent: string;
  onAccent: string;
  /** Sant om märket behöver en vit platta för att synas mot bakgrunden. */
  plate: boolean;
};

export type MediaInput = {
  name: string;
  /** Märket som PNG, eller null om klubben saknar ett. */
  crest: Buffer | null;
  look: Look;
  /** Fram- och baksida som de blir stickade, liggande med fransar (genomskinlig botten). */
  front: Buffer;
  back: Buffer;
  /** Fotografier på modell, stående format. Kan vara tom. */
  photos: Buffer[];
  copy: ScarfCopy;
  fonts: { head: Font; label: Font };
};

const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
};
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex([0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t)) as [number, number, number]);
};
const on = (hex: string) => (lum(hex) < 150 ? "#FFFFFF" : "#111111");

/** Färgerna bilderna sätts i. Bakgrunden är den första av klubbens färger som halsdukens botten syns mot. */
export function lookOf(club: { palette: { hex: string }[]; crestColors: string[] }, idea: Pick<ScarfIdea, "colors">): Look {
  const palette = club.palette.map((p) => p.hex.toUpperCase());
  const ground = idea.colors.ground.toUpperCase();
  const stage = palette.find((c) => lum(c) < 215 && deltaE(c, ground) >= 22) ?? (lum(ground) > 70 ? mix(ground, "#000000", 0.62) : PAPER);
  const accent = [idea.colors.accent, idea.colors.ink, ...palette, "#FFFFFF", "#111111"].map((c) => c.toUpperCase()).find((c) => deltaE(c, stage) >= 35) ?? on(stage);
  const crest = club.crestColors[0];
  return { stage, onStage: on(stage), accent, onAccent: on(accent), plate: !crest || deltaE(crest.toUpperCase(), stage) < 28 };
}

export async function mediaFonts(idea: Pick<ScarfIdea, "font">) {
  const [head, label] = await Promise.all([loadFontFile(FONT_FILES[idea.font]), loadFontFile(LABEL_FONT)]);
  return { head, label };
}

// --- Byggstenar ----------------------------------------------------------------

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const up = (s: string) => s.toLocaleUpperCase("sv-SE");
const uri = (buf: Buffer, type: "png" | "jpeg") => `data:image/${type};base64,${buf.toString("base64")}`;

type Row = { d: string; w: number };
type Block = { rows: Row[]; size: number; step: number; cap: number; w: number; h: number };

/** Konturen som SVG-bana. Skrivs ut här, eftersom typsnittsbibliotekets egen avrundning ger NaN för vissa tal. */
function pathData(commands: PathCommand[]) {
  const r = (v: number) => (Math.round(v * 100) / 100).toString();
  return commands
    .map((c) => {
      if (c.type === "M" || c.type === "L") return `${c.type}${r(c.x)} ${r(c.y)}`;
      if (c.type === "C") return `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
      if (c.type === "Q") return `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`;
      return "Z";
    })
    .join("");
}

/** En rad text som kontur, med baslinjen i y = 0 och början i x = 0. */
function row(font: Font, text: string, size: number, spacing = 0): Row {
  const opts = { letterSpacing: spacing };
  return { d: pathData(font.getPath(text, 0, 0, size, opts).commands), w: Math.max(0, font.getAdvanceWidth(text, size, opts) - spacing * size) };
}

const capOf = (font: Font, size: number) => -font.getPath("H", 0, 0, size).getBoundingBox().y1 || size * 0.7;

/** Texten så stor som får plats på högst `lines` rader inom bredden. */
function fit(font: Font, text: string, o: { width: number; max: number; min: number; lines: number; spacing?: number; leading?: number }): Block {
  const words = text.split(/\s+/).filter(Boolean);
  const build = (size: number) => {
    const rows: string[] = [];
    for (const word of words) {
      const last = rows.at(-1);
      if (last !== undefined && row(font, `${last} ${word}`, size, o.spacing).w <= o.width) rows[rows.length - 1] = `${last} ${word}`;
      else rows.push(word);
    }
    return rows.map((r) => row(font, r, size, o.spacing));
  };
  let size = o.max;
  let rows = build(size);
  while (size > o.min && (rows.length > o.lines || rows.some((r) => r.w > o.width))) {
    size = Math.max(o.min, size - Math.max(2, Math.round(size * 0.04)));
    rows = build(size);
  }
  const cap = capOf(font, size);
  const step = cap * (o.leading ?? 1.32);
  return { rows, size, step, cap, w: Math.max(...rows.map((r) => r.w), 0), h: cap + step * (rows.length - 1) };
}

/** Ritar ett textblock med överkanten i `y`. `x` är vänsterkant, mitt eller högerkant beroende på `align`. */
function draw(b: Block, x: number, y: number, fill: string, align: "left" | "center" | "right" = "left", opacity = 1) {
  return b.rows
    .map((r, i) => {
      const tx = align === "left" ? x : align === "center" ? x - r.w / 2 : x - r.w;
      return `<path d="${r.d}" transform="translate(${n(tx)} ${n(y + b.cap + i * b.step)})" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`;
    })
    .join("");
}

/** En liten etikett på färgad platta. Ger också bredden, så att den går att ställa mot en kant. */
function pill(font: Font, text: string, x: number, y: number, size: number, look: Look, align: "left" | "center" = "left") {
  const r = row(font, up(text), size, 0.08);
  const cap = capOf(font, size);
  const [w, h] = [r.w + size * 1.3, size * 1.75];
  const left = align === "center" ? x - w / 2 : x;
  return {
    w,
    h,
    svg: `<rect x="${n(left)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${look.accent}"/><path d="${r.d}" transform="translate(${n(left + (w - r.w) / 2)} ${n(y + (h + cap) / 2)})" fill="${look.onAccent}"/>`,
  };
}

async function photoUri(photo: Buffer, w: number, h: number, position: "top" | "centre" = "top") {
  return uri(await sharp(photo).resize(Math.round(w), Math.round(h), { fit: "cover", position }).jpeg({ quality: 90 }).toBuffer(), "jpeg");
}

type Piece = { uri: string; w: number; h: number };
async function piece(png: Buffer, width: number): Promise<Piece> {
  const buf = await sharp(png).resize({ width: Math.round(width) }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { uri: uri(buf, "png"), w: meta.width ?? width, h: meta.height ?? width / 8 };
}

const SHADOW = `<filter id="skugga" x="-10%" y="-80%" width="120%" height="260%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.38"/></filter>`;

/** Halsduken med mitten i (cx, cy), vriden `deg` grader. */
const scarf = (p: Piece, cx: number, cy: number, deg = 0) =>
  `<image xlink:href="${p.uri}" x="${n(-p.w / 2)}" y="${n(-p.h / 2)}" width="${p.w}" height="${p.h}" transform="translate(${n(cx)} ${n(cy)}) rotate(${deg})" filter="url(#skugga)"/>`;

/** Märket och klubbens namn. Märket ryms i en ruta som är `h` hög; en bred logga bär redan namnet och får stå ensam. */
async function mark(m: MediaInput, x: number, y: number, h: number, color: string, opts: { name?: boolean; plate?: boolean; maxWidth?: number } = {}) {
  let svg = "";
  let w = 0;
  if (m.crest) {
    const meta = await sharp(m.crest).metadata();
    const ar = (meta.width || 1) / (meta.height || 1);
    const boxW = Math.min(h * 2.6, opts.maxWidth ?? Infinity);
    const [cw, ch] = ar > boxW / h ? [boxW, boxW / ar] : [h * ar, h];
    const img = uri(await sharp(m.crest).resize({ width: Math.round(cw * 2), height: Math.round(ch * 2), fit: "inside" }).png().toBuffer(), "png");
    const pad = opts.plate ? h * 0.16 : 0;
    if (opts.plate) svg += `<rect x="${n(x)}" y="${n(y)}" width="${n(cw + pad * 2)}" height="${n(h + pad * 2)}" rx="${n(h * 0.2)}" fill="#FFFFFF"/>`;
    svg += `<image xlink:href="${img}" x="${n(x + pad)}" y="${n(y + pad + (h - ch) / 2)}" width="${n(cw)}" height="${n(ch)}"/>`;
    w = cw + pad * 2;
    if (ar > 1.7) return { svg, w, h: h + pad * 2 };
    y += pad;
  }
  if (opts.name !== false) {
    const size = h * 0.4;
    const r = row(m.fonts.label, up(m.name), size, 0.06);
    const gap = w ? h * 0.26 : 0;
    svg += `<path d="${r.d}" transform="translate(${n(x + w + gap)} ${n(y + (h + capOf(m.fonts.label, size)) / 2)})" fill="${color}"/>`;
    w += gap + r.w;
  }
  return { svg, w, h };
}

const open = (w: number, h: number, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}"><defs>${SHADOW}</defs>`;

const render = (svg: string) => sharp(Buffer.from(svg), { unlimited: true });
const jpg = (svg: string) => render(svg).flatten({ background: "#FFFFFF" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();

/** Fram- och baksidan som två snedställda band över ytan – för bilder utan fotografi. */
async function bands(m: MediaInput, box: { x: number; y: number; w: number; h: number }, deg = -14) {
  const len = Math.hypot(box.w, box.h) * 1.18;
  const [front, back] = await Promise.all([piece(m.front, len), piece(m.back, len)]);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const gap = front.h * 0.62;
  const rad = (deg * Math.PI) / 180;
  // Banden förskjuts längs sin egen riktning, så att de inte ligger kant i kant.
  const shift = len * 0.07;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  const at = (side: -1 | 1) => [cx + side * (shift * cos - gap * sin), cy + side * (shift * sin + gap * cos)] as const;
  const [a, b] = [at(-1), at(1)];
  return `<g clip-path="url(#ruta)">${scarf(front, a[0], a[1], deg)}${scarf(back, b[0], b[1], deg)}</g>`;
}

const clip = (box: { x: number; y: number; w: number; h: number }, id = "ruta") => `<clipPath id="${id}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath>`;

// --- Instagram 4:5 --------------------------------------------------------------

async function instagram(m: MediaInput) {
  const [W, H, P] = [1080, 1350, 64];
  const { look, copy } = m;
  let svg = open(W, H);
  const head = fit(m.fonts.head, up(copy.headline), { width: W - P * 2, max: 132, min: 64, lines: 2 });
  const sub = fit(m.fonts.label, copy.subline, { width: W - P * 2, max: 40, min: 28, lines: 2, leading: 1.5 });
  const subY = H - P - sub.h;
  const headY = subY - 30 - head.h;
  if (m.photos[0]) {
    svg += `<image xlink:href="${await photoUri(m.photos[0], W, H)}" width="${W}" height="${H}"/>`;
    const from = Math.max(0.3, (headY - 330) / H);
    svg += `<defs><linearGradient id="ner" x1="0" y1="0" x2="0" y2="1"><stop offset="${n(from)}" stop-color="${look.stage}" stop-opacity="0"/><stop offset="${n((headY - 40) / H)}" stop-color="${look.stage}" stop-opacity="0.9"/><stop offset="1" stop-color="${look.stage}"/></linearGradient><linearGradient id="upp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0.5"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient></defs>`;
    svg += `<rect width="${W}" height="250" fill="url(#upp)"/><rect width="${W}" height="${H}" fill="url(#ner)"/>`;
    svg += (await mark(m, P, P - 8, 104, "#FFFFFF")).svg;
  } else {
    const box = { x: 0, y: 0, w: W, h: headY - 40 };
    svg += `<rect width="${W}" height="${H}" fill="${look.stage}"/><defs>${clip(box)}</defs>${await bands(m, { ...box, y: 150, h: box.h - 150 })}`;
    svg += (await mark(m, P, P - 8, 104, look.onStage, { plate: look.plate })).svg;
  }
  const tag = pill(m.fonts.label, "Ny halsduk", P, headY - 78, 30, look);
  svg += tag.svg + draw(head, P, headY, look.onStage) + draw(sub, P, subY, look.onStage, "left", 0.86);
  return jpg(`${svg}</svg>`);
}

// --- Facebook 1:1 ---------------------------------------------------------------

async function facebook(m: MediaInput) {
  const [W, H, P] = [1080, 1080, 60];
  const { look, copy } = m;
  const split = 640;
  let svg = open(W, H) + `<rect width="${W}" height="${H}" fill="${look.stage}"/>`;
  const photo = m.photos[1] ?? m.photos[0];
  if (photo) svg += `<image xlink:href="${await photoUri(photo, W, split)}" width="${W}" height="${split}"/>`;
  else svg += `<defs>${clip({ x: 0, y: 0, w: W, h: split })}</defs><rect width="${W}" height="${split}" fill="${mix(look.stage, look.onStage, 0.1)}"/>${await bands(m, { x: 0, y: 0, w: W, h: split }, -10)}`;
  // Halsduken som den blir stickad ligger över skarven mellan fotot och färgfältet.
  if (photo) svg += scarf(await piece(m.front, W * 1.02), W / 2, split, -2.5);
  const brand = await mark(m, 0, 0, 92, look.onStage, { name: false, plate: look.plate });
  const textW = W - P * 2 - (brand.w ? brand.w + 36 : 0);
  const head = fit(m.fonts.head, up(copy.headline), { width: textW, max: 104, min: 56, lines: 2 });
  const sub = fit(m.fonts.label, copy.subline, { width: textW, max: 36, min: 26, lines: 2, leading: 1.5 });
  const top = split + (photo ? 96 : 40);
  const free = H - top - P;
  const y = top + Math.max(0, (free - (head.h + 26 + sub.h)) / 2);
  svg += draw(head, P, y, look.onStage) + draw(sub, P, y + head.h + 26, look.onStage, "left", 0.86);
  if (brand.w) svg += `<g transform="translate(${n(W - P - brand.w)} ${n(H - P - brand.h)})">${brand.svg}</g>`;
  return jpg(`${svg}</svg>`);
}

// --- LinkedIn 1,91:1 ------------------------------------------------------------

async function linkedin(m: MediaInput) {
  const [W, H, P] = [1200, 628, 56];
  const { look, copy } = m;
  const photo = m.photos[0];
  const side = photo ? 400 : 0;
  const left = W - side;
  let svg = open(W, H) + `<rect width="${W}" height="${H}" fill="${PAPER}"/>`;
  if (photo) svg += `<image xlink:href="${await photoUri(photo, side, H)}" x="${left}" width="${side}" height="${H}"/>`;
  svg += `<rect width="${left}" height="10" fill="${look.stage === PAPER ? look.accent : look.stage}"/>`;
  svg += (await mark(m, P, P, 64, INK, { maxWidth: 240 })).svg;
  const width = left - P * 2;
  const [front, back] = await Promise.all([piece(m.front, width), piece(m.back, width)]);
  const scarvesH = front.h * 2 + 22;
  const scarvesY = H - P + 6 - scarvesH;
  const head = fit(m.fonts.head, up(copy.headline), { width, max: 78, min: 44, lines: 2 });
  const sub = fit(m.fonts.label, copy.subline, { width, max: 30, min: 22, lines: 1 });
  const top = P + 64 + 30;
  const y = top + Math.max(0, (scarvesY - 34 - top - (head.h + 20 + sub.h)) / 2);
  svg += draw(head, P, y, INK) + draw(sub, P, y + head.h + 20, "#55555A");
  svg += scarf(front, P + width / 2, scarvesY + front.h / 2) + scarf(back, P + width / 2, scarvesY + front.h * 1.5 + 22);
  return jpg(`${svg}</svg>`);
}

// --- Hemsidans banner 1920 × 600 --------------------------------------------------

async function banner(m: MediaInput) {
  const [W, H, P] = [1920, 600, 84];
  const { look, copy } = m;
  const photo = m.photos[1] ?? m.photos[0];
  const side = photo ? 470 : 0;
  let svg = open(W, H) + `<rect width="${W}" height="${H}" fill="${look.stage}"/>`;
  if (photo) {
    svg += `<defs><linearGradient id="kant" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${look.stage}"/><stop offset="1" stop-color="${look.stage}" stop-opacity="0"/></linearGradient></defs>`;
    svg += `<image xlink:href="${await photoUri(photo, side, H)}" x="${W - side}" width="${side}" height="${H}"/><rect x="${W - side}" width="170" height="${H}" fill="url(#kant)"/>`;
  }
  const textW = 600;
  const brand = await mark(m, P, 64, 76, look.onStage, { plate: look.plate, maxWidth: 260 });
  const head = fit(m.fonts.head, up(copy.banner.headline), { width: textW, max: 96, min: 52, lines: 2 });
  const sub = fit(m.fonts.label, copy.banner.subline, { width: textW, max: 34, min: 24, lines: 2, leading: 1.5 });
  const button = pill(m.fonts.label, copy.banner.button, P, 0, 30, look);
  const top = 64 + brand.h + 30;
  const block = head.h + 22 + sub.h + 34 + button.h;
  const y = top + Math.max(0, (H - 60 - top - block) / 2);
  svg += brand.svg + draw(head, P, y, look.onStage) + draw(sub, P, y + head.h + 22, look.onStage, "left", 0.86);
  svg += `<g transform="translate(0 ${n(y + head.h + 22 + sub.h + 34)})">${button.svg}</g>`;
  // Halsduken ligger mellan texten och fotot – fram- och baksida, lätt snedställda. Den slutar innan ansiktet.
  const x0 = P + textW + 56;
  const len = (photo ? W - side + 120 : W - P) - x0;
  const [front, back] = await Promise.all([piece(m.front, len), piece(m.back, len)]);
  const cx = x0 + len / 2;
  svg += scarf(back, cx + 30, H / 2 + front.h * 0.64, -4) + scarf(front, cx - 10, H / 2 - front.h * 0.56, -4);
  return jpg(`${svg}</svg>`);
}

const IMAGES: Record<ImageChannel, (m: MediaInput) => Promise<Buffer>> = { instagram, facebook, linkedin, banner };

/** De fyra kanalbilderna som JPG. */
export async function channelImages(m: MediaInput): Promise<Record<ImageChannel, Buffer>> {
  const ids = Object.keys(IMAGES) as ImageChannel[];
  const out = await Promise.all(ids.map((id) => IMAGES[id](m)));
  return Object.fromEntries(ids.map((id, i) => [id, out[i]])) as Record<ImageChannel, Buffer>;
}

// --- Filmernas stillbilder (1080 × 1920) -------------------------------------------

export const FILM = { w: 1080, h: 1920 } as const;
const [FW, FH, FP] = [FILM.w, FILM.h, 76];

/** Stillbilderna till zoomscenerna ritas dubbelt så stora som filmen, så att zoomen blir mjuk. */
const still = (svg: string) => render(svg).flatten({ background: "#000000" }).jpeg({ quality: 92 }).toBuffer();
const layer = (svg: string) => render(svg).png().toBuffer();

/** Öppningen: märket, kroken och klubbens färg. Texten ligger i ett eget lager, så att den kan tonas in. */
export async function introCard(m: MediaInput, hook: string) {
  const { look } = m;
  const head = fit(m.fonts.head, up(hook), { width: FW - FP * 2, max: 150, min: 70, lines: 3 });
  let bg = open(FW, FH, 2) + `<rect width="${FW}" height="${FH}" fill="${look.stage}"/>`;
  const box = { x: 0, y: 0, w: FW, h: FH };
  bg += `<defs>${clip(box)}</defs><g opacity="0.2">${await bands(m, { x: -200, y: 980, w: FW + 400, h: 900 }, -18)}</g>`;
  let over = open(FW, FH);
  const crestH = 300;
  const brand = await mark(m, 0, 0, crestH, look.onStage, { name: false, plate: look.plate });
  const blockH = (brand.w ? brand.h + 80 : 0) + 62 + 40 + head.h;
  let y = (FH - blockH) / 2 - 60;
  if (brand.w) {
    over += `<g transform="translate(${n((FW - brand.w) / 2)} ${n(y)})">${brand.svg}</g>`;
    y += brand.h + 80;
  }
  const tag = pill(m.fonts.label, "Ny halsduk", FW / 2, y, 36, look, "center");
  over += tag.svg + draw(head, FW / 2, y + tag.h + 40, look.onStage, "center");
  return { bg: await still(`${bg}</svg>`), over: await layer(`${over}</svg>`) };
}

/** Fotot i helbild. Texten ligger i ett eget lager över toningen. */
export async function photoCard(m: MediaInput, photo: Buffer, text: { head: string; sub?: string; top?: boolean }) {
  const { look } = m;
  let bg = open(FW, FH, 2) + `<image xlink:href="${await photoUri(photo, FW * 1.5, FH * 1.5)}" width="${FW}" height="${FH}"/>`;
  bg += `<defs><linearGradient id="ner" x1="0" y1="0" x2="0" y2="1"><stop offset="0.52" stop-color="${look.stage}" stop-opacity="0"/><stop offset="0.8" stop-color="${look.stage}" stop-opacity="0.9"/><stop offset="1" stop-color="${look.stage}"/></linearGradient><linearGradient id="upp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0.55"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient></defs>`;
  bg += text.top ? `<rect width="${FW}" height="560" fill="url(#upp)"/>` : `<rect width="${FW}" height="${FH}" fill="url(#ner)"/>`;
  let over = open(FW, FH);
  if (text.top) {
    // Kroken som en textruta överst, som i appens egna textverktyg.
    const head = fit(m.fonts.label, text.head, { width: FW - FP * 2 - 80, max: 76, min: 48, lines: 3, leading: 1.5 });
    const [w, h] = [head.w + 84, head.h + 76];
    over += `<rect x="${n((FW - w) / 2)}" y="210" width="${n(w)}" height="${n(h)}" rx="30" fill="#FFFFFF"/>` + draw(head, FW / 2, 210 + 38, "#111111", "center");
  } else {
    const head = fit(m.fonts.head, up(text.head), { width: FW - FP * 2, max: 140, min: 70, lines: 2 });
    const sub = text.sub ? fit(m.fonts.label, text.sub, { width: FW - FP * 2, max: 46, min: 32, lines: 2, leading: 1.5 }) : null;
    // Appens egna knappar och bildtext ligger över filmens nedersta del – texten hålls ovanför.
    const bottom = FH - 330;
    const y = bottom - (sub ? sub.h + 30 : 0) - head.h;
    over += draw(head, FP, y, look.onStage);
    if (sub) over += draw(sub, FP, bottom - sub.h, look.onStage, "left", 0.88);
  }
  return { bg: await still(`${bg}</svg>`), over: await layer(`${over}</svg>`) };
}

/** Slutbilden: halsdukens båda sidor, märket, rubriken och var den finns. */
export async function endCard(m: MediaInput, text: { head: string; sub: string; cta: string }) {
  const { look } = m;
  const box = { x: 0, y: 0, w: FW, h: 760 };
  let bg = open(FW, FH, 2) + `<rect width="${FW}" height="${FH}" fill="${look.stage}"/><defs>${clip(box)}</defs>${await bands(m, { x: 0, y: 110, w: FW, h: 560 }, -12)}`;
  let over = open(FW, FH);
  const head = fit(m.fonts.head, up(text.head), { width: FW - FP * 2, max: 128, min: 66, lines: 3 });
  const sub = fit(m.fonts.label, text.sub, { width: FW - FP * 2, max: 44, min: 30, lines: 2, leading: 1.5 });
  const brand = await mark(m, 0, 0, 190, look.onStage, { name: false, plate: look.plate });
  const cta = pill(m.fonts.label, text.cta, FW / 2, 0, 42, look, "center");
  // Blocket står mitt i ytan under halsdukarna, ovanför appens egna knappar.
  const blockH = (brand.w ? brand.h + 60 : 0) + head.h + 32 + sub.h + 60 + cta.h;
  let y = 790 + Math.max(0, (FH - 300 - 790 - blockH) / 2);
  if (brand.w) {
    over += `<g transform="translate(${n((FW - brand.w) / 2)} ${n(y)})">${brand.svg}</g>`;
    y += brand.h + 60;
  }
  over += draw(head, FW / 2, y, look.onStage, "center") + draw(sub, FW / 2, y + head.h + 32, look.onStage, "center", 0.88);
  over += `<g transform="translate(0 ${n(y + head.h + 32 + sub.h + 60)})">${cta.svg}</g>`;
  bg += "</svg>";
  return { bg: await still(bg), over: await layer(`${over}</svg>`) };
}

/** Bakgrunden bakom de rullande halsdukarna, och en etikett per sida. */
export async function scrollStage(m: MediaInput, labels: string[]) {
  const { look } = m;
  const bg = await render(`${open(FW, FH)}<rect width="${FW}" height="${FH}" fill="${look.stage}"/></svg>`).png().toBuffer();
  let over = open(FW, FH);
  const each = FW / labels.length;
  labels.forEach((label, i) => (over += pill(m.fonts.label, label, each * (i + 0.5), 150, 30, look, "center").svg));
  return { bg, over: await layer(`${over}</svg>`) };
}

/**
 * En sida av halsduken stående, som kameran åker längs med. `width` är halsdukens bredd i bilden; med `canvas`
 * läggs den mitt på en bakgrund i den bredden, annars blir bilden genomskinlig och lika bred som halsduken.
 */
export async function strip(face: Buffer, width: number, canvas?: { width: number; color: string }) {
  const turned = await sharp(face).rotate(90).resize({ width: Math.round(width) }).png().toBuffer();
  if (!canvas) return turned;
  const meta = await sharp(turned).metadata();
  const [w, h] = [meta.width ?? width, meta.height ?? FH];
  const pad = 220;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.width}" height="${h + pad * 2}"><defs><filter id="s" x="-12%" y="-2%" width="124%" height="104%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000000" flood-opacity="0.4"/></filter></defs><rect width="100%" height="100%" fill="${canvas.color}"/><image xlink:href="${uri(turned, "png")}" x="${n((canvas.width - w) / 2)}" y="${pad}" width="${w}" height="${h}" filter="url(#s)"/></svg>`;
  return render(svg).jpeg({ quality: 92 }).toBuffer();
}

/** Halsduken liggande och stor, för en åkning i sidled. Bilden är `height` hög och halsduken fyller det mesta av höjden. */
export async function closeUp(face: Buffer, height: number, color: string) {
  const scarfH = Math.round(height * 0.5);
  const lying = await sharp(face).resize({ height: scarfH }).png().toBuffer();
  const meta = await sharp(lying).metadata();
  const w = meta.width ?? scarfH * 8;
  return sharp({ create: { width: w, height, channels: 3, background: color } })
    .composite([{ input: lying, left: 0, top: Math.round((height - scarfH) / 2) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
