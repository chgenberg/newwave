// Kör: node scripts/demo-assets.mjs [id ...] [--force]
// Skapar statiska bilder till /demo i public/demo/ (hjältebild, kort, neutrala scener för mässa, konferens, kick-off och event
// i 3:2 och 4:3, produktbilder med tryckyta).
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

const NEUTRAL =
  'The scene is neutral and unbranded: white, light warm grey and black surfaces. Everywhere a logo would be it shows the simple black placeholder wordmark "DIN LOGO" in a clean geometric sans-serif (white on dark surfaces), spelled exactly D-I-N space L-O-G-O. No other text or logos anywhere.';
const HANDS =
  "Each person has an anatomically correct body: one head, two arms, two hands, five fingers per hand, all clearly connected to their own body; natural adult proportions; natural, relaxed faces with real skin texture.";

/** Fixed compositions; lib/demoScenes.ts describes the same positions to the image model and the reviewer. */
const EVENT_SCENES = {
  "scene-konferens": `${PHOTO}
Eye-level, straight-on wide photo inside a modern conference venue just before the first session starts: the stage at the back of the room and the registration desk in front, warm and professional event lighting. Fixed composition, left to right:
- FOREGROUND FAR LEFT (about 3-13% from the left edge): a roll-up banner standing on the carpet.
- FOREGROUND LEFT (about 15-22%): a free-standing A1 floor sign on a slim stand with the logo and a simple arrow.
- BACKGROUND, across the room (about 24-97%): a low black stage with a wide stage backdrop wall behind it. The large logo is on the left part of the backdrop; a large 16:9 screen on the right part of the backdrop shows a calm landscape photo. On the stage, left of centre (about 31-39%), an unattended lectern with the logo on its front panel. Nobody is on the stage.
- FOREGROUND RIGHT (about 52-92%, lower half of the image): a long registration desk with the logo on its front panel. On the desk, neatly in rows: name badges on lanyards, a small tablet check-in stand, a few notebooks and water bottles. Exactly two friendly staff, a man and a woman in matching dark blazers over light shirts, stand behind the desk, relaxed and facing the camera, each with both hands resting on the desk top.
Open dark grey carpet floor between the desk and the stage, no chairs. A few blurred attendees far in the background. ${HANDS}
${NEUTRAL}`,
  "scene-kickoff": `${PHOTO}
Eye-level, straight-on wide photo inside a bright, modern event venue (a Scandinavian loft with large windows, light wood floor and white walls) during a company kick-off, soft natural daylight. Fixed composition, left to right:
- FAR LEFT (about 3-10% from the left edge): a tall curved beach flag on a pole.
- LEFT FOREGROUND (about 11-30%): a round table with a fitted light grey tablecloth with the logo on its front; on it water bottles and two caps. Two chairs at the table, each with a white tote bag with the logo on the seat.
- BACKGROUND CENTRE (about 24-76%): a wide banner wall (light grey textile backdrop on an aluminium frame) with the large logo centred at the top.
- CENTRE (about 33-67%), in front of the banner wall: a team of exactly six colleagues, a natural mix of women and men of different ages, in matching light grey hoodies with the logo on the chest, standing side by side on the floor and seen from head to shoes. The two in the middle give each other one simple high-five with their raised right hands, palms meeting cleanly; the other four stand relaxed with their arms at their sides or their hands in their hoodie pockets. Everyone smiles naturally.
- RIGHT FOREGROUND (about 68-87%): a second identical round table with tablecloth; on it thermos mugs and a dark backpack with the logo. Two chairs with white tote bags on the seats.
- FAR RIGHT (about 89-97%): a welcome sign on a wooden easel with the logo.
No other people. ${HANDS} Exactly two hands meet in the high-five; nobody puts an arm around anyone, nobody holds anything.
${NEUTRAL}`,
  "scene-event": `${PHOTO}
Eye-level, straight-on wide photo of an elegant evening brand event in a stylish venue with dark walls, warm string lights across the ceiling and soft bokeh in the background. Fixed composition, left to right:
- FAR LEFT (about 3-10% from the left edge): a tall curved beach flag on a pole.
- LEFT (about 11-17%): a free-standing A1 floor sign on a slim stand with the logo.
- LEFT OF CENTRE (about 19-45%): a step-and-repeat photo wall: a white backdrop with the logo repeated in a regular grid, a short black carpet in front of it, nobody posing.
- CENTRE FOREGROUND (about 45-58%): a high cocktail table with a fitted black stretch cover with the logo on its front; on it a few glasses and white napkins. Exactly three guests in smart evening wear stand around it, chatting; each holds at most one glass in one hand, the other arm relaxed at the side.
- RIGHT (about 60-96%): a bar counter with a white front panel with the logo, and a back bar with shelves of glasses and bottles without readable labels. Exactly two bartenders in black shirts stand behind the bar, relaxed and facing the camera, each with both hands resting on the bar. On the bar: glasses and stacks of white napkins.
Nobody else except a few blurred silhouettes far in the background. ${HANDS}
${NEUTRAL}`,
};

const SCENES = {
  ...EVENT_SCENES,
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
const INNER = { left: 40, top: 198, width: 944, height: 629 };
const CROP_43 = { top: 112, height: 768 };
const extend = (what, above, below, sides) => `${PHOTO}
Extend this ${what} photo outwards into a square image. The scene in the middle stays exactly as it is. Fill the transparent area seamlessly:
- Above: ${above}, continuing the perspective of the photo.
- Below: ${below}.
- Left and right: ${sides}.
Eye-level, straight-on camera, no tilt. Do not add any objects, people, text or logos to the scene itself.`;
const SQUARES = {
  "booth-placeholder-43": {
    source: "booth-placeholder",
    square: "booth-placeholder-43-sq",
    prompt: extend("trade show booth", "more of the bright exhibition hall ceiling with white trusses, rows of lights and high windows", "more of the light grey carpet floor in front of the booth with soft, natural shadows", "a little more of the softly out-of-focus hall with a few visitors in the distance"),
  },
  "scene-konferens-43": {
    source: "scene-konferens",
    square: "scene-konferens-43-sq",
    prompt: extend("conference venue", "more of the dark venue ceiling with lighting trusses and spotlights", "more of the dark grey carpet floor in front of the registration desk with soft shadows", "a little more of the dimly lit room"),
  },
  "scene-kickoff-43": {
    source: "scene-kickoff",
    square: "scene-kickoff-43-sq",
    prompt: extend("bright kick-off venue", "more of the white loft ceiling with wooden beams and pendant lamps", "more of the light wood floor in front of the tables", "a little more of the bright room with large windows"),
  },
  "scene-event-43": {
    source: "scene-event",
    square: "scene-event-43-sq",
    prompt: extend("evening event", "more of the dark ceiling with warm string lights", "more of the dark polished floor in front of the bar and the cocktail table", "a little more of the softly lit venue"),
  },
};

const logUsage = (id, res) => res.usage && console.log(`${id}: tokens in=${res.usage.input_tokens} out=${res.usage.output_tokens}`);

/**
 * Mobile (4:3) scene: the 3:2 neutral image is scaled to 92 % of a square and the model only paints the ceiling, floor and side
 * margins around it, so both formats share one layout. The square is the edit reference; its centre band is the 4:3 placeholder.
 */
async function square43(id) {
  const spec = SQUARES[id];
  const inner = INNER;
  const src = await sharp(path.join(OUT, `${spec.source}.jpg`)).resize(inner.width, inner.height, { fit: "fill" }).png().toBuffer();
  const canvas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: src, left: inner.left, top: inner.top }])
    .png()
    .toBuffer();
  const res = await client.images.edit({
    model: MODEL,
    image: await toFile(canvas, "booth.png", { type: "image/png" }),
    mask: await toFile(canvas, "mask.png", { type: "image/png" }),
    prompt: spec.prompt,
    size: "1024x1024",
    quality: QUALITY,
    output_format: "jpeg",
  });
  logUsage(id, res);
  /** The model re-renders the whole frame; pasting the original back would leave visible seams, so its output is used as is. */
  const square = await sharp(Buffer.from(res.data[0].b64_json, "base64")).resize(1024, 1024).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  await writeFile(path.join(OUT, `${spec.square}.jpg`), square);
  const { top, height } = CROP_43;
  await writeFile(path.join(OUT, `${id}.jpg`), await sharp(square).extract({ left: 0, top, width: 1024, height }).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
  console.log(`${id}: klar`);
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
  backpack: "a plain dark charcoal grey modern laptop backpack standing upright, front view, with a smooth flat front panel and two zipped compartments. The print area is a landscape rectangle (3:2) in the upper middle of the smooth front panel",
  napkins: "a neat square stack of folded white paper cocktail napkins seen from above at a slight angle, with a few folded napkins fanned beside it. The print area is a landscape rectangle (3:2) in the middle of the top napkin of the stack",
  lanyard: "a white plastic name badge card in a clear landscape badge holder hanging from a plain white woven lanyard strap, the strap forming a V shape above the badge, flat front view on the white background. The print area is a landscape rectangle (2:1) covering the upper half of the badge card",
};
const SURFACE = { polo: "fabric", tote: "fabric", backpack: "fabric" };

async function generate(prompt, size, id = "") {
  const res = await client.images.generate({ model: MODEL, prompt, size, quality: QUALITY, output_format: "jpeg" });
  logUsage(id, res);
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
  const raw = await generate(SCENES[id], "1536x1024", id);
  const width = id.startsWith("card-") ? 960 : 1536;
  await writeFile(file, await sharp(raw).resize({ width }).jpeg({ quality: 82, mozjpeg: true }).toBuffer());
  console.log(`${id}: klar`);
}

async function product(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await generate(`${STUDIO}\nProduct: ${ITEMS[id]}.\n${MARKER}`, "1024x1024", id);
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
    logUsage(`${id} (tom)`, res);
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
  const all = [...Object.keys(SCENES), ...Object.keys(SQUARES), ...Object.keys(ITEMS)];
  const ids = (wanted.length ? wanted : all).filter((id) => {
    const file = id in ITEMS ? path.join(PRODUCTS, `${id}.jpg`) : path.join(OUT, `${id}.jpg`);
    return force || wanted.length || !existsSync(file);
  });
  const library = JSON.parse(await readFile(LIBRARY, "utf8").catch(() => "{}"));
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        if (id in SQUARES) await square43(id);
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
