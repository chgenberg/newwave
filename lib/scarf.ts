/** Seger's knitted scarf on the OPEK 365: a tube on a 240-needle cylinder, front = needles 1–120, back = 121–240. */
export const SCARF = {
  needles: 240,
  side: 120,
  rows: 1210,
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

/** Includes two mid-grey yarns within the 7-colour cap so photo portraits knit with 4 greyscale tones (white, light grey, dark grey, black) like on an IMS/OPEK 365. */
export function clubScarfPalette(club: { palette: { hex: string }[]; crestColors: string[] }) {
  const out: string[] = [];
  const clubCandidates = [...club.palette.map((c) => c.hex), ...club.crestColors].map((c) => c.toUpperCase());
  const greys = ["#A6AAB0", "#555960"];
  for (const h of clubCandidates) {
    if (out.length < SCARF.maxColors - greys.length && !out.some((o) => deltaE(o, h) < 14)) out.push(h);
  }
  for (const g of greys) {
    if (out.length < SCARF.maxColors && !out.some((o) => deltaE(o, g) < 8)) out.push(g);
  }
  for (const h of clubCandidates) {
    if (out.length < SCARF.maxColors && !out.some((o) => deltaE(o, h) < 6)) out.push(h);
  }
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

/** Common Pantone Solid Coated references as sRGB approximations. Seger matches yarn from the Pantone code. */
const PANTONE: [string, string][] = [
  ["White", "#FFFFFF"], ["Black 6 C", "#101820"], ["Black C", "#2D2926"], ["Cool Gray 11 C", "#53565A"], ["Cool Gray 7 C", "#97999B"],
  ["Cool Gray 3 C", "#C8C9C7"], ["7527 C", "#D6D2C4"], ["432 C", "#333F48"], ["7547 C", "#131E29"],
  ["281 C", "#00205B"], ["282 C", "#041E42"], ["289 C", "#0C2340"], ["2955 C", "#003865"], ["541 C", "#003C71"], ["7686 C", "#1D4F91"],
  ["286 C", "#0033A0"], ["293 C", "#003DA5"], ["2945 C", "#004C97"], ["2935 C", "#0057B8"], ["300 C", "#005EB8"], ["3005 C", "#0077C8"],
  ["2727 C", "#307FE2"], ["279 C", "#418FDE"], ["2925 C", "#009CDE"], ["299 C", "#00A3E0"], ["2985 C", "#59CBE8"], ["7690 C", "#00507F"],
  ["186 C", "#C8102E"], ["485 C", "#DA291C"], ["032 C", "#EF3340"], ["1795 C", "#D22630"], ["199 C", "#D50032"], ["200 C", "#BA0C2F"],
  ["201 C", "#9D2235"], ["202 C", "#862633"], ["7621 C", "#AB2328"], ["1805 C", "#AF272F"], ["7427 C", "#97233F"], ["7421 C", "#651D32"],
  ["220 C", "#A50050"], ["484 C", "#9A3324"], ["4625 C", "#4F2C1D"],
  ["021 C", "#FE5000"], ["1655 C", "#FC4C02"], ["165 C", "#FF671F"], ["151 C", "#FF8200"], ["158 C", "#E87722"],
  ["108 C", "#FEDB00"], ["109 C", "#FFD100"], ["116 C", "#FFCD00"], ["7548 C", "#FFC600"], ["123 C", "#FFC72C"], ["7406 C", "#F1C400"], ["7409 C", "#F0B323"],
  ["375 C", "#97D700"], ["368 C", "#78BE20"], ["7741 C", "#44883E"], ["347 C", "#009A44"], ["356 C", "#007A33"], ["349 C", "#046A38"],
  ["342 C", "#006747"], ["3425 C", "#006341"],
  ["2685 C", "#330072"], ["268 C", "#582C83"], ["259 C", "#6D2077"],
];

export function nearestPantone(hex: string) {
  let best = PANTONE[0];
  let bestD = Infinity;
  for (const p of PANTONE) {
    const d = deltaE(hex, p[1]);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return { code: best[0] === "White" ? "White" : `PMS ${best[0]}`, hex: best[1], deltaE: Math.round(bestD * 10) / 10 };
}

export type ScarfCheck = { id: string; ok: boolean; title: string; note: string };

/** Stitch-level checks on the finished 240×1210 grid. */
export function checkGrid(cells: Uint8Array, palette: string[], minTextMm: number | null, hasPortrait = false): { checks: ScarfCheck[]; counts: number[] } {
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
    hasPortrait
      ? {
          id: "dots",
          ok: true,
          title: "Fotoporträtt i jacquard-raster",
          note: "Ansiktet stickas med halftonsraster i 4 gråtoner för mjuka övergångar på OPEK 365.",
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

export function colorCsv(palette: string[], counts: number[]) {
  return ["Färg;Hex;RGB;Närmaste Pantone;Maskor", ...palette.map((hex, i) => `${i + 1};${hex};${hexToRgb(hex).join(",")};${nearestPantone(hex).code};${counts[i] ?? 0}`)].join("\n");
}

export function readMe(opts: { club: string; palette: string[]; counts: number[]; date: string }) {
  const lines = opts.palette.map((hex, i) => {
    const p = nearestPantone(hex);
    return `  Färg ${i + 1}: ${hex}  ≈ ${p.code}  (${opts.counts[i] ?? 0} maskor)`;
  });
  return [
    `Halsduk – ${opts.club}`,
    `Skapad ${opts.date}`,
    "",
    `Maskin: ${SCARF.machine}   Mönsterprogram: ${SCARF.software}`,
    `Storlek: ${SCARF.needles} nålar × ${SCARF.rows} maskrader, ca ${SCARF.lengthMm / 10} × ${SCARF.widthMm / 10} cm exklusive fransar.`,
    `Bilden är ${SCARF.needles} × ${SCARF.rows} pixlar: en pixel = en maska.`,
    `Kolumn 1–${SCARF.side} = framsida, kolumn ${SCARF.side + 1}–${SCARF.needles} = baksida. Rad 1 är bildens översta rad.`,
    "",
    "Färger (Pantone är närmaste referens – välj garn som matchar):",
    ...lines,
    "",
    "Filer:",
    "  halsduk.jpg      – JPG i högsta kvalitet, för Draw Designer (JPG kan ge små färgavvikelser i kanterna)",
    "  halsduk.png      – samma mönster förlustfritt, exakt de färger som står nedan",
    "  halsduk-x4.png   – förstorad för granskning på skärm",
    "  farger.csv       – färglista",
  ].join("\n");
}
