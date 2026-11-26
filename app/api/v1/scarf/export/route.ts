import JSZip from "jszip";
import { z } from "zod";
import { readJson } from "@/lib/demoLimit";
import { CELLS, SCARF } from "@/lib/scarf";
import { facesFromDrawn, packageFromFaces } from "@/lib/scarfPackage";

export const maxDuration = 60;

const Body = z.object({
  club: z.string().trim().min(1).max(80),
  palette: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(2).max(SCARF.maxColors),
  cells: z.string().max(Math.ceil(CELLS / 3) * 4 + 8),
  /** Vad som står på sidorna, i ord, till stickordern. Saknas: "som den ritades". */
  front: z.string().trim().max(160).optional(),
  back: z.string().trim().max(160).optional(),
});

const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "klubb";

/**
 * Stickfilerna till en halsduk som ritats med sidorna bredvid varandra – i halsduksstudion och i kampanjpaketet. Paketet är
 * exakt det stickeriet godkänt (lib/scarfPackage.ts): en BMP för hela halsduken, korrektur, stickorder som PDF,
 * garnlista, stickorder som data och LÄS MIG.
 */
export async function POST(req: Request) {
  const body = await readJson(req, 600_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltigt mönster" }, { status: 400 });
  const { club, palette } = parsed.data;
  const cells = Buffer.from(parsed.data.cells, "base64");
  if (cells.length !== CELLS || cells.some((v) => v >= palette.length)) return Response.json({ error: "Ogiltigt mönster" }, { status: 400 });

  const date = new Date().toISOString().slice(0, 10);
  const pack = await packageFromFaces({
    club,
    title: "Halsduk",
    front: parsed.data.front || "framsidan som den ritades",
    back: parsed.data.back || "baksidan som den ritades",
    faces: facesFromDrawn(new Uint8Array(cells)),
    palette,
    date,
  });
  const zip = new JSZip();
  for (const f of pack.files) zip.file(f.name, f.data);
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  return new Response(Buffer.from(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="halsduk-${safeName(club)}-${date}.zip"`,
    },
  });
}
