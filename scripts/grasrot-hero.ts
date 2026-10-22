// Kör: npx tsx scripts/grasrot-hero.ts [förenings-id ...]
// Tar herobilden för Gräsrot 360-föreningarna (alla utan id) och sparar den i assets/grasrot/<id>/herobild.jpg.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { GRASROT_CLUBS } from "../lib/newwave/grasrot/clubs";
import { generateHero, heroFile } from "../lib/newwave/grasrot/hero";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

async function main() {
  const queue = process.argv.slice(2).length ? process.argv.slice(2) : GRASROT_CLUBS.map((c) => c.id);
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const t = Date.now();
      try {
        const jpg = await generateHero(id);
        if (!jpg) throw new Error("okänd förening eller saknat märke");
        await writeFile(heroFile(id), jpg);
        console.log(`${id}: ${path.relative(process.cwd(), heroFile(id))} (${Math.round((Date.now() - t) / 1000)} s)`);
      } catch (e) {
        console.error(`${id}: ${e instanceof Error ? e.message : e}`);
        process.exitCode = 1;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

main();
