import { loadImage } from "@/lib/compose";
import type { NwProduct } from "./catalog";
import { printFit, warpPrint } from "./printSurface";

/** Trycket på det riktiga produktfotot, lagt på tryckytan: multiply på ljust tyg så vävstrukturen syns, vanlig tryckfärg på mörkt. */
export async function photoMockup(visual: Pick<NwProduct, "photo" | "print">, printUrl: string, dark: boolean, size = 1000) {
  const [photo, print] = await Promise.all([loadImage(visual.photo), loadImage(printUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0, size, size);

  const fit = printFit(visual.print, (print.width || 3) / (print.height || 4), size);
  const logo = document.createElement("canvas");
  logo.width = Math.max(1, Math.round(fit.w * 2));
  logo.height = Math.max(1, Math.round(fit.h * 2));
  const lctx = logo.getContext("2d")!;
  lctx.drawImage(print, 0, 0, logo.width, logo.height);
  const layer = warpPrint(visual.print, lctx.getImageData(0, 0, logo.width, logo.height), size);

  const overlay = document.createElement("canvas");
  overlay.width = size;
  overlay.height = size;
  overlay.getContext("2d")!.putImageData(new ImageData(layer, size, size), 0, 0);
  ctx.globalCompositeOperation = dark ? "source-over" : "multiply";
  ctx.globalAlpha = dark ? 0.94 : 1;
  ctx.drawImage(overlay, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/jpeg", 0.88);
}
