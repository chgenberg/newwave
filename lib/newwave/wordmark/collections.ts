import type { NwProduct } from "@/lib/newwave/catalog";
import { defaultDesign, type Design } from "@/lib/newwave/marking";

/**
 * Kollektioner: ett mallpaket som ger hela sortimentet samma stil på en gång – rätt mall per produkt, och den lilla
 * versionen av sig själv där trycket är litet. Varje klubb får paketet med sitt namn, sina färger och sitt märke.
 */
export type WordmarkCollection = { id: string; name: string; blurb: string; worn?: boolean; items: { product: string; template: string }[] };

export const COLLECTIONS: WordmarkCollection[] = [
  {
    id: "vintage",
    name: "Vintage",
    blurb: "Skrivstil och rutband i slitet tryck – som en gammal supportertröja.",
    worn: true,
    items: [
      { product: "p001", template: "retro-skript" },
      { product: "p004", template: "svansen" },
      { product: "p011", template: "baseboll" },
      { product: "p014", template: "skriptbage" },
      { product: "p022", template: "rutskript" },
    ],
  },
  {
    id: "campus",
    name: "Campus",
    blurb: "Collegetryck i en färg: namnet i båge, årtalet och sporten.",
    items: [
      { product: "p005", template: "campus" },
      { product: "p001", template: "akademi" },
      { product: "p004", template: "universitet" },
      { product: "p011", template: "monogram" },
      { product: "p012", template: "monogram" },
    ],
  },
  {
    id: "hockey",
    name: "Hockey",
    blurb: "Kapslar, ränder och pucken – för kalla kvällar på läktaren.",
    items: [
      { product: "p004", template: "hockeyranderna" },
      { product: "p002", template: "kapsel" },
      { product: "p012", template: "puck" },
      { product: "p021", template: "stadion" },
      { product: "p028", template: "kapselbage" },
    ],
  },
  {
    id: "emblem",
    name: "Emblem",
    blurb: "Märket i centrum med krans, sköld och banderoll.",
    items: [
      { product: "p003", template: "lagerkrans" },
      { product: "p004", template: "emblem" },
      { product: "p001", template: "banderoll" },
      { product: "p015", template: "liggande" },
      { product: "p026", template: "skold" },
    ],
  },
];

export const findCollection = (id: string) => COLLECTIONS.find((c) => c.id === id);

export const collectionDesign = (c: WordmarkCollection, template: string, p: NwProduct): Design => ({
  ...defaultDesign(p),
  wordmark: { template, icon: true, ornament: true, ...(c.worn ? { worn: true } : {}) },
});
