import { SCARF, hexToRgb } from "./scarf";

/**
 * Hur halsduken ligger på stickmaskinen, och mönsterfilen i stickeriets format. Delas av alla vägar som gör stickfiler –
 * halsduksagenten, hubbens leverans, den gamla halsduksstudion och kampanjpaketet – och behöver inte servern, så att
 * den också går att köra i webbläsaren.
 *
 * Stickeriets besked (november 2026): en enda BMP för hela halsduken, 240 × 1210 – cylindern utplattad, där 240 nålar
 * är ett varv på maskinen och 1210 antalet varv – i de färger halsduken ska ha. Ränder får gå runt hela varvet.
 * Från stickeriets egen fil (Norge_DHL_6126061.bmp): 8 bitar, okomprimerad, lagrad nerifrån och upp, 96 dpi, 50
 * enfärgade varv i varje ände och motivet 10 nålar från kanterna. Startrader och vikmarkeringar finns inte i filen;
 * dem lägger stickeriets program till.
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

// --- Mönsterfilen ----------------------------------------------------------------------

/** Upplösningen i stickeriets fil: 3779 punkter per meter, alltså 96 dpi. */
const PELS_PER_METER = 3779;

/**
 * Hela halsduken som en BMP: 240 × 1210, 8 bitar, nerifrån och upp, och paletten är garnernas egna färger – färg 0 är
 * garn 1. `cells` är maskinens rutnät (rad 1 först, nål 1 först i varje rad) och `palette` garnerna. Bildens översta
 * rad är rad 1 och dess vänstra kolumn nål 1.
 */
export function tubeBmp(cells: Uint8Array, palette: string[]): Uint8Array {
  const stride = Math.ceil(NEEDLES / 4) * 4;
  const offset = 14 + 40 + 256 * 4;
  const buf = new Uint8Array(offset + stride * ROWS);
  const v = new DataView(buf.buffer);
  buf.set([0x42, 0x4d], 0);
  v.setUint32(2, buf.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, NEEDLES, true);
  v.setInt32(22, ROWS, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 8, true);
  v.setUint32(30, 0, true);
  v.setUint32(34, stride * ROWS, true);
  v.setInt32(38, PELS_PER_METER, true);
  v.setInt32(42, PELS_PER_METER, true);
  // Bara garnerna är färger i bilden; resten av färgtabellen är tom.
  v.setUint32(46, palette.length, true);
  v.setUint32(50, palette.length, true);
  palette.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    buf.set([b, g, r, 0], 54 + i * 4);
  });
  for (let r = 0; r < ROWS; r++) buf.set(cells.subarray(r * NEEDLES, (r + 1) * NEEDLES), offset + (ROWS - 1 - r) * stride);
  return buf;
}

/** Mönsterfilens namn. */
export const patternFile = (base: string) => `${base}-${NEEDLES}x${ROWS}.bmp`;

/** Raderna om mönsterfilen i en LÄS MIG: hur den är gjord och hur halsduken ligger i den. */
export function bmpLines(backReads: BackReads = "hold-up") {
  return [
    `Mönstret är en BMP för hela halsduken: ${NEEDLES} × ${ROWS} bildpunkter, 8 bitar, i garnernas egna färger. Färg 1 i filen är garn 1.`,
    `En bildpunkt är en maska: ${NEEDLES} nålar är ett varv, ${ROWS} är antalet varv. Skala inte om bilden och jämna inte ut den.`,
    `  Framsidan är nål 1–${SIDE} och baksidan nål ${SIDE + 1}–${NEEDLES}. Rad 1 är bildens översta rad.`,
    "  Framsidan ligger som i stickeriets egen BMP: text tvärs över ändarna har överkanten mot halsdukens mitt.",
    backReads === "hold-up" ? "  Baksidan läses rätt bakifrån när halsduken hålls upp." : "  Baksidan läses rätt när halsduken vänds över långsidan.",
    `  Rad 1–${SCARF.endRows} och ${ROWS - SCARF.endRows + 1}–${ROWS} är enfärgade: änden som klipps och sömsmånen för fransen. Startrader och vikmarkeringar finns inte i filen.`,
  ];
}
