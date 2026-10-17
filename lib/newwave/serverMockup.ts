import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadFile, saveFile } from "@/lib/store";
import type { NwProduct } from "./catalog";

/** Läser en bild som appen själv serverar: uppladdade filer, klubbarnas sköldar och allt under public/newwave. */
async function asset(url: string): Promise<Buffer | null> {
  const file = url.match(/^\/api\/v1\/files\/([0-9a-f-]{36}\.(?:png|jpg))$/);
  if (file) return (await loadFile(file[1]))?.data ?? null;
  const brand = url.match(/^\/api\/v1\/brand\/([a-z0-9-]+)\/([a-z0-9-]+\.png)$/);
  if (brand) {
    for (const p of [path.join(".data", "brand", brand[1], "kit", brand[2]), path.join("brand-kits", brand[1], brand[2])]) {
      const data = await readFile(path.join(process.cwd(), p)).catch(() => null);
      if (data) return data;
    }
    return null;
  }
  if (/^\/newwave\/[a-z0-9-]+(\/[a-z0-9-]+)*\.(png|jpg)$/i.test(url)) return readFile(path.join(process.cwd(), "public", url)).catch(() => null);
  return null;
}

/** Samma bild som studions `photoMockup`, fast på servern: trycket på produktfotot, multiply på ljust tyg. */
export async function serverMockup(p: Pick<NwProduct, "photo" | "box" | "dark">, printUrl: string, size = 1000): Promise<string | null> {
  const [photo, print] = await Promise.all([asset(p.photo), asset(printUrl)]);
  if (!photo || !print) return null;
  const bw = Math.round(p.box.w * size);
  const bh = Math.round(p.box.h * size);
  const logo = await sharp(print).resize(bw, bh, { fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  const left = Math.round(p.box.x * size + (bw - logo.info.width) / 2);
  const top = Math.round(p.box.y * size + (bh - logo.info.height) / 2);
  const out = await sharp(photo)
    .resize(size, size, { fit: "fill" })
    .composite([{ input: logo.data, left, top, blend: p.dark ? "over" : "multiply" }])
    .jpeg({ quality: 88 })
    .toBuffer();
  return (await saveFile(out, "jpg")).url;
}
