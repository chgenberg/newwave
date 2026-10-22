import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { toFile } from "openai";
import sharp from "sharp";
import { IMAGE_MODEL, openai } from "@/lib/openai";
import { grasrotClub } from "./clubs";
import { heroMarks, marksFile, stampMarks } from "./heroMarks";
import { productMockup } from "./mockup";
import { featuredColor, GRASROT_PRODUCTS, type ProductColor, type ProductId } from "./products";
import { grasrotWordmark } from "./wordmark";

/**
 * Herobilden: föreningens produkter på klubbstugans veranda under sommarfesten. Bildmodellen fotograferar scenen med
 * webbshopens produktbilder som förlaga, så att plaggfärgerna och trycket är desamma som i butiken. Bilden tas en gång
 * per förening med scripts/grasrot-hero.ts. Bildmodellens klubbmärken byts sedan mot tryckfilernas (se heroMarks.ts);
 * tryckfilerna och produktbilderna ritas aldrig av bildmodellen.
 */

export const HERO_SIZE: [number, number] = [1920, 1080];
export const heroFile = (id: string) => path.join(process.cwd(), "assets", "grasrot", id, "herobild.jpg");

export type HeroInfo = { colors: Record<string, ProductColor> };

async function heroColors(id: string): Promise<HeroInfo["colors"] | null> {
  const wordmark = await grasrotWordmark(id, "original");
  if (!wordmark) return null;
  return Object.fromEntries(GRASROT_PRODUCTS.map((p) => [p.id, featuredColor(p, wordmark.colors[0])]));
}

const stamped = new Map<string, Promise<Buffer>>();

/** Herobilden som JPEG i 1920 × 1080, och vilka färger produkterna har; null tills föreningens bild är tagen. */
export async function heroImage(id: string): Promise<{ jpg: Buffer; info: HeroInfo } | null> {
  const [photo, marks, colors] = await Promise.all([stat(heroFile(id)).catch(() => null), stat(marksFile(id)).catch(() => null), heroColors(id)]);
  if (!photo || !colors) return null;
  const key = `${id}:${photo.mtimeMs}:${marks?.mtimeMs ?? 0}`;
  let jpg = stamped.get(key);
  if (!jpg) {
    jpg = Promise.all([readFile(heroFile(id)), heroMarks(id)]).then(([src, list]) => stampMarks(src, id, GRASROT_PRODUCTS, colors, list));
    jpg.catch(() => stamped.get(key) === jpg && stamped.delete(key));
    stamped.set(key, jpg);
  }
  return { jpg: await jpg, info: { colors } };
}

/** Bildmodellens foto, innan märkena byts. */
export const heroPhoto = (id: string) => readFile(heroFile(id)).catch(() => null);

const WHERE: Record<ProductId, string> = {
  hoodie: "hangs on a wooden hanger from the veranda beam, front facing the camera",
  tshirt: "hangs on a wooden hanger next to the hoodie, front facing the camera",
  keps: "lies on a rustic wooden table in front of the garments, front panel facing the camera",
  flaska: "stands upright on the same table next to the cap, print facing the camera",
  halsduk: "is draped horizontally along the veranda railing beside the garments, fully unfolded so the whole design is readable",
};

const SETTING: Record<string, string> = {
  Fotboll: "right next to a natural grass football pitch; in the soft background a full-size goal stands on the pitch",
  Innebandy: "next to the club's sports hall; in the soft background floorball sticks lean against the clubhouse wall and a small floorball goal stands on the lawn",
};

const prompt = (club: string, sport: string, parts: string[]) => `Hyperrealistic editorial lifestyle photograph for a sports brand campaign, indistinguishable from a real photo. Shot on a full-frame camera, 35 mm lens, f/2.8, natural warm golden-hour sunlight, subtle film grain, true-to-life colours and fabric textures.

Setting: the summer party ("sommarfest") of ${club}, a Swedish grassroots sports club, on the wooden veranda of the club's traditional falu-red clubhouse with white trim, ${SETTING[sport] ?? SETTING.Fotboll}. Softly blurred background: string lights, birch trees, a few club members chatting far away (out of focus, no faces visible). Relaxed, warm, community feeling.

The products from the reference images are the heroes, sharp and in focus, arranged in the centre of the frame:
${parts.map((p) => `- ${p}`).join("\n")}

Composition: landscape, with clear space above the hanger hooks and the hood and the table top visible at the bottom, so the image can be cropped to 16:9 without cutting any product.

Every logo, emblem, wordmark and printed text on the products must be reproduced exactly as in the reference images: same shapes, letters, colours, proportions and placement. Do not redraw, simplify, translate, misspell or add any text, logos or brand marks anywhere else in the image. Garments keep their exact colours from the references. No watermark.`;

/** Tar en ny herobild med bildmodellen, i 1920 × 1080. */
export async function generateHero(id: string): Promise<Buffer | null> {
  const [club, colors] = [grasrotClub(id), await heroColors(id)];
  if (!club || !colors) return null;
  const order: ProductId[] = ["hoodie", "tshirt", "keps", "flaska", "halsduk"];
  const refs: Buffer[] = [];
  const parts: string[] = [];
  for (const pid of order) {
    const product = GRASROT_PRODUCTS.find((p) => p.id === pid)!;
    const jpg = await productMockup(id, product, colors[pid], 92);
    if (!jpg) return null;
    refs.push(jpg);
    parts.push(`The ${product.short.toLowerCase()} (reference image ${refs.length}) ${WHERE[pid]}.`);
  }
  const res = await openai().images.edit({
    model: IMAGE_MODEL,
    image: await Promise.all(refs.map((b, i) => toFile(b, `produkt-${i + 1}.jpg`, { type: "image/jpeg" }))),
    prompt: prompt(club.name, club.sport, parts),
    size: "1536x1024",
    quality: "high",
    output_format: "png",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  const [W, H] = HERO_SIZE;
  return sharp(Buffer.from(b64, "base64")).resize(W, H, { fit: "cover", kernel: "lanczos3" }).sharpen({ sigma: 0.5 }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
