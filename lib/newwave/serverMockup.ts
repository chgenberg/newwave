import sharp, { type OverlayOptions } from "sharp";
import { saveFile } from "@/lib/store";
import { readAsset } from "./asset";
import type { NwProduct } from "./catalog";
import { printFit, type Surface, warpPrint } from "./printSurface";

/** Loggan lagd på tryckytan som ett lager lika stort som fotot; multiply på ljusa produkter så att strukturen syns. */
export async function printLayer(s: Surface, logo: Buffer, size: number, dark: boolean): Promise<OverlayOptions> {
  const meta = await sharp(logo, { density: 200 }).metadata();
  const fit = printFit(s, (meta.width || 1) / (meta.height || 1), size);
  const raw = await sharp(logo, { density: 200 })
    .resize(Math.max(1, Math.round(fit.w * 2)), Math.max(1, Math.round(fit.h * 2)), { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const layer = warpPrint(s, { data: raw.data, width: raw.info.width, height: raw.info.height }, size);
  return { input: Buffer.from(layer.buffer, layer.byteOffset, layer.byteLength), raw: { width: size, height: size, channels: 4 }, blend: dark ? "over" : "multiply" };
}

/** Samma bild som studions `photoMockup`, fast på servern: trycket på produktfotot. */
export async function mockupJpeg(p: Pick<NwProduct, "photo" | "print" | "dark">, printUrl: string, size = 1000): Promise<Buffer | null> {
  const [photo, print] = await Promise.all([readAsset(p.photo), readAsset(printUrl)]);
  if (!photo || !print) return null;
  return sharp(photo)
    .resize(size, size, { fit: "fill" })
    .composite([await printLayer(p.print, print, size, p.dark)])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function serverMockup(p: Pick<NwProduct, "photo" | "print" | "dark">, printUrl: string, size = 1000): Promise<string | null> {
  const out = await mockupJpeg(p, printUrl, size);
  return out ? (await saveFile(out, "jpg")).url : null;
}
