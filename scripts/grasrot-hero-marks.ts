// Kör: npx tsx scripts/grasrot-hero-marks.ts <förenings-id> '[["keps", 643, 857, 94, 94], ...]'
// Mäter upp klubbmärkena på föreningens herobild utifrån en ungefärlig mitt, bredd och höjd per märke (i bildpunkter, på
// produkten som står först) och sparar dem i assets/grasrot/<id>/herobild-marken.json. Körs om när fotot tas om.
// Ett sjätte värde `true` tar måtten som de är, för märken som mätningen inte hittar (vridning som sjunde värde).
// Hoodiens snören (`front` på hoodiemärket) skrivs över av en ny mätning och läggs in för hand efteråt.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { emblemSet } from "../lib/newwave/grasrot/emblem";
import { heroPhoto, heroImage } from "../lib/newwave/grasrot/hero";
import { type HeroMark, markArt, marksFile, measureMark } from "../lib/newwave/grasrot/heroMarks";
import { GRASROT_PRODUCTS, type ProductId } from "../lib/newwave/grasrot/products";

async function main() {
  const [id, list] = process.argv.slice(2);
  const [photo, hero] = [await heroPhoto(id), await heroImage(id)];
  if (!photo || !hero) throw new Error(`${id}: ingen herobild`);
  const { data, info } = await sharp(photo).greyscale().raw().toBuffer({ resolveWithObject: true });
  const gray = Float32Array.from(data, (v) => v / 255);
  const marks: HeroMark[] = [];
  for (const [product, cx, cy, w, h, fixed, rz = 0] of JSON.parse(list) as [ProductId, number, number, number, number, boolean?, number?][]) {
    if (fixed) {
      marks.push({ product, cx, cy, w, h, rz });
      continue;
    }
    const p = GRASROT_PRODUCTS.find((x) => x.id === product)!;
    // Bildmodellen ritar halsdukens märken ibland i färg och ibland vita som väven; de mäts mot båda.
    const set = await emblemSet(id);
    const flats = (product === "halsduk" ? [set?.original, set?.negativ] : [await markArt(id, p, hero.info.colors[product])]).filter((f) => f != null);
    if (!flats.length) throw new Error(`${id}: inget märke för ${product}`);
    const tries = await Promise.all(flats.map((f) => measureMark(gray, info.width, info.height, { product, cx, cy, w, h, rz: 0 }, f)));
    const { score, ...m } = tries.reduce((a, b) => (b.score > a.score ? b : a));
    console.log(`${id} ${product}: ${JSON.stringify(m)} träff ${score}${score < 0.5 ? "  ← kontrollera" : ""}`);
    marks.push(m);
  }
  await writeFile(marksFile(id), `${JSON.stringify(marks, null, 1)}\n`);
  console.log(path.relative(process.cwd(), marksFile(id)));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
