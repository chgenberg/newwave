import sharp, { type OverlayOptions } from "sharp";
import { SCARF, checkGrid, colorCsv, hexToRgb, indexOfNear, readMe } from "@/lib/scarf";
import { bmpColors, bmpLines, plainEnds, sideBmp, toMachine } from "@/lib/scarfMachine";

/**
 * Stickfilerna till en jacquardhalsduk i hubbens leverans, gjorda på servern: en BMP per sida i stickeriets eget format
 * (se lib/scarfMachine.ts), samma som halsduksagentens. Halsduken här är enklare – ränder, sköld och en text per sida.
 */

export type KnitInput = { club: string; front: string; back: string; yarns: string[]; crest: Buffer | null; date: string };
export type KnitFile = { name: string; data: Buffer };
export type Knit = { cells: Uint8Array; palette: string[]; counts: number[]; minTextMm: number; files: KnitFile[]; preview: Buffer };

const PX_PER_MM = 4;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** En sida liggande i mm: ränder i ändarna, skölden innanför och texten i mitten. */
async function side(text: string, bg: string, fg: string, thin: string, crest: Buffer | null) {
  const [L, W] = [SCARF.lengthMm, SCARF.widthMm];
  const bands = [
    [10, 34, fg],
    [46, 52, thin],
    [64, 88, fg],
  ] as const;
  const stripes = bands.flatMap(([a, b, c]) => [`<rect x="${a}" y="0" width="${b - a}" height="${W}" fill="${c}"/>`, `<rect x="${L - b}" y="0" width="${b - a}" height="${W}" fill="${c}"/>`]).join("");
  const fs = Math.min(150, 740 / (0.56 * Math.max(1, text.length)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L * PX_PER_MM}" height="${W * PX_PER_MM}" viewBox="0 0 ${L} ${W}"><rect width="${L}" height="${W}" fill="${bg}"/>${stripes}<text x="${L / 2}" y="${W / 2 + fs * 0.36}" text-anchor="middle" font-family="Oswald, 'Liberation Sans Narrow', 'Arial Narrow', 'DejaVu Sans Condensed', sans-serif" font-weight="700" font-size="${fs}" fill="${fg}">${esc(text)}</text></svg>`;
  const layers: OverlayOptions[] = [];
  if (crest) {
    const h = 150 * PX_PER_MM;
    const c = await sharp(crest).resize({ height: h, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    const top = Math.round(((W - 150) / 2) * PX_PER_MM);
    layers.push({ input: c.data, left: 104 * PX_PER_MM, top }, { input: c.data, left: Math.round((L - 104) * PX_PER_MM - c.info.width), top });
  }
  const { data } = await sharp(await sharp(Buffer.from(svg)).composite(layers).png().toBuffer())
    .resize(SCARF.rows, SCARF.side, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, capMm: fs * 0.72 };
}

/** Filnamnen i leveransen. */
export const FILES = {
  front: `halsduk-framsida-${SCARF.side}x${SCARF.rows}.bmp`,
  back: `halsduk-baksida-${SCARF.side}x${SCARF.rows}.bmp`,
  preview: "halsduk-forhandsvisning.png",
  colors: "farger.csv",
  readme: "readme.txt",
} as const;

export async function knitScarf(input: KnitInput): Promise<Knit> {
  const palette = input.yarns.slice(0, SCARF.maxColors);
  const [bg, fg, thin] = [palette[0], palette[1] ?? "#FFFFFF", palette[2] ?? palette[1] ?? "#FFFFFF"];
  const [front, back] = await Promise.all([side(input.front, bg, fg, thin, input.crest), side(input.back, fg, bg, thin, input.crest)]);
  const W = SCARF.needles;
  const cache = new Map<number, number>();
  const near = (d: Buffer, i: number) => {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let v = cache.get(key);
    if (v === undefined) {
      v = indexOfNear(palette, `#${key.toString(16).padStart(6, "0")}`);
      cache.set(key, v);
    }
    return v;
  };
  // Sidorna liggande (rad längs halsduken, maska räknad från den övre långsidan), med enfärgade ändrader. De läggs sedan
  // på maskinens nålar på samma sätt som i halsduksagenten, så att framsidan ligger som i stickeriets egen BMP.
  const faces: [Uint8Array, Uint8Array] = [new Uint8Array(SCARF.side * SCARF.rows), new Uint8Array(SCARF.side * SCARF.rows)];
  [front, back].forEach((f, k) => {
    for (let r = 0; r < SCARF.rows; r++) for (let y = 0; y < SCARF.side; y++) faces[k][r * SCARF.side + y] = near(f.data, (y * SCARF.rows + r) * 3);
  });
  plainEnds(faces);
  const cells = toMachine(faces);
  const { counts } = checkGrid(cells, palette, Math.min(front.capMm, back.capMm));
  const pal = palette.map(hexToRgb);
  const colors = bmpColors(palette, counts);
  const [frontBmp, backBmp] = ([0, 1] as const).map((k) => Buffer.from(sideBmp(cells, k, colors)));

  // Förhandsvisningen ligger ner i verkliga proportioner: framsidan överst, baksidan under, som de ritades.
  const view = async (face: Uint8Array) => {
    const out = Buffer.alloc(SCARF.rows * SCARF.side * 3);
    for (let r = 0; r < SCARF.rows; r++) for (let y = 0; y < SCARF.side; y++) out.set(pal[face[r * SCARF.side + y]], (y * SCARF.rows + r) * 3);
    return sharp(out, { raw: { width: SCARF.rows, height: SCARF.side, channels: 3 } })
      .resize(SCARF.lengthMm, SCARF.widthMm, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
  };
  const [f, b] = await Promise.all(faces.map(view));
  const gap = 16;
  const preview = await sharp({ create: { width: SCARF.lengthMm, height: SCARF.widthMm * 2 + gap, channels: 3, background: "#FFFFFF" } })
    .composite([
      { input: f, left: 0, top: 0 },
      { input: b, left: 0, top: SCARF.widthMm + gap },
    ])
    .png()
    .toBuffer();

  const list: [string, string][] = [
    [FILES.front, `framsidan, nål 1–${SCARF.side}: mönstret i stickeriets eget BMP-format, en bildpunkt per maska`],
    [FILES.back, `baksidan, nål ${SCARF.side + 1}–${W}, i samma format`],
    [FILES.preview, "fram- och baksida i verkliga proportioner, för korrektur"],
    [FILES.colors, "garnlista med närmaste Pantone, garnets färg i BMP-filerna och antal maskor"],
  ];
  const files: KnitFile[] = [
    { name: FILES.front, data: frontBmp },
    { name: FILES.back, data: backBmp },
    { name: FILES.preview, data: preview },
    { name: FILES.colors, data: Buffer.from(`\uFEFF${colorCsv(palette, counts, colors)}`) },
    { name: FILES.readme, data: Buffer.from(readMe({ club: input.club, palette, counts, date: input.date, files: list, layout: bmpLines(), bmp: colors })) },
  ];
  return { cells, palette, counts, minTextMm: Math.min(front.capMm, back.capMm), files, preview };
}
