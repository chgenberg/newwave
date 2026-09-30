"use client";

import QRCode from "qrcode";
import { MOCKUP_ASPECT } from "@/components/ProductMockup";

export const PRINT_DPI = 300;
export const PRINT_W = Math.round((30 / 2.54) * PRINT_DPI);
export const PRINT_H = Math.round((40 / 2.54) * PRINT_DPI);
const K = PRINT_W / 2400;
const SANS = `-apple-system, "Helvetica Neue", Arial, sans-serif`;

export type PrintVariant = "light" | "dark";

export function loadImage(src: string, timeoutMs = 20000) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error("Bilden laddades inte i tid")), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Kunde inte ladda bild"));
    };
    img.src = src;
  });
}

export const fontsReady = () => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

export const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const qrDataUrl = (text: string, dark = "#234B9A") =>
  QRCode.toDataURL(text, { margin: 1, width: 720, errorCorrectionLevel: "M", color: { dark, light: "#FFFFFF" } });

export const brandFont = (px: number, family: string) => `900 ${px}px ${family}`;

const crest: { image: HTMLImageElement | null; inverse: HTMLImageElement | null; aspect: number; clubId: string } = {
  image: null,
  inverse: null,
  aspect: 0.657,
  clubId: "",
};

/** `inverseOnColor`: use the white logo on brand-coloured backgrounds (for logos drawn in the brand colour). */
export async function loadClubCrest(clubId: string, inverseOnColor = false) {
  if (crest.image && crest.clubId === clubId) return;
  crest.clubId = clubId;
  crest.inverse = inverseOnColor ? await loadImage(`/api/v1/brand/${clubId}/skold-vit.png`).catch(() => null) : null;
  try {
    crest.image = await loadImage(`/api/v1/brand/${clubId}/skold-farg.png`);
    crest.aspect = (crest.image.naturalWidth || 657) / (crest.image.naturalHeight || 1000);
  } catch {
    crest.image = null;
  }
}

export function drawCrest(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, fill: string, ink: string, font: string, onColor = false) {
  const h = w * 1.18;
  const image = onColor && crest.inverse ? crest.inverse : crest.image;
  if (image) {
    const cw = crest.aspect > 1 ? h : h * crest.aspect;
    const ch = crest.aspect > 1 ? h / crest.aspect : h;
    ctx.drawImage(image, cx - cw / 2, top + (h - ch) / 2, cw, ch);
    return;
  }
  const x = cx - w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x + w, top);
  ctx.lineTo(x + w, top + h * 0.55);
  ctx.quadraticCurveTo(x + w, top + h * 0.85, cx, top + h);
  ctx.quadraticCurveTo(x, top + h * 0.85, x, top + h * 0.55);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w * 0.05;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = brandFont(w * 0.36, font);
  ctx.fillText("IFK", cx, top + h * 0.42);
  ctx.font = brandFont(w * 0.1, font);
  ctx.fillText("PLATSHÅLLARE", cx, top + h * 0.7);
  ctx.restore();
}

export function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number, font: string) {
  const fits = (lines: string[], px: number) => {
    ctx.font = brandFont(px, font);
    return lines.every((l) => ctx.measureText(l).width <= maxWidth);
  };
  for (let px = startPx; px >= minPx; px -= 4) if (fits([text], px)) return { lines: [text], px };
  const words = text.split(" ");
  let best = { lines: [text], px: minPx };
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    for (let px = startPx; px >= minPx * 0.7; px -= 4) {
      if (fits(lines, px)) {
        if (px > best.px || best.lines.length === 1) best = { lines, px };
        break;
      }
    }
  }
  return best;
}

function shrinkToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number, px: number, family: string, weight = "") {
  do ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxW && --px > 12);
  return px;
}

function newCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d")! };
}

export async function composePrintFile(opts: {
  artworkUrl: string;
  slogan: string;
  footer: string;
  variant: PrintVariant;
  font: string;
  primary: string;
  scale?: number;
}) {
  await fontsReady();
  const s = opts.scale ?? 1;
  const W = Math.round(PRINT_W * s), H = Math.round(PRINT_H * s), k = K * s;
  const { canvas, ctx } = newCanvas(W, H);
  const ink = opts.variant === "dark" ? "#FFFFFF" : opts.primary;
  const crestFill = opts.variant === "dark" ? opts.primary : "#FFFFFF";

  drawCrest(ctx, W / 2, 80 * k, 340 * k, crestFill, ink, opts.font);

  const art = await loadImage(opts.artworkUrl);
  const box = 2000 * k;
  const ratio = (art.width || 1024) / (art.height || 1024);
  const aw = ratio >= 1 ? box : box * ratio;
  const ah = ratio >= 1 ? box / ratio : box;
  ctx.drawImage(art, (W - aw) / 2, 560 * k + (box - ah) / 2, aw, ah);

  const fitted = fitLines(ctx, opts.slogan.toUpperCase(), W - 200 * k, 300 * k, 200 * k, opts.font);
  const px = fitted.lines.length === 1 ? fitted.px : Math.min(fitted.px, 220 * k);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = brandFont(px, opts.font);
  fitted.lines.forEach((l, i) => ctx.fillText(l, W / 2, 2960 * k - (fitted.lines.length - 1 - i) * px * 1.08));

  ctx.font = brandFont(90 * k, opts.font);
  ctx.globalAlpha = 0.85;
  ctx.fillText(opts.footer.toUpperCase(), W / 2, 3110 * k);
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/png");
}

export async function composeBackPrint(opts: {
  name: string;
  number: string;
  variant: PrintVariant;
  font: string;
  primary: string;
  clubName: string;
  scale?: number;
}) {
  await fontsReady();
  const s = opts.scale ?? 1;
  const W = Math.round(PRINT_W * s), H = Math.round(PRINT_H * s), k = K * s;
  const { canvas, ctx } = newCanvas(W, H);
  const ink = opts.variant === "dark" ? "#FFFFFF" : opts.primary;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const namePx = shrinkToWidth(ctx, opts.name.toUpperCase(), W * 0.86, 360 * k, opts.font, "900");
  ctx.font = brandFont(namePx, opts.font);
  ctx.fillText(opts.name.toUpperCase(), W / 2, 620 * k);
  ctx.font = brandFont(1500 * k, opts.font);
  ctx.fillText(opts.number, W / 2, 2350 * k);
  ctx.font = brandFont(110 * k, opts.font);
  ctx.globalAlpha = 0.85;
  ctx.fillText(opts.clubName.toUpperCase(), W / 2, 2700 * k);
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/png");
}

export async function composeCampaignImage(opts: {
  mockupSvg: string;
  headline: string;
  subline: string;
  cta: string;
  width: number;
  height: number;
  font: string;
  primary: string;
  qr?: { dataUrl: string; caption: string };
}) {
  await fontsReady();
  const { width: W, height: H, font } = opts;
  const { canvas, ctx } = newCanvas(W, H);
  ctx.fillStyle = opts.primary;
  ctx.fillRect(0, 0, W, H);

  const mockup = await loadImage(svgToDataUrl(opts.mockupSvg));
  const qr = opts.qr ? await loadImage(opts.qr.dataUrl) : null;
  const headline = opts.headline.toUpperCase();

  const pill = (text: string, x: number, y: number, px: number, align: "left" | "center") => {
    ctx.font = `600 ${px}px ${SANS}`;
    const w = ctx.measureText(text).width + px * 2.2;
    const h = px * 2.3;
    const left = align === "center" ? x - w / 2 : x;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(left, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = opts.primary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + w / 2, y + px * 0.05);
  };

  if (W / H >= 1.3) {
    const mh = Math.min(H * 0.92, W * 0.42 * MOCKUP_ASPECT);
    const mw = mh / MOCKUP_ASPECT;
    const mx = W * 0.06;
    ctx.drawImage(mockup, mx, (H - mh) / 2 + H * 0.02, mw, mh);

    const left = mx + mw + W * 0.05;
    const maxW = W - left - W * 0.05;
    const crestW = H * 0.1;
    const { lines, px } = fitLines(ctx, headline, maxW, Math.round(H * 0.2), Math.round(H * 0.09), font);
    const subPx = Math.round(Math.max(px * 0.28, H * 0.035));
    const qrSize = qr ? H * 0.22 : 0;
    const tail = qr ? qrSize : subPx * 2.3;
    const block = crestW * 1.18 + H * 0.05 + lines.length * px + H * 0.03 + subPx * 1.4 + H * 0.05 + tail;
    let y = Math.max(H * 0.04, (H - block) / 2);

    drawCrest(ctx, left + crestW / 2, y, crestW, opts.primary, "#FFFFFF", font, true);
    y += crestW * 1.18 + H * 0.05;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = brandFont(px, font);
    lines.forEach((l) => {
      ctx.fillText(l, left, y);
      y += px;
    });
    y += H * 0.03;
    shrinkToWidth(ctx, opts.subline, maxW, subPx, SANS);
    ctx.globalAlpha = 0.9;
    ctx.fillText(opts.subline, left, y);
    ctx.globalAlpha = 1;
    y += subPx * 1.4 + H * 0.05;
    if (qr) {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(left - qrSize * 0.06, y - qrSize * 0.06, qrSize * 1.12, qrSize * 1.12, qrSize * 0.08);
      ctx.fill();
      ctx.drawImage(qr, left, y, qrSize, qrSize);
      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${subPx}px ${SANS}`;
      ctx.fillText(opts.qr!.caption, left + qrSize * 1.3, y + qrSize * 0.38);
      ctx.font = `${subPx * 0.8}px ${SANS}`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(opts.cta, left + qrSize * 1.3, y + qrSize * 0.64);
      ctx.globalAlpha = 1;
    } else {
      pill(opts.cta, left, y + subPx, subPx * 0.8, "left");
    }
  } else {
    const crestW = W * 0.09;
    drawCrest(ctx, W / 2, H * 0.045, crestW, opts.primary, "#FFFFFF", font, true);
    const { lines, px } = fitLines(ctx, headline, W * 0.88, Math.round(W * 0.13), Math.round(W * 0.075), font);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = brandFont(px, font);
    let y = H * 0.045 + crestW * 1.18 + H * 0.03;
    lines.forEach((l) => {
      ctx.fillText(l, W / 2, y);
      y += px;
    });

    const bottomReserve = qr ? H * 0.3 : H * 0.2;
    const avail = H - y - bottomReserve;
    const mh = Math.min(avail, W * 0.8 * MOCKUP_ASPECT);
    const mw = mh / MOCKUP_ASPECT;
    ctx.drawImage(mockup, (W - mw) / 2, y + (avail - mh) / 2 + H * 0.01, mw, mh);

    const subPx = Math.round(W * 0.036);
    shrinkToWidth(ctx, opts.subline, W * 0.9, subPx, SANS);
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.92;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.subline, W / 2, H - bottomReserve * (qr ? 0.86 : 0.68));
    ctx.globalAlpha = 1;
    if (qr) {
      const size = bottomReserve * 0.52;
      const top = H - bottomReserve * 0.72;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(W / 2 - size * 0.56, top - size * 0.06, size * 1.12, size * 1.12, size * 0.08);
      ctx.fill();
      ctx.drawImage(qr, W / 2 - size / 2, top, size, size);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `600 ${subPx}px ${SANS}`;
      ctx.fillText(opts.qr!.caption, W / 2, H - bottomReserve * 0.08);
    } else {
      pill(opts.cta, W / 2, H - bottomReserve * 0.32, subPx * 0.85, "center");
    }
  }
  return canvas.toDataURL("image/png");
}

export const dataUrlToBase64 = (url: string) => url.split(",")[1];
