// Kör: npx tsx scripts/build-product-library.ts [produkt-id ...]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MERCH, type ProductLibrary } from "../lib/merch";
import { editWithMask, generatePhoto } from "../lib/openai";
import { detectMarker } from "../lib/photoComposite";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

const OUT = path.join(process.cwd(), "public", "products");
const LIBRARY = path.join(OUT, "library.json");

const STUDIO =
  "Professional e-commerce studio product photo on a seamless pure white background (#FFFFFF), soft even studio lighting, a subtle soft contact shadow, the product centred and filling about 75% of the frame. Photorealistic, crisp, premium catalogue quality. No text, no logos, no brand marks, no people.";
const MARKER =
  "Exactly one flat, solid, pure bright green (#00FF00) rectangle marks the print area, following the surface of the product. The rectangle has no texture, text or pattern, and there is no other green anywhere in the image.";

async function build(id: string) {
  const p = MERCH.find((m) => m.id === id)!;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await generatePhoto(`${STUDIO}\nProduct: ${p.prompt}.\n${MARKER}`, "1024x1024");
    const marker = await detectMarker(raw);
    if (!marker) {
      console.log(`${id}: ingen markering, försök ${attempt}`);
      continue;
    }
    const blank = await editWithMask(
      await sharp(raw).png().toBuffer(),
      marker.maskPng,
      "Replace the masked green rectangle with the plain, unprinted surface of the product, continuing its material, colour, curvature, reflections and shading seamlessly. Keep everything else identical. No print, no graphics, no text.",
      "1024x1024",
    );
    if (await detectMarker(blank)) {
      console.log(`${id}: grönt kvar efter redigering, försök ${attempt}`);
      continue;
    }
    await writeFile(path.join(OUT, `${id}.jpg`), await sharp(blank).jpeg({ quality: 88 }).toBuffer());
    console.log(`${id}: klar`, marker.box);
    return { width: marker.width, height: marker.height, box: marker.box };
  }
  throw new Error(`${id}: misslyckades`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const library: ProductLibrary = JSON.parse(await readFile(LIBRARY, "utf8").catch(() => "{}"));
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : MERCH.map((m) => m.id);
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        library[id] = await build(id);
        await writeFile(LIBRARY, JSON.stringify(library, null, 2));
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

main();
