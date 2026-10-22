import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLUBS_DIR, CLUB_ID } from "@/lib/newwave/clubRegistry";

type Ctx = { params: Promise<{ id: string; file: string }> };

const FILES: Record<string, { dir: string; ext: string; type: string }> = {
  "logo.png": { dir: "logos", ext: "png", type: "image/png" },
  "bild.jpg": { dir: "images", ext: "jpg", type: "image/jpeg" },
};

/** Loggan och bilden byts bara när klubben skrapas om; adressen bär då en ny `?v=`. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id, file } = await ctx.params;
  const f = FILES[file];
  if (!f || !CLUB_ID.test(id)) return new Response("Hittades inte", { status: 404 });
  const data = await readFile(path.join(CLUBS_DIR, f.dir, `${id}.${f.ext}`)).catch(() => null);
  if (!data) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": f.type, "Cache-Control": "private, max-age=86400" } });
}
