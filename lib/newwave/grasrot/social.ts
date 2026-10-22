import sharp from "sharp";
import { pathString } from "@/lib/newwave/vector/path";
import { type Flat, type Shape, toSvg } from "@/lib/newwave/vector/svg";
import { grasrotClub } from "./clubs";
import { emblemSet, NEGATIVE_INK } from "./emblem";
import { heroImage } from "./hero";
import { productMockup } from "./mockup";
import { featuredColor, GRASROT_PRODUCTS, METHOD_TEXT } from "./products";
import { textFlat } from "./scarf";
import { grasrotWordmark } from "./wordmark";

/**
 * Underlaget för sociala medier: herobilden först och sedan varje produkt, i flödets 4:5 och storyns 9:16. Text och
 * märken är vektor och produkterna samma bilder som webbshopen, så att inläggen visar exakt det som går att köpa.
 */

export const SOCIAL_FORMATS = { feed: { w: 1080, h: 1350, label: "Flöde 4:5" }, story: { w: 1080, h: 1920, label: "Story 9:16" } } as const;
export type SocialFormat = keyof typeof SOCIAL_FORMATS;
export type Slide = { name: string; title: string; jpg: Buffer };

const PAPER = "#FFFFFF";
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

  const heroH = story ? 760 : 620;
  const markH = story ? 470 : 330;
  const top = story ? 200 : 70;
  const slides: Slide[] = [];
  if (!only || only === slideName(0, "herobild")) {
    const first = [
      open,
      `<rect width="${W}" height="${H}" fill="${base}"/>`,
      place(negativ.flat, 140, top, W - 280, markH),
      image(hero.jpg, 0, top + markH + (story ? 90 : 50), W, heroH, true),
      await text("Klubbkollektionen", "archivo-black", 90, H - (story ? 330 : 205), W - 180, story ? 78 : 64, NEGATIVE_INK),
      await text(`Gräsrot 360 · ${club.name}`, "oswald-bold", 90, H - (story ? 220 : 120), W - 180, story ? 46 : 40, NEGATIVE_INK),
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
    const size = story ? 1000 : 920;
    const y = story ? 300 : 150;
    const design = p.design(color);
    const sub = p.id === "halsduk" ? `110 × 15 cm · ${METHOD_TEXT[design.method]}` : `${color.name} · ${METHOD_TEXT[design.method]}`;
    const svg = [
      open,
      `<rect width="${W}" height="${H}" fill="${PAPER}"/>`,
      image(mock, (W - size) / 2, y, size, size),
      place(set.original, 60, story ? 110 : 40, 96, 96),
      await text("Gräsrot 360", "oswald-bold", W - 380, story ? 140 : 70, 320, 34, base),
      await text(p.short, "archivo-black", 90, y + size + (story ? 120 : 40), W - 180, story ? 96 : 76, base),
      await text(sub, "oswald-bold", 90, y + size + (story ? 250 : 136), W - 180, story ? 44 : 36, "#5B5B57"),
      `<rect x="0" y="${H - 14}" width="${W}" height="14" fill="${base}"/>`,
      "</svg>",
    ].join("");
    slides.push({ name, title: p.short, jpg: await render(svg) });
  }
  return slides;
}
