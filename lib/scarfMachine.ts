import { SCARF, deltaE, hexToRgb } from "./scarf";

/**
 * Hur halsduken ligger på stickmaskinen, och mönsterfilen i stickeriets eget format. Delas av alla vägar som gör
 * stickfiler – halsduksagenten, hubbens leverans, den gamla halsduksstudion och kampanjpaketet – och behöver inte
 * servern, så att den också går att köra i webbläsaren.
 *
 * Formatet är uppmätt i stickeriets egen fil (Norge_DHL_6126061.bmp, november 2026): en BMP per sida, 120 nålar ×
 * 1210 rader, 8 bitar, okomprimerad, lagrad nerifrån och upp, 96 dpi och Windows standardpalett med 256 färger. Varje
 * bildpunkt är en maska och dess färg en etikett för ett garn – stickeriet väljer själva garnet och matar maskinen.
 * Startrader och vikmarkeringar finns inte i filen; dem lägger stickeriets program till.
 */

const ROWS = SCARF.rows;
const SIDE = SCARF.side;
const NEEDLES = SCARF.needles;

export type BackReads = "hold-up" | "turn-over";

/**
 * Var en maska hamnar i maskinens rutnät (240 × 1210, rad 1 först). `r` är raden längs halsduken och `s` maskan
 * räknad från halsdukens övre långsida när sidan ritas liggande och läsbar.
 * – Framsidan på nål 1–120, vriden ett kvarts varv medurs: samma läge som stickeriets egen BMP.
 * – Baksidan på nål 121–240. "hold-up": läses rätt bakifrån när halsduken hålls upp. "turn-over": läses rätt när
 *   halsduken vänds över långsidan.
 * Ingen sida är spegelvänd – mönstret går runt tubens utsida.
 */
export function machineIndex(side: 0 | 1, r: number, s: number, backReads: BackReads) {
  if (side === 0) return r * NEEDLES + (SIDE - 1 - s);
  return backReads === "hold-up" ? (ROWS - 1 - r) * NEEDLES + SIDE + s : r * NEEDLES + (NEEDLES - 1 - s);
}

/**
 * De första och sista raderna stickas enfärgade, som stickeriet vill ha det: i framsidans bottenfärg (det garn som har
 * flest maskor mellan ändraderna). `faces` är de två sidorna liggande, `r * 120 + s`. Ger bottenfärgen.
 */
export function plainEnds(faces: [Uint8Array, Uint8Array]) {
  const count = new Map<number, number>();
  for (let i = SCARF.endRows * SIDE; i < (ROWS - SCARF.endRows) * SIDE; i++) count.set(faces[0][i], (count.get(faces[0][i]) ?? 0) + 1);
  const ground = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  for (const f of faces) for (const r0 of [0, ROWS - SCARF.endRows]) f.fill(ground, r0 * SIDE, (r0 + SCARF.endRows) * SIDE);
  return ground;
}

/** Två liggande sidor till maskinens rutnät. */
export function toMachine(faces: [Uint8Array, Uint8Array], backReads: BackReads = "hold-up") {
  const cells = new Uint8Array(NEEDLES * ROWS);
  faces.forEach((f, side) => {
    for (let r = 0; r < ROWS; r++) for (let s = 0; s < SIDE; s++) cells[machineIndex(side as 0 | 1, r, s, backReads)] = f[r * SIDE + s];
  });
  return cells;
}

/**
 * Ett rutnät där sidorna ligger bredvid varandra som de ritades (kolumn 1–120 framsidan, 121–240 baksidan, kolumnen
 * räknad från den övre långsidan) – så som den gamla halsduksstudion bygger halsduken – till maskinens rutnät, med
 * enfärgade ändrader.
 */
export function fromDrawnSides(drawn: Uint8Array, backReads: BackReads = "hold-up") {
  const faces: [Uint8Array, Uint8Array] = [new Uint8Array(SIDE * ROWS), new Uint8Array(SIDE * ROWS)];
  faces.forEach((f, side) => {
    for (let r = 0; r < ROWS; r++) f.set(drawn.subarray(r * NEEDLES + side * SIDE, r * NEEDLES + side * SIDE + SIDE), r * SIDE);
  });
  plainEnds(faces);
  return { cells: toMachine(faces, backReads), faces };
}

// --- Windows standardpalett -------------------------------------------------------------

const SYSTEM: Record<number, string> = {
  0: "#000000",
  1: "#800000",
  2: "#008000",
  3: "#808000",
  4: "#000080",
  5: "#800080",
  6: "#008080",
  7: "#C0C0C0",
  8: "#C0DCC0",
  9: "#A6CAF0",
  246: "#FFFBF0",
  247: "#A0A0A4",
  248: "#808080",
  249: "#FF0000",
  250: "#00FF00",
  251: "#FFFF00",
  252: "#0000FF",
  253: "#FF00FF",
  254: "#00FFFF",
  255: "#FFFFFF",
};
const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

/** Windows standardpalett med 256 färger: tjugo systemfärger och däremellan en färgkub (rött och grönt i steg om 32, blått i steg om 64). */
export const WINDOWS_PALETTE: readonly string[] = Array.from({ length: 256 }, (_, i) => SYSTEM[i] ?? `#${hex2((i & 7) * 32)}${hex2(((i >> 3) & 7) * 32)}${hex2(((i >> 6) & 3) * 64)}`);

/** Paletten har några färger två gånger; garnen väljer bara bland den första av varje. */
const UNIQUE = WINDOWS_PALETTE.flatMap((hex, i) => (WINDOWS_PALETTE.indexOf(hex) === i ? [i] : []));

export type BmpColor = { index: number; hex: string; deltaE: number };

/**
 * Varje garn får en egen färg i Windows-paletten: den närmaste som inte redan är tagen. Garnet med flest maskor väljer
 * först. `counts` är antal maskor per garn i samma ordning som `palette`.
 */
export function bmpColors(palette: string[], counts: number[]): BmpColor[] {
  const order = palette.map((_, i) => i).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a - b);
  const taken = new Set<number>();
  const out: BmpColor[] = new Array(palette.length);
  for (const y of order) {
    let [best, bestD] = [-1, Infinity];
    for (const i of UNIQUE) {
      if (taken.has(i)) continue;
      const d = deltaE(palette[y], WINDOWS_PALETTE[i]);
      if (d < bestD) [best, bestD] = [i, d];
    }
    taken.add(best);
    out[y] = { index: best, hex: WINDOWS_PALETTE[best], deltaE: Math.round(bestD * 10) / 10 };
  }
  return out;
}

// --- Mönsterfilen ----------------------------------------------------------------------

/** Upplösningen i stickeriets fil: 3779 punkter per meter, alltså 96 dpi. */
const PELS_PER_METER = 3779;

/**
 * En sida av halsduken som BMP i stickeriets format: 120 × 1210, 8 bitar, Windows standardpalett, nerifrån och upp.
 * `cells` är maskinens rutnät (240 × 1210) och `side` 0 för framsidan (nål 1–120) eller 1 för baksidan (nål 121–240,
 * där bildens kolumn 1 är nål 121). Bildens översta rad är rad 1.
 */
export function sideBmp(cells: Uint8Array, side: 0 | 1, colors: BmpColor[]): Uint8Array {
  const stride = Math.ceil(SIDE / 4) * 4;
  const offset = 14 + 40 + 256 * 4;
  const buf = new Uint8Array(offset + stride * ROWS);
  const v = new DataView(buf.buffer);
  buf.set([0x42, 0x4d], 0);
  v.setUint32(2, buf.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, SIDE, true);
  v.setInt32(22, ROWS, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 8, true);
  v.setUint32(30, 0, true);
  v.setUint32(34, stride * ROWS, true);
  v.setInt32(38, PELS_PER_METER, true);
  v.setInt32(42, PELS_PER_METER, true);
  // 0 färger i huvudet betyder hela paletten, som i stickeriets fil.
  v.setUint32(46, 0, true);
  v.setUint32(50, 0, true);
  WINDOWS_PALETTE.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    buf.set([b, g, r, 0], 54 + i * 4);
  });
  const index = colors.map((c) => c.index);
  for (let r = 0; r < ROWS; r++) {
    const row = offset + (ROWS - 1 - r) * stride;
    const from = r * NEEDLES + side * SIDE;
    for (let s = 0; s < SIDE; s++) buf[row + s] = index[cells[from + s]];
  }
  return buf;
}

/** Filnamnen för de två sidorna. */
export const sideFile = (base: string, side: 0 | 1) => `${base}-${side === 0 ? "framsida" : "baksida"}-${SIDE}x${ROWS}.bmp`;

/** Raderna om mönsterfilerna i en LÄS MIG: hur de är gjorda och hur de ligger. */
export function bmpLines(backReads: BackReads = "hold-up") {
  return [
    `Mönstret är två BMP-filer, en per sida: ${SIDE} × ${ROWS} bildpunkter, 8 bitar, Windows standardpalett – samma form som stickeriets egen BMP.`,
    "En bildpunkt är en maska. Skala inte om bilderna och jämna inte ut dem.",
    `  Framsidan är nål 1–${SIDE} och baksidan nål ${SIDE + 1}–${NEEDLES} (kolumn 1 i baksidans fil är nål ${SIDE + 1}). Rad 1 är bildens översta rad.`,
    "  Framsidan ligger som i stickeriets egen BMP: text tvärs över ändarna har överkanten mot halsdukens mitt.",
    backReads === "hold-up" ? "  Baksidan läses rätt bakifrån när halsduken hålls upp." : "  Baksidan läses rätt när halsduken vänds över långsidan.",
    `  Rad 1–${SCARF.endRows} och ${ROWS - SCARF.endRows + 1}–${ROWS} är enfärgade (sömsmån). Startrader och vikmarkeringar finns inte i filerna.`,
    "  Färgerna i filerna är närmaste färg i Windows-paletten, en per garn. Välj garn efter garnlistan.",
  ];
}
