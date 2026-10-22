"use client";

const LOGO_TYPES = /^image\/(png|jpeg|webp|svg\+xml)$/;
const MAX_LOGO_BYTES = 10_000_000;
const MAX_SVG_BYTES = 5_000_000;

const isVector = (file: File) => file.type.includes("svg") || /\.svg$/i.test(file.name);

function checkLogoFile(file: File) {
  if (!LOGO_TYPES.test(file.type) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) throw new Error("Använd en bild i PNG, JPG, WebP eller SVG.");
  if (file.size > (isVector(file) ? MAX_SVG_BYTES : MAX_LOGO_BYTES)) throw new Error(`Filen är för stor (max ${isVector(file) ? 5 : 10} MB).`);
}

/** Read an uploaded logo into a PNG data URL of at most 1200 px, so it stays light in the cart and the offer. */
export async function readLogoFile(file: File): Promise<string> {
  checkLogoFile(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Kunde inte läsa bilden."));
      el.src = url;
    });
    // SVGs without a width/height report 0, and vectors should be drawn sharp – always at 1200 px.
    const w0 = img.naturalWidth || 1000;
    const h0 = img.naturalHeight || 1000;
    const scale = isVector(file) ? 1200 / Math.max(w0, h0) : Math.min(1, 1200 / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A logo for /api/v1/logo: an SVG goes as it is so the server can crop and draw the vector sharp; other images are scaled down first. */
export async function readLogoUpload(file: File): Promise<string> {
  if (!isVector(file)) return readLogoFile(file);
  checkLogoFile(file);
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Kunde inte läsa filen."));
    r.readAsDataURL(new Blob([file], { type: "image/svg+xml" }));
  });
}
