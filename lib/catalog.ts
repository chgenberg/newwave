import { NW_CATALOG } from "./newwave/catalog";
import type { CatalogProduct } from "./types";

export const CATALOG: CatalogProduct[] = [
  {
    id: "tee-white",
    name: "T-shirt, neutral etikett",
    kind: "tee",
    garmentColor: "Vit",
    garmentHex: "#F7F7F5",
    dark: false,
    priceSek: 299,
    sizes: ["110/116", "122/128", "134/140", "146/152", "XS", "S", "M", "L", "XL", "XXL"],
    printArea: { widthCm: 30, heightCm: 40, method: "DTG" },
  },
  {
    id: "tee-navy",
    name: "T-shirt, neutral etikett",
    kind: "tee",
    garmentColor: "Marinblå",
    garmentHex: "#15213B",
    dark: true,
    priceSek: 299,
    sizes: ["110/116", "122/128", "134/140", "146/152", "XS", "S", "M", "L", "XL", "XXL"],
    printArea: { widthCm: 30, heightCm: 40, method: "DTG" },
  },
  {
    id: "hoodie-navy",
    name: "Hoodie, neutral etikett",
    kind: "hoodie",
    garmentColor: "Marinblå",
    garmentHex: "#1A2A4A",
    dark: true,
    priceSek: 549,
    sizes: ["134/140", "146/152", "XS", "S", "M", "L", "XL", "XXL"],
    printArea: { widthCm: 28, heightCm: 35, method: "DTG" },
  },
  {
    id: "mug-white",
    name: "Mugg",
    kind: "mug",
    garmentColor: "Vit",
    garmentHex: "#FFFFFF",
    dark: false,
    priceSek: 199,
    sizes: ["One size"],
    printArea: { widthCm: 20, heightCm: 9, method: "Sublimering" },
  },
];

export const productById = (id: string) => CATALOG.find((p) => p.id === id);

/** Det som går att trycka på – IFK:s fyra produkter eller New Waves sortiment för klubbarna i hubben. */
export type Sellable = Omit<CatalogProduct, "kind"> & { kind: string; category?: string; seasons?: string[]; use?: string };

const NW_CLUBS = new Set(["asa-if"]);

/** `hub` när förfrågan kommer från hubben, där alla klubbar trycker på New Waves sortiment. */
export const catalogFor = (clubId: string, hub = false): Sellable[] => (hub || NW_CLUBS.has(clubId) ? NW_CATALOG : CATALOG);
