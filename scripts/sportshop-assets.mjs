// Kör: node scripts/sportshop-assets.mjs [id ...] [--force]
// Skapar bilder till den tyska sportbutiken (/newwave/sportshop): fyra påhittade vereinswappen (transparent PNG) och
// Craft-teamwear per klubb (studiofoton på vit bakgrund). id är en klubb ("tus-brackwede") eller en fil ("tus-brackwede-home").
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OUT = path.join(process.cwd(), "public", "newwave", "sportshop");
const CRESTS = path.join(OUT, "wappen");
const KIT = path.join(OUT, "kit");

/** Same ids and colours as lib/newwave/sportshop/data.ts. */
const CLUBS = {
  "tus-brackwede": {
    crest:
      'a classic heater shield split diagonally into dark green (#0B6B3A) and white halves, a stylised oak leaf in the white half, a dark green banner across the top reading exactly "TuS" and the year "1911" small at the bottom',
    main: "dark green (#0B6B3A)",
    second: "white",
  },
  "sc-sennestadt": {
    crest:
      'a round badge with a royal blue (#1747A6) outer ring and a yellow (#F5C400) centre, a stylised blue pine tree in the centre, the ring reading exactly "SC SENNESTADT" at the top and "1958" at the bottom in white capitals',
    main: "royal blue (#1747A6)",
    second: "golden yellow (#F5C400)",
  },
  "fc-heepen": {
    crest:
      'a pointed shield with red (#C8102E) and white vertical stripes, a white upper band reading exactly "FC" in bold red letters, a small red heraldic lion in the band and the year "1921" in white at the bottom',
    main: "red (#C8102E)",
    second: "white",
  },
  "vfb-joellenbeck": {
    crest:
      'a rounded square shield in black (#141414) with a gold (#D4A017) border, a large gold monogram reading exactly "VfB" and a small gold star above it, and "1905" in gold at the bottom',
    main: "black (#141414)",
    second: "gold (#D4A017)",
  },
};

const STUDIO =
  "Professional e-commerce studio product photo on a seamless pure white background (#FFFFFF), soft even studio lighting, a subtle soft contact shadow, the garment centred and filling about 80% of the frame, front view on an invisible ghost mannequin (no person, no hanger), natural fabric folds. Photorealistic, crisp, premium sportswear catalogue quality.";

const BRANDING = (logo) =>
  `The club crest from the first reference image is reproduced exactly (same shape, colours and lettering) as a heat-transferred badge. The Craft logo, the word CRAFT in bold italic capitals followed by a small cluster of dots as in the second reference image, is printed small in ${logo}. No other text, numbers, sponsors or logos anywhere.`;

/** Six Craft teamwear items per club; {main} and {second} are the club colours. */
const ITEMS = {
  home: {
    prompt: ({ main, second }) =>
      `a modern short-sleeve football jersey (home kit) in ${main} with a ${second} crew neck collar and ${second} sleeve cuffs, subtle tonal raglan panels, breathable technical fabric. The crest sits on the left chest (on the right side of the image), the Craft logo on the right chest (left side of the image)`,
    logo: ({ second }) => second,
  },
  away: {
    prompt: ({ main, second }) =>
      `a modern short-sleeve football jersey (away kit) in ${second} with a ${main} V-neck collar, ${main} sleeve cuffs and thin ${main} side panels, breathable technical fabric. The crest sits on the left chest (on the right side of the image), the Craft logo on the right chest (left side of the image)`,
    logo: ({ main }) => main,
  },
  shorts: {
    prompt: ({ main, second }) =>
      `a pair of football shorts in ${main} with a thin ${second} side stripe and an elastic waistband, flat front view. The crest sits small on the lower left leg (on the right side of the image), the Craft logo on the lower right leg (left side of the image)`,
    logo: ({ second }) => second,
  },
  socks: {
    prompt: ({ main, second }) =>
      `one pair of knee-high football socks in ${main} with two ${second} hoops below the folded top cuff, standing upright side by side as if on invisible legs. No crest on the socks; only the small Craft logo on the front of each cuff`,
    logo: ({ second }) => second,
  },
  training: {
    prompt: ({ main, second }) =>
      `a slim full-zip training jacket with a stand-up collar in ${main} with ${second} piping along the shoulders and sleeves, zipped side pockets. The crest sits on the left chest (on the right side of the image), the Craft logo on the right chest (left side of the image)`,
    logo: ({ second }) => second,
  },
  rain: {
    prompt: ({ main }) =>
      `a lightweight all-weather rain jacket with an attached hood, full zip and taped seams in ${main}, slightly glossy waterproof fabric. The crest sits on the left chest (on the right side of the image), the Craft logo on the right chest (left side of the image)`,
    logo: () => "white",
  },
};

const logUsage = (id, res) => res.usage && console.log(`${id}: tokens in=${res.usage.input_tokens} out=${res.usage.output_tokens}`);

/**
 * The model's own transparent output sometimes punches holes inside the emblem, so the crest is drawn on white and only the
 * white connected to the canvas edge is removed; the emblem's solid outer border keeps its inner white areas.
 */
async function cutOut(jpeg) {
  const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const light = (p) => Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);
  const bg = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || light(p) < 228) continue;
    bg[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const x = p % W;
    const edge = !bg[p] && ((x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (p >= W && bg[p - W]) || (p < W * (H - 1) && bg[p + W]));
    rgba[p * 4] = data[p * 3];
    rgba[p * 4 + 1] = data[p * 3 + 1];
    rgba[p * 4 + 2] = data[p * 3 + 2];
    rgba[p * 4 + 3] = bg[p] ? 0 : edge ? Math.min(255, (255 - light(p)) * 3) : 255;
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

async function crest(club) {
  const res = await client.images.generate({
    model: MODEL,
    prompt: `A fictional German amateur sports club crest (Vereinswappen): ${CLUBS[club].crest}. The whole emblem is enclosed by a solid coloured outer border. Clean, flat vector emblem with crisp edges and solid colours, centred, filling about 85% of the canvas, on a plain pure white (#FFFFFF) background. All lettering is spelled exactly as given; no other text, no mockup, no shadow.`,
    size: "1024x1024",
    quality: QUALITY,
    output_format: "png",
  });
  logUsage(club, res);
  const cut = await cutOut(Buffer.from(res.data[0].b64_json, "base64"));
  const png = await sharp(cut).trim().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ palette: true, quality: 95, compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(CRESTS, `${club}.png`), png);
  console.log(`${club}: wappen klar`);
}

/** The Craft wordmark cut out of the club portal poster, upscaled as a style reference. */
async function craftLogo() {
  const poster = path.join(process.cwd(), "public", "newwave", "portals", "klubb.jpg");
  return sharp(poster).extract({ left: 90, top: 220, width: 65, height: 28 }).resize({ width: 520, kernel: "lanczos3" }).png().toBuffer();
}

async function kit(club, item, logo) {
  const id = `${club}-${item}`;
  const spec = ITEMS[item];
  const colours = CLUBS[club];
  const badge = await sharp(path.join(CRESTS, `${club}.png`)).flatten({ background: "#FFFFFF" }).png().toBuffer();
  const res = await client.images.edit({
    model: MODEL,
    image: [await toFile(badge, "crest.png", { type: "image/png" }), await toFile(logo, "craft.png", { type: "image/png" })],
    prompt: `${STUDIO}\nProduct: ${spec.prompt(colours)}.\n${BRANDING(spec.logo(colours))}`,
    size: "1024x1024",
    quality: QUALITY,
    output_format: "jpeg",
  });
  logUsage(id, res);
  await writeFile(path.join(KIT, `${id}.jpg`), await sharp(Buffer.from(res.data[0].b64_json, "base64")).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
  console.log(`${id}: klar`);
}

async function pool(tasks, size) {
  const queue = [...tasks];
  const failed = [];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let t = queue.shift(); t; t = queue.shift())
        await t.run().catch((err) => {
          failed.push(t.id);
          console.error(`${t.id}: ${err.message}`);
        });
    }),
  );
  return failed;
}

async function main() {
  await mkdir(CRESTS, { recursive: true });
  await mkdir(KIT, { recursive: true });
  const force = process.argv.includes("--force");
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const pick = (id, file) => (wanted.length ? wanted.some((w) => id === w || id.startsWith(`${w}-`)) : force || !existsSync(file));

  const crests = Object.keys(CLUBS)
    .filter((club) => pick(club, path.join(CRESTS, `${club}.png`)))
    .map((club) => ({ id: club, run: () => crest(club) }));
  const failedCrests = await pool(crests, 4);

  const logo = await craftLogo();
  const kits = Object.keys(CLUBS)
    .filter((club) => !failedCrests.includes(club))
    .flatMap((club) => Object.keys(ITEMS).map((item) => ({ id: `${club}-${item}`, club, item })))
    .filter((k) => pick(k.id, path.join(KIT, `${k.id}.jpg`)))
    .map((k) => ({ id: k.id, run: () => kit(k.club, k.item, logo) }));
  const failed = [...failedCrests, ...(await pool(kits, 4))];
  if (failed.length) {
    console.error(`Misslyckades: ${failed.join(" ")}`);
    process.exit(1);
  }
}

main();
