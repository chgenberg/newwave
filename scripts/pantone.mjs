#!/usr/bin/env node
/**
 * Genererar lib/pantoneData.ts: Pantone Solid Coated som CIELAB (D50) ur en öppen sammanställning.
 * Värdena är en referens för att föreslå närmaste Pantone; tryckeriet stämmer alltid av mot sin fysiska Pantone-guide.
 *
 *   node scripts/pantone.mjs [csv-url-eller-fil]
 */
import { readFile, writeFile } from "node:fs/promises";

const SOURCE = process.argv[2] ?? "https://raw.githubusercontent.com/aj90909/unofficial-pantone-solid-coated-2024-v5/main/colors.csv";
const csv = SOURCE.startsWith("http") ? await (await fetch(SOURCE)).text() : await readFile(SOURCE, "utf8");

// Kolumnerna heter RED, GREEN, BLUE men innehåller L*, a*, b*.
const rows = csv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(","))
  .filter(([name, , L, a, b]) => /^PANTONE .+ C$/.test(name) && [L, a, b].every((v) => Number.isFinite(Number(v))));
if (rows.length < 3000) throw new Error(`Bara ${rows.length} färger i ${SOURCE}`);

const data = rows.map(([name, , L, a, b]) => `${name.slice("PANTONE ".length, -2)}:${Number(L)},${Number(a)},${Number(b)}`).join(";");
await writeFile(
  new URL("../lib/pantoneData.ts", import.meta.url),
  `// Genererad av scripts/pantone.mjs – ändra inte för hand.\n// Pantone Solid Coated, ${rows.length} färger: "kod:L,a,b" (CIELAB D50), koden utan "PANTONE " och " C".\nexport const PANTONE_C = "${data}";\n`,
);
console.log(`lib/pantoneData.ts: ${rows.length} färger, ${Math.round(data.length / 1024)} kB`);
