import sharp from "sharp";
import { Potrace } from "potrace";
import { deltaE, hexToRgb, nearestPantone, rgbToHex, type Rgb } from "@/lib/scarf";
import type { NwProduct } from "./catalog";
import { colorName } from "./colors";
import { embroider, METERS_PER_1000, ROW_MM, STITCHES_PER_MIN, stitchSvg } from "./embroidery";
import { colorsOf, METHOD_INFO, type Method, type Names, type Placement, zoneLabel } from "./marking";

/**
 * Produktionsfilerna som navet skickar till New Wave när materialet är godkänt: det format varje tryckeri,
 * brodyr, laser och stickeri vill ha, i rätt storlek och med specifikationen bredvid.
 */

export type FileRole = "tryck" | "separation" | "maskin" | "korrektur" | "data";
export type OutFile = { name: string; label: string; role: FileRole; format: string; spec: string; data: Buffer };
export type JobInk = { hex: string; name: string; pantone: string; detail?: string };
export type Fact = { label: string; value: string };
export type MadeJob = {
  method: Method | "stickning";
  methodLabel: string;
  receiver: string;
  placement: string;
  sizeMm: [number, number];
  inks: JobInk[];
  facts: Fact[];
  notes: string[];
  preview: string;
  files: OutFile[];
};

export type JobInput = { club: string; palette: string[]; product: NwProduct; color: string; placement: Placement; names?: Names; art: Buffer; slug: string };

const MM_PER_IN = 25.4;
const KNOCKOUT = 22;
const nf = new Intl.NumberFormat("sv-SE");
const mm1 = (v: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(v);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const isDarkHex = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
};

const ink = (hex: string, detail?: string): JobInk => ({ hex, name: colorName(hex), pantone: nearestPantone(hex).code, detail });

// --- Motivet ----------------------------------------------------------------

type Art = { rgba: Buffer; w: number; h: number; dpi: number; widthMm: number; heightMm: number };

/** Motivet beskuret till det som trycks och skalat till exakt tryckstorlek; stora ytor i 150 dpi som storformat. */
async function fitArt(art: Buffer, widthMm: number, dpi = widthMm > 400 ? 150 : 300): Promise<Art> {
  const trimmed = await sharp(art)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
    .catch(() => art);
  const w = Math.round((widthMm / MM_PER_IN) * dpi);
  const { data, info } = await sharp(trimmed).ensureAlpha().resize({ width: w }).raw().toBuffer({ resolveWithObject: true });
  return { rgba: data, w: info.width, h: info.height, dpi, widthMm, heightMm: (info.height / info.width) * widthMm };
}

const pngOf = (a: Art) => sharp(a.rgba, { raw: { width: a.w, height: a.h, channels: 4 } }).withDensity(a.dpi).png({ compressionLevel: 9 }).toBuffer();
const mmPx = (mm: number, dpi: number) => Math.round((mm / MM_PER_IN) * dpi);

/** Korrekturbilden: motivet på produktens färg med luft runt, högst 900 px. */
async function proof(rgba: Buffer, w: number, h: number, bg: string, size = 900) {
  const art = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(Math.round(size * 0.78), Math.round(size * 0.78), { fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: art.data, left: Math.round((size - art.info.width) / 2), top: Math.round((size - art.info.height) / 2) }])
    .png()
    .toBuffer();
}

/** Färgerna i motivet: de vanligaste färgytorna, förfinade med k-means och fästa vid klubbens färger när de ligger nära. */
function dominant(rgba: Buffer, k: number, palette: string[]): { hex: string; weight: number }[] {
  const bins = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const b = bins.get(key) ?? [0, 0, 0, 0];
    b[0] += rgba[i];
    b[1] += rgba[i + 1];
    b[2] += rgba[i + 2];
    b[3]++;
    bins.set(key, b);
  }
  const pts = [...bins.values()].map(([r, g, b, n]) => ({ c: [r / n, g / n, b / n] as Rgb, n })).sort((a, b) => b.n - a.n);
  const seeds: Rgb[] = [];
  for (const p of pts) {
    if (seeds.length >= k) break;
    if (seeds.every((s) => deltaE(rgbToHex(s.map(Math.round) as Rgb), rgbToHex(p.c.map(Math.round) as Rgb)) > 25)) seeds.push(p.c);
  }
  let centers = seeds;
  let weights = centers.map(() => 0);
  for (let it = 0; it < 8; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = (c[0] - p.c[0]) ** 2 + (c[1] - p.c[1]) ** 2 + (c[2] - p.c[2]) ** 2;
        if (d < bd) [best, bd] = [i, d];
      });
      const s = sum[best];
      s[0] += p.c[0] * p.n;
      s[1] += p.c[1] * p.n;
      s[2] += p.c[2] * p.n;
      s[3] += p.n;
    }
    centers = sum.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[i]));
    weights = sum.map((s) => s[3]);
  }
  return centers.map((c, i) => {
    const hex = rgbToHex(c.map((v) => Math.round(v)) as Rgb);
    const brand = palette.find((p) => deltaE(p, hex) < 18);
    return { hex: (brand ?? hex).toUpperCase(), weight: weights[i] };
  });
}

/**
 * Delar motivet i högst `k` dekorfärger. Färger som ligger nära produktens egen färg trycks eller sys inte –
 * där syns produkten igenom, som när den svarta kanten på en sköld lämnas otryckt på ett svart plagg.
 */
function separate(rgba: Buffer, k: number, garment: string, palette: string[]) {
  const found = dominant(rgba, k + 1, palette);
  const out = found.filter((c) => deltaE(c.hex, garment) >= KNOCKOUT).sort((a, b) => b.weight - a.weight);
  const kept = out.slice(0, k);
  const all = [...kept, ...found.filter((c) => !kept.includes(c) && !out.slice(k).includes(c))];
  const rgb = all.map((c) => hexToRgb(c.hex));
  const index = new Uint8Array(rgba.length / 4).fill(255);
  for (let i = 0, px = 0; i < rgba.length; i += 4, px++) {
    if (rgba[i + 3] < 128) continue;
    let best = 0;
    let bd = Infinity;
    rgb.forEach((c, j) => {
      const d = (c[0] - rgba[i]) ** 2 + (c[1] - rgba[i + 1]) ** 2 + (c[2] - rgba[i + 2]) ** 2;
      if (d < bd) [best, bd] = [j, d];
    });
    if (best < kept.length) index[px] = best;
  }
  return { inks: kept.map((c) => c.hex), index };
}

const maskOf = (index: Uint8Array, pick: (v: number) => boolean) => {
  const m = Buffer.alloc(index.length);
  for (let i = 0; i < index.length; i++) m[i] = pick(index[i]) ? 255 : 0;
  return m;
};

const tint = (mask: Buffer, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  const out = Buffer.alloc(mask.length * 4);
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.set([r, g, b, mask[i]], i * 4);
  return out;
};

/** Ytor som kantvektorer: potrace på en nedskalad mask, utan kontur, i verkliga mm. */
async function trace(mask: Buffer, w: number, h: number, fill: string, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const [tw, th] = [Math.round(w * scale), Math.round(h * scale)];
  const png = await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).resize(tw, th).negate().png().toBuffer();
  const tag = await new Promise<string>((resolve, reject) => {
    const p = new Potrace({ turdSize: 6, optTolerance: 0.3, threshold: 128, blackOnWhite: true });
    p.loadImage(png, (err: Error | null) => (err ? reject(err) : resolve(p.getPathTag(fill))));
  });
  return { tag, tw, th };
}

const svgDoc = (widthMm: number, heightMm: number, tw: number, th: number, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${mm1(widthMm).replace(",", ".")}mm" height="${mm1(heightMm).replace(",", ".")}mm" viewBox="0 0 ${tw} ${th}">\n${body}\n</svg>\n`;

/** Film för en schablon: svart motiv på vitt med passmärken och färgens namn i kanten. */
async function separationPng(mask: Buffer, a: Art, label: string) {
  const m = mmPx(15, a.dpi);
  const band = mmPx(9, a.dpi);
  const [W, H] = [a.w + 2 * m, a.h + 2 * m + band];
  const r = mmPx(3, a.dpi);
  const arm = mmPx(5, a.dpi);
  const sw = Math.max(2, mmPx(0.25, a.dpi));
  const mark = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}"/><path d="M${x - arm} ${y}H${x + arm}M${x} ${y - arm}V${y + arm}"/>`;
  const cy = m + a.h / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g fill="none" stroke="#000" stroke-width="${sw}">${mark(W / 2, m / 2)}${mark(W / 2, m + a.h + m / 2)}${mark(m / 2, cy)}${mark(W - m / 2, cy)}</g><text x="${m}" y="${H - band / 2}" font-family="'Liberation Sans', Arial, Helvetica, sans-serif" font-size="${mmPx(3, a.dpi)}" fill="#000">${esc(label)}</text></svg>`;
  const film = await sharp(mask, { raw: { width: a.w, height: a.h, channels: 1 } }).negate().toColourspace("srgb").png().toBuffer();
  const sheet = await sharp({ create: { width: W, height: H, channels: 3, background: "#FFFFFF" } })
    .composite([
      { input: film, left: m, top: m },
      { input: Buffer.from(svg), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  return sharp(sheet)
    .removeAlpha()
    .toColourspace("b-w")
    .withDensity(a.dpi)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const sizeSpec = (a: Art) => `${nf.format(a.w)} × ${nf.format(a.h)} px · ${a.dpi} dpi · ${mm1(a.widthMm)} × ${mm1(a.heightMm)} mm`;

// --- Metoderna ----------------------------------------------------------------

type Ctx = JobInput & { a: Art; base: string; dark: boolean; where: string; size: Fact };

async function dtg(c: Ctx): Promise<MadeJob> {
  const file = `${c.base}-dtg.png`;
  return {
    method: "dtg",
    methodLabel: "DTG",
    receiver: "DTG-tryck",
    placement: c.where,
    sizeMm: [c.a.widthMm, c.a.heightMm],
    inks: [],
    facts: [
      c.size,
      { label: "Format", value: "PNG, 24 bitar med alfakanal" },
      { label: "Färgrymd", value: "sRGB – RIP:en räknar om till CMYK + vitt" },
      { label: "Vitt underlag", value: c.dark ? "Ja, läggs av RIP:en under motivet" : "Nej, ljust plagg" },
    ],
    notes: [c.dark ? "Plagget förbehandlas före tryck. Underlaget krymps 1 px så att det inte syns i kanten." : "Vitt i motivet lämnas otryckt – plaggets färg syns där.", "Skalas inte i RIP:en: filen är redan i exakt tryckstorlek."],
    preview: "korrektur.png",
    files: [
      { name: file, label: "Tryckfil", role: "tryck", format: "PNG", spec: `${sizeSpec(c.a)} · transparent bakgrund`, data: await pngOf(c.a) },
      { name: "korrektur.png", label: "Korrektur", role: "korrektur", format: "PNG", spec: "Motivet på plaggets färg", data: await proof(c.a.rgba, c.a.w, c.a.h, c.color) },
    ],
  };
}

async function namesSheet(names: Names, textHex: string) {
  const heightMm = Math.max(30, names.sizeCm * 10 * 0.22);
  const rowMm = heightMm * 1.45;
  const widthMm = names.sizeCm * 10 + 20;
  const fs = heightMm / 0.72;
  const rows = names.list
    .map((n, i) => `<text x="${widthMm / 2}" y="${10 + i * rowMm + heightMm}" text-anchor="middle" textLength="${Math.min(names.sizeCm * 10, n.length * fs * 0.62)}" lengthAdjust="spacingAndGlyphs">${esc(n.toUpperCase())}</text>`)
    .join("");
  const totalMm = 20 + names.list.length * rowMm;
  const px = (mm: number) => Math.round((mm / 25.4) * 300);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(widthMm)}" height="${px(totalMm)}" viewBox="0 0 ${widthMm} ${totalMm}"><g font-family="'Liberation Sans', Arial, Helvetica, sans-serif" font-weight="700" font-size="${fs}" fill="${textHex}">${rows}</g></svg>`;
  const data = await sharp(Buffer.from(svg)).withDensity(300).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  return { data: data.data, spec: `${nf.format(data.info.width)} × ${nf.format(data.info.height)} px · 300 dpi · ${Math.round(widthMm)} × ${Math.round(totalMm)} mm film`, heightMm };
}

async function transfer(c: Ctx): Promise<MadeJob> {
  const files: OutFile[] = [
    { name: `${c.base}-dtf.png`, label: "Tryckfil", role: "tryck", format: "PNG", spec: `${sizeSpec(c.a)} · transparent bakgrund`, data: await pngOf(c.a) },
  ];
  const facts: Fact[] = [c.size, { label: "Format", value: "PNG, 24 bitar med alfakanal" }, { label: "Film", value: "DTF, skrivs ut rättvänd" }, { label: "Vitt lager", value: "Skrivaren lägger vitt under allt" }];
  const notes = ["Pressas 15 s – värme och tryck enligt filmens datablad.", "Halvtransparenta pixlar blir fläckiga i vitt lager – kanterna är redan rena."];
  if (c.names?.list.length) {
    const text = isDarkHex(c.color) ? (c.palette.find((p) => !isDarkHex(p)) ?? "#FFFFFF") : (c.palette.find(isDarkHex) ?? "#111111");
    const sheet = await namesSheet(c.names, text);
    files.push(
      { name: `${c.base}-namn-ark.png`, label: "Namnark", role: "tryck", format: "PNG", spec: `${sheet.spec} · ett namn per rad`, data: sheet.data },
      {
        name: `${c.base}-namn.csv`,
        label: "Namnlista",
        role: "data",
        format: "CSV",
        spec: `${c.names.list.length} namn · placering och storlek`,
        data: Buffer.from(`\uFEFFNr;Namn;Placering;Bredd mm;Bokstavshöjd mm;Färg\n${c.names.list.map((n, i) => `${i + 1};${n.toUpperCase()};${zoneLabel(c.product, c.names!.zone)};${c.names!.sizeCm * 10};${Math.round(sheet.heightMm)};${text}`).join("\n")}`),
      },
    );
    facts.push({ label: "Namn", value: `${c.names.list.length} st, ${zoneLabel(c.product, c.names.zone).toLowerCase()}` });
    notes.push("Namnarket skärs per rad; ordningen följer namnlistan och plaggens packsedel.");
  }
  files.push({ name: "korrektur.png", label: "Korrektur", role: "korrektur", format: "PNG", spec: "Motivet på plaggets färg", data: await proof(c.a.rgba, c.a.w, c.a.h, c.color) });
  return { method: "transfer", methodLabel: "Transfer (DTF)", receiver: "Transfertryck", placement: c.where, sizeMm: [c.a.widthMm, c.a.heightMm], inks: [], facts, notes, preview: "korrektur.png", files };
}

async function screen(c: Ctx): Promise<MadeJob> {
  const { inks, index } = separate(c.a.rgba, colorsOf(c.placement), c.color, c.palette);
  const n = c.a.w * c.a.h;
  const layers: { name: string; hex: string; mask: Buffer; label: string }[] = [];
  if (c.dark && inks.length) {
    const union = maskOf(index, (v) => v !== 255);
    const choked = await sharp(union, { raw: { width: c.a.w, height: c.a.h, channels: 1 } }).erode(3).extractChannel(0).raw().toBuffer();
    layers.push({ name: "underlag-vit", hex: "#FFFFFF", mask: choked, label: "Vitt underlag" });
  }
  inks.forEach((hex, i) => layers.push({ name: slug(nearestPantone(hex).code), hex, mask: maskOf(index, (v) => v === i), label: nearestPantone(hex).code }));
  const total = layers.length;
  const files: OutFile[] = [];
  for (const [i, l] of layers.entries()) {
    const label = `${c.club} · ${c.product.name} · Schablon ${i + 1}/${total} · ${l.label} · ${mm1(c.a.widthMm)} × ${mm1(c.a.heightMm)} mm · 100 % svart`;
    files.push({
      name: `${c.base}-${String(i + 1).padStart(2, "0")}-${l.name}.png`,
      label: `Schablon ${i + 1}: ${l.label}`,
      role: "separation",
      format: "PNG",
      spec: `Filmpositiv · ${sizeSpec(c.a)} · passmärken`,
      data: await separationPng(l.mask, c.a, label),
    });
  }
  const traced = await Promise.all(layers.map((l) => trace(l.mask, c.a.w, c.a.h, l.hex === "#FFFFFF" ? "#D9D9D9" : l.hex)));
  const body = traced.map((t, i) => `<g id="${layers[i].name}" data-ink="${esc(layers[i].label)}">${t.tag}</g>`).join("\n");
  files.push({
    name: `${c.base}-separationer.svg`,
    label: "Separationer, vektor",
    role: "separation",
    format: "SVG",
    spec: `Ett lager per schablon · ${mm1(c.a.widthMm)} × ${mm1(c.a.heightMm)} mm`,
    data: Buffer.from(svgDoc(c.a.widthMm, c.a.heightMm, traced[0]?.tw ?? c.a.w, traced[0]?.th ?? c.a.h, body)),
  });
  const comp = Buffer.alloc(n * 4);
  inks.forEach((hex, i) => {
    const t = tint(maskOf(index, (v) => v === i), hex);
    for (let p = 0; p < n; p++) if (t[p * 4 + 3]) t.copy(comp, p * 4, p * 4, p * 4 + 4);
  });
  files.push({ name: "korrektur.png", label: "Korrektur", role: "korrektur", format: "PNG", spec: "Färgerna tryckta på plaggets färg", data: await proof(comp, c.a.w, c.a.h, c.color) });
  const order = layers.map((l) => l.label).join(" → blixttork → ");
  return {
    method: "screentryck",
    methodLabel: "Screentryck",
    receiver: "Screentryckeri",
    placement: c.where,
    sizeMm: [c.a.widthMm, c.a.heightMm],
    inks: [...(c.dark && inks.length ? [{ hex: "#FFFFFF", name: "Vit", pantone: "Underlag", detail: "Krympt 0,25 mm" }] : []), ...inks.map((h) => ink(h, `${Math.round((index.filter((v) => inks[v] === h).length / n) * 100)} % av ytan`))],
    facts: [
      c.size,
      { label: "Schabloner", value: `${total} st${c.dark ? " inkl. vitt underlag" : ""}` },
      { label: "Tryckordning", value: order || "–" },
      { label: "Raster", value: "Inget – rena dekorfärger" },
    ],
    notes: [
      "Färger nära plaggets färg trycks inte – plagget syns igenom.",
      "Filmerna skrivs ut i 100 % svart, en per schablon. Passmärkena ligger på samma plats på alla filmer.",
      "Pantone är närmaste referens; tryckeriet blandar färgen mot Pantone-guiden.",
    ],
    preview: "korrektur.png",
    files,
  };
}

async function embroidery(c: Ctx): Promise<MadeJob> {
  const gw = Math.max(8, Math.round(c.a.widthMm / ROW_MM));
  const gh = Math.max(8, Math.round(c.a.heightMm / ROW_MM));
  const { data } = await sharp(c.a.rgba, { raw: { width: c.a.w, height: c.a.h, channels: 4 } }).resize(gw, gh, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const { inks, index } = separate(data, colorsOf(c.placement), c.color, c.palette);
  // Enstaka rutor på 0,4 mm går inte att sy – de får grannarnas färg.
  const clean = Uint8Array.from(index);
  for (let y = 1; y < gh - 1; y++)
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      const around = [index[i - 1], index[i + 1], index[i - gw], index[i + gw]];
      const same = around.filter((v) => v === index[i]).length;
      if (same === 0) clean[i] = around.sort((a, b) => around.filter((v) => v === b).length - around.filter((v) => v === a).length)[0];
    }
  const area = inks.map((_, i) => clean.filter((v) => v === i).length);
  const order = inks.map((hex, i) => ({ hex, i })).sort((a, b) => area[b.i] - area[a.i]);
  const layers = order.map((o) => ({ hex: o.hex, mask: Uint8Array.from(clean, (v) => (v === o.i ? 1 : 0)) }));
  const e = embroider(`${c.club} ${c.product.name}`, layers, gw, gh);
  const minutes = Math.max(1, Math.round(e.stitches / STITCHES_PER_MIN));
  const meters = (s: number) => Math.max(1, Math.round((s / 1000) * METERS_PER_1000));
  const plan = [
    `${c.club} – ${c.product.name} (${colorName(c.color).toLowerCase()}) · Brodyr`,
    `Maskinfil: ${c.base}.dst (Tajima DST, 0,1 mm)`,
    `Storlek: ${mm1(e.widthMm)} × ${mm1(e.heightMm)} mm · Placering: ${c.where}`,
    `Stygn: ${nf.format(e.stitches)} · Färgbyten: ${Math.max(0, e.blocks.length - 1)} · Hopp: ${e.jumps}`,
    `Maskintid: cirka ${minutes} min per plagg vid ${STITCHES_PER_MIN} stygn/min`,
    "",
    "Trådordning (DST sparar inga färger – trä nålarna enligt listan):",
    ...e.blocks.map((b, i) => `  ${i + 1}. ${colorName(b.hex).padEnd(10)} ${b.hex}  ≈ ${nearestPantone(b.hex).code.padEnd(16)} ${nf.format(b.stitches).padStart(7)} stygn  ~${meters(b.stitches)} m ovantråd`),
    "",
    `Fyllning: tatami, ${String(ROW_MM).replace(".", ",")} mm radavstånd, 3 mm stygnlängd i tegelförband.`,
    "Underlag: glesa stygn på tvären, 1,6 mm, under varje fält så att tyget inte drar ihop sig.",
    "Färger nära plaggets färg sys inte – plaggets färg syns där.",
  ].join("\n");
  const stitchPng = await sharp(Buffer.from(stitchSvg(e, c.color))).png().toBuffer();
  return {
    method: "brodyr",
    methodLabel: "Brodyr",
    receiver: "Brodyr",
    placement: c.where,
    sizeMm: [e.widthMm, e.heightMm],
    inks: e.blocks.map((b) => ink(b.hex, `${nf.format(b.stitches)} stygn · ~${meters(b.stitches)} m`)),
    facts: [
      { label: "Storlek", value: `${mm1(e.widthMm)} × ${mm1(e.heightMm)} mm` },
      { label: "Stygn", value: nf.format(e.stitches) },
      { label: "Färgbyten", value: String(Math.max(0, e.blocks.length - 1)) },
      { label: "Maskintid", value: `cirka ${minutes} min per plagg` },
    ],
    notes: ["DST innehåller bara stygn, hopp och färgbyten – trådfärgerna står i stygnplanen och i API-anropet.", "Brodyren syr ett provstygn på samma tyg innan serien startar."],
    preview: `${c.base}-stygnbild.png`,
    files: [
      { name: `${c.base}.dst`, label: "Maskinfil", role: "maskin", format: "DST", spec: `Tajima · ${nf.format(e.stitches)} stygn · ${e.blocks.length} ${e.blocks.length === 1 ? "färg" : "färger"}`, data: e.dst },
      { name: `${c.base}-stygnbild.png`, label: "Stygnbild", role: "korrektur", format: "PNG", spec: "Varje stygn ritat i trådens färg", data: stitchPng },
      { name: `${c.base}-stygnplan.txt`, label: "Stygnplan", role: "data", format: "TXT", spec: "Trådordning, stygn och maskintid", data: Buffer.from(plan) },
    ],
  };
}

async function engraving(c: Ctx): Promise<MadeJob> {
  const n = c.a.w * c.a.h;
  const opaque = Buffer.alloc(n);
  const contrast = Buffer.alloc(n);
  let hits = 0;
  let solid = 0;
  const cache = new Map<number, boolean>();
  for (let i = 0; i < n; i++) {
    if (c.a.rgba[i * 4 + 3] < 128) continue;
    opaque[i] = 255;
    solid++;
    const [r, g, b] = [c.a.rgba[i * 4], c.a.rgba[i * 4 + 1], c.a.rgba[i * 4 + 2]];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let far = cache.get(key);
    if (far === undefined) {
      far = deltaE(rgbToHex([r, g, b]), c.color) > 25;
      cache.set(key, far);
    }
    if (far) {
      contrast[i] = 255;
      hits++;
    }
  }
  // Ett motiv i bara produktens färg graveras som helhet.
  const mask = hits > solid * 0.05 ? contrast : opaque;
  const t = await trace(mask, c.a.w, c.a.h, "#000000");
  const svg = svgDoc(c.a.widthMm, c.a.heightMm, t.tw, t.th, `<g id="Engraving">${t.tag}</g>`);
  const dpi = 600;
  const rw = mmPx(c.a.widthMm, dpi);
  const raster = await sharp(mask, { raw: { width: c.a.w, height: c.a.h, channels: 1 } })
    .resize(rw)
    .negate()
    .threshold(128)
    .withDensity(dpi)
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const metal = tint(mask, "#C9CDD3");
  return {
    method: "gravyr",
    methodLabel: "Lasergravyr",
    receiver: "Lasergravyr",
    placement: c.where,
    sizeMm: [c.a.widthMm, c.a.heightMm],
    inks: [{ hex: "#000000", name: "Svart", pantone: "Gravyr", detail: "100 % = lasern bränner" }],
    facts: [
      { label: "Storlek", value: `${mm1(c.a.widthMm)} × ${mm1(c.a.heightMm)} mm` },
      { label: "Format", value: "SVG vektor + PNG 600 dpi" },
      { label: "Färg", value: "En ton, 100 % svart" },
      { label: "Konturer", value: "Inga – bara fyllda ytor" },
    ],
    notes: [
      "Svart är det lasern graverar; resten lämnas orört.",
      "Ritytan är exakt graveringsytan – inget skalas på maskinen.",
      "Effekt och hastighet ställs efter materialet (pulverlack eller rostfritt).",
    ],
    preview: "korrektur.png",
    files: [
      { name: `${c.base}-gravyr.svg`, label: "Graverfil, vektor", role: "tryck", format: "SVG", spec: `${mm1(c.a.widthMm)} × ${mm1(c.a.heightMm)} mm · en ton · inga konturer`, data: Buffer.from(svg) },
      { name: `${c.base}-gravyr.png`, label: "Graverfil, raster", role: "tryck", format: "PNG", spec: `${nf.format(raster.info.width)} × ${nf.format(raster.info.height)} px · 600 dpi · svartvit`, data: raster.data },
      { name: "korrektur.png", label: "Korrektur", role: "korrektur", format: "PNG", spec: "Graveringen på produktens färg", data: await proof(metal, c.a.w, c.a.h, c.color) },
    ],
  };
}

/** Muggens mall: 200 × 90 mm tryckyta plus 3 mm utfall runt om, motivet mitt emot handtaget. */
const MUG = { w: 200, h: 90, bleed: 3 };

async function sublimation(c: Ctx): Promise<MadeJob> {
  const dpi = 300;
  const [Wmm, Hmm] = [MUG.w + 2 * MUG.bleed, MUG.h + 2 * MUG.bleed];
  const [W, H] = [mmPx(Wmm, dpi), mmPx(Hmm, dpi)];
  const maxH = mmPx(MUG.h - 10, dpi);
  const art = await sharp(c.a.rgba, { raw: { width: c.a.w, height: c.a.h, channels: 4 } })
    .resize(c.a.w, Math.min(c.a.h, maxH), { fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const flat = await sharp({ create: { width: W, height: H, channels: 3, background: "#FFFFFF" } })
    .composite([{ input: art.data, left: Math.round((W - art.info.width) / 2), top: Math.round((H - art.info.height) / 2) }])
    .png()
    .toBuffer();
  const mirrored = await sharp(flat).flop().withDensity(dpi).png({ compressionLevel: 9 }).toBuffer();
  const [bx, by, bw, bh] = [mmPx(MUG.bleed, dpi), mmPx(MUG.bleed, dpi), mmPx(MUG.w, dpi), mmPx(MUG.h, dpi)];
  const guide = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#E5484D" stroke-width="5" stroke-dasharray="24 16"/><path d="M${W / 2} 0V${H}" stroke="#0B4FB3" stroke-width="3" stroke-dasharray="10 12" opacity=".5"/></svg>`;
  const check = await sharp(await sharp(flat).composite([{ input: Buffer.from(guide) }]).png().toBuffer())
    .resize(900)
    .png()
    .toBuffer();
  const artMm: [number, number] = [(art.info.width / dpi) * MM_PER_IN, (art.info.height / dpi) * MM_PER_IN];
  return {
    method: "sublimering",
    methodLabel: "Sublimering",
    receiver: "Sublimering",
    placement: "Mitt emot handtaget",
    sizeMm: artMm,
    inks: [],
    facts: [
      { label: "Mall", value: `${MUG.w} × ${MUG.h} mm + ${MUG.bleed} mm utfall (${Wmm} × ${Hmm} mm)` },
      { label: "Upplösning", value: `${nf.format(W)} × ${nf.format(H)} px · ${dpi} dpi` },
      { label: "Spegelvänd", value: "Ja – filen är redan spegelvänd" },
      { label: "Motiv", value: `${mm1(artMm[0])} × ${mm1(artMm[1])} mm, mitt i mallen` },
    ],
    notes: ["Skrivs ut på sublimeringspapper med RIP:ens profil för sublimeringsbläck, sRGB in.", "Mitten av mallen hamnar mitt emot handtaget. Röd streckad linje i korrekturen är muggens tryckyta."],
    preview: "korrektur.png",
    files: [
      { name: `${c.base}-sublimering.png`, label: "Tryckfil, spegelvänd", role: "tryck", format: "PNG", spec: `${nf.format(W)} × ${nf.format(H)} px · ${dpi} dpi · ${Wmm} × ${Hmm} mm · RGB`, data: mirrored },
      { name: "korrektur.png", label: "Korrektur", role: "korrektur", format: "PNG", spec: "Rättvänd med tryckyta och mittlinje", data: check },
    ],
  };
}

async function digital(c: Ctx): Promise<MadeJob> {
  const files: OutFile[] = [{ name: `${c.base}-farg.png`, label: "Färglager", role: "tryck", format: "PNG", spec: `${sizeSpec(c.a)} · transparent bakgrund`, data: await pngOf(c.a) }];
  if (c.dark) {
    const alpha = Buffer.alloc(c.a.w * c.a.h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = c.a.rgba[i * 4 + 3] >= 128 ? 255 : 0;
    const choked = await sharp(alpha, { raw: { width: c.a.w, height: c.a.h, channels: 1 } }).erode(2).negate().withDensity(c.a.dpi).png({ compressionLevel: 9 }).toBuffer();
    files.push({ name: `${c.base}-vitt.png`, label: "Vitt lager", role: "separation", format: "PNG", spec: `Spotfärg "White" · svart = vitt bläck · ${sizeSpec(c.a)}`, data: choked });
  }
  files.push({ name: "korrektur.png", label: "Korrektur", role: "korrektur", format: "PNG", spec: "Motivet på produktens färg", data: await proof(c.a.rgba, c.a.w, c.a.h, c.color) });
  return {
    method: "digitaltryck",
    methodLabel: "Digitaltryck (UV)",
    receiver: "UV-tryck",
    placement: c.where,
    sizeMm: [c.a.widthMm, c.a.heightMm],
    inks: [],
    facts: [
      c.size,
      { label: "Färg", value: "sRGB in – CMYK (FOGRA39) i RIP:en" },
      { label: "Vitt", value: c.dark ? "Eget lager, spotfärg \"White\"" : "Behövs inte på ljus yta" },
      { label: "Lack", value: "Ingen" },
    ],
    notes: ["Trycket hamnar direkt på produkten, så inget utfall behövs – filen är exakt tryckytan.", c.dark ? "Vita lagret är krympt 0,2 mm så att det inte sticker ut i kanten." : "Ljus yta: färgen trycks utan vitt under."],
    preview: "korrektur.png",
    files,
  };
}

const MAKERS: Record<Method, (c: Ctx) => Promise<MadeJob>> = { dtg, transfer, screentryck: screen, brodyr: embroidery, gravyr: engraving, sublimering: sublimation, digitaltryck: digital };

export async function makeJob(input: JobInput): Promise<MadeJob> {
  const m = input.placement.method;
  const a = await fitArt(input.art, m === "sublimering" ? Math.min(input.placement.sizeCm * 10, MUG.w) : input.placement.sizeCm * 10);
  const where = zoneLabel(input.product, input.placement.zone);
  return MAKERS[m]({
    ...input,
    a,
    base: input.slug || slug(input.product.name),
    dark: isDarkHex(input.color),
    where,
    size: { label: "Tryckyta", value: `${mm1(a.widthMm)} × ${mm1(a.heightMm)} mm · ${a.dpi} dpi` },
  });
}

export const methodLabel = (m: Method | "stickning") => (m === "stickning" ? "Stickning" : METHOD_INFO[m].label);
export const fileSlug = slug;
