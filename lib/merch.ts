export type MerchFinish = "print" | "engrave" | "etch";
export type MerchArt = "print" | "crest";
export type MerchSurface =
  | { kind: "flat" }
  | { kind: "fabric"; folds: number }
  // radius: the body's visible half-width as a multiple of box.w. sag: ellipse minor/major ratio of a horizontal band.
  | { kind: "cylinder"; sag: number; radius: number };

export type MerchProduct = {
  id: string;
  name: string;
  priceSek: number;
  finish: MerchFinish;
  art: MerchArt;
  variant: "light" | "dark";
  surface: MerchSurface;
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
    surface: { kind: "fabric", folds: 1 },
    prompt: "a plain white crew-neck cotton t-shirt, front view, shown on an invisible ghost mannequin, natural fabric folds. The print area is a portrait rectangle (3:4) covering the chest",
  },
  {
    id: "hoodie",
    name: "Hoodie",
    priceSek: 549,
    finish: "print",
    art: "print",
    variant: "dark",
    surface: { kind: "fabric", folds: 0.8 },
    prompt: "a plain navy blue (#1A2A4A) pullover hoodie with hood and kangaroo pocket, front view on an invisible ghost mannequin. The print area is a portrait rectangle (3:4) on the chest above the pocket",
  },
  {
    id: "keps",
    name: "Keps",
    priceSek: 249,
    finish: "print",
    art: "crest",
    variant: "dark",
    surface: { kind: "cylinder", sag: 0.3, radius: 0.9 },
    prompt: "a plain navy blue six-panel baseball cap with curved brim, three-quarter front view. The print area is a small landscape rectangle on the front panel above the brim",
  },
  {
    id: "kaffekopp",
    name: "Kaffekopp",
    priceSek: 179,
    finish: "engrave",
    art: "print",
    variant: "light",
    surface: { kind: "cylinder", sag: 0.34, radius: 0.83 },
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
    surface: { kind: "cylinder", sag: 0.32, radius: 0.72 },
    prompt: "a white enamel camping mug with a black rolled rim and a handle on the right, side view. The print area is a square on the front of the mug",
  },
  {
    id: "yeti",
    name: "Yeti-mugg",
    priceSek: 399,
    finish: "engrave",
    art: "print",
    variant: "light",
    surface: { kind: "cylinder", sag: 0.22, radius: 0.7 },
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
    surface: { kind: "cylinder", sag: 0.16, radius: 0.65 },
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
    surface: { kind: "cylinder", sag: 0.22, radius: 0.66 },
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
    surface: { kind: "flat" },
    prompt: "a white hardcover A5 notebook with a white elastic closure band on the right edge, standing upright, slightly angled, front cover facing camera. The print area is a portrait rectangle covering most of the front cover",
  },
  {
    id: "powerbank",
    name: "Powerbank",
    priceSek: 299,
    finish: "print",
    art: "print",
    variant: "dark",
    surface: { kind: "flat" },
    prompt: "a slim matte black rectangular powerbank lying flat, seen from above at a slight angle, rounded corners. The print area is a rectangle covering most of the top surface",
  },
  {
    id: "isskrapa",
    name: "Isskrapa",
    priceSek: 79,
    finish: "print",
    art: "print",
    variant: "light",
    surface: { kind: "flat" },
    prompt: "a flat square white plastic car ice scraper with a straight blade edge, lying flat, seen from above at a slight angle. The print area is a square covering most of the scraper",
  },
  {
    id: "filt",
    name: "Filt",
    priceSek: 499,
    finish: "print",
    art: "print",
    variant: "light",
    surface: { kind: "fabric", folds: 1.3 },
    prompt: "a soft cream white fleece throw blanket hanging neatly over a simple light wooden ladder, front view, gentle folds. The print area is a large portrait rectangle on the front of the hanging blanket",
  },
];

export type LibraryEntry = {
  width: number;
  height: number;
  box: { x: number; y: number; w: number; h: number };
  /** Print surface corners TL, TR, BR, BL for flat products shot at an angle. */
  quad?: [number, number][];
};
export type ProductLibrary = Record<string, LibraryEntry>;

/** Products that only the neutral logo page uses; not part of the club collages. */
export const EXTRA_MERCH: MerchProduct[] = [
  {
    id: "paraply",
    name: "Paraply",
    priceSek: 349,
    finish: "print",
    art: "print",
    variant: "dark",
    surface: { kind: "fabric", folds: 0.5 },
    prompt: "a large black golf umbrella, fully opened, seen straight from the front and slightly below so the canopy fills the frame, the straight black handle visible underneath. The print area is a landscape rectangle (3:2) in the middle of the canopy panel that faces the camera",
  },
];

