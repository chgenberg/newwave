import { BILAGA2, type Bilaga2Zone, type Technique } from "@/lib/newwave/bilaga2";
import { deltaE2000, hexToLab } from "@/lib/pantone";
import type { Variant } from "./emblem";

/**
 * Produkterna i Bilaga 2 med färgerna leverantörerna har och tryckytorna NWG markerat (se lib/newwave/bilaga2.ts, där
 * också måtten förklaras); måtten bekräftas mot leverantörens mall före produktion.
 * Varje produkt har en standarddesign – ensamstående klubbmärke eller ordmärke – vars variant följer plaggfärgen.
 */

export type ProductId = "tshirt" | "hoodie" | "keps" | "flaska" | "halsduk";
export type Method = Technique;
export type DesignArt = "klubbmarke" | "ordmarke" | "halsduk";

export type ProductColor = { id: string; name: string; hex: string; dark: boolean; /** Skärmen på tvåfärgade kepsar. */ visor?: string };
export type Placement = { zone: string; art: DesignArt; variant: Variant; method: Method; /** Motivet ryms i den här rutan, i mm. */ box: [number, number] };

export type GrasrotProduct = {
  id: ProductId;
  name: string;
  /** Namnet i butiken och i inläggen. */
  short: string;
  supplier: string;
  url?: string;
  article?: string;
  colors: ProductColor[];
  zones: Bilaga2Zone[];
  /** Standarddesignen på en färg. */
  design: (c: ProductColor) => Placement;
  /** Katalogprodukten vars 3D-modell visar produkten. */
  model?: string;
};

export const METHOD_TEXT: Record<Method, string> = {
  screentryck: "Screentryck",
  transfer: "Transfer",
  brodyr: "Brodyr",
  digitaltryck: "Digitaltryck",
  lasergravyr: "Lasergravyr",
  vavt: "Vävd jacquard",
};

const c = (id: string, name: string, hex: string, dark: boolean, visor?: string): ProductColor => ({ id, name, hex, dark, visor });

const UM_COLORS = [c("ash-grey", "Ash Grey Melange", "#BFC0C1", false), c("birch", "Birch", "#E6DFD0", false), c("navy", "Navy", "#1E2840", true), c("black", "Black", "#161616", true), c("charcoal", "Charcoal", "#46474B", true)];

export const GRASROT_PRODUCTS: GrasrotProduct[] = [
  {
    id: "tshirt",
    name: "UM T-shirt (OCS) Loose Fit Unisex",
    short: "T-shirt",
    supplier: "Untagged Movement",
    url: "https://www.untaggedmovement.com/products/um-t-shirt-ocs-loose-fit-unisex/",
    colors: UM_COLORS,
    zones: BILAGA2.tshirt,
    design: (col) => ({ zone: "brost", art: "ordmarke", variant: col.dark ? "negativ" : "original", method: "screentryck", box: [260, 300] }),
    model: "p001",
  },
  {
    id: "hoodie",
    name: "UM Hoodie (OCS-RCS) Loose Fit Unisex",
    short: "Hoodie",
    supplier: "Untagged Movement",
    url: "https://www.untaggedmovement.com/products/um-hoodie-ocs-rcs-loose-fit-unisex/",
    colors: UM_COLORS,
    zones: BILAGA2.hoodie,
    design: () => ({ zone: "brost", art: "klubbmarke", variant: "original", method: "transfer", box: [220, 175] }),
    model: "p004",
  },
  {
    id: "keps",
    name: "Washed Cap",
    short: "Keps",
    supplier: "New Wave Group",
    colors: [
      c("rod", "Röd", "#A8262C", true),
      c("gron", "Grön", "#1F4F37", true),
      c("gra", "Grå", "#9A9C9E", false),
      c("navy", "Navy", "#1F2A44", true),
      c("svart", "Svart", "#1A1A1A", true),
      c("khaki", "Khaki", "#B5A27C", false),
      c("vit-gron", "Vit/grön", "#EEEDE8", false, "#1F4F37"),
      c("vit-navy", "Vit/navy", "#EEEDE8", false, "#1F2A44"),
      c("khaki-svart", "Khaki/svart", "#B5A27C", false, "#1A1A1A"),
      c("gra-svart", "Grå/svart", "#9A9C9E", false, "#1A1A1A"),
    ],
    zones: BILAGA2.keps,
    design: () => ({ zone: "front", art: "klubbmarke", variant: "original", method: "brodyr", box: [90, 55] }),
    model: "p011",
  },
  {
    id: "flaska",
    name: "Thermo Bottle Ashton 500 ml",
    short: "Termosflaska",
    supplier: "Toppoint",
    article: "LT98882",
    url: "https://new.toppoint.com/en/shop/products/LT98882-thermo-bottle-ashton-500ml",
    colors: [
      c("white", "White", "#F1F1EF", false),
      c("black", "Black", "#1C1C1C", true),
      c("silver", "Silver", "#C3C5C7", false),
      c("dark-red", "Dark Red", "#6E1D24", true),
      c("dark-blue", "Dark Blue", "#1D2C56", true),
      c("light-blue", "Light Blue", "#86B6DA", false),
    ],
    zones: BILAGA2.flaska,
    // Gravyren tar fram stålet: den syns på lackade mörka flaskor, medan ljusa trycks digitalt i klubbens färger.
    design: (col) => (col.dark ? { zone: "front", art: "klubbmarke", variant: "solid", method: "lasergravyr", box: [45, 60] } : { zone: "front", art: "klubbmarke", variant: "original", method: "digitaltryck", box: [45, 60] }),
    model: "p019",
  },
  {
    id: "halsduk",
    name: "Woven Scarf",
    short: "Halsduk",
    supplier: "New Wave Group",
    colors: [c("klubb", "Klubbens färger", "#FFFFFF", false)],
    zones: BILAGA2.halsduk,
    design: () => ({ zone: "hel", art: "halsduk", variant: "original", method: "vavt", box: [1100, 150] }),
  },
];

export const grasrotProduct = (id: string) => GRASROT_PRODUCTS.find((p) => p.id === id) ?? null;
export const productColor = (p: GrasrotProduct, id: string) => p.colors.find((col) => col.id === id) ?? null;

/** Färgen herobilden och sociala medier visar: produktens färg närmast klubbens, med ljusa T-shirts mot mörka hoodies. */
export function featuredColor(p: GrasrotProduct, clubHex: string): ProductColor {
  if (p.id === "tshirt") return p.colors.find((col) => col.id === "birch")!;
  const pool = p.id === "hoodie" ? p.colors.filter((col) => col.dark) : p.colors.filter((col) => !col.visor);
  const lab = hexToLab(clubHex);
  return pool.reduce((best, col) => (deltaE2000(lab, hexToLab(col.hex)) < deltaE2000(lab, hexToLab(best.hex)) ? col : best));
}
