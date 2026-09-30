import { EXTRA_MERCH, MERCH, type MerchProduct } from "./merch";

export type LogoProduct = MerchProduct & { blurb: string };

const BLURBS: Record<string, string> = {
  tee: "Ekologisk bomull, tryck på bröstet",
  hoodie: "Tjock collegekvalitet, marinblå",
  keps: "Brodyr på framsidan",
  paraply: "Golfparaply, 130 cm",
  kaffekopp: "Keramik, matt ljusgrå",
  emaljmugg: "Emalj med svart kant",
  yeti: "Isolerad mugg med sugrör, 1,2 l",
  termos: "Stålflaska med bambulock",
  anteckningsbok: "A5, hårda pärmar",
  filt: "Mjuk fleece, 130 × 170 cm",
};

export const LOGO_PRODUCT_IDS = Object.keys(BLURBS);

const baseOf = (id: string) => [...MERCH, ...EXTRA_MERCH].find((m) => m.id === id)!;

export const LOGO_PRODUCTS: LogoProduct[] = LOGO_PRODUCT_IDS.map((id) => ({ ...baseOf(id), finish: "print" as const, blurb: BLURBS[id] }));

export type LogoFinish = "print" | "engrave";

/** Products that can be ordered either colour printed or laser engraved. */
export const ENGRAVABLE = ["kaffekopp", "yeti", "termos"];

export function withFinish(p: LogoProduct, finish: LogoFinish): LogoProduct {
  if (finish !== "engrave" || !ENGRAVABLE.includes(p.id)) return p;
  const base = baseOf(p.id);
  return { ...p, finish: "engrave", engraveInk: base.engraveInk };
}

export function engraveInkFor(id: string): [number, number, number, number] {
  const [r, g, b, a = 1] = (baseOf(id).engraveInk ?? "rgba(120,120,125,0.6)").match(/[\d.]+/g)!.map(Number);
  return [r, g, b, a];
}
