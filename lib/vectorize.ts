import sharp from "sharp";
import { Potrace } from "potrace";
import { hexToRgb } from "./imagecheck";

function traceMask(mask: Buffer, color: string) {
  return new Promise<string>((resolve, reject) => {
    const p = new Potrace({ turdSize: 12, optTolerance: 0.35, threshold: 128, blackOnWhite: true });
    p.loadImage(mask, (err: Error | null) => {
      if (err) return reject(err);
      resolve(p.getPathTag(color).replace('stroke="none"', `stroke="${color}" stroke-width="1.2" stroke-linejoin="round"`));
    });
  });
}

export async function vectorizeToPalette(png: Buffer, paletteHex: string[]) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const palette = paletteHex.map(hexToRgb);
  const masks = palette.map(() => Buffer.alloc(width * height, 255));
  const counts = palette.map(() => 0);

  for (let i = 0, px = 0; i < data.length; i += 4, px++) {
    if (data[i + 3] < 128) continue;
    let best = 0, bestD = Infinity;
    for (let c = 0; c < palette.length; c++) {
      const [r, g, b] = palette[c];
      const d = (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    masks[best][px] = 0;
    counts[best]++;
  }

  const layers = await Promise.all(
    palette
      .map((_, c) => c)
      .filter((c) => counts[c] > width * height * 0.001)
      .sort((a, b) => counts[b] - counts[a])
      .map(async (c) => {
        const maskPng = await sharp(masks[c], { raw: { width, height, channels: 1 } }).png().toBuffer();
        return traceMask(maskPng, paletteHex[c]);
      }),
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${layers.join("\n")}\n</svg>`;
  return { svg, colorsUsed: paletteHex.filter((_, c) => counts[c] > width * height * 0.001) };
}
