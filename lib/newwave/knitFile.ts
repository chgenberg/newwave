import sharp, { type OverlayOptions } from "sharp";
import { SCARF, checkGrid, colorCsv, hexToRgb, indexOfNear, readMe, ROW_H_MM, STITCH_W_MM } from "@/lib/scarf";

/**
 * Stickfilen till en jacquardhalsduk, gjord på servern: en pixel per maska, paletten är garnerna.
 * Stickmaskinernas mönsterprogram (Stoll M1plus, Shima, Seger:s Draw Designer) läser indexerad BMP eller PNG.
 */

export type KnitInput = { club: string; front: string; back: string; yarns: string[]; crest: Buffer | null; date: string };
export type KnitFile = { name: string; data: Buffer };
export type Knit = { cells: Uint8Array; palette: string[]; counts: number[]; minTextMm: number; files: KnitFile[]; preview: Buffer };

const PX_PER_MM = 4;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 8-bitars indexerad BMP, nerifrån och upp som formatet kräver; upplösningen följer maskans verkliga bredd och höjd. */
export function indexedBmp(cells: Uint8Array, w: number, h: number, palette: string[]) {
  const stride = Math.ceil(w / 4) * 4;
  const offset = 14 + 40 + 256 * 4;
  const buf = Buffer.alloc(offset + stride * h);
  buf.write("BM", 0, "latin1");
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(offset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28);
  buf.writeUInt32LE(stride * h, 34);
  buf.writeInt32LE(Math.round(1000 / STITCH_W_MM), 38);
  buf.writeInt32LE(Math.round(1000 / ROW_H_MM), 42);
  buf.writeUInt32LE(palette.length, 46);
  buf.writeUInt32LE(palette.length, 50);
  palette.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    buf.set([b, g, r, 0], 54 + i * 4);
  });
  for (let y = 0; y < h; y++) buf.set(cells.subarray(y * w, y * w + w), offset + (h - 1 - y) * stride);
  return buf;
}

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

export async function knitScarf(input: KnitInput): Promise<Knit> {
  const palette = input.yarns.slice(0, SCARF.maxColors);
  const [bg, fg, thin] = [palette[0], palette[1] ?? "#FFFFFF", palette[2] ?? palette[1] ?? "#FFFFFF"];
  const [front, back] = await Promise.all([side(input.front, bg, fg, thin, input.crest), side(input.back, fg, bg, thin, input.crest)]);
  const W = SCARF.needles;
  const cells = new Uint8Array(W * SCARF.rows);
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
  // Liggande sida: x längs halsduken = maskrad, y tvärs över = nål. Baksidan stickas spegelvänd tvärs över så att den läses rätt.
  for (let r = 0; r < SCARF.rows; r++) {
    for (let c = 0; c < SCARF.side; c++) {
      cells[r * W + c] = near(front.data, (c * SCARF.rows + r) * 3);
      cells[r * W + SCARF.side + c] = near(back.data, ((SCARF.side - 1 - c) * SCARF.rows + r) * 3);
    }
  }
  const { counts } = checkGrid(cells, palette, Math.min(front.capMm, back.capMm));
  const rgb = Buffer.alloc(W * SCARF.rows * 3);
  const pal = palette.map(hexToRgb);
  cells.forEach((v, i) => rgb.set(pal[v], i * 3));
  const raw = { raw: { width: W, height: SCARF.rows, channels: 3 as const } };
  const png = await sharp(rgb, raw).png({ palette: true, colours: palette.length, dither: 0 }).toBuffer();
  const bmp = indexedBmp(cells, W, SCARF.rows, palette);

  // Förhandsvisningen ligger ner i verkliga proportioner: framsidan överst, baksidan under.
  const view = async (back: boolean) => {
    const out = Buffer.alloc(SCARF.rows * SCARF.side * 3);
    for (let r = 0; r < SCARF.rows; r++)
      for (let c = 0; c < SCARF.side; c++) out.set(pal[cells[r * W + (back ? SCARF.needles - 1 - c : c)]], (c * SCARF.rows + r) * 3);
    return sharp(out, { raw: { width: SCARF.rows, height: SCARF.side, channels: 3 } })
      .resize(SCARF.lengthMm, SCARF.widthMm, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
  };
  const [f, b] = await Promise.all([view(false), view(true)]);
  const gap = 16;
  const preview = await sharp({ create: { width: SCARF.lengthMm, height: SCARF.widthMm * 2 + gap, channels: 3, background: "#FFFFFF" } })
    .composite([
      { input: f, left: 0, top: 0 },
      { input: b, left: 0, top: SCARF.widthMm + gap },
    ])
    .png()
    .toBuffer();

  const files: KnitFile[] = [
    { name: "halsduk.bmp", data: bmp },
    { name: "halsduk.png", data: png },
    { name: "halsduk-forhandsvisning.png", data: preview },
    { name: "farger.csv", data: Buffer.from(`\uFEFF${colorCsv(palette, counts)}`) },
    {
      name: "readme.txt",
      data: Buffer.from(
        readMe({
          club: input.club,
          palette,
          counts,
          date: input.date,
          files: [
            ["halsduk.bmp", "8-bitars indexerad BMP, paletten är garnerna – läses av Stoll M1plus, Shima och Draw Designer"],
            ["halsduk.png", "samma mönster som PNG med palett, förlustfritt"],
            ["halsduk-forhandsvisning.png", "fram- och baksida i verkliga proportioner, för korrektur"],
            ["farger.csv", "garnlista med närmaste Pantone och antal maskor"],
          ],
        }),
      ),
    },
  ];
  return { cells, palette, counts, minTextMm: Math.min(front.capMm, back.capMm), files, preview };
}
