"use client";

import { MOCKUP_ASPECT } from "@/components/ProductMockup";
import { brandFont, drawCrest, fitLines, fontsReady, loadImage, svgToDataUrl } from "./compose";

const W = 1080;
const H = 1920;
const FPS = 30;
const DURATION = 10;
const SANS = `-apple-system, "Helvetica Neue", Arial, sans-serif`;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t: number, a: number, b: number) => (t - a) / (b - a);

export function videoMimeType() {
  const options = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

export async function renderReel(opts: {
  headline: string;
  subline: string;
  tagline: string;
  photoUrl?: string;
  mockups: string[];
  qrDataUrl: string;
  font: string;
  primary: string;
  shopName?: string;
  shopSupport?: string;
}): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const [photo, qr, ...mockups] = await Promise.all([
    opts.photoUrl ? loadImage(opts.photoUrl) : Promise.resolve(null),
    loadImage(opts.qrDataUrl),
    ...opts.mockups.map((m) => loadImage(svgToDataUrl(m))),
  ]);
  const headline = opts.headline.toUpperCase();
  const head = fitLines(ctx, headline, W * 0.86, 150, 84, opts.font);

  const drawHeadline = (y: number, alpha: number, scale: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = brandFont(head.px, opts.font);
    head.lines.forEach((l, i) => ctx.fillText(l, 0, i * head.px));
    ctx.restore();
  };

  const frame = (t: number) => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = opts.primary;
    ctx.fillRect(0, 0, W, H);

    if (t < 2.4) {
      const a = ease(seg(t, 0, 0.6));
      drawCrest(ctx, W / 2, 520 - 40 * (1 - a), 150, opts.primary, "#FFFFFF", opts.font, true);
      drawHeadline(760, ease(seg(t, 0.25, 0.9)), 1.25 - 0.25 * ease(seg(t, 0.25, 0.9)));
    } else if (t < 5.4 && photo) {
      const p = seg(t, 2.4, 5.4);
      const zoom = 1.04 + 0.1 * p;
      const scale = Math.max(W / photo.width, H / photo.height) * zoom;
      const pw = photo.width * scale, ph = photo.height * scale;
      ctx.globalAlpha = ease(seg(t, 2.4, 2.7));
      ctx.drawImage(photo, (W - pw) / 2, (H - ph) / 2 - 40 * p, pw, ph);
      const g = ctx.createLinearGradient(0, H * 0.8, 0, H);
      g.addColorStop(0, "rgba(26,55,112,0)");
      g.addColorStop(1, "rgba(26,55,112,0.8)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = ease(seg(t, 2.9, 3.4));
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 44px ${SANS}`;
      ctx.fillText(opts.tagline, W / 2, H - 110);
      ctx.globalAlpha = 1;
    } else if (t < 8.2) {
      const start = photo ? 5.4 : 2.4;
      const n = mockups.length;
      mockups.forEach((m, i) => {
        const a = ease(seg(t, start + i * 0.35, start + 0.6 + i * 0.35));
        const mh = n > 1 ? 780 : 1100;
        const mw = mh / MOCKUP_ASPECT;
        const cx = n > 1 ? W / 2 + (i - (n - 1) / 2) * (mw * 0.72) : W / 2;
        const float = Math.sin((t + i) * 2) * 10;
        ctx.globalAlpha = a;
        ctx.drawImage(m, cx - mw / 2 + (1 - a) * (i % 2 ? 300 : -300), 560 + float + i * 80, mw, mh);
      });
      ctx.globalAlpha = 1;
      drawHeadline(220, 1, 0.8);
    } else {
      const a = ease(seg(t, 8.2, 8.7));
      drawCrest(ctx, W / 2, 200, 130, opts.primary, "#FFFFFF", opts.font, true);
      drawHeadline(420, 1, 0.85);
      ctx.globalAlpha = a;
      const size = 420;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(W / 2 - size / 2 - 24, 900 - 24, size + 48, size + 48, 32);
      ctx.fill();
      ctx.drawImage(qr, W / 2 - size / 2, 900, size, size);
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 52px ${SANS}`;
      ctx.fillText(opts.shopName ?? "Klubbshoppen hos Intersport", W / 2, 1480);
      let px = 40;
      do ctx.font = `${px}px ${SANS}`;
      while (ctx.measureText(opts.subline).width > W * 0.88 && --px > 20);
      ctx.globalAlpha = a * 0.9;
      ctx.fillText(opts.subline, W / 2, 1560);
      if (!/beställning|stöttar/i.test(opts.subline)) {
        ctx.font = `36px ${SANS}`;
        ctx.fillText(opts.shopSupport ?? "Tryckt på beställning · Varje köp stöttar klubben", W / 2, 1630);
      }
      ctx.globalAlpha = 1;
    }
  };

  const mimeType = videoMimeType();
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  frame(0);
  recorder.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      frame(Math.min(t, DURATION));
      if (t >= DURATION) return resolve();
      setTimeout(tick, 1000 / FPS);
    };
    tick();
  });
  recorder.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await done;
  const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mimeType.split(";")[0] }), ext };
}
