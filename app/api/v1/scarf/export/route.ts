import JSZip from "jszip";
import sharp from "sharp";
import { z } from "zod";
import { readJson } from "@/lib/demoLimit";
import { CELLS, SCARF, checkGrid, colorCsv, hexToRgb, readMe } from "@/lib/scarf";
import { bmpColors, bmpLines, fromDrawnSides, sideBmp } from "@/lib/scarfMachine";

export const maxDuration = 30;

const Body = z.object({
  club: z.string().trim().min(1).max(80),
  palette: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(2).max(SCARF.maxColors),
  cells: z.string().max(Math.ceil(CELLS / 3) * 4 + 8),
});

const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "klubb";

export async function POST(req: Request) {
  const body = await readJson(req, 600_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltigt mönster" }, { status: 400 });
  const { club, palette } = parsed.data;
  const cells = Buffer.from(parsed.data.cells, "base64");
  if (cells.length !== CELLS || cells.some((v) => v >= palette.length)) return Response.json({ error: "Ogiltigt mönster" }, { status: 400 });

  // Halsduksstudion lägger sidorna bredvid varandra som de ritades. Här läggs de på maskinens nålar som i
  // halsduksagenten, med enfärgade ändrader, och lämnas som en BMP per sida i stickeriets format.
  const { cells: machine, faces } = fromDrawnSides(new Uint8Array(cells));
  const { counts } = checkGrid(machine, palette, null);
  const colors = bmpColors(palette, counts);
  const [front, back] = ([0, 1] as const).map((k) => Buffer.from(sideBmp(machine, k, colors)));

  // Förhandsvisningen: båda sidorna liggande som de ritades, framsidan överst.
  const pal = palette.map(hexToRgb);
  const [R, S] = [SCARF.rows, SCARF.side];
  const sideRgb = (face: Uint8Array) => {
    const out = Buffer.alloc(R * S * 3);
    for (let r = 0; r < R; r++) for (let y = 0; y < S; y++) out.set(pal[face[r * S + y]], (y * R + r) * 3);
    return sharp(out, { raw: { width: R, height: S, channels: 3 } }).resize(R * 2, S * 3, { kernel: "nearest" }).png().toBuffer();
  };
  const [f, b] = await Promise.all(faces.map(sideRgb));
  const preview = await sharp({ create: { width: R * 2, height: S * 6 + 24, channels: 3, background: "#FFFFFF" } })
    .composite([
      { input: f, left: 0, top: 0 },
      { input: b, left: 0, top: S * 3 + 24 },
    ])
    .png()
    .toBuffer();

  const csv = colorCsv(palette, counts, colors);
  const date = new Date().toISOString().slice(0, 10);
  const name = { front: `halsduk-framsida-${S}x${R}.bmp`, back: `halsduk-baksida-${S}x${R}.bmp`, preview: "halsduk-forhandsvisning.png" };
  const files: [string, string][] = [
    [name.front, `framsidan, nål 1–${S}: mönstret i stickeriets eget BMP-format, en bildpunkt per maska`],
    [name.back, `baksidan, nål ${S + 1}–${SCARF.needles}, i samma format`],
    [name.preview, "fram- och baksida liggande, för granskning på skärm"],
    ["farger.csv", "färglista med närmaste Pantone och färgen i BMP-filerna"],
  ];

  const zip = new JSZip();
  zip.file(name.front, front);
  zip.file(name.back, back);
  zip.file(name.preview, preview);
  zip.file("farger.csv", `\uFEFF${csv}`);
  zip.file("LAS-MIG.txt", readMe({ club, palette, counts, date, files, layout: bmpLines(), bmp: colors }));
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  return new Response(Buffer.from(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="halsduk-${safeName(club)}-${date}.zip"`,
    },
  });
}
