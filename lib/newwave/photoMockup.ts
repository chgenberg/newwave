import { loadImage } from "@/lib/compose";
import { isSoft, type NwProduct, printOf } from "./catalog";
import { printFit, printOnPhoto } from "./printSurface";

const pixels = (img: CanvasImageSource, width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, image: ctx.getImageData(0, 0, width, height) };
};

/** Trycket på det riktiga produktfotot i webbläsaren, för tryckfiler som bara finns här; samma bild som servern ritar. */
export async function photoMockup(visual: Pick<NwProduct, "photo" | "print" | "chest" | "kind">, printUrl: string, dark: boolean, size = 1000) {
  const [photoImg, printImg] = await Promise.all([loadImage(visual.photo), loadImage(printUrl)]);
  const s = printOf(visual);
  const fit = printFit(s, (printImg.width || 3) / (printImg.height || 4), size);
  const photo = pixels(photoImg, size, size);
  const logo = pixels(printImg, Math.max(1, Math.round(fit.w * 2)), Math.max(1, Math.round(fit.h * 2))).image;
  const out = printOnPhoto(s, photo.image, logo, { dark, soft: isSoft(visual) });
  photo.ctx.putImageData(new ImageData(out, size, size), 0, 0);
  return photo.canvas.toDataURL("image/jpeg", 0.88);
}
