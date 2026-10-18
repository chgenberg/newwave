import { type Surface, type SurfaceInput, surface } from "./printSurface";

/** New Waves tryckbara sortiment för klubbarna – foton och 3D-modeller från PACH. */

export type Season = "vinter" | "vår" | "sommar" | "höst";
type Kind = "top" | "cap" | "beanie" | "bag" | "drink" | "pen" | "book" | "flat" | "box" | "tech" | "textile" | "lanyard" | "umbrella" | "booth";
type Vec3 = [number, number, number];

export type NwProduct = {
  id: string;
  name: string;
  category: string;
  kind: Kind;
  garmentColor: string;
  garmentHex: string;
  dark: boolean;
  priceSek: number;
  sizes: string[];
  printArea: { widthCm: number; heightCm: number; method: string };
  seasons: Season[];
  use: string;
  photo: string;
  /** Tryckytan på fotot. */
  print: Surface;
  /** Den lilla ytan på vänster bröst, för plagg som annars har trycket mitt på. */
  chest?: Surface;
  model: string | null;
  /** Var trycket projiceras på 3D-modellen: riktning och förskjutning i andelar av modellens storlek. */
  zone: { dir: Vec3; offset: [number, number] };
  /** Produktens största mått och tryckets bredd i cm, för att skala trycket på 3D-modellen. */
  sizeCm: number;
  printCm: number;
};

const KIND: Record<Kind, { dir: Vec3; offset: [number, number]; sizeCm: number; printCm: number; method: string; area: [number, number] }> = {
  top: { dir: [0, 0, 1], offset: [0, 0.16], sizeCm: 72, printCm: 22, method: "DTG", area: [30, 40] },
  cap: { dir: [0, 0, 1], offset: [0, 0.12], sizeCm: 27, printCm: 7, method: "Brodyr", area: [10, 6] },
  beanie: { dir: [0, 0, 1], offset: [0, -0.15], sizeCm: 22, printCm: 7, method: "Brodyr", area: [8, 5] },
  bag: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 45, printCm: 18, method: "Screentryck", area: [25, 30] },
  drink: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 20, printCm: 5, method: "Gravyr", area: [7, 9] },
  pen: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 14, printCm: 3, method: "Gravyr", area: [4, 1] },
  book: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 21, printCm: 10, method: "Digitaltryck", area: [12, 16] },
  flat: { dir: [0, 1, 0], offset: [0, 0], sizeCm: 40, printCm: 14, method: "Digitaltryck", area: [20, 20] },
  box: { dir: [0, 1, 0], offset: [0, 0], sizeCm: 25, printCm: 10, method: "Digitaltryck", area: [12, 12] },
  tech: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 14, printCm: 5, method: "Digitaltryck", area: [5, 5] },
  textile: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 140, printCm: 40, method: "Digitaltryck", area: [40, 40] },
  lanyard: { dir: [0, 0, 1], offset: [0, 0.2], sizeCm: 45, printCm: 2, method: "Screentryck", area: [2, 30] },
  umbrella: { dir: [0, 0.6, 1], offset: [0, 0.25], sizeCm: 100, printCm: 30, method: "Transfer", area: [30, 25] },
  booth: { dir: [0, 0, 1], offset: [0, 0], sizeCm: 150, printCm: 60, method: "Digitaltryck", area: [80, 60] },
};
const TOP_DOWN = new Set(["P031", "P033", "P035"]);
/** Hoodiens snören sitter där bröstzonen annars hamnar. */
/** Handduksmodellens luddiga yta bryter sönder trycket. */
const NO_MODEL = new Set(["P036"]);
const TUNED: Record<string, { offset?: [number, number]; sizeCm?: number; printCm?: number }> = {
  P004: { offset: [0, 0.07] },
};
const WEAR = ["XS", "S", "M", "L", "XL", "XXL"];
const KIDS = ["110/116", "122/128", "134/140", "146/152"];

function row(
  id: string,
  name: string,
  category: string,
  kind: Kind,
  garmentColor: string,
  garmentHex: string,
  priceSek: number,
  seasons: Season[],
  use: string,
  place: { print: SurfaceInput; chest?: SurfaceInput; leftChest?: boolean },
): NwProduct {
  const leftChest = Boolean(place.leftChest);
  const k = { ...KIND[kind], ...TUNED[id] };
  const wear = kind === "top" && id !== "P037";
  return {
    id: id.toLowerCase(),
    name,
    category,
    kind,
    garmentColor,
    garmentHex,
    dark: garmentHex !== "#F4F3EF" && garmentHex !== "#C8B08C" && garmentHex !== "#9A9CA1",
    priceSek,
    sizes: wear ? (["P001", "P004", "P005", "P008"].includes(id) ? [...KIDS, ...WEAR] : WEAR) : ["One size"],
    printArea: { widthCm: leftChest ? 9 : k.area[0], heightCm: leftChest ? 9 : k.area[1], method: id === "P022" ? "Sublimering" : k.method },
    seasons,
    use,
    photo: `/newwave/products/${id}-${garmentHex.slice(1)}.jpg`,
    print: surface(place.print),
    chest: place.chest && surface(place.chest),
    model: NO_MODEL.has(id) ? null : `/newwave/models/${id}.glb`,
    zone: { dir: TOP_DOWN.has(id) ? [0, 1, 0] : k.dir, offset: leftChest ? [0.12, 0.22] : k.offset },
    sizeCm: k.sizeCm,
    printCm: leftChest ? 9 : k.printCm,
  };
}

/** Ett plagg framifrån: bröstpartiet som det mätts på fotot, med trycket överst och lätt böjt över bröstkorgen. */
function garment([x, y, w, h]: [number, number, number, number], leftChest = false) {
  const print = { cx: x + w / 2, cy: y + h * 0.04 + h * 0.35, w: w * 0.7, h: h * 0.7, bend: 28, top: true };
  if (leftChest) return { print, leftChest };
  return { print, chest: { cx: x + w * 0.66, cy: y + h * 0.06 + h * 0.15, w: w * 0.3, h: h * 0.3, bend: 18, top: true } };
}

export const printOf = (p: Pick<NwProduct, "print" | "chest">, chest = false) => (chest && p.chest) || p.print;

const SOFT: ReadonlySet<Kind> = new Set(["top", "beanie", "bag", "textile"]);
/** Tyg som veckar sig, där trycket följer vecken. */
export const isSoft = (p: Pick<NwProduct, "kind">) => SOFT.has(p.kind);

export const NW_CATALOG: NwProduct[] = [
  row("P001", "T-shirt", "Kläder", "top", "Vit", "#F4F3EF", 249, ["vinter", "vår", "sommar", "höst"], "match, träning, cup och sommarläger", garment([0.347, 0.228, 0.308, 0.355])),
  row("P002", "T-shirt Premium", "Kläder", "top", "Svart", "#111111", 349, ["vinter", "vår", "sommar", "höst"], "supportrar och present", garment([0.319, 0.196, 0.352, 0.383])),
  row("P003", "Piké", "Kläder", "top", "Svart", "#111111", 449, ["vår", "sommar"], "ledare, funktionärer och avslutning", garment([0.339, 0.196, 0.32, 0.382])),
  row("P004", "Hoodie", "Kläder", "top", "Svart", "#111111", 599, ["höst", "vinter", "vår"], "kalla kvällar på läktaren och träning", garment([0.356, 0.385, 0.29, 0.26])),
  row("P005", "Sweatshirt", "Kläder", "top", "Gråmelerad", "#9A9CA1", 499, ["höst", "vinter", "vår"], "vardag och hemmamatch inomhus", garment([0.334, 0.206, 0.33, 0.375])),
  row("P006", "Softshelljacka", "Kläder", "top", "Svart", "#111111", 899, ["höst", "vår"], "ledare och blåsiga utomhusmatcher", garment([0.545, 0.224, 0.121, 0.157], true)),
  row("P007", "Fleece", "Kläder", "top", "Svart", "#111111", 599, ["höst", "vinter"], "kyla, läger och utomhusträning", garment([0.546, 0.229, 0.124, 0.162], true)),
  row("P008", "Funktions-t-shirt", "Kläder", "top", "Svart", "#111111", 299, ["vinter", "vår", "sommar", "höst"], "träning, lopp och cup", garment([0.335, 0.219, 0.327, 0.367])),
  row("P009", "Skaljacka", "Kläder", "top", "Svart", "#111111", 1199, ["höst", "vår"], "regn och ledare", garment([0.54, 0.25, 0.112, 0.156], true)),
  row("P010", "Funktionärsväst", "Kläder", "top", "Svart", "#111111", 699, ["vinter", "vår", "sommar", "höst"], "funktionärer, parkering och arrangörer", garment([0.537, 0.223, 0.098, 0.162], true)),
  row("P011", "Keps", "Huvudbonader", "cap", "Svart", "#111111", 249, ["vår", "sommar"], "sol, sommarcup och läger", { print: { cx: 0.43, cy: 0.42, w: 0.22, h: 0.14, rx: 8, ry: -30, rz: -6, bend: 70 } }),
  row("P012", "Mössa", "Huvudbonader", "beanie", "Svart", "#111111", 249, ["höst", "vinter"], "kyla, läktare och jul", { print: { cx: 0.525, cy: 0.71, w: 0.2, h: 0.11, rx: -4, bend: 70 } }),
  row("P013", "Buff", "Huvudbonader", "beanie", "Svart", "#111111", 179, ["höst", "vinter"], "kyla, löpning och skidor", { print: { cx: 0.5, cy: 0.56, w: 0.26, h: 0.16, rx: -4, bend: 90 } }),
  row("P014", "Tygkasse", "Väskor", "bag", "Sand", "#C8B08C", 149, ["vinter", "vår", "sommar", "höst"], "loppis, julmarknad och present", { print: { cx: 0.5, cy: 0.64, w: 0.24, h: 0.26 } }),
  row("P015", "Ryggsäck", "Väskor", "bag", "Svart", "#111111", 499, ["vinter", "vår", "sommar", "höst"], "skola och träning", { print: { cx: 0.49, cy: 0.42, w: 0.16, h: 0.11, ry: -18, bend: 30 } }),
  row("P016", "Sportbag", "Väskor", "bag", "Svart", "#111111", 549, ["vinter", "vår", "sommar", "höst"], "träning, cup och resor", { print: { cx: 0.52, cy: 0.57, w: 0.24, h: 0.12, ry: -10 } }),
  row("P017", "Datorfodral", "Väskor", "bag", "Svart", "#111111", 299, ["vinter", "vår", "sommar", "höst"], "kansli och sponsorer", { print: { cx: 0.48, cy: 0.43, w: 0.26, h: 0.17, rx: 18, ry: 8 } }),
  row("P018", "Kylväska", "Väskor", "bag", "Svart", "#111111", 399, ["sommar"], "picknick, sommarcup och utflykt", { print: { cx: 0.56, cy: 0.58, w: 0.22, h: 0.1, ry: -8 } }),
  row("P019", "Termosflaska", "Dryck", "drink", "Svart", "#111111", 349, ["höst", "vinter"], "kyla, läktare och ledare", { print: { cx: 0.49, cy: 0.56, w: 0.12, h: 0.16, rx: -4, bend: 110 } }),
  row("P020", "Vattenflaska", "Dryck", "drink", "Svart", "#111111", 199, ["vår", "sommar"], "träning, cup och värme", { print: { cx: 0.5, cy: 0.64, w: 0.17, h: 0.14, rx: -4, bend: 100 } }),
  row("P021", "Termosmugg", "Dryck", "drink", "Svart", "#111111", 279, ["höst", "vinter"], "kaffe på läktaren", { print: { cx: 0.44, cy: 0.64, w: 0.2, h: 0.2, rx: -8, bend: 110 } }),
  row("P022", "Mugg", "Dryck", "drink", "Vit", "#F4F3EF", 179, ["vinter", "vår", "sommar", "höst"], "kansli, fika och present", { print: { cx: 0.43, cy: 0.53, w: 0.3, h: 0.28, rx: -10, bend: 110 } }),
  row("P023", "Glasflaska", "Dryck", "drink", "Svart", "#111111", 229, ["vår", "sommar"], "träning och sommar", { print: { cx: 0.5, cy: 0.72, w: 0.16, h: 0.12, rx: -6, bend: 110 } }),
  row("P024", "Penna", "Kontor", "pen", "Svart", "#111111", 39, ["vinter", "vår", "sommar", "höst"], "kansli, lotter och skolstart", { print: { cx: 0.5, cy: 0.55, w: 0.2, h: 0.05, rz: -50 } }),
  row("P025", "Metallpenna", "Kontor", "pen", "Svart", "#111111", 99, ["vinter", "vår", "sommar", "höst"], "sponsorer och present", { print: { cx: 0.47, cy: 0.5, w: 0.18, h: 0.045, rz: -45 } }),
  row("P026", "Anteckningsbok", "Kontor", "book", "Svart", "#111111", 149, ["vinter", "vår", "sommar", "höst"], "ledare, möten och skolstart", { print: { cx: 0.44, cy: 0.42, w: 0.26, h: 0.22, ry: -12 } }),
  row("P027", "Skrivbordsmatta", "Kontor", "flat", "Svart", "#111111", 249, ["vinter", "vår", "sommar", "höst"], "kansli och sponsorer", { print: { cx: 0.5, cy: 0.42, w: 0.3, h: 0.2, rx: 58, rz: -22 } }),
  row("P028", "Nyckelband", "Kontor", "lanyard", "Svart", "#111111", 59, ["vinter", "vår", "sommar", "höst"], "cup, funktionärer och ackreditering", { print: { cx: 0.27, cy: 0.42, w: 0.22, h: 0.045, rz: 72 } }),
  row("P029", "Paraply", "Fritid", "umbrella", "Svart", "#111111", 349, ["höst", "vår"], "regn på läktaren", { print: { cx: 0.45, cy: 0.3, w: 0.2, h: 0.1, rx: -20, rz: -8 } }),
  row("P030", "Reflex", "Fritid", "flat", "Svart", "#111111", 39, ["höst", "vinter"], "mörker och skolväg", { print: { cx: 0.47, cy: 0.56, w: 0.2, h: 0.2 } }),
  row("P031", "Powerbank", "Teknik", "tech", "Svart", "#111111", 399, ["vinter", "vår", "sommar", "höst"], "resor och cup", { print: { cx: 0.52, cy: 0.38, w: 0.28, h: 0.17, rx: 52, rz: -22 } }),
  row("P032", "Laddkabel", "Teknik", "tech", "Svart", "#111111", 149, ["vinter", "vår", "sommar", "höst"], "resor", { print: { cx: 0.85, cy: 0.81, w: 0.07, h: 0.05 } }),
  row("P033", "Trådlös laddare", "Teknik", "tech", "Svart", "#111111", 299, ["vinter", "vår", "sommar", "höst"], "kansli och sponsorer", { print: { cx: 0.37, cy: 0.55, w: 0.22, h: 0.22, rx: 62 } }),
  row("P034", "Högtalare", "Teknik", "tech", "Svart", "#111111", 499, ["vår", "sommar"], "omklädningsrum, fest och avslutning", { print: { cx: 0.5, cy: 0.63, w: 0.24, h: 0.09, rx: -12, bend: 70 } }),
  row("P035", "Picknickfilt", "Fritid", "textile", "Svart", "#111111", 449, ["sommar"], "picknick, sommarcup och avslutning", { print: { cx: 0.6, cy: 0.56, w: 0.22, h: 0.2, rx: 55, rz: -15 } }),
  row("P036", "Badhandduk", "Fritid", "textile", "Vit", "#F4F3EF", 399, ["sommar"], "bad och sommarläger", { print: { cx: 0.44, cy: 0.63, w: 0.2, h: 0.07, rx: 20 } }),
  row("P037", "Förkläde", "Fritid", "top", "Svart", "#111111", 299, ["vinter", "vår", "sommar", "höst"], "kiosk, korvgrillning och fika", garment([0.418, 0.173, 0.17, 0.4])),
  row("P038", "Presentask", "Present", "box", "Svart", "#111111", 599, ["vinter"], "jul, tack och sponsorer", { print: { cx: 0.62, cy: 0.23, w: 0.26, h: 0.11, rz: 2 } }),
  row("P039", "Chokladask", "Present", "box", "Svart", "#111111", 149, ["vinter", "höst"], "jul, fars dag och tack", { print: { cx: 0.74, cy: 0.5, w: 0.17, h: 0.11, rx: 40, rz: 28 } }),
  row("P040", "Mässdisk", "Evenemang", "booth", "Svart", "#111111", 4990, ["vinter", "vår", "sommar", "höst"], "cup, mässa och evenemang", { print: { cx: 0.53, cy: 0.55, w: 0.42, h: 0.3, bend: 40 } }),
];

export const nwProduct = (id: string) => NW_CATALOG.find((p) => p.id === id);

export const CATEGORIES = [...new Set(NW_CATALOG.map((p) => p.category))];

export const seasonLabel = (s: Season[]) => (s.length === 4 ? "året runt" : s.join(", "));
