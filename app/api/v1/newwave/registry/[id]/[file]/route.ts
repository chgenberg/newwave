import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { CLUBS_DIR, CLUB_ID, clubVector } from "@/lib/newwave/clubRegistry";

type Ctx = { params: Promise<{ id: string; file: string }> };

const FILES: Record<string, { dir: string; ext: string; type: string; vector?: boolean }> = {
  "logo.png": { dir: "logos", ext: "png", type: "image/png" },
  "bild.jpg": { dir: "images", ext: "jpg", type: "image/jpeg" },
  "vektor.png": { dir: "vektorer", ext: "png", type: "image/png", vector: true },
  "vektor.svg": { dir: "vektorer", ext: "svg", type: "image/svg+xml", vector: true },
};

/** I produktionen ligger de godkända SVG:erna packade i paketets vektorer/; på datorn kvar bredvid omritningen. */
const LOCAL_SVG = path.join(process.cwd(), ".data", "newwave", "clubs", "logos-hd");

async function readSvg(id: string) {
  const packed = await readFile(path.join(CLUBS_DIR, "vektorer", `${id}.svg.gz`)).catch(() => null);
  return packed ? gunzipSync(packed) : readFile(path.join(LOCAL_SVG, `${id}.vektor.svg`)).catch(() => null);
}

/** Loggan och bilden byts bara när klubben skrapas om; adressen bär då en ny `?v=`. Vektorn finns bara för de godkända. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id, file } = await ctx.params;
  const f = FILES[file];
  if (!f || !CLUB_ID.test(id)) return new Response("Hittades inte", { status: 404 });
  if (f.vector && (await clubVector(id))?.k !== "godkand") return new Response("Hittades inte", { status: 404 });
  const data = f.ext === "svg" ? await readSvg(id) : await readFile(path.join(CLUBS_DIR, f.dir, `${id}.${f.ext}`)).catch(() => null);
  if (!data) return new Response("Hittades inte", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": f.type, "Cache-Control": "private, max-age=86400" };
  // SVG:n öppnas aldrig som sida med skript, och sparas med klubbens namn.
  if (f.ext === "svg") Object.assign(headers, { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "Content-Disposition": `attachment; filename="${id}.svg"` });
  return new Response(new Uint8Array(data), { headers });
}
