export type MerchFinish = "print" | "engrave" | "etch";
export type MerchArt = "print" | "crest";

export type MerchProduct = {
  id: string;
  name: string;
  priceSek: number;
  finish: MerchFinish;
  art: MerchArt;
  variant: "light" | "dark";
  curved: boolean;
  engraveInk?: string;
  prompt: string;
};

export const MERCH: MerchProduct[] = [
  {
    id: "tee",
    name: "T-shirt",
    priceSek: 299,
    finish: "print",
    art: "print",
    variant: "light",
    curved: false,
    prompt: "a plain white crew-neck cotton t-shirt, front view, shown on an invisible ghost mannequin, natural fabric folds. The print area is a portrait rectangle (3:4) covering the chest",
  },
  {
    id: "hoodie",
    name: "Hoodie",
    priceSek: 549,
    finish: "print",
    art: "print",
    variant: "dark",
    curved: false,
    prompt: "a plain navy blue (#1A2A4A) pullover hoodie with hood and kangaroo pocket, front view on an invisible ghost mannequin. The print area is a portrait rectangle (3:4) on the chest above the pocket",
  },
  {
    id: "keps",
    name: "Keps",
    priceSek: 249,
    finish: "print",
    art: "crest",
    variant: "dark",
    curved: false,
    prompt: "a plain navy blue six-panel baseball cap with curved brim, three-quarter front view. The print area is a small landscape rectangle on the front panel above the brim",
  },
  {
    id: "kaffekopp",
    name: "Kaffekopp",
    priceSek: 179,
    finish: "engrave",
    art: "print",
    variant: "light",
    curved: true,
    engraveInk: "rgba(252,252,253,0.95)",
    prompt: "a matte light grey ceramic coffee cup with a handle on the right, side view. The print area is a square on the front of the cup",
  },
  {
    id: "emaljmugg",
    name: "Emaljmugg",
    priceSek: 199,
    finish: "print",
    art: "print",
    variant: "light",
    curved: true,
    prompt: "a white enamel camping mug with a black rolled rim and a handle on the right, side view. The print area is a square on the front of the mug",
  },
  {
    id: "yeti",
    name: "Yeti-mugg",
    priceSek: 399,
    finish: "engrave",
    art: "print",
    variant: "light",
    curved: true,
    engraveInk: "rgba(118,122,130,0.62)",
    prompt: "a tall white insulated 40 oz travel tumbler with a large handle on the right, a clear lid with a straw and a thin steel ring under the lid, side view. The print area is a tall portrait rectangle on the front of the body",
  },
  {
    id: "termos",
    name: "Termos",
    priceSek: 349,
    finish: "engrave",
    art: "print",
    variant: "light",
    curved: true,
    engraveInk: "rgba(118,122,130,0.62)",
    prompt: "a white powder-coated stainless steel water bottle with a bamboo lid and a steel carry handle, standing upright, front view. The print area is a portrait rectangle on the middle of the bottle",
  },
  {
    id: "dricksglas",
    name: "Dricksglas",
    priceSek: 129,
    finish: "etch",
    art: "print",
    variant: "light",
    curved: true,
    engraveInk: "rgba(168,174,182,0.85)",
    prompt: "an empty clear tall highball drinking glass, front view, subtle reflections. The print area is a portrait rectangle on the front of the glass",
  },
  {
    id: "anteckningsbok",
    name: "Anteckningsbok",
    priceSek: 149,
    finish: "print",
    art: "print",
    variant: "light",
    curved: false,
    prompt: "a white hardcover A5 notebook with a white elastic closure band on the right edge, standing upright, slightly angled, front cover facing camera. The print area is a portrait rectangle covering most of the front cover",
  },
  {
    id: "powerbank",
    name: "Powerbank",
    priceSek: 299,
    finish: "print",
    art: "print",
    variant: "dark",
    curved: false,
    prompt: "a slim matte black rectangular powerbank lying flat, seen from above at a slight angle, rounded corners. The print area is a rectangle covering most of the top surface",
  },
  {
    id: "isskrapa",
    name: "Isskrapa",
    priceSek: 79,
    finish: "print",
    art: "print",
    variant: "light",
    curved: false,
    prompt: "a flat square white plastic car ice scraper with a straight blade edge, lying flat, seen from above at a slight angle. The print area is a square covering most of the scraper",
  },
  {
    id: "filt",
    name: "Filt",
    priceSek: 499,
    finish: "print",
    art: "print",
    variant: "light",
    curved: false,
    prompt: "a soft cream white fleece throw blanket hanging neatly over a simple light wooden ladder, front view, gentle folds. The print area is a large portrait rectangle on the front of the hanging blanket",
  },
];

export type LibraryEntry = { width: number; height: number; box: { x: number; y: number; w: number; h: number } };
export type ProductLibrary = Record<string, LibraryEntry>;
