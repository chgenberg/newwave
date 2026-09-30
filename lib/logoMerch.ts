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

export const LOGO_PRODUCTS: LogoProduct[] = LOGO_PRODUCT_IDS.map((id) => {
  const base = [...MERCH, ...EXTRA_MERCH].find((m) => m.id === id)!;
  return { ...base, finish: "print" as const, blurb: BLURBS[id] };
});
