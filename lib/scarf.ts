import { nearestPantone } from "./pantone";

/**
 * Seger's knitted scarf: a tube on a 240-needle cylinder, front = needles 1–120, back = 121–240.
 * `endRows` is the knitter's own rule (November 2026): always leave 50 courses plain at the start and at the end of the
 * pattern, as seam allowance. The machine's start rows and fold markers lie in the outermost 15 of them, as measured in
 * the knitter's machine file 004212.MOF. `edgeNeedles` is measured in that file: its motif keeps 10 needles clear of both folds.
 * The knitter also confirms 7 yarns per scarf, and full machine speed with 1–4 yarns but slower with 5–7.
 */
export const SCARF = {
  needles: 240,
  side: 120,
  rows: 1210,
  /** Rows at each end that are left in one plain yarn: seam allowance, and the machine's start rows and fold markers. */
  endRows: 50,
  /** Needles next to each fold that text, crests and edge stripes stay clear of. */
  edgeNeedles: 10,
  lengthMm: 1350,
  widthMm: 180,
  maxColors: 7,
  factory: "Seger",
  machine: "OPEK 365",
  software: "Draw Designer 1.0",
} as const;

export const STITCH_W_MM = SCARF.widthMm / SCARF.side;
export const ROW_H_MM = SCARF.lengthMm / SCARF.rows;
export const CELLS = SCARF.needles * SCARF.rows;
/** About ten stitches across the letter height; smaller text knits blurry. */
export const MIN_TEXT_MM = 15;

/** Längsta text på en halsduk, i tecken: huvudrad, underrad, en spelare i truppen och en namnteckning – och hur många av de två sista som ryms. */
export const SCARF_TEXT = { main: 16, sub: 24, player: 16, players: 14, sign: 22, signers: 4 } as const;

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function toLab([r, g, b]: Rgb): Rgb {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a: string, b: string) {
  const [l1, a1, b1] = toLab(hexToRgb(a));
  const [l2, a2, b2] = toLab(hexToRgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Black, dark grey and light grey: with white these give photo portraits 4 greyscale tones like on an IMS/OPEK 365. */
export const GREY_YARNS = ["#0A0A0A", "#555960", "#A6AAB0"];

/**
 * Up to 7 yarns: the primary colour, every crest colour and the second club colour always come first so the crest knits correctly,
 * then the portrait yarns (`extras`), then any remaining club colours.
 */
export function clubScarfPalette(club: { palette: { hex: string }[]; crestColors: string[] }, extras: string[] = GREY_YARNS) {
  const out: string[] = [];
  const add = (hex: string | undefined, minDelta: number) => {
    if (!hex) return;
    const h = hex.toUpperCase();
    if (out.length < SCARF.maxColors && !out.some((o) => deltaE(o, h) < minDelta)) out.push(h);
  };
  [club.palette[0]?.hex, ...club.crestColors, club.palette[1]?.hex].forEach((h) => add(h, 6));
  extras.forEach((h) => add(h, 8));
  club.palette.forEach((p) => add(p.hex, 6));
  return out;
}

export function indexOfNear(palette: string[], hex: string, fallback = 0) {
  let best = fallback;
  let bestD = Infinity;
  palette.forEach((p, i) => {
    const d = deltaE(p, hex);
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** Demo riktpriser per halsduk exkl. moms, sorted by minimum quantity. Seger confirms the real price with the proof. */
export const SCARF_ORDER = {
  minQty: 100,
  maxQty: 20_000,
  tiers: [
    { from: 100, unitSek: 89 },
    { from: 250, unitSek: 72 },
    { from: 500, unitSek: 59 },
    { from: 1000, unitSek: 49 },
    { from: 2500, unitSek: 42 },
  ],
  leadTime: "cirka 4–6 veckor efter godkänt korrektur",
  sampleNote: "En provstickning skickas för godkännande innan produktion.",
} as const;

export function scarfUnitPrice(qty: number) {
  let unit: number = SCARF_ORDER.tiers[0].unitSek;
  for (const t of SCARF_ORDER.tiers) if (qty >= t.from) unit = t.unitSek;
  return unit;
}

export type ScarfCheck = { id: string; ok: boolean; title: string; note: string };

/** Stitch-level checks on the finished 240×1210 grid. */
export function checkGrid(
  cells: Uint8Array,
  palette: string[],
  minTextMm: number | null,
  portrait: "grey" | "color" | null = null,
): { checks: ScarfCheck[]; counts: number[] } {
  const counts = new Array(palette.length).fill(0);
  let isolated = 0;
  const W = SCARF.needles;
  for (let r = 0; r < SCARF.rows; r++) {
    for (let c = 0; c < W; c++) {
      const v = cells[r * W + c];
      counts[v]++;
      const left = c % SCARF.side === 0 ? -1 : cells[r * W + c - 1];
      const right = c % SCARF.side === SCARF.side - 1 ? -1 : cells[r * W + c + 1];
      const up = r === 0 ? -1 : cells[(r - 1) * W + c];
      const down = r === SCARF.rows - 1 ? -1 : cells[(r + 1) * W + c];
      if (left !== v && right !== v && up !== v && down !== v) isolated++;
    }
  }
  const used = counts.filter((n) => n > 0).length;
  const share = isolated / CELLS;
  const checks: ScarfCheck[] = [
    { id: "colors", ok: used <= SCARF.maxColors, title: `${used} av ${SCARF.maxColors} färger`, note: "Seger kan sticka alla sju färger på samma varv." },
    minTextMm === null
      ? { id: "text", ok: true, title: "Ingen text", note: "Bara motiv och ränder." }
      : {
          id: "text",
          ok: minTextMm >= MIN_TEXT_MM,
          title: minTextMm >= MIN_TEXT_MM ? "Texten går att läsa" : "För liten text",
          note: `Minsta bokstavshöjd ${Math.round(minTextMm)} mm${minTextMm >= MIN_TEXT_MM ? "" : ` – minst ${MIN_TEXT_MM} mm behövs för att den ska synas i stickningen`}.`,
        },
    portrait
      ? {
          id: "dots",
          ok: true,
          title: portrait === "color" ? "Färgporträtt i jacquard-raster" : "Fotoporträtt i jacquard-raster",
          note:
            portrait === "color"
              ? "Ansiktet stickas med färgraster av hudtoner och klubbfärger inom de sju garnerna – enstaka maskor är avsiktliga."
              : "Ansiktet stickas med halftonsraster i 4 gråtoner för mjuka övergångar på OPEK 365.",
        }
      : {
          id: "dots",
          ok: share < 0.004,
          title: share < 0.004 ? "Rena färgfält" : "Många enstaka maskor",
          note: `${isolated} maskor står ensamma i sin färg${share < 0.004 ? "." : " – förenkla loggan eller öka storleken."}`,
        },
  ];
  return { checks, counts };
}

/** `bmp` är varje garns färg i BMP-filerna (index i Windows-paletten och färgen där), i samma ordning som `palette`. */
export function colorCsv(palette: string[], counts: number[], bmp?: { index: number; hex: string }[]) {
  return [
    `Färg;Hex;RGB;Närmaste Pantone;${bmp ? "Färg i BMP (index);Färg i BMP (hex);" : ""}Maskor`,
    ...palette.map((hex, i) => `${i + 1};${hex};${hexToRgb(hex).join(",")};${nearestPantone(hex).code};${bmp ? `${bmp[i]?.index ?? ""};${bmp[i]?.hex ?? ""};` : ""}${counts[i] ?? 0}`),
  ].join("\n");
}

/** `layout` är raderna om hur mönsterfilerna är gjorda och ligger (bmpLines i scarfMachine.ts). */
export function readMe(opts: { club: string; palette: string[]; counts: number[]; date: string; files: [string, string][]; layout: string[]; bmp?: { index: number; hex: string }[] }) {
  const lines = opts.palette.map((hex, i) => {
    const p = nearestPantone(hex);
    const inFile = opts.bmp?.[i] ? `  färg i BMP: ${opts.bmp[i].index} (${opts.bmp[i].hex})` : "";
    return `  Färg ${i + 1}: ${hex}  ≈ ${p.code}${inFile}  (${opts.counts[i] ?? 0} maskor)`;
  });
  const files = opts.files;
  const pad = Math.max(15, ...files.map(([name]) => name.length)) + 2;
  return [
    `Halsduk – ${opts.club}`,
    `Skapad ${opts.date}`,
    "",
    `Maskin: ${SCARF.machine}   Mönsterprogram: ${SCARF.software}`,
    `Storlek: ${SCARF.needles} nålar × ${SCARF.rows} maskrader, ca ${SCARF.lengthMm / 10} × ${SCARF.widthMm / 10} cm exklusive fransar.`,
    "",
    ...opts.layout,
    "",
    "Färger (Pantone är närmaste referens – välj garn som matchar):",
    ...lines,
    "",
    "Filer:",
    ...files.map(([name, what]) => `  ${name.padEnd(pad)}– ${what}`),
  ].join("\n");
}
