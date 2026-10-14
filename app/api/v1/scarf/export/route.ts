import JSZip from "jszip";
import sharp from "sharp";
import { z } from "zod";
import { readJson } from "@/lib/demoLimit";
import { CELLS, SCARF, checkGrid, hexToRgb, nearestPantone, readMe } from "@/lib/scarf";

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

  const rgb = Buffer.alloc(CELLS * 3);
  const colors = palette.map(hexToRgb);
  for (let i = 0; i < CELLS; i++) rgb.set(colors[cells[i]], i * 3);
  const raw = { raw: { width: SCARF.needles, height: SCARF.rows, channels: 3 as const } };

  const [jpg, png, x4] = await Promise.all([
    sharp(rgb, raw).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer(),
    sharp(rgb, raw).png({ compressionLevel: 9 }).toBuffer(),
    sharp(rgb, raw).resize(SCARF.needles * 4, SCARF.rows * 4, { kernel: "nearest" }).png().toBuffer(),
  ]);

  const { counts } = checkGrid(new Uint8Array(cells), palette, null);
  const csv = ["Färg;Hex;RGB;Närmaste Pantone;Maskor", ...palette.map((hex, i) => `${i + 1};${hex};${hexToRgb(hex).join(",")};${nearestPantone(hex).code};${counts[i]}`)].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  const zip = new JSZip();
  zip.file("halsduk.jpg", jpg);
  zip.file("halsduk.png", png);
  zip.file("halsduk-x4.png", x4);
  zip.file("farger.csv", `\uFEFF${csv}`);
  zip.file("LAS-MIG.txt", readMe({ club, palette, counts, date }));
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  return new Response(Buffer.from(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="halsduk-${safeName(club)}-${date}.zip"`,
    },
  });
}
