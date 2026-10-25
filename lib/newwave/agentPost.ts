import type { AgentPost } from "./klubbagent";

/**
 * Inläggen från klubbens agent, ritade i webbläsaren: klubbens foto eller färg, märket, typsnittet och texterna.
 * Ingen bild-AI – samma inlägg blir alltid likadant.
 */

export type PostSize = "feed" | "story";
export type PostLook = { name: string; handle: string; site: string; crest: string; primary: string; accent: string; onAccent: string; font: string };

const SIZES: Record<PostSize, [number, number]> = { feed: [1080, 1350], story: [1080, 1920] };
const PAD = 72;

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bilden gick inte att läsa"));
    img.src = src;
  });

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const [sw, sh] = [w / s, h / s];
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Rubriken så stor som får plats på högst två rader. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, font: string, max: number, width: number) {
  for (let size = max; size >= 56; size -= 6) {
    ctx.font = `700 ${size}px ${font}`;
    const lines: string[] = [];
    for (const word of text.split(/\s+/)) {
      const last = lines.at(-1);
      if (last && ctx.measureText(`${last} ${word}`).width <= width) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= width)) return { size, lines };
  }
  return { size: 56, lines: [text] };
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, look: PostLook) {
  ctx.font = `700 34px ${look.font}`;
  spaced(ctx, 3);
  const w = ctx.measureText(text).width + 44;
  ctx.fillStyle = look.accent;
  ctx.beginPath();
  ctx.roundRect(x, y - 54, w, 62, 31);
  ctx.fill();
  ctx.fillStyle = look.onAccent;
  ctx.fillText(text, x + 22, y - 10);
  spaced(ctx, 0);
}

export async function drawPost(post: AgentPost, look: PostLook, size: PostSize, art: { photo?: string; product?: string }) {
  const [W, H] = SIZES[size];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Webbläsaren kan inte rita bilden");
  const [crest, photo, product] = await Promise.all([load(look.crest), art.photo ? load(art.photo) : null, art.product ? load(art.product) : null]);
  const shop = post.format === "shop" && product;
  const ink = shop ? look.onAccent : "#FFFFFF";

  if (shop) {
    ctx.fillStyle = look.accent;
    ctx.fillRect(0, 0, W, H);
    const side = W - PAD * 2;
    const top = size === "story" ? 300 : 210;
    const tall = size === "story" ? side : 700;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, top, side, tall, 36);
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(PAD, top, side, tall);
    const s = Math.min(side / product.width, tall / product.height);
    ctx.drawImage(product, PAD + (side - product.width * s) / 2, top + (tall - product.height * s) / 2, product.width * s, product.height * s);
    ctx.restore();
  } else if (photo) {
    cover(ctx, photo, 0, 0, W, H);
    const fade = ctx.createLinearGradient(0, H * 0.35, 0, H);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(0.55, `${look.primary}D9`);
    fade.addColorStop(1, look.primary);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    const top = ctx.createLinearGradient(0, 0, 0, 300);
    top.addColorStop(0, "rgba(0,0,0,0.5)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 300);
  } else {
    ctx.fillStyle = look.primary;
    ctx.fillRect(0, 0, W, H);
    const big = H * 0.78;
    ctx.globalAlpha = 0.09;
    ctx.drawImage(crest, W - big * 0.62, H * 0.04, big * (crest.width / crest.height), big);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(0, H * 0.5);
    ctx.rotate(-0.12);
    ctx.fillStyle = look.accent;
    ctx.fillRect(-100, 0, W + 200, 22);
    ctx.restore();
  }

  const crestH = 128;
  ctx.drawImage(crest, PAD, PAD - 8, crestH * (crest.width / crest.height), crestH);
  const textX = PAD + crestH * (crest.width / crest.height) + 26;
  ctx.fillStyle = ink;
  ctx.font = `700 48px ${look.font}`;
  spaced(ctx, 2);
  ctx.fillText(look.name.toUpperCase(), textX, PAD + 50);
  if (post.team) {
    ctx.globalAlpha = 0.75;
    ctx.font = `500 32px ${look.font}`;
    ctx.fillText(post.team.toUpperCase(), textX, PAD + 96);
    ctx.globalAlpha = 1;
  }
  spaced(ctx, 0);

  const width = W - PAD * 2;
  let y = H - (size === "story" ? 150 : 72);
  ctx.font = `500 30px ${look.font}`;
  ctx.globalAlpha = 0.75;
  spaced(ctx, 1);
  ctx.fillText(`@${look.handle}  ·  ${look.site}`, PAD, y);
  ctx.globalAlpha = 1;
  y -= 74;
  ctx.font = `500 40px ${look.font}`;
  ctx.fillText(post.detail, PAD, y, width);
  spaced(ctx, 0);
  y -= 64;

  const title = fitLines(ctx, post.title.toUpperCase(), look.font, shop ? 104 : 128, width);
  ctx.font = `700 ${title.size}px ${look.font}`;
  for (const line of [...title.lines].reverse()) {
    ctx.fillText(line, PAD, y);
    y -= title.size * 1.1;
  }

  if (post.score && post.opponent) {
    const away = post.home === false;
    const names = away ? `${post.opponent} – ${look.name}` : `${look.name} – ${post.opponent}`;
    const score = away ? `${post.score.them}–${post.score.us}` : `${post.score.us}–${post.score.them}`;
    y -= 6;
    ctx.fillStyle = look.accent;
    ctx.font = `700 300px ${look.font}`;
    ctx.fillText(score, PAD - 8, y);
    y -= 300 * 0.86;
    ctx.fillStyle = ink;
    ctx.font = `600 40px ${look.font}`;
    spaced(ctx, 2);
    ctx.fillText(names.toUpperCase(), PAD, y, width);
    spaced(ctx, 0);
    y -= 52;
  }
  pill(ctx, post.kicker, PAD, y - 10, shop ? { ...look, accent: look.primary, onAccent: look.accent } : look);

  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Klubbens foto i en storlek som räcker för inlägget, så att chatten inte bär på kamerans originalfil. */
export async function shrinkPhoto(file: File, max = 1920) {
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * s);
    canvas.height = Math.round(img.height * s);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
