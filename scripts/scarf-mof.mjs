/**
 * Gör en provfil i stickmaskinens MOF-format av en av våra stickfiler.
 *
 * Formatet är inte dokumenterat. Det som står här är uppmätt i en enda fil från stickeriet (004212.MOF, november 2026):
 *   byte 0–41 631   maskinprogrammet (stegen, maskornas längd, hastigheter). Det är inte uttytt och kopieras oförändrat
 *                   från förlagan – bara mönstrets nummer i de sex första tecknen byts.
 *   byte 41 632–    mönstret, en byte per maska, 240 nålar × 1210 rader, rad 1 först. Värdet är en garnkod.
 *   de 8 sista      00, mönstrets bytesumma som 16 bitar, två byte som är "zx" i förlagan, 00 00 00.
 * Rad 1–15 och 1196–1210 är maskinens egna: startrader (kod 16) och vikmarkeringar på nål 1 och 121. De kopieras från
 * förlagan. Därför måste vår fil ha de raderna enfärgade, i samma garn som får förlagans bottenkod.
 *
 * Filen är en PROVFIL. Om maskinen läser den avgör bara stickeriet: de två "zx"-byten kan vara en kontrollsumma vi inte
 * har kunnat räkna ut, huvudets två byte med värdet 8 kan vara förlagans antal garnkoder, och maskinprogrammet hör till
 * förlagans halsduk. Formatet finns inte beskrivet offentligt (sökt november 2026); tillverkaren är Hefei Opek Machinery.
 *
 *   node scripts/scarf-mof.mjs <förlaga.MOF> <vår-240x1210.bmp> <utmapp> <nummer med sex siffror> [garn.csv]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [W, H, SIDE, TECH] = [240, 1210, 120, 15];
const START = 41_632;
/** Förlagans garnkoder i den ordning den använder dem mest: botten först. Kod 16 finns bara i startraderna. */
const CODES = [13, 9, 11, 12, 5, 7, 1];
const START_CODE = 16;
const MARKER = 11;

const [templateFile, bmpFile, outDir, number, yarnFile] = process.argv.slice(2);
const fail = (msg) => {
  console.error(`Avbryter: ${msg}`);
  process.exit(1);
};
if (!templateFile || !bmpFile || !outDir || !/^\d{6}$/.test(number ?? "")) fail("ange förlaga, BMP-fil, utmapp och ett nummer med sex siffror.");

// --- Förlagan ------------------------------------------------------------------------

const template = readFileSync(templateFile);
if (template.length !== START + W * H + 8) fail(`förlagan är ${template.length} byte, väntade ${START + W * H + 8}.`);
if (!/^\d{6}\.MO$/.test(template.subarray(0, 9).toString("latin1"))) fail("förlagan börjar inte med ett mönsternummer.");
if (template.readUInt32LE(12) !== W * H || template.readUInt16LE(17) !== W || template.readUInt16LE(20) !== H) fail("förlagans huvud anger inte 240 × 1210 maskor.");
const sum16 = (buf) => buf.reduce((n, b) => (n + b) & 0xffff, 0);
const pattern0 = template.subarray(START, START + W * H);
const tail0 = template.subarray(START + W * H);
// Summan prövas mot förlagan själv, så att vi vet att vi räknar som maskinens program gör.
if (tail0.readUInt16LE(1) !== sum16(pattern0)) fail("förlagans kontrollsumma stämmer inte med vår uträkning.");

// --- Vår fil: 8-bitars BMP med palett, en bildpunkt per maska --------------------------

const bmp = readFileSync(bmpFile);
if (bmp.toString("latin1", 0, 2) !== "BM") fail("stickfilen är inte en BMP.");
const [pixels, dib, width, height, bits] = [bmp.readUInt32LE(10), bmp.readUInt32LE(14), bmp.readInt32LE(18), bmp.readInt32LE(22), bmp.readUInt16LE(28)];
if (width !== W || Math.abs(height) !== H || bits !== 8) fail(`stickfilen är ${width} × ${Math.abs(height)} med ${bits} bitar – väntade 240 × 1210 med 8.`);
const stride = Math.ceil(W / 4) * 4;
/** Garnets index i vår palett för rad `y` (0 = första raden) och nål `x`. En BMP med positiv höjd ligger nerifrån och upp. */
const ours = (x, y) => bmp[pixels + (height > 0 ? H - 1 - y : y) * stride + x];
const hexOf = (i) => `#${[2, 1, 0].map((k) => bmp[14 + dib + i * 4 + k].toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const count = new Map();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) count.set(ours(x, y), (count.get(ours(x, y)) ?? 0) + 1);
const ground = ours(0, 0);
for (const y of [...Array(TECH).keys(), ...Array.from({ length: TECH }, (_, k) => H - 1 - k)]) {
  for (let x = 0; x < W; x++) if (ours(x, y) !== ground) fail(`rad ${y + 1} är inte enfärgad i bottenfärgen. De ${TECH} första och sista raderna hör till maskinen.`);
}
// Så många rader i varje ände är enfärgade i bottenfärgen. Stickeriet vill ha 50, som sömsmån.
const plainRow = (y) => Array.from({ length: W }, (_, x) => ours(x, y)).every((v) => v === ground);
let plain = 0;
while (plain < H / 2 && plainRow(plain) && plainRow(H - 1 - plain)) plain++;
if (count.size > CODES.length) fail(`halsduken har ${count.size} garner, förlagan har bara ${CODES.length} garnkoder.`);
// Bottenfärgen får förlagans bottenkod, de övriga förlagans koder i den ordning de används mest.
const order = [ground, ...[...count.keys()].filter((i) => i !== ground).sort((a, b) => count.get(b) - count.get(a))];
const codeOf = new Map(order.map((index, k) => [index, CODES[k]]));
// Vikmarkeringen stickas i förlagans markeringskod om halsduken har ett garn där, annars i halsdukens näst vanligaste garn.
const marker = [...codeOf.values()].includes(MARKER) ? MARKER : CODES[1];
if (count.size < 2) fail("halsduken har bara ett garn – vikmarkeringen behöver ett andra.");

// --- Mönstret --------------------------------------------------------------------------

const pattern = Buffer.alloc(W * H);
let most = 0;
for (let y = 0; y < H; y++) {
  const tech = y < TECH || y >= H - TECH;
  const seen = new Set();
  for (let x = 0; x < W; x++) {
    let code;
    if (tech) {
      // Maskinens rader tas från förlagan: dess botten är vår botten, och dess markering får vår markeringskod.
      const theirs = pattern0[y * W + x];
      if (theirs !== START_CODE && theirs !== CODES[0] && theirs !== MARKER) fail(`förlagans rad ${y + 1} har en kod vi inte känner igen (${theirs}).`);
      code = theirs === MARKER ? marker : theirs;
    } else code = codeOf.get(ours(x, y));
    pattern[y * W + x] = code;
    seen.add(code);
  }
  most = Math.max(most, seen.size);
}

// --- Filen -----------------------------------------------------------------------------

const head = Buffer.from(template.subarray(0, START));
head.write(number, 0, "latin1");
const tail = Buffer.from(tail0);
tail.writeUInt16LE(sum16(pattern), 1);
const file = Buffer.concat([head, pattern, tail]);
const name = `${number}.MOF`;
writeFileSync(path.join(outDir, name), file);

// Kontrolläsning: filen läses tillbaka och jämförs med det vi utgick från.
const back = readFileSync(path.join(outDir, name));
const inverse = new Map([...codeOf].map(([index, code]) => [code, index]));
let wrong = 0;
for (let y = TECH; y < H - TECH; y++) for (let x = 0; x < W; x++) if (inverse.get(back[START + y * W + x]) !== ours(x, y)) wrong++;
const headSame = back.subarray(6, START).equals(template.subarray(6, START));
if (wrong || !headSame || back.length !== template.length || back.readUInt16LE(back.length - 7) !== sum16(back.subarray(START, START + W * H))) fail("kontrolläsningen av den skrivna filen stämmer inte.");

// --- Följebladet -----------------------------------------------------------------------

/** garn.csv ur våra stickfiler: garnets nummer (1 = palettens första färg) och närmaste Pantone. */
const pantone = new Map();
if (yarnFile) {
  for (const line of readFileSync(yarnFile, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1)) {
    const [index, , , ref] = line.split(";");
    if (index && ref) pantone.set(Number(index) - 1, ref);
  }
}
const share = (n) => `${((n / (W * H)) * 100).toFixed(1).replace(".", ",")} %`;
const rows = order.map((index) => `  kod ${String(codeOf.get(index)).padStart(2)}   ${hexOf(index)}   ${(pantone.get(index) ?? "").padEnd(22)} ${String(count.get(index)).padStart(7)} maskor  ${share(count.get(index)).padStart(7)}${index === ground ? "   botten" : ""}`);
const sheet = [
  `PROVFIL ${name}`,
  "",
  "En stickfil från Halsduksagenten, omgjord till samma format som er fil 004212.MOF.",
  "Den är inte körd på någon maskin. Titta på den i ert mönsterprogram innan den stickas.",
  "",
  "Så är filen gjord",
  "  Maskinprogrammet (allt före mönstret) är kopierat oförändrat ur 004212.MOF. Bara mönstrets nummer är bytt.",
  `  Mönstret är vårt: ${W} nålar × ${H} rader, en byte per maska, med era garnkoder.`,
  `  Rad 1–${TECH} och ${H - TECH + 1}–${H} är kopierade ur 004212.MOF: era startrader och vikmarkeringarna på nål 1 och ${SIDE + 1}.`,
  `  Vikmarkeringen stickas i kod ${marker}.`,
  `  De ${plain} första och ${plain} sista raderna är enfärgade i bottenfärgen${plain >= 50 ? ", enligt er rekommendation om 50 enfärgade varv i början och slutet" : " – färre än de 50 varv ni rekommenderar"}.`,
  "",
  "Det vi inte vet",
  "  De åtta sista byten: summan av mönstret är omräknad, men de två byten 7A 78 är lämnade som i er fil.",
  "  Är de en kontrollsumma kan maskinen avvisa filen – säg då till, så rättar vi.",
  "  Maskinprogrammet hör till halsduken i 004212. Stämmer det inte för ett annat mönster behöver vi veta vad som ska ändras.",
  "  Huvudet har två byte med värdet 8 (byte 20 och 30). Är det antalet garnkoder i 004212 stämmer de inte för vår fil,",
  `  som har ${count.size + 1} koder med startradernas kod 16. De är lämnade som i er fil.`,
  "",
  "Kontrollerat mot 004212.MOF",
  "  Samma längd. Huvudet skiljer bara i mönsternumret. Startraderna är identiska, vikmarkeringarna sitter på samma nålar,",
  "  och mönstret använder bara garnkoder som finns i 004212.",
  "",
  "Garner (Pantone är närmaste referens)",
  ...rows,
  "",
  `Flest garner på samma varv: ${most}. Er fil 004212 har högst 4.`,
  `Framsidan ligger på nål 1–${SIDE} och baksidan på nål ${SIDE + 1}–${W}. Baksidan har mönster och text, till skillnad från 004212.`,
  "",
].join("\r\n");
writeFileSync(path.join(outDir, `${number}.txt`), sheet);

console.log(`${name}: ${file.length} byte, ${count.size} garner, högst ${most} per varv, ${plain} enfärgade rader i varje ände. Kontrolläst: mönstret och huvudet stämmer.`);
console.log(rows.join("\n"));
