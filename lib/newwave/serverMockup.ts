import sharp from "sharp";
import { saveFile } from "@/lib/store";
import { readAsset } from "./asset";
import { isSoft, type NwProduct, printOf } from "./catalog";
import { printFit, printOnPhoto } from "./printSurface";

type Visual = Pick<NwProduct, "photo" | "print" | "chest" | "center" | "dark" | "kind">;

/** Trycket på produktfotot som JPEG, `size` pixlar i kvadrat; samma bild som butiken visar. */
export async function mockupJpeg(p: Visual, printUrl: string, size = 1000, zone?: string): Promise<Buffer | null> {
  const [photoFile, logoFile] = await Promise.all([readAsset(p.photo), readAsset(printUrl)]);
  if (!photoFile || !logoFile) return null;
  const s = printOf(p, zone);
  const meta = await sharp(logoFile, { density: 200 }).metadata();
  const fit = printFit(s, (meta.width || 1) / (meta.height || 1), size);
  const [photo, logo] = await Promise.all([
    sharp(photoFile).resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(logoFile, { density: 200 })
      .resize(Math.max(1, Math.round(fit.w * 2)), Math.max(1, Math.round(fit.h * 2)), { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  const out = printOnPhoto(s, { data: photo.data, width: size, height: size }, { data: logo.data, width: logo.info.width, height: logo.info.height }, { dark: p.dark, soft: isSoft(p) });
  return sharp(Buffer.from(out.buffer, out.byteOffset, out.byteLength), { raw: { width: size, height: size, channels: 4 } })
    .jpeg({ quality: 86 })
    .toBuffer();
}

export async function serverMockup(p: Visual, printUrl: string, size = 1000, zone?: string): Promise<string | null> {
  const out = await mockupJpeg(p, printUrl, size, zone);
  return out ? (await saveFile(out, "jpg")).url : null;
}
