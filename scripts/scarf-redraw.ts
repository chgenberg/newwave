/**
 * Ritar om förhandsbilderna för halsdukarna som redan ligger i inspirationsbanken och i demokollektionen, utan att
 * anropa någon modell. Används när stickmotorn har ändrats (till exempel marginaler eller ändrader), så att bilderna
 * visar det som faktiskt stickas. Idéerna, märkena och de ritade motiven är de som redan ligger sparade.
 *
 *   JITI_ALIAS='{"@/":"<repo>/"}' node_modules/.bin/jiti scripts/scarf-redraw.ts
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CLUBS } from "@/lib/club";
import { facePreview } from "@/lib/scarfEngine";
import { knitIdea } from "@/lib/scarfFlow";
import type { ScarfClub, ScarfIdea } from "@/lib/scarfRecipes";

const ROOT = process.cwd();
type Stored = { slug: string; idea: ScarfIdea; art: boolean; club: unknown; clubId?: string; palette?: string[]; [key: string]: unknown };

async function redraw(set: "bank" | "demo") {
  const file = path.join(ROOT, "lib", set === "bank" ? "scarfBank.json" : "scarfDemo.json");
  const dir = path.join(ROOT, "public", "halsduk", set);
  const data = JSON.parse(await readFile(file, "utf8")) as { date: string; scarves: Stored[] };
  for (const s of data.scarves) {
    const artFile = path.join(dir, `${s.slug}-motiv.png`);
    const art = s.art && existsSync(artFile) ? await readFile(artFile) : null;
    // Banken har klubbens profil och märke sparade; demokollektionen använder klubbarna med full profil.
    const result =
      set === "bank"
        ? await knitIdea(s.club as ScarfClub, s.idea, { art, crest: await readFile(path.join(dir, `${(s.club as ScarfClub).id}-skold.png`)) })
        : await knitIdea(CLUBS[s.clubId!], s.idea, { art });
    const { knit, report, front, back } = result;
    const [f, b] = await Promise.all(knit.faces.map((face) => facePreview(face, knit.palette, 2000)));
    await Promise.all([
      sharp(f).flatten({ background: "#F5F5F7" }).jpeg({ quality: 88 }).toFile(path.join(dir, `${s.slug}-fram.jpg`)),
      sharp(b).flatten({ background: "#F5F5F7" }).jpeg({ quality: 88 }).toFile(path.join(dir, `${s.slug}-bak.jpg`)),
    ]);
    if (s.palette) s.palette = knit.palette;
    s.yarns = report.yarns.map((y) => ({ hex: y.hex, pantone: y.pantone, share: Math.round(y.share * 1000) / 1000 }));
    s.system = report.maxColorsPerRow <= 4 ? "dubbel" : "enkel";
    s.maxColorsPerRow = report.maxColorsPerRow;
    s.minTextMm = knit.minTextMm === null ? null : Math.round(knit.minTextMm);
    s.ok = report.ok;
    s.text = { front, back };
    const warn = report.checks.filter((c) => c.level === "varning").map((c) => c.title);
    console.log(`${set}  ${s.slug.padEnd(58)} ${s.idea.recipe.padEnd(9)} ${warn.length ? `VARNING: ${warn.join(", ")}` : "ok"}`);
  }
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

(async () => {
  await redraw("bank");
  await redraw("demo");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
