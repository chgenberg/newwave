import sharp from "sharp";
import { nearestPantone } from "./pantone";
import { CELLS, MIN_TEXT_MM, SCARF, STITCH_W_MM, hexToRgb } from "./scarf";
import { facePreview, sheetPreview, type Knitted } from "./scarfEngine";
import { bmpColors, bmpLines, sideBmp, sideFile } from "./scarfMachine";
import { tubeMismatch } from "./scarfTube";

/**
 * Det stickeriet behöver för att sticka: kontroll av mönstret maska för maska och ett filpaket.
 *
 * Mönstret lämnas som två BMP-filer, en per sida, i samma form som stickeriets egen BMP (se scarfMachine.ts).
 * Stickeriet väljer garn efter garnlistan och matar själva maskinen med färger och inställningar.
 * Från stickeriet: högst sju färger per halsduk; med en till fyra färger går maskinen i full fart, med fem till sju
 * långsammare. Från OPEK:s datablad: med två system klarar maskinen högst fyra färger per varv.
 */

const W = SCARF.needles;
const ROWS = SCARF.rows;
/** OPEK:s dubbelsystem klarar fyra färger på samma varv. */
export const FAST_COLORS = 4;
/** Marginal mot långsidorna, där tuben viks: tio maskor, som i stickeriets egen maskinfil. */
export const MIN_MARGIN_MM = (SCARF.edgeNeedles * SCARF.widthMm) / SCARF.side;

export type CheckLevel = "ok" | "info" | "varning";
export type ProductionCheck = { id: string; level: CheckLevel; title: string; note: string };
export type YarnRow = {
  index: number;
  hex: string;
  pantone: string;
  stitches: number;
  share: number;
  /** Garnets färg i BMP-filerna: index i Windows-paletten, färgen där och avståndet till garnet. */
  bmp: { index: number; hex: string; deltaE: number };
};
export type ProductionReport = {
  checks: ProductionCheck[];
  yarns: YarnRow[];
  /** Flest garner på ett och samma varv. */
  maxColorsPerRow: number;
  /** Varv som behöver fler än fyra garner. */
  rowsOverFast: number;
  /** Längsta sträcka i mm där ett garn löper på insidan utan att stickas, inom ett varv. */
  longestFloatMm: number;
  /** Andel av maskorna som ligger i raster eller bård. */
  rasterShare: number;
  ok: boolean;
};

export function inspect(knit: Knitted): ProductionReport {
  const { cells, protect, palette } = knit;
  const counts = new Array<number>(palette.length).fill(0);
  let loose = 0;
  let raster = 0;
  let maxColors = 0;
  let over = 0;
  let longest = 0;
  const first = new Int16Array(palette.length);
  const last = new Int16Array(palette.length);

  for (let r = 0; r < ROWS; r++) {
    first.fill(-1);
    let used = 0;
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      const v = cells[i];
      counts[v]++;
      if (protect[i]) raster++;
      else {
        // Grannar räknas runt tuben: kolumn 240 möter kolumn 1.
        const left = cells[r * W + ((c + W - 1) % W)];
        const right = cells[r * W + ((c + 1) % W)];
        const up = r ? cells[i - W] : -1;
        const down = r < ROWS - 1 ? cells[i + W] : -1;
        if (left !== v && right !== v && up !== v && down !== v) loose++;
      }
      if (first[v] < 0) {
        first[v] = c;
        used++;
      } else if (c - last[v] - 1 > longest) longest = c - last[v] - 1;
      last[v] = c;
    }
    for (let v = 0; v < palette.length; v++) {
      if (first[v] < 0) continue;
      // Ett garn som bara stickas på ett ställe på varvet löper resten av varvet runt.
      const wrap = W - 1 - last[v] + first[v];
      if (wrap > longest) longest = wrap;
    }
    if (used > maxColors) maxColors = used;
    if (used > FAST_COLORS) over++;
  }

  const used = counts.filter((n) => n > 0).length;
  const looseShare = loose / CELLS;
  const rasterShare = raster / CELLS;
  const floatMm = Math.round(longest * STITCH_W_MM);
  const text = knit.minTextMm;
  const margin = knit.minMarginMm;
  const fast = maxColors <= FAST_COLORS;
  // Filen viks till en tub och sidorna läses av från utsidan – de ska vara de sidor som ritades, maska för maska.
  const tube = tubeMismatch(knit);
  // Raderna i ändarna: varje rad i ett enda garn, runt hela tuben.
  const plain = (r: number) => cells.subarray(r * W, (r + 1) * W).every((v) => v === cells[r * W]);
  const ends = Array.from({ length: SCARF.endRows }, (_, k) => plain(k) && plain(ROWS - 1 - k)).every(Boolean);

  const checks: ProductionCheck[] = [
    { id: "format", level: "ok", title: `${W} × ${ROWS.toLocaleString("sv-SE")} maskor`, note: `${W} nålar runt cylindern och ${ROWS.toLocaleString("sv-SE")} maskrader, en BMP-fil per sida om ${SCARF.side} nålar. En bildpunkt är en maska. Fransarna ligger utanför.` },
    {
      id: "colors",
      level: used <= SCARF.maxColors ? "ok" : "varning",
      title: `${used} av ${SCARF.maxColors} garner`,
      note: used <= SCARF.maxColors ? "Alla garner ryms i maskinens sju matare." : `Maskinen har sju matare – ta bort ${used - SCARF.maxColors} färg.`,
    },
    {
      id: "system",
      level: "ok",
      title: fast ? `Högst ${maxColors} garner per varv – kan köras i dubbelsystem` : `Upp till ${maxColors} garner per varv – enkelsystem`,
      note: fast
        ? `Inget varv behöver fler än fyra garner. Enligt stickeriet går maskinen i full fart med en till fyra färger${used > FAST_COLORS ? ` – halsduken har ${used} garner, så den kan gå långsammare` : ""}.`
        : `${over.toLocaleString("sv-SE")} av ${ROWS.toLocaleString("sv-SE")} varv har fler än fyra garner, så halsduken körs med ett system (upp till sju garner per varv).`,
    },
    text === null
      ? { id: "text", level: "ok", title: "Ingen text", note: "Bara mönster och sköld." }
      : {
          id: "text",
          level: text >= MIN_TEXT_MM ? "ok" : "varning",
          title: text >= MIN_TEXT_MM ? "Texten går att läsa" : "För liten text",
          note: `Minsta versalhöjd ${Math.round(text)} mm, ${Math.round(text / STITCH_W_MM)} maskor${text >= MIN_TEXT_MM ? "." : ` – minst ${MIN_TEXT_MM} mm (tio maskor) behövs för att bokstäverna ska hålla formen.`}`,
        },
    {
      id: "loose",
      level: looseShare < 0.004 ? "ok" : "varning",
      title: looseShare < 0.004 ? "Rena färgfält" : "Många lösa maskor",
      note: `${loose.toLocaleString("sv-SE")} maskor står ensamma i sin färg utanför raster och bårder${looseShare < 0.004 ? "." : " – förenkla motivet eller gör det större."}`,
    },
    margin === null
      ? { id: "margin", level: "ok", title: "Mönster ända ut", note: "Inga texter eller sköldar nära vikkanten." }
      : {
          id: "margin",
          level: margin >= MIN_MARGIN_MM ? "ok" : "varning",
          title: margin >= MIN_MARGIN_MM ? "Marginal mot vikkanten" : "För nära vikkanten",
          note: `Text och sköld ligger minst ${Math.round(margin)} mm från långsidorna, där tuben viks${margin >= MIN_MARGIN_MM ? "." : ` – minst ${MIN_MARGIN_MM} mm behövs.`}`,
        },
    ...(rasterShare > 0.002
      ? [{ id: "raster", level: "info" as const, title: "Raster och bårder", note: `${Math.round(rasterShare * 100)} % av maskorna ligger i toning, bård eller porträtt, där enstaka maskor är avsiktliga.` }]
      : []),
    {
      id: "float",
      level: "info",
      title: `Längsta flottering ${Math.round(floatMm / 10)} cm`,
      note: "Garn som inte stickas löper på tubens insida. Stäm av med Seger om långa flotteringar ska bindas in eller klippas.",
    },
    {
      id: "ends",
      level: ends ? "ok" : "varning",
      title: ends ? `De ${SCARF.endRows} första och sista raderna är enfärgade` : "Mönster i ändraderna",
      note: ends
        ? "Stickeriet vill ha 50 enfärgade varv i början och slutet som sömsmån. Maskinens startrader och vikmarkeringar ligger i de yttersta."
        : `De ${SCARF.endRows} första och sista raderna ska vara enfärgade: stickeriets sömsmån och maskinens egna rader – skicka inte filen till stickeriet.`,
    },
    { id: "seam", level: "info", title: "Varvskarven i nederkanten", note: "Varvet börjar och slutar i halsdukens nedre vikkant, så hacket i tvärränder syns minst." },
    {
      id: "tube",
      level: tube === 0 ? "ok" : "varning",
      title: tube === 0 ? "Fram- och baksida ligger rätt på tuben" : "Sidorna ligger fel i stickfilen",
      note:
        tube === 0
          ? `Filen är vikt till en tub och avläst från utsidan: båda sidor läses rätt, ingen är spegelvänd${knit.backReads === "hold-up" ? ", och baksidan läses rätt bakifrån när halsduken hålls upp" : ", och baksidan läses rätt när halsduken vänds över långsidan"}.`
          : `${tube.toLocaleString("sv-SE")} maskor hamnar fel när filen viks till en tub – skicka inte filen till stickeriet.`,
    },
  ];

  // Varje garn får en egen färg i BMP-filernas Windows-palett. Färgen är en etikett; garnet väljs efter garnlistan.
  const bmp = bmpColors(palette, counts);
  const inFile = bmp.filter((_, i) => counts[i] > 0);
  const worst = Math.max(0, ...inFile.map((c) => c.deltaE));
  checks.push({
    id: "bmp",
    level: new Set(inFile.map((c) => c.index)).size === inFile.length ? "ok" : "varning",
    title: "Egen färg per garn i BMP-filerna",
    note: `Färgen är närmaste i Windows standardpalett, som i stickeriets egen BMP – största avvikelse ΔE ${Math.round(worst)}. Välj garn efter garnlistan.`,
  });

  return {
    checks,
    yarns: palette.map((hex, index) => ({ index: index + 1, hex, pantone: nearestPantone(hex).code, stitches: counts[index], share: counts[index] / CELLS, bmp: bmp[index] })),
    maxColorsPerRow: maxColors,
    rowsOverFast: over,
    longestFloatMm: floatMm,
    rasterShare,
    ok: checks.every((c) => c.level !== "varning"),
  };
}

// --- Filerna -----------------------------------------------------------------

export type PackageFile = { name: string; data: Buffer; what: string };

export const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "halsduk";

export type PackageInput = { club: string; title: string; why?: string; front: string; back: string; consent?: string | null; knit: Knitted; report: ProductionReport; date: string; pdf?: (html: string) => Promise<Buffer> };

export async function buildPackage(input: PackageInput): Promise<{ files: PackageFile[]; base: string }> {
  const { knit, report } = input;
  const base = `${slug(input.club)}-${slug(input.title)}`;
  const colors = report.yarns.map((y) => y.bmp);
  const [front, back] = ([0, 1] as const).map((side) => Buffer.from(sideBmp(knit.cells, side, colors)));
  const proof = await sheetPreview(knit, 2400);
  const pct = (share: number) => `${(share * 100).toFixed(1).replace(".", ",")} %`;

  const csv = [
    "Garn;Hex;RGB;Närmaste Pantone;Färg i BMP (index);Färg i BMP (hex);Maskor;Andel",
    ...report.yarns.map((y) => `${y.index};${y.hex};${hexToRgb(y.hex).join(",")};${y.pantone};${y.bmp.index};${y.bmp.hex};${y.stitches};${pct(y.share)}`),
  ].join("\r\n");

  const order = {
    version: 2,
    club: input.club,
    design: input.title,
    date: input.date,
    machine: { factory: SCARF.factory, model: SCARF.machine, software: SCARF.software, needles: W, rows: ROWS, widthMm: SCARF.widthMm, lengthMm: SCARF.lengthMm, tube: true },
    layout: {
      format: `BMP per sida, ${SCARF.side} × ${ROWS}, 8 bitar, Windows standardpalett – samma form som stickeriets egen BMP`,
      front: `nål 1–${SCARF.side}, samma läge som stickeriets egen BMP`,
      back: `nål ${SCARF.side + 1}–${W}, kolumn 1 är nål ${SCARF.side + 1}; ${knit.backReads === "hold-up" ? "läses rätt bakifrån när halsduken hålls upp" : "läses rätt när halsduken vänds över långsidan"}`,
      row1: "bildens översta rad",
      reserved: `rad 1–${SCARF.endRows} och ${ROWS - SCARF.endRows + 1}–${ROWS} är enfärgade (sömsmån); startrader och vikmarkeringar ingår inte`,
      clearEdge: `text, märken och kantränder ligger minst ${SCARF.edgeNeedles} nålar från vikkanterna`,
    },
    yarns: report.yarns.map((y) => ({ yarn: y.index, hex: y.hex, pantone: y.pantone, bmpIndex: y.bmp.index, bmpHex: y.bmp.hex, stitches: y.stitches, share: Math.round(y.share * 1000) / 1000 })),
    system: report.maxColorsPerRow <= FAST_COLORS ? "dubbel" : "enkel",
    maxColorsPerRow: report.maxColorsPerRow,
    longestFloatMm: report.longestFloatMm,
    text: { front: input.front, back: input.back, minCapMm: knit.minTextMm === null ? null : Math.round(knit.minTextMm) },
    checks: report.checks.map((c) => ({ id: c.id, level: c.level, title: c.title })),
    consent: input.consent ?? null,
    files: { front: sideFile(base, 0), back: sideFile(base, 1) },
  };

  const files: PackageFile[] = [
    { name: sideFile(base, 0), data: front, what: `framsidan, nål 1–${SCARF.side}: mönstret i stickeriets eget BMP-format, en bildpunkt per maska` },
    { name: sideFile(base, 1), data: back, what: `baksidan, nål ${SCARF.side + 1}–${W}, i samma format` },
    { name: `${base}-korrektur.png`, data: proof, what: "fram- och baksida som de ser ut stickade, med fransar" },
    { name: "garn.csv", data: Buffer.from(`\uFEFF${csv}`), what: "garnlista: närmaste Pantone, garnets färg i BMP-filerna, antal maskor och andel" },
    { name: "stickorder.json", data: Buffer.from(JSON.stringify(order, null, 2)), what: "samma uppgifter i maskinläsbar form, för en framtida direktkoppling" },
  ];

  if (input.pdf) {
    const pdf = await input.pdf(await orderHtml(input)).catch(() => null);
    if (pdf) files.splice(3, 0, { name: "stickorder.pdf", data: pdf, what: "stickorder på en sida: korrektur, garner, maskininställning och kontroller" });
  }

  const pad = Math.max(...files.map((f) => f.name.length)) + 2;
  const readme = [
    `Stickad halsduk – ${input.club}: ${input.title}`,
    `Skapad ${input.date} av Halsduksagenten`,
    "",
    `Maskin: ${SCARF.machine} hos ${SCARF.factory}   Mönsterprogram: ${SCARF.software}`,
    `Storlek: ${W} nålar × ${ROWS} maskrader, cirka ${SCARF.lengthMm / 10} × ${SCARF.widthMm / 10} cm exklusive fransar.`,
    "",
    "Mönsterfilerna",
    ...bmpLines(knit.backReads).map((l) => (l.startsWith("  ") ? l : `  ${l}`)),
    `  Text, märken och kantränder ligger minst ${SCARF.edgeNeedles} nålar från vikkanterna (nål 1, ${SCARF.side}, ${SCARF.side + 1} och ${W}).`,
    "",
    "Garner (Pantone är närmaste referens – välj garn som matchar)",
    ...report.yarns.map((y) => `  Garn ${y.index}: ${y.hex}  ≈ ${y.pantone.padEnd(16)}  färg i BMP: ${String(y.bmp.index).padStart(3)} (${y.bmp.hex})  ${String(y.stitches).padStart(7)} maskor  ${pct(y.share).padStart(7)}`),
    "",
    "Kontroll",
    ...report.checks.map((c) => `  ${c.level === "ok" ? "OK " : c.level === "info" ? "–  " : "!  "}${c.title}. ${c.note}`),
    ...(input.consent ? ["", `Godkännande: ${input.consent}`] : []),
    "",
    "Filer",
    ...files.map((f) => `  ${f.name.padEnd(pad)}– ${f.what}`),
  ].join("\r\n");
  files.push({ name: "LAS-MIG.txt", data: Buffer.from(readme), what: "den här filen" });
  return { files, base };
}

const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Stickordern som en A4-sida. Alla bilder är inbäddade. */
async function orderHtml(input: PackageInput) {
  const { knit, report } = input;
  const [front, back] = await Promise.all(knit.faces.map((f) => facePreview(f, knit.palette, 1700).then((b) => sharp(b).flatten({ background: "#FFFFFF" }).jpeg({ quality: 88 }).toBuffer())));
  // Maskinens rutnät liggande, så att det får plats på bredden: vridet ett kvarts varv moturs läses framsidan rätt.
  const pal = knit.palette.map(hexToRgb);
  const rgb = Buffer.alloc(CELLS * 3);
  for (let i = 0; i < CELLS; i++) rgb.set(pal[knit.cells[i]], i * 3);
  const grid = await sharp(rgb, { raw: { width: W, height: ROWS, channels: 3 } }).png().toBuffer();
  const strip = await sharp(grid).rotate(-90).resize(ROWS * 2, W * 2, { kernel: "nearest" }).png().toBuffer();
  const img = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;
  const mark = (l: string) => (l === "ok" ? "✓" : l === "info" ? "i" : "!");
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
@page{size:A4;margin:11mm 12mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif;color:#111;font-size:8.6pt;line-height:1.4}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.2pt solid #111;padding-bottom:3mm}
h1{font-size:19pt;letter-spacing:-.02em;line-height:1.05}.k{font-size:7pt;letter-spacing:.07em;text-transform:uppercase;color:#6F6B63}
.meta{text-align:right;font-size:7.6pt;color:#3B3934;line-height:1.55}
h2{font-size:7pt;letter-spacing:.07em;text-transform:uppercase;color:#6F6B63;font-weight:500;margin:4.2mm 0 1.6mm}
.scarf{width:100%;display:block}.cap{font-size:7pt;color:#6F6B63;margin:.6mm 0 1.6mm}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:7mm}
table{width:100%;border-collapse:collapse}td,th{padding:1.15mm 2mm 1.15mm 0;border-bottom:.5pt solid #ddd;text-align:left;vertical-align:top}
th{font-size:6.6pt;letter-spacing:.06em;text-transform:uppercase;color:#6F6B63;font-weight:500;border-bottom:.9pt solid #111}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sw{display:inline-block;width:5.4mm;height:3.4mm;border:.4pt solid #999;vertical-align:-0.7mm;margin-right:1.6mm}
.ch{display:grid;grid-template-columns:4.4mm 1fr;gap:0 1mm;margin-bottom:.9mm}.ch b{font-weight:600}.ch span{color:#3B3934}
.dot{width:3.5mm;height:3.5mm;border-radius:50%;color:#fff;font-size:6pt;font-weight:700;text-align:center;line-height:3.5mm;margin-top:.3mm}
.ok{background:#1E8E3E}.info{background:#8A8A8E}.varning{background:#B3261E}
.strip{width:100%;display:block;border:.5pt solid #bbb;image-rendering:pixelated}
.note{font-size:7.4pt;color:#3B3934;margin-top:1.4mm}
</style></head><body>
<div class="top"><div><p class="k">Stickorder · ${html(SCARF.factory)} · ${html(SCARF.machine)}</p><h1>${html(input.club)} – ${html(input.title)}</h1></div>
<div class="meta">${html(input.date)}<br>${W} × ${ROWS} maskor · cirka ${SCARF.lengthMm / 10} × ${SCARF.widthMm / 10} cm<br>${report.yarns.filter((y) => y.stitches).length} garner · ${report.maxColorsPerRow <= FAST_COLORS ? "dubbelsystem möjligt" : "enkelsystem"}</div></div>
<h2>Korrektur – så blir den</h2>
<img class="scarf" src="${img(front, "image/jpeg")}"><p class="cap">Framsida · ${html(input.front)}</p>
<img class="scarf" src="${img(back, "image/jpeg")}"><p class="cap">Baksida · ${html(input.back)}</p>
<div class="cols"><div>
<h2>Garner</h2>
<table><tr><th>Garn</th><th>Närmaste Pantone</th><th>Hex</th><th>I BMP</th><th class="n">Maskor</th><th class="n">Andel</th></tr>
${report.yarns.map((y) => `<tr><td><span class="sw" style="background:${y.hex}"></span>${y.index}</td><td>${html(y.pantone)}</td><td>${y.hex}</td><td><span class="sw" style="background:${y.bmp.hex}"></span>${y.bmp.index}</td><td class="n">${y.stitches.toLocaleString("sv-SE")}</td><td class="n">${(y.share * 100).toFixed(1).replace(".", ",")} %</td></tr>`).join("")}</table>
<h2>Maskin</h2>
<table>
<tr><td>Maskin och program</td><td>${html(SCARF.machine)}, ${html(SCARF.software)}</td></tr>
<tr><td>Mönster</td><td>${W} nålar × ${ROWS} maskrader, tub. Fransar utanför.</td></tr>
<tr><td>System</td><td>${report.maxColorsPerRow <= FAST_COLORS ? `Högst ${report.maxColorsPerRow} garner per varv – kan köras i dubbelsystem` : `Upp till ${report.maxColorsPerRow} garner per varv – enkelsystem`}</td></tr>
<tr><td>Filer</td><td>En BMP per sida, ${SCARF.side} × ${ROWS}, i stickeriets eget format</td></tr>
${input.consent ? `<tr><td>Godkännande</td><td>${html(input.consent)}</td></tr>` : ""}
</table>
</div><div>
<h2>Kontroll före stickning</h2>
${report.checks.map((c) => `<div class="ch"><div class="dot ${c.level}">${mark(c.level)}</div><div><b>${html(c.title)}.</b> <span>${html(c.note)}</span></div></div>`).join("")}
</div></div>
<h2>Mönstret, liggande</h2>
<img class="strip" src="${img(strip, "image/png")}">
<p class="note">Hela tuben: övre halvan är baksidan (nål ${SCARF.side + 1}–${W}), nedre halvan framsidan (nål 1–${SCARF.side}). I filerna står varje sida på högkant med rad 1 överst${knit.backReads === "hold-up" ? "; baksidan är vänd så att den läses rätt bakifrån när halsduken hålls upp" : ""}. En bildpunkt är en maska – skala inte om bilderna.</p>
</body></html>`;
}
