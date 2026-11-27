/**
 * Importerar Crafts produktdata till POC-flödets katalog: läser en CSV- eller JSON-fil (t.ex. exporterad ur Excel),
 * kontrollerar varje rad och skriver lib/poc/catalog-data.json. Katalogen (lib/poc/catalog.ts) använder den filen i
 * stället för platshållarplaggen; ta bort filen för att gå tillbaka till platshållarna. Servern läser om katalogen inom
 * en sekund, utan omstart. När New Waves hubb skickat produkter (lib/poc/hub/products.ts) går de före den här filen.
 *
 *   JITI_ALIAS='{"@/":"<repo>/"}' node_modules/.bin/jiti scripts/poc-import-catalog.ts scripts/poc-katalog-exempel.csv
 *     --prova     kontrollerar filen utan att skriva något
 *     --ut=<fil>  skriver till en annan fil än lib/poc/catalog-data.json
 *
 * Excel: Arkiv → Spara som → "CSV UTF-8". Semikolon, komma eller tabb mellan fälten; rubrikraden avgör ordningen.
 * Kolumnerna (svenska eller engelska namn):
 *   artikelnummer (sku)   Crafts artikelnummer, t.ex. 1910163
 *   namn (name)           t.ex. Craft Core Hoodie
 *   slag (kind)           plagg eller halsduk – plagg trycks hos tryckeriet, halsdukar stickas hos stickeriet
 *   pris (price)          kronor inklusive moms, t.ex. 599 eller 599,00
 *   storlekar (sizes)     med | eller komma emellan, t.ex. XS|S|M|L|XL
 *   färger (colors)       namn och färgkod med | eller komma emellan, t.ex. Svart #111111|Vit #F4F3EF
 *   basplagg (base)       plagget i New Waves katalog som ger foto och tryckyta: id (p004) eller namn (Hoodie)
 * JSON: en lista med samma fält, eller { "products": [...] }.
 *
 * Fel visas per rad, och ingenting skrivs förrän hela filen är rätt.
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NW_CATALOG } from "@/lib/newwave/catalog";
import { colorName, SWATCHES } from "@/lib/newwave/colors";
import { CATALOG_DATA_FILE, CatalogFileSchema, type CatalogRow, CatalogRowSchema, POC_BASES } from "@/lib/poc/catalog";

type Raw = Record<string, string>;

const COLUMNS: Record<string, keyof CatalogRow> = {
  artikelnummer: "sku",
  artnr: "sku",
  sku: "sku",
  namn: "name",
  name: "name",
  benamning: "name",
  slag: "kind",
  typ: "kind",
  kind: "kind",
  pris: "priceSek",
  price: "priceSek",
  storlekar: "sizes",
  storlek: "sizes",
  sizes: "sizes",
  farger: "colors",
  farg: "colors",
  colors: "colors",
  basplagg: "baseId",
  bas: "baseId",
  base: "baseId",
  baseid: "baseId",
};

const fold = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

/** CSV med citattecken runt fält som innehåller avgränsaren, radbrytningar eller citattecken (som "" inuti). */
function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const head = body.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((s) => [s, head.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      [row, cell] = [[], ""];
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** Raderna som fält → text, med rubrikerna översatta till katalogens fält. Okända kolumner ger ett fel. */
function fromCsv(text: string): { rows: Raw[]; problems: string[] } {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], problems: ["Filen är tom."] };
  const keys = header.map((h) => COLUMNS[fold(h)]);
  const problems = header.flatMap((h, i) => (keys[i] || !h.trim() ? [] : [`Okänd kolumn ”${h.trim()}”. Kolumnerna är: artikelnummer, namn, slag, pris, storlekar, färger, basplagg.`]));
  const missing = (["sku", "name", "kind", "priceSek", "sizes"] as const).filter((k) => !keys.includes(k));
  if (missing.length) problems.push(`Kolumner saknas: ${missing.map((k) => Object.keys(COLUMNS).find((c) => COLUMNS[c] === k)).join(", ")}.`);
  const rows = lines.map((cells) => Object.fromEntries(keys.flatMap((k, i) => (k ? [[k, (cells[i] ?? "").trim()]] : []))));
  return { rows, problems };
}

function fromJson(text: string): { rows: Raw[]; problems: string[] } {
  const data: unknown = JSON.parse(text.replace(/^﻿/, ""));
  const list = Array.isArray(data) ? data : (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) return { rows: [], problems: ["JSON-filen ska vara en lista med produkter, eller { \"products\": [...] }."] };
  const rows = list.map((item) => {
    const out: Raw = {};
    for (const [k, v] of Object.entries((item ?? {}) as Record<string, unknown>)) {
      const key = COLUMNS[fold(k)];
      if (!key || v == null) continue;
      out[key] = Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? `${(x as { name?: string }).name ?? ""} ${(x as { hex?: string }).hex ?? ""}` : String(x))).join("|") : String(v);
    }
    return out;
  });
  return { rows, problems: [] };
}

const list = (s: string | undefined) =>
  (s ?? "")
    .split(/[|,]/)
    .map((v) => v.trim())
    .filter(Boolean);

const KNOWN = new Map([...SWATCHES, { name: "Vit", hex: "#F4F3EF" }, { name: "Grå", hex: "#9A9CA1" }, { name: "Svart", hex: "#111111" }].map((s) => [fold(s.name), s.hex]));

/** "Svart #111111", "#111111", "Svart: #111111", "Svart (#111111)" eller ett känt namn som Svart, Vit, Grå, Marinblå. */
function color(item: string): { name: string; hex: string } | string {
  const m = /^(.*?)[\s:(]*#([0-9a-f]{6})\)?$/i.exec(item);
  if (m) {
    const hex = `#${m[2].toUpperCase()}`;
    return { name: m[1].trim() || colorName(hex), hex };
  }
  const known = KNOWN.get(fold(item));
  return known ? { name: item.trim(), hex: known } : `färgen ”${item}” saknar färgkod – skriv t.ex. ”${item} #1A2B3C”`;
}

/** Basplaggen: New Waves katalog och POC-flödets egna (sweatshirt och joggingbyxor). */
const BASES = [...POC_BASES, ...NW_CATALOG];

/** Basplagget på id eller namn. */
function base(v: string | undefined): string | undefined {
  if (!v?.trim()) return undefined;
  const id = v.trim().toLowerCase();
  return (BASES.find((p) => p.id === id) ?? BASES.find((p) => fold(p.name) === fold(v)))?.id ?? v.trim();
}

const KIND: Record<string, CatalogRow["kind"]> = { plagg: "plagg", trycks: "plagg", garment: "plagg", halsduk: "halsduk", scarf: "halsduk", stickad: "halsduk" };

function toRow(raw: Raw): { row: unknown; problems: string[] } {
  const problems: string[] = [];
  const colors = list(raw.colors).map(color);
  for (const c of colors) if (typeof c === "string") problems.push(c);
  const price = (raw.priceSek ?? "").replace(/\s|kr|sek/gi, "").replace(",", ".");
  const kind = KIND[fold(raw.kind ?? "")];
  const baseId = base(raw.baseId);
  if (baseId && !BASES.some((p) => p.id === baseId)) problems.push(`basplagg: ”${raw.baseId}” finns inte i katalogen – ange id eller namn, t.ex. p001 (T-shirt), p004 (Hoodie), poc-sweatshirt eller poc-joggingbyxor`);
  return {
    row: {
      sku: (raw.sku ?? "").trim(),
      name: (raw.name ?? "").trim(),
      kind: kind ?? (raw.kind ?? "").trim(),
      priceSek: price && Number.isFinite(Number(price)) ? Math.round(Number(price)) : price ? price : undefined,
      sizes: kind === "halsduk" && !list(raw.sizes).length ? ["One size"] : list(raw.sizes),
      colors: colors.filter((c): c is { name: string; hex: string } => typeof c !== "string"),
      baseId,
    },
    problems,
  };
}

const LABEL: Record<string, string> = { sku: "artikelnummer", name: "namn", kind: "slag", priceSek: "pris", sizes: "storlekar", colors: "färger", baseId: "basplagg" };

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--prova");
  const out = args.find((a) => a.startsWith("--ut="))?.slice(5) ?? CATALOG_DATA_FILE;
  if (!file) {
    console.log("Ange filen: jiti scripts/poc-import-catalog.ts <crafts-produkter.csv|json> [--prova] [--ut=<fil>]");
    process.exit(1);
  }
  const text = await readFile(file, "utf8");
  const { rows, problems } = /\.json$/i.test(file) ? fromJson(text) : fromCsv(text);
  const errors = [...problems];
  const products: CatalogRow[] = [];
  const seen = new Map<string, number>();
  // Rad 1 är rubrikraden i en CSV; i JSON räknas produkterna från 1.
  const first = /\.json$/i.test(file) ? 1 : 2;
  rows.forEach((raw, i) => {
    const line = `Rad ${i + first}${raw.sku ? ` (${raw.sku})` : ""}`;
    const { row, problems: own } = toRow(raw);
    const parsed = CatalogRowSchema.safeParse(row);
    const issues = [...new Set([...own, ...(parsed.success ? [] : parsed.error.issues.map((is) => `${LABEL[String(is.path[0])] ?? is.path.join(".")}: ${is.message}`))])].filter((t, _, all) => !(t.startsWith("basplagg: basplagget") && all.some((o) => o.startsWith("basplagg: ”"))));
    const sku = (row as { sku: string }).sku;
    if (sku && seen.has(sku)) issues.push(`artikelnumret finns redan på rad ${seen.get(sku)}`);
    if (sku) seen.set(sku, i + first);
    if (issues.length) errors.push(`${line}: ${issues.join("; ")}`);
    else if (parsed.success) products.push(parsed.data);
  });
  if (!rows.length) errors.push("Inga produkter i filen.");
  if (errors.length) {
    console.error(`${errors.length} ${errors.length === 1 ? "fel" : "fel"} – ingenting skrevs:\n${errors.map((e) => `  ${e}`).join("\n")}`);
    process.exit(1);
  }
  const data = CatalogFileSchema.parse({ importedAt: new Date().toISOString(), source: path.basename(file), products });
  const summary = products.map((p) => `  ${p.sku.padEnd(16)} ${p.name.padEnd(32)} ${p.kind.padEnd(8)} ${String(p.priceSek).padStart(6)} kr  ${p.sizes.join(" ")}${p.colors.length ? `  · ${p.colors.map((c) => c.name).join(", ")}` : ""}${p.baseId ? `  · basplagg ${p.baseId}` : ""}`);
  console.log(`${products.length} produkter godkända:\n${summary.join("\n")}`);
  if (dry) return console.log("Provkörning – ingenting skrevs.");
  const tmp = `${out}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, out);
  console.log(`Skrev ${path.relative(process.cwd(), out) || out}.${products.some((p) => p.kind === "halsduk") ? "" : " Klubbhalsduken läggs till av katalogen."}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
