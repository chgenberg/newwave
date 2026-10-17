import sharp from "sharp";
import { saveFile } from "@/lib/store";
import { readAsset } from "./asset";
import type { NwProduct } from "./catalog";

/** Samma bild som studions `photoMockup`, fast på servern: trycket på produktfotot, multiply på ljust tyg. */
export async function mockupJpeg(p: Pick<NwProduct, "photo" | "box" | "dark">, printUrl: string, size = 1000): Promise<Buffer | null> {
  const [photo, print] = await Promise.all([readAsset(p.photo), readAsset(printUrl)]);
  if (!photo || !print) return null;
  const bw = Math.round(p.box.w * size);
  const bh = Math.round(p.box.h * size);
  const logo = await sharp(print).resize(bw, bh, { fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  const left = Math.round(p.box.x * size + (bw - logo.info.width) / 2);
  const top = Math.round(p.box.y * size + (bh - logo.info.height) / 2);
  return sharp(photo)
    .resize(size, size, { fit: "fill" })
    .composite([{ input: logo.data, left, top, blend: p.dark ? "over" : "multiply" }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function serverMockup(p: Pick<NwProduct, "photo" | "box" | "dark">, printUrl: string, size = 1000): Promise<string | null> {
  const out = await mockupJpeg(p, printUrl, size);
  return out ? (await saveFile(out, "jpg")).url : null;
}
