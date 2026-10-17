import { loadImage } from "@/lib/compose";
import type { NwProduct } from "./catalog";

/** Trycket på det riktiga produktfotot: multiply på ljust tyg så vävstrukturen syns, vanlig tryckfärg på mörkt. */
export async function photoMockup(visual: Pick<NwProduct, "photo" | "box">, printUrl: string, dark: boolean, size = 1000) {
  const [photo, print] = await Promise.all([loadImage(visual.photo), loadImage(printUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0, size, size);

  const bw = visual.box.w * size;
  const bh = visual.box.h * size;
  const ratio = (print.width || 3) / (print.height || 4);
  const w = Math.min(bw, bh * ratio);
  const h = w / ratio;
  const x = visual.box.x * size + (bw - w) / 2;
  const y = visual.box.y * size + (bh - h) / 2;

  ctx.globalCompositeOperation = dark ? "source-over" : "multiply";
  ctx.globalAlpha = dark ? 0.94 : 1;
  ctx.drawImage(print, x, y, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/jpeg", 0.88);
}
