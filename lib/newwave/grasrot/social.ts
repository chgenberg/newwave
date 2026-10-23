import sharp from "sharp";
import { pathString } from "@/lib/newwave/vector/path";
import { type Flat, type Shape, toSvg } from "@/lib/newwave/vector/svg";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { type GrasrotClub, grasrotClub } from "./clubs";
import { emblemSet, NEGATIVE_INK } from "./emblem";
import { heroImage } from "./hero";
import { productMockup } from "./mockup";
import { featuredColor, GRASROT_PRODUCTS, type ProductColor, type ProductId } from "./products";
import { textFlat } from "./scarf";
import { grasrotWordmark } from "./wordmark";

/**
 * Underlaget för sociala medier: herobilden först och sedan varje produkt, i flödets 4:5 och storyns 9:16. Text och
 * märken är vektor och produkterna samma bilder som webbshopen, så att inläggen visar exakt det som går att köpa.
 * Storyns text och märken ligger inom Instagrams säkra yta (y 250–1670), utanför profilraden och svarsfältet.
 */

export const SOCIAL_FORMATS = { feed: { w: 1080, h: 1350, label: "Flöde 4:5" }, story: { w: 1080, h: 1920, label: "Story 9:16" } } as const;
export type SocialFormat = keyof typeof SOCIAL_FORMATS;
export type Slide = { name: string; title: string; jpg: Buffer };

const PAPER = "#FFFFFF";
/** Leverantörernas färgnamn på svenska; kepsarnas namn är redan svenska. */
const COLOR_SV: Record<string, string> = {
  "Ash Grey Melange": "Gråmelerad",
  Birch: "Naturvit",
  Navy: "Marinblå",
  Black: "Svart",
  Charcoal: "Koksgrå",
  White: "Vit",
  Silver: "Silver",
  "Dark Red": "Mörkröd",
  "Dark Blue": "Mörkblå",
  "Light Blue": "Ljusblå",
};
export const colorSv = (c: ProductColor) => COLOR_SV[c.name] ?? c.name;
const paths = (shapes: Shape[]) => shapes.map((s) => `<path d="${pathString(s.segs, 1)}" fill="${s.fill}"${s.rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`).join("");
/** Vektorn inpassad i rutan, centrerad. */
const place = (flat: Flat, x: number, y: number, w: number, h: number) =>
  `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${[flat.box.x, flat.box.y, flat.box.w, flat.box.h].join(" ")}" preserveAspectRatio="xMidYMid meet">${toSvg(flat).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
const image = (jpg: Buffer, x: number, y: number, w: number, h: number, slice = false) =>
  `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid ${slice ? "slice" : "meet"}" href="data:image/jpeg;base64,${jpg.toString("base64")}"/>`;
const text = async (t: string, font: string, x: number, y: number, w: number, h: number, fill: string) => paths(await textFlat(t, font, { x, y, w, h }, fill));

async function render(svg: string) {
  return sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

export const slideName = (i: number, slide: string) => `${String(i + 1).padStart(2, "0")}-${slide}`;
/** Bildernas namn i ordning: herobilden och sedan varje produkt. */
export const SOCIAL_SLIDES = ["herobild", ...GRASROT_PRODUCTS.map((p) => p.id)].map((s, i) => slideName(i, s));

/** Bilderna i formatet, i ordning: herobilden och sedan produkterna; `only` bygger bara bilden med det namnet. */
export async function socialSlides(id: string, format: SocialFormat, only?: string): Promise<Slide[] | null> {
  const club = grasrotClub(id);
  const [hero, negativ, set] = await Promise.all([heroImage(id), grasrotWordmark(id, "negativ"), emblemSet(id)]);
  if (!club || !hero || !negativ || !set) return null;
  const { w: W, h: H } = SOCIAL_FORMATS[format];
  const story = format === "story";
  const base = negativ.colors[0];
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  const markH = story ? 380 : 330;
  const top = story ? 270 : 70;
  const slides: Slide[] = [];
  if (!only || only === slideName(0, "herobild")) {
    const first = [
      open,
      `<rect width="${W}" height="${H}" fill="${base}"/>`,
      place(negativ.flat, 140, top, W - 280, markH),
      // Storyn visar hela fotot (1920 × 1080 blir 1080 × 608); flödet beskär det knappt.
      image(hero.jpg, 0, top + markH + (story ? 80 : 50), W, story ? 608 : 620, !story),
      await text("Klubbkollektionen", "archivo-black", 90, story ? 1400 : H - 205, W - 180, story ? 78 : 64, NEGATIVE_INK),
      await text(`Nu i klubbshoppen · ${club.name}`, "oswald-bold", 90, story ? 1515 : H - 120, W - 180, story ? 46 : 40, NEGATIVE_INK),
      "</svg>",
    ].join("");
    slides.push({ name: slideName(0, "herobild"), title: "Herobild", jpg: await render(first) });
  }

  for (const [i, p] of GRASROT_PRODUCTS.entries()) {
    const name = slideName(i + 1, p.id);
    if (only && only !== name) continue;
    const color = featuredColor(p, base);
    const mock = await productMockup(id, p, color, 90);
    if (!mock) continue;
    const size = story ? 960 : 920;
    const y = story ? 400 : 150;
    const sub = `${p.id === "halsduk" ? "Vävd · 110 × 15 cm" : colorSv(color)} · Beställ i klubbshoppen`;
    const svg = [
      open,
      `<rect width="${W}" height="${H}" fill="${PAPER}"/>`,
      image(mock, (W - size) / 2, y, size, size),
      place(set.original, 60, story ? 270 : 40, 96, 96),
      await text("Gräsrot 360", "oswald-bold", W - 380, story ? 300 : 70, 320, 34, base),
      await text(p.short, "archivo-black", 90, y + size + 40, W - 180, story ? 90 : 76, base),
      await text(sub, "oswald-bold", 90, y + size + (story ? 150 : 136), W - 180, story ? 44 : 36, "#5B5B57"),
      `<rect x="0" y="${H - 14}" width="${W}" height="14" fill="${base}"/>`,
      "</svg>",
    ].join("");
    slides.push({ name, title: p.short, jpg: await render(svg) });
  }
  return slides;
}

const PRODUCT_TEXT: Record<ProductId, (club: GrasrotClub) => string> = {
  tshirt: (club) => `T-shirten med ${genitive(club.name)} wordmark, screentryckt på bröstet. Loose fit i fem färger.`,
  hoodie: (club) => `Hoodien med klubbmärket på bröstet – för kalla kvällar ${club.sport === "Innebandy" ? "i hallen" : "vid planen"}. Loose fit i fem färger.`,
  keps: () => "Washed cap med broderat klubbmärke. Tio färger att välja mellan, några med kontrastskärm.",
  flaska: () => "Termosflaskan på 500 ml med klubbmärket – tryckt på de ljusa flaskorna, lasergraverat på de mörka. Kaffet håller sig varmt hela matchen.",
  halsduk: () => "Den vävda halsduken i klubbens färger, 110 × 15 cm. Läktarens viktigaste plagg.",
};

/** En färdig bildtext till varje inlägg, i samma ordning som bilderna. */
export function captions(club: GrasrotClub): { slide: string; text: string }[] {
  const tags = `#${club.name.replace(/\s+/g, "")} #Gräsrot360`;
  const cta = "Beställ i klubbshoppen – länk i bion.";
  return [
    { slide: SOCIAL_SLIDES[0], text: `Sommarfest vid klubbstugan – och nu finns ${genitive(club.name)} klubbkollektion i klubbshoppen: t-shirt, hoodie, keps, termosflaska och halsduk. Varje köp stöttar föreningen. ${cta} ${tags}` },
    ...GRASROT_PRODUCTS.map((p, i) => ({ slide: SOCIAL_SLIDES[i + 1], text: `${PRODUCT_TEXT[p.id](club)} ${cta} ${tags}` })),
  ];
}

export const captionText = (club: GrasrotClub) =>
  `${club.name} – bildtexter till inläggen\n\n${captions(club)
    .map((c) => `${c.slide}\n${c.text}`)
    .join("\n\n")}\n`;
