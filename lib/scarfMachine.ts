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

/** Så många rader närmast ändraderna som avgör deras färg. */
const NEAR_ROWS = 6;

/**
 * De första och sista raderna stickas enfärgade, som stickeriet vill ha det. Varje sida och varje ände får färgen som
 * mönstret har närmast ändraderna, så att kanten löper ut till fransen och det syns var klippkanten och fransen
 * börjar. `faces` är de två sidorna liggande, `r * 120 + s`; `protect` nollas i ändraderna om det finns.
 * Ger färgerna: `[sida][ände]`, där ände 0 är sidans rad 1 och ände 1 dess sista rad.
 */
export function plainEnds(faces: [Uint8Array, Uint8Array], protect?: [Uint8Array, Uint8Array]) {
  const END = SCARF.endRows;
  return faces.map((f, side) =>
    [0, ROWS - END].map((r0) => {
      const from = r0 === 0 ? END : ROWS - END - NEAR_ROWS;
      const count = new Map<number, number>();
      for (let i = from * SIDE; i < (from + NEAR_ROWS) * SIDE; i++) count.set(f[i], (count.get(f[i]) ?? 0) + 1);
      const color = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      f.fill(color, r0 * SIDE, (r0 + END) * SIDE);
      protect?.[side].fill(0, r0 * SIDE, (r0 + END) * SIDE);
      return color;
    }),
  ) as [[number, number], [number, number]];
}

/** Två liggande sidor till maskinens rutnät. */
export function toMachine(faces: [Uint8Array, Uint8Array], backReads: BackReads = "hold-up") {
  const cells = new Uint8Array(NEEDLES * ROWS);
  faces.forEach((f, side) => {
    for (let r = 0; r < ROWS; r++) for (let s = 0; s < SIDE; s++) cells[machineIndex(side as 0 | 1, r, s, backReads)] = f[r * SIDE + s];
  });
  return cells;
}

/** Maskinens rutnät tillbaka till de två liggande sidorna – för förhandsbilderna. */
export function facesOf(cells: Uint8Array, backReads: BackReads = "hold-up") {
  const faces: [Uint8Array, Uint8Array] = [new Uint8Array(SIDE * ROWS), new Uint8Array(SIDE * ROWS)];
  faces.forEach((f, side) => {
    for (let r = 0; r < ROWS; r++) for (let s = 0; s < SIDE; s++) f[r * SIDE + s] = cells[machineIndex(side as 0 | 1, r, s, backReads)];
  });
  return faces;
}

/** Så många nålar på var sida om varje vikkant som har samma färg fram och bak. */
export const FOLD_NEEDLES = 4;

/**
 * Tuben viks aldrig exakt, så en bit på båda sidor om vikkanten har samma färg (stickeriets önskemål). På varje varv
 * får de närmaste nålarna på båda sidor om kanten den färg framsidan har vid kanten – den som flest av framsidans
 * yttersta nålar har. Kanterna ligger mellan nål 120 och 121 och mellan nål 240 och 1. `protect` nollas där.
 */
export function foldBands(cells: Uint8Array, protect?: Uint8Array) {
  const K = FOLD_NEEDLES;
  const majority = (cols: number[], r: number) => {
    const count = new Map<number, number>();
    for (const c of cols) count.set(cells[r * NEEDLES + c], (count.get(cells[r * NEEDLES + c]) ?? 0) + 1);
    // Lika många: den yttersta nålens färg.
    const best = Math.max(...count.values());
    return cells[r * NEEDLES + cols.find((c) => count.get(cells[r * NEEDLES + c]) === best)!];
  };
  const set = (r: number, cols: number[], v: number) => cols.forEach((c) => ((cells[r * NEEDLES + c] = v), protect && (protect[r * NEEDLES + c] = 0)));
  const range = (from: number, n: number, step = 1) => Array.from({ length: n }, (_, k) => from + k * step);
  for (let r = 0; r < ROWS; r++) {
    // Kanten mellan nål 120 och 121: framsidans yttersta nålar är 120, 119 …, baksidans 121, 122 …
    set(r, [...range(SIDE - 1, K, -1), ...range(SIDE, K)], majority(range(SIDE - 1, K, -1), r));
    // Kanten mellan nål 240 och 1: framsidans yttersta nålar är 1, 2 …, baksidans 240, 239 …
    set(r, [...range(0, K), ...range(NEEDLES - 1, K, -1)], majority(range(0, K), r));
  }
}

/**
 * Halsduken färdig för maskinen: enfärgade ändrader och samma färg på båda sidor om vikkanterna. Ger maskinens
 * rutnät, sidorna som de blir stickade (för förhandsbilderna) och fransens färg i varje ände.
 */
export function finishTube(faces: [Uint8Array, Uint8Array], backReads: BackReads = "hold-up") {
  const ends = plainEnds(faces);
  const cells = toMachine(faces, backReads);
  foldBands(cells);
  return { cells, faces: facesOf(cells, backReads), fringe: fringeOf(ends) };
}

/** Fransen i varje ände får framsidans färg där: `[vid rad 1, vid rad 1210]`. */
export const fringeOf = (ends: [[number, number], [number, number]]) => [ends[0][0], ends[0][1]] as [number, number];

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
  // 0 färger i huvudet betyder hela färgtabellen på 256 platser, som i stickeriets egen fil och som Paint sparar. Stickeriets
  // program räknar ut var bilden börjar ur det här talet i stället för ur bfOffBits: med 3 här läste det bilden förskjuten.
  v.setUint32(46, 0, true);
  v.setUint32(50, 0, true);
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
    `  Rad 1–${SCARF.endRows} och ${ROWS - SCARF.endRows + 1}–${ROWS} är enfärgade på varje sida, i färgen mönstret har närmast: änden som klipps och sömsmånen för fransen.`,
    `  ${FOLD_NEEDLES} nålar på var sida om varje vikkant har samma färg fram och bak, så att det inte syns om tuben viks lite snett.`,
    "  Startrader och vikmarkeringar finns inte i filen.",
  ];
}
