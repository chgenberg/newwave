// Kör: node scripts/demo-assets.mjs [id ...] [--force]
// Skapar statiska bilder till /demo i public/demo/ (hjältebild, kort, neutral monter i 3:2 och 4:3, produktbilder med tryckyta).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OUT = path.join(process.cwd(), "public", "demo");
const PRODUCTS = path.join(OUT, "products");
const LIBRARY = path.join(PRODUCTS, "library.json");

const PHOTO =
  "Photorealistic editorial photo, shot on a full-frame camera, natural colours, crisp detail, realistic materials and lighting. Any people are fictional and generic, natural faces and hands.";

const BOOTH_LAYOUT = `Eye-level, straight-on wide photo of one 3 x 3 m trade show booth in a modern, bright Scandinavian exhibition hall. The camera is centred on the booth, which fills about 85% of the image width. Fixed composition, left to right:
- FAR LEFT (about 4-12% from the left edge): a tall curved beach flag (feather flag) on a pole.
- LEFT (about 14-24%): a roll-up banner standing on the floor.
- LEFT OF CENTRE (about 26-33%): a black brochure stand with several stacked leaflets.
- CENTRE: a straight back wall across the booth with a large logo centred at the top of the wall, and a wall-mounted flat screen on the back wall slightly right of centre. In front, centred in the lower half, a white reception counter with the logo on its front panel. Two friendly staff, a man and a woman in matching polo shirts, stand behind the counter. On the counter: two coffee mugs, two water bottles, a bowl of wrapped candy and a few pens.
- RIGHT (about 68-92%): open wooden shelving with folded t-shirts and polo shirts on hangers, baseball caps on a shelf, tote bags hanging on hooks and a row of mugs.
Light grey carpet floor. The rest of the hall behind the booth is softly out of focus with a few visitors. Even, flattering exhibition lighting.`;

const SCENES = {
  "booth-placeholder": `${PHOTO}\n${BOOTH_LAYOUT}\nThe booth is neutral and unbranded: white and light warm grey surfaces with black accents. Everywhere a logo would be (back wall, counter front, roll-up, beach flag, shirts) it shows the simple black placeholder wordmark "DIN LOGO" in a clean geometric sans-serif, spelled exactly D-I-N space L-O-G-O. No other text or logos.`,
  hero: `${PHOTO}\nWide, cinematic photo inside a busy, modern exhibition hall with high ceilings and warm spotlights, slightly moody and dark. On the right half of the image stands a premium white trade show booth with a back wall, a reception counter, a roll-up and a tall beach flag, two staff talking with a visitor. The booth shows the simple black placeholder wordmark "DIN LOGO" (exactly D-I-N space L-O-G-O) on the back wall, counter and flag. The left half of the image is darker and calmer: blurred visitors and hall depth, leaving space for a headline. No other text or logos.`,
  "card-massa": `${PHOTO}\nA bright modern trade show booth with a white back wall, a counter, a roll-up and a beach flag, a few visitors, three-quarter view, exhibition hall in the background. No readable text or logos.`,
  "card-konferens": `${PHOTO}\nA conference hall from the back of the audience: a stage with large blue-lit screens and a speaker, rows of people seen from behind, cool blue stage lighting. No readable text or logos.`,
  "card-kickoff": `${PHOTO}\nA joyful company kick-off: a group of colleagues in casual clothes doing an enthusiastic high-five in a bright modern office event space, warm light. No readable text or logos.`,
  "card-event": `${PHOTO}\nAn elegant evening company event: a long table with champagne glasses in the foreground, warm bokeh lights and guests mingling in the background. No readable text or logos.`,
};

/**
 * Mobile (4:3) booth: the 3:2 neutral booth is scaled to 92 % of a square and the model only paints the ceiling, floor and side
 * margins around it, so both formats share one layout. The square is the edit reference; its centre band is the 4:3 placeholder.
 */
const BOOTH_43 = {
  source: "booth-placeholder",
  square: "booth-placeholder-43-sq",
  inner: { left: 40, top: 198, width: 944, height: 629 },
  crop: { top: 112, height: 768 },
  prompt: `${PHOTO}
Extend this trade show booth photo outwards into a square image. The booth in the middle stays exactly as it is. Fill the transparent area seamlessly:
- Above: more of the bright exhibition hall ceiling with white trusses, rows of lights and high windows, continuing the perspective of the photo.
- Below: more of the light grey carpet floor in front of the booth with soft, natural shadows.
- Left and right: a little more of the softly out-of-focus hall with a few visitors in the distance.
Eye-level, straight-on camera, no tilt. Do not add any objects, people, text or logos to the booth itself.`,
};

async function booth43() {
  const { inner } = BOOTH_43;
  const src = await sharp(path.join(OUT, `${BOOTH_43.source}.jpg`)).resize(inner.width, inner.height, { fit: "fill" }).png().toBuffer();
  const canvas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: src, left: inner.left, top: inner.top }])
    .png()
    .toBuffer();
  const res = await client.images.edit({
    model: MODEL,
    image: await toFile(canvas, "booth.png", { type: "image/png" }),
    mask: await toFile(canvas, "mask.png", { type: "image/png" }),
    prompt: BOOTH_43.prompt,
    size: "1024x1024",
    quality: QUALITY,
    output_format: "jpeg",
  });
  /** The model re-renders the whole frame; pasting the original back would leave visible seams, so its output is used as is. */
  const square = await sharp(Buffer.from(res.data[0].b64_json, "base64")).resize(1024, 1024).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  await writeFile(path.join(OUT, `${BOOTH_43.square}.jpg`), square);
  const { top, height } = BOOTH_43.crop;
  await writeFile(path.join(OUT, "booth-placeholder-43.jpg"), await sharp(square).extract({ left: 0, top, width: 1024, height }).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
  console.log("booth-placeholder-43: klar");
}

const STUDIO =
  "Professional e-commerce studio product photo on a seamless pure white background (#FFFFFF), soft even studio lighting, a subtle soft contact shadow, the product centred and filling about 75% of the frame. Photorealistic, crisp, premium catalogue quality. No text, no logos, no brand marks, no people.";
const MARKER =
  "Exactly one flat, solid, pure bright green (#00FF00) rectangle marks the print area, following the surface of the product. The rectangle has no texture, text or pattern, and there is no other green anywhere in the image.";

const ITEMS = {
  polo: "a plain navy blue short-sleeve piqué polo shirt with collar and a three-button placket, front view on an invisible ghost mannequin, natural fabric folds. The print area is a landscape rectangle (3:2) centred on the chest below the placket",
  "pen-classic": "a navy blue plastic ballpoint click pen with a silver clip, lying horizontally across the frame and filling most of its width, side view, slightly from above. The print area is a long thin landscape rectangle (5:1) on the middle of the barrel",
  "pen-metal": "a matte white metal twist ballpoint pen with chrome details, lying horizontally across the frame and filling most of its width, side view, slightly from above. The print area is a long thin landscape rectangle (5:1) on the middle of the barrel",
  candy: "a white cardboard gift box with the lid open and leaning behind, the box filled with colourful individually wrapped candy, front view slightly from above. The print area is a landscape rectangle (2:1) covering the white front side of the box",
  tote: "a natural off-white cotton canvas tote bag with two long handles, hanging flat, front view. The print area is a square in the middle of the bag",
  paperbag: "a white paper shopping bag with twisted paper handles standing upright, front view. The print area is a portrait rectangle (3:4) in the middle of the front panel",
};
const SURFACE = { polo: "fabric", tote: "fabric" };

async function generate(prompt, size) {
  const res = await client.images.generate({ model: MODEL, prompt, size, quality: QUALITY, output_format: "jpeg" });
  return Buffer.from(res.data[0].b64_json, "base64");
}

const isMarker = (r, g, b) => g > 120 && g > r * 1.5 && g > b * 1.5 && r < 150 && b < 150;

async function detectMarker(photo) {
  const { data, info } = await sharp(photo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const pts = [];
  for (let i = 0, px = 0; px < W * H; i += 3, px++) if (isMarker(data[i], data[i + 1], data[i + 2])) pts.push({ x: px % W, y: Math.floor(px / W) });
  if (pts.length < W * H * 0.003) return null;
  const xs = pts.map((p) => p.x).sort((a, b) => a - b);
  const ys = pts.map((p) => p.y).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
  const [x0, x1, y0, y1] = [q(xs, 0.005), q(xs, 0.995), q(ys, 0.005), q(ys, 0.995)];
  if (x1 - x0 < W * 0.08 || y1 - y0 < H * 0.02) return null;
  const inside = pts.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1);
  const extreme = (score) => {
    const top = [...inside].sort((a, b) => score(b) - score(a)).slice(0, 40);
    return [Math.round(top.reduce((s, p) => s + p.x, 0) / top.length), Math.round(top.reduce((s, p) => s + p.y, 0) / top.length)];
  };
  const quad = [extreme((p) => -(p.x + p.y)), extreme((p) => p.x - p.y), extreme((p) => p.x + p.y), extreme((p) => p.y - p.x)];
  const R = 10;
  const alpha = Buffer.alloc(W * H * 4, 255);
  for (let y = Math.max(0, y0 - R); y < Math.min(H, y1 + R); y++) for (let x = Math.max(0, x0 - R); x < Math.min(W, x1 + R); x++) alpha[(y * W + x) * 4 + 3] = 0;
  const maskPng = await sharp(alpha, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return { width: W, height: H, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, quad, maskPng };
}

async function scene(id) {
  const file = path.join(OUT, `${id}.jpg`);
  const raw = await generate(SCENES[id], "1536x1024");
  const width = id.startsWith("card-") ? 960 : 1536;
  await writeFile(file, await sharp(raw).resize({ width }).jpeg({ quality: 82, mozjpeg: true }).toBuffer());
  console.log(`${id}: klar`);
}

async function product(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await generate(`${STUDIO}\nProduct: ${ITEMS[id]}.\n${MARKER}`, "1024x1024");
    const marker = await detectMarker(raw);
    if (!marker) {
      console.log(`${id}: ingen markering, försök ${attempt}`);
      continue;
    }
    const res = await client.images.edit({
      model: MODEL,
      image: await toFile(await sharp(raw).png().toBuffer(), "photo.png", { type: "image/png" }),
      mask: await toFile(marker.maskPng, "mask.png", { type: "image/png" }),
      prompt:
        "Replace the masked green rectangle with the plain, unprinted surface of the product, continuing its material, colour, curvature, reflections and shading seamlessly. Keep everything else identical. No print, no graphics, no text.",
      size: "1024x1024",
      quality: QUALITY,
      output_format: "png",
    });
    const blank = Buffer.from(res.data[0].b64_json, "base64");
    if (await detectMarker(blank)) {
      console.log(`${id}: grönt kvar, försök ${attempt}`);
      continue;
    }
    await writeFile(path.join(PRODUCTS, `${id}.jpg`), await sharp(blank).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
    console.log(`${id}: klar`, marker.box);
    const entry = { width: marker.width, height: marker.height, box: marker.box };
    return SURFACE[id] ? entry : { ...entry, quad: marker.quad };
  }
  throw new Error(`${id}: misslyckades`);
}

async function main() {
  await mkdir(PRODUCTS, { recursive: true });
  const force = process.argv.includes("--force");
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const all = [...Object.keys(SCENES), "booth-placeholder-43", ...Object.keys(ITEMS)];
  const ids = (wanted.length ? wanted : all).filter((id) => {
    const file = id in ITEMS ? path.join(PRODUCTS, `${id}.jpg`) : path.join(OUT, `${id}.jpg`);
    return force || wanted.length || !existsSync(file);
  });
  const library = JSON.parse(await readFile(LIBRARY, "utf8").catch(() => "{}"));
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        if (id === "booth-placeholder-43") await booth43();
        else if (id in SCENES) await scene(id);
        else if (id in ITEMS) {
          library[id] = await product(id);
          await writeFile(LIBRARY, JSON.stringify(library, null, 2));
        } else console.error(`okänt id: ${id}`);
      } catch (e) {
        console.error(id, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

main();
