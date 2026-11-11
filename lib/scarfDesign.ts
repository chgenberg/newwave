import { SCARF } from "./scarf";

/**
 * Halsdukens designspråk. En design är två sidor som var och en delas i sektioner längs halsduken.
 * Varje sektion har en fyllning (ränder, rutor, bårder …) och kan bära ett innehåll (text, sköld, ikon, trupp, porträtt, autografer).
 * Motorn i scarfEngine.ts gör om en design till maskor – inget i den här filen behöver servern.
 *
 * Mått är i millimeter på den liggande halsduken: x längs de 135 cm, y tvärs över de 18 cm.
 * Färger är alltid index i designens garnlista (högst sju).
 */

export type Yarn = number;
export type Stripe = { yarn: Yarn; mm: number };

export const FONT_FILES = {
  anton: "anton.ttf",
  varsity: "bevan.ttf",
  block: "archivo-black.ttf",
  rund: "titan-one.ttf",
  slab: "alfa-slab-one.ttf",
  smal: "big-shoulders-black.ttf",
  teknik: "russo-one.ttf",
  bred: "bungee.ttf",
  gotisk: "pirata-one.ttf",
  pensel: "knewave.ttf",
  fart: "racing-sans-one.ttf",
} as const;
export type FontKey = keyof typeof FONT_FILES;
export const FONT_KEYS = Object.keys(FONT_FILES) as FontKey[];
export const FONT_LABEL: Record<FontKey, string> = {
  anton: "Anton – smal och tung, klassisk läktarhalsduk",
  varsity: "Varsity – collegebokstäver med klackar",
  block: "Block – bred grotesk",
  rund: "Rund – mjuk och lekfull",
  slab: "Slab – tunga klackar, julkort och retro",
  smal: "Smal – hög affischstil för långa ord",
  teknik: "Teknik – kantig och modern",
  bred: "Bred – extra breda versaler för korta ord",
  gotisk: "Gotisk – läktarstil",
  pensel: "Pensel – handmålad",
  fart: "Fart – lutande och sportig",
};

/** Skrivstilen som autografer sätts i när ingen har ritat dem för hand. */
export const SIGN_FONT_FILE = "kaushan-script.ttf";
/** Ritrutan för autografer är så här många gånger bredare än den är hög. */
export const SIGN_PAD = 4;
/** Ett streck ritat för hand: punkter i 0–1 i båda led på ritrutan, x längs halsduken. */
export type SignStroke = [number, number][];

export type Fill =
  | { kind: "solid"; yarn: Yarn }
  /** Tvärränder: band tvärs över halsduken som upprepas längs den (bar scarf). */
  | { kind: "bars"; stripes: Stripe[] }
  /** Längsränder: band som löper längs hela sektionen. */
  | { kind: "hoops"; stripes: Stripe[] }
  | { kind: "diagonal"; stripes: Stripe[]; dir?: 1 | -1 }
  /** Vinklar som pekar längs halsduken. */
  | { kind: "chevron"; stripes: Stripe[]; dir?: 1 | -1 }
  /** Längsränder i sicksack. */
  | { kind: "zigzag"; stripes: Stripe[]; ampMm: number; waveMm: number }
  /** Längsränder i mjuka vågor. */
  | { kind: "waves"; stripes: Stripe[]; ampMm: number; waveMm: number }
  | { kind: "checker"; yarns: [Yarn, Yarn]; mm: number }
  /** Argyle: romber i två färger med en tunn korsande linje. */
  | { kind: "diamonds"; yarns: [Yarn, Yarn]; wMm: number; hMm: number; line?: Yarn }
  /** Toning mellan två garner med raster – varannan maska i mitten. */
  | { kind: "fade"; from: Yarn; to: Yarn }
  /** Ett litet maskmotiv som upprepas över ytan. */
  | { kind: "tile"; ground: Yarn; yarn: Yarn; bitmap: BitmapId; gap?: number; brick?: boolean }
  /** Nordiska bårder: band av maskmotiv och linjer som upprepas längs sektionen. */
  | { kind: "nordic"; ground: Yarn; bands: NordicBand[] };

export type NordicBand = { bitmap: BitmapId; yarn: Yarn; pad?: number } | { line: Yarn; rows: number } | { space: number };

export type TextStyle = {
  font: FontKey;
  yarn: Yarn;
  /** Skugga snett nedanför texten. */
  shadow?: Yarn;
  /** Kontur runt texten, minst två maskor bred. */
  outline?: Yarn;
  /** Dra ut texten på bredden så att den fyller rutan. */
  stretch?: boolean;
};

export type Content =
  | ({ kind: "text"; lines: string[]; /** Underradernas andel av höjden. */ sub?: number; /** Läses tvärs över halsduken. */ rotate?: boolean; /** Texter i samma grupp får samma versalhöjd – den minsta av dem. */ group?: string } & TextStyle)
  /** `plate` är färgen på en platta som läggs bakom skölden när dess ytterkant har samma färg som bottnen och annars skulle försvinna. */
  | { kind: "crest"; yarns?: Yarn[]; plate?: Yarn; /** Vriden ett kvarts varv, så att märket står rätt när änden hänger: 1 medurs, -1 moturs. */ turn?: 1 | -1 }
  | { kind: "icon"; icon: IconId; yarn: Yarn; outline?: Yarn; count?: number }
  | { kind: "roster"; title?: string; players: string[]; font: FontKey; yarn: Yarn; accent: Yarn }
  | { kind: "portrait"; frame: Yarn; yarns: Yarn[] }
  /** Ett motiv som bildmodellen ritat, reducerat till de angivna garnerna. */
  | { kind: "art"; yarns: Yarn[] }
  /** Autografer: namnen i skrivstil bredvid varandra, eller de streck beställaren själv har ritat. */
  | { kind: "sign"; yarn: Yarn; names: string[]; strokes?: SignStroke[] };

export type Section = {
  /** Fast bredd i mm, annars delar sektionen på resten efter `flex` (1 om inget anges). */
  mm?: number;
  flex?: number;
  fill: Fill;
  content?: Content;
  /** Luft runt innehållet i mm, [längs, tvärs]. */
  pad?: [number, number];
  /** Mönstret räknas från sektionens bortre kant, så att halsdukens två ändar blir spegelbilder. */
  flip?: boolean;
  /** Mönstret räknas från halsdukens början i stället för sektionens, så att det löper obrutet över flera sektioner. */
  through?: boolean;
};

export type Face = {
  sections: Section[];
  /** Ränder längs långsidorna, utifrån och in, ovanpå fyllningen. `skip` sektioner i varje ände lämnas orörda. */
  edge?: { stripes: Stripe[]; skip?: number };
};

export type ScarfDesign = {
  palette: string[];
  front: Face;
  back: Face;
  /**
   * Hur baksidan vänds i stickfilen. "hold-up": läsbar bakifrån när halsduken hålls upp (standard för supporterhalsdukar).
   * "turn-over": läsbar när halsduken vänds över långsidan.
   */
  backReads?: "hold-up" | "turn-over";
};

export const L_MM = SCARF.lengthMm;
export const W_MM = SCARF.widthMm;
/** Maskrader per maskbredd: en maska är 1,5 mm bred men bara 1,12 mm hög, så ett motiv dras ut längs halsduken för att bli rätt. */
export const ASPECT = SCARF.widthMm / SCARF.side / (SCARF.lengthMm / SCARF.rows);

/** Hur många maskrader ett band i en nordisk bård tar. */
export function bandRows(b: NordicBand) {
  if ("line" in b) return b.rows;
  if ("space" in b) return b.space;
  return Math.round((BITMAPS[b.bitmap][0].length + (b.pad ?? 2) * 2) * ASPECT);
}

/** Längden i mm på `cycles` hela varv av en nordisk bård – så att sektionen slutar jämnt. */
export const nordicMm = (bands: NordicBand[], cycles = 1) => (bands.reduce((n, b) => n + bandRows(b), 0) * cycles * SCARF.lengthMm) / SCARF.rows;

/** Speglar sektionerna runt mitten: [a, b, MITT] blir [a, b, MITT, b', a']. */
export function mirrored(ends: Section[], middle: Section[]): Section[] {
  return [...ends, ...middle, ...[...ends].reverse().map((s) => ({ ...s, flip: !s.flip }))];
}

// --- Maskmotiv ---------------------------------------------------------------

/** Små motiv ritade maska för maska, som i ett stickdiagram. `#` är motivets färg. */
export const BITMAPS = {
  snostjarna: [
    "......#......",
    "...#..#..#...",
    "..###.#.###..",
    "...###.###...",
    "....#####....",
    ".##..###..##.",
    "####.#.#.####",
    ".##..###..##.",
    "....#####....",
    "...###.###...",
    "..###.#.###..",
    "...#..#..#...",
    "......#......",
  ],
  hjarta: ["..##...##..", ".####.####.", "###########", "###########", "###########", ".#########.", "..#######..", "...#####...", "....###....", ".....#....."],
  gran: [".....#.....", "....###....", "...#####...", "....###....", "...#####...", "..#######..", "...#####...", "..#######..", ".#########.", "###########", ".....#.....", ".....#....."],
  romb: ["...#...", "..###..", ".##.##.", "##...##", ".##.##.", "..###..", "...#..."],
  kors: ["..#..", "..#..", "#####", "..#..", "..#.."],
  stjarna: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", ".#.....#."],
  lus: ["##", "##"],
  krona: ["#...#...#", "#...#...#", "##.###.##", "#########", "#########", ".#######."],
  boll: [
    "...#####...",
    "..#..#..#..",
    ".#..###..#.",
    "#..#####..#",
    "####.#.####",
    "#..#.#.#..#",
    "#...###...#",
    ".#.#...#.#.",
    "..##...##..",
    "...#####...",
  ],
  sicksack: ["##...", ".##..", "..##.", "...##", "..##.", ".##.."],
} as const;
export type BitmapId = keyof typeof BITMAPS;

// --- Ikoner ------------------------------------------------------------------

const star = (cx: number, cy: number, R: number, r: number, n = 5) =>
  `M${Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rad = i % 2 ? r : R;
    return `${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`;
  }).join("L")}Z`;

const quad = (x0: number, y0: number, x1: number, y1: number, w: number) => {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const [nx, ny] = [(-(y1 - y0) / len) * (w / 2), ((x1 - x0) / len) * (w / 2)];
  return `M${(x0 + nx).toFixed(2)} ${(y0 + ny).toFixed(2)}L${(x1 + nx).toFixed(2)} ${(y1 + ny).toFixed(2)}L${(x1 - nx).toFixed(2)} ${(y1 - ny).toFixed(2)}L${(x0 - nx).toFixed(2)} ${(y0 - ny).toFixed(2)}Z`;
};

const ball = () => {
  const ring = "M50 3A47 47 0 1 0 50 97A47 47 0 1 0 50 3ZM50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10Z";
  const at = (a: number, r: number) => `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
  const parts = [ring, `M${Array.from({ length: 5 }, (_, i) => at((Math.PI * 2 * i) / 5 - Math.PI / 2, 16)).join("L")}Z`];
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const [x0, y0] = at(a, 15).split(" ").map(Number);
    const [x1, y1] = at(a, 31).split(" ").map(Number);
    parts.push(quad(x0, y0, x1, y1, 5), `M${at(a, 27)}L${at(a - 0.36, 42)}L${at(a + 0.36, 42)}Z`);
  }
  return parts.join("");
};

const snowflake = () => {
  const arms: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * i) / 3;
    const p = (r: number, da = 0) => [50 + Math.cos(a + da) * r, 50 + Math.sin(a + da) * r] as const;
    const [ex, ey] = p(46);
    arms.push(quad(50, 50, ex, ey, 8));
    for (const s of [-1, 1]) {
      const [bx, by] = p(28);
      const [tx, ty] = [bx + Math.cos(a + (s * Math.PI) / 3.4) * 15, by + Math.sin(a + (s * Math.PI) / 3.4) * 15];
      arms.push(quad(bx, by, tx, ty, 7));
    }
  }
  return arms.join("");
};

const WING = "M48 49C45 33 40 21 30 13C20 5 10 1 2 1C4 9 8 14 14 17C10 19 8 23 8 27C14 29 20 29 25 28C21 32 20 37 21 41C27 41 32 39 36 37C34 42 34 47 36 51C41 51 45 50 48 49Z";
const flipX = (d: string) => d.replace(/([MLC])([^MLCZ]+)/g, (_, c: string, nums: string) => c + nums.trim().split(/[\s,]+/).map((n, i) => (i % 2 === 0 ? (100 - Number(n)).toString() : n)).join(" "));

/** Ikoner i en ruta på 100 × 100 (eller måtten i ICON_BOX), fyllda med evenodd. */
export const ICONS = {
  stjarna: star(50, 54, 50, 20),
  hjarta: "M50 92C18 64 4 46 4 28C4 13 16 4 28 4C38 4 46 10 50 19C54 10 62 4 72 4C84 4 96 13 96 28C96 46 82 64 50 92Z",
  krona: "M6 76L6 26L28 50L50 12L72 50L94 26L94 76ZM6 82H94V94H6Z",
  blixt: "M60 2L16 56H44L34 98L84 40H54Z",
  gran: "M50 4L74 36H61L82 62H66L90 88H56V98H44V88H10L34 62H18L39 36H26Z",
  pokal: "M27 6H73V34C73 52 62 62 50 62C38 62 27 52 27 34ZM27 12V22H19V28C19 36 23 40 28 41L30 50C19 49 10 41 10 28V12ZM73 12H90V28C90 41 81 49 70 50L72 41C77 40 81 36 81 28V22H73ZM43 62H57V80H43ZM28 80H72V94H28Z",
  boll: ball(),
  vingar: `${WING}${flipX(WING)}`,
  kopp: "M14 40H70V70C70 84 60 92 48 92H36C24 92 14 84 14 70ZM70 46H80C89 46 94 52 94 60C94 68 89 74 80 74H70V65H79C83 65 85 63 85 60C85 57 83 55 79 55H70ZM28 6C34 12 34 18 28 24C22 30 22 34 26 36H34C30 32 31 29 36 24C42 18 42 11 36 6ZM48 6C54 12 54 18 48 24C42 30 42 34 46 36H54C50 32 51 29 56 24C62 18 62 11 56 6Z",
  snoflinga: snowflake(),
  ankare: "M50 4A11 11 0 1 0 50 26A11 11 0 1 0 50 4ZM50 10A5 5 0 1 1 50 20A5 5 0 1 1 50 10ZM45 24H55V34H72V43H55V84C66 82 75 74 78 62L70 62L84 48L96 64L88 63C84 82 68 95 50 95C32 95 16 82 12 63L4 64L16 48L30 62L22 62C25 74 34 82 45 84V43H28V34H45Z",
  stralkastare: "M18 6H82V40H18ZM24 12V20H36V12ZM44 12V20H56V12ZM64 12V20H76V12ZM24 26V34H36V26ZM44 26V34H56V26ZM64 26V34H76V26ZM45 40H55V98H45ZM34 92H66V98H34Z",
} as const;
export type IconId = keyof typeof ICONS;
/** Ikoner som inte är kvadratiska: [bredd, höjd]. */
export const ICON_BOX: Partial<Record<IconId, [number, number]>> = { vingar: [100, 52] };
export const ICON_LABEL: Record<IconId, string> = {
  stjarna: "stjärna",
  hjarta: "hjärta",
  krona: "krona",
  blixt: "blixt",
  gran: "gran",
  pokal: "pokal",
  boll: "fotboll",
  vingar: "änglavingar",
  kopp: "kaffekopp",
  snoflinga: "snöflinga",
  ankare: "ankare",
  stralkastare: "strålkastare",
};
