import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toFile } from "openai";
import sharp from "sharp";
import { SITE, cleanText, createLimiter, envInt } from "./demoLimit";
import { IMAGE_MODEL, IMAGE_QUALITY, hasOpenAIKey, openai } from "./openai";
import { loadFile, saveFile } from "./store";

export const BOOTH_ITEMS = ["massvagg", "rollup", "beachflagga", "massdisk", "skyltstall"] as const;
export type BoothItem = (typeof BOOTH_ITEMS)[number];

export type BoothRequest = { name: string; site: string; color: string; light: string; products: BoothItem[] };
export type BoothResult = { url: string; color: string; cached: boolean };

export class BoothError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSec?: number) {
    super(message);
  }
}

export const LOGO_URL = /^\/api\/v1\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png)$/;
/** Scraped page titles can carry anything; only a short, plain name may reach the image prompt. */
export const promptName = (name: string, site: string) => cleanText(name, 40) || site.split(".")[0] || "the company";

const limiter = createLimiter(() => ({
  perKey: envInt("DEMO_BOOTH_PER_IP_HOUR", 5),
  global: envInt("DEMO_BOOTH_GLOBAL_HOUR", 60),
  windowMs: 60 * 60 * 1000,
}));
const MAX_CONCURRENT = () => Math.max(1, envInt("DEMO_BOOTH_CONCURRENCY", 3));
const MAX_LOGO_BYTES = 8_000_000;

const VERSION = "v1";
const CACHE = path.join(process.cwd(), ".data", "demo", "booths");
const PLACEHOLDER = path.join(process.cwd(), "public", "demo", "booth-placeholder.jpg");

const LAYOUT = `Fixed composition, left to right, exactly as in the first reference image:
- FAR LEFT (about 4-12% from the left edge): a tall curved beach flag (feather flag) on a pole.
- LEFT (about 14-24%): a roll-up banner standing on the floor.
- LEFT OF CENTRE (about 26-33%): a black brochure stand with several stacked leaflets.
- CENTRE: a straight back wall across the booth with the large logo centred at the top of the wall, and a wall-mounted flat screen slightly right of centre. In front, centred in the lower half, a reception counter with the logo on its front panel. Two friendly staff, a man and a woman in matching branded polo shirts, stand behind the counter. On the counter: two branded coffee mugs, two branded water bottles, a bowl of wrapped candy and a few pens.
- RIGHT (about 68-92%): open wooden shelving with branded t-shirts and polo shirts on hangers, branded baseball caps on a shelf, branded tote bags hanging on hooks and a row of branded mugs.`;

const MISSING: Record<BoothItem, string> = {
  massvagg: "The back wall is a plain neutral light grey wall without logo or print.",
  rollup: "There is no roll-up banner; leave that floor space empty.",
  beachflagga: "There is no beach flag; leave that space empty.",
  massdisk: "There is no printed counter front; the counter is plain white without logo.",
  skyltstall: "There is no brochure stand; leave that floor space empty.",
};

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** Monochrome logos get a deep navy booth so the result still looks designed, not grey. */
export function boothColor(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#14233C";
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return sat < 0.18 ? "#14233C" : hex.toUpperCase();
}

function prompt(req: BoothRequest, color: string) {
  const missing = BOOTH_ITEMS.filter((i) => !req.products.includes(i)).map((i) => MISSING[i]);
  return `Photorealistic photo of a professionally built trade show booth for the company "${promptName(req.name, req.site)}"${SITE.test(req.site) ? ` (${req.site})` : ""}, shot on a full-frame camera, eye level, straight on, landscape.
The first reference image shows the exact booth layout, camera angle, framing, lighting, people and object positions: keep all of them the same, only rebrand the booth.
The second reference image is the company's logo. Replace every "DIN LOGO" placeholder with this exact logo – identical shapes, letters and proportions, no invented or distorted characters, no other text. On dark surfaces print the logo in white, on light surfaces in its own colours.
Brand colour: ${color}. Use it as the dominant colour of the back wall, roll-up, beach flag, counter front and staff shirts, combined with white and a little warm wood. Premium, clean Scandinavian design.
${LAYOUT}
${missing.join("\n")}
The exhibition hall behind the booth stays softly out of focus with a few visitors. Real skin texture, natural hands and faces; people are fictional and generic.`;
}

const hash = (parts: string[]) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 20);
const productKey = (req: BoothRequest) => [...req.products].sort().join(",");

/** Coarse fingerprint of the logo pixels, so re-fetching the same logo still hits the cache but another logo never does. */
async function logoPrint(png: Buffer) {
  const px = await sharp(png, { limitInputPixels: 40_000_000 })
    .flatten({ background: "#FFFFFF" })
    .resize(24, 24, { fit: "contain", background: "#FFFFFF" })
    .greyscale()
    .raw()
    .toBuffer();
  return createHash("sha1").update(px.map((v) => v >> 5)).digest("hex").slice(0, 16);
}

/** Entries written before the key included the logo; read-only so they cannot be poisoned. */
const legacyKey = (req: BoothRequest) => (SITE.test(req.site) ? hash(["v1", req.site, productKey(req)]) : null);

async function readCache(key: string): Promise<BoothResult | null> {
  try {
    const hit = JSON.parse(await readFile(path.join(CACHE, `${key}.json`), "utf8")) as { url: string; color: string };
    const id = hit.url.split("/").pop()!;
    return (await loadFile(id)) ? { url: hit.url, color: hit.color, cached: true } : null;
  } catch {
    return null;
  }
}

async function render(req: BoothRequest, logo: Buffer, key: string): Promise<BoothResult> {
  const color = boothColor(req.color);
  const logoRef = await sharp(logo, { limitInputPixels: 40_000_000 })
    .resize(860, 860, { fit: "inside" })
    .extend({ top: 82, bottom: 82, left: 82, right: 82, background: "#FFFFFF" })
    .flatten({ background: "#FFFFFF" })
    .resize(1024, 1024, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toBuffer();
  const booth = await readFile(PLACEHOLDER);
  const res = await openai().images.edit({
    model: IMAGE_MODEL,
    image: [await toFile(booth, "booth.jpg", { type: "image/jpeg" }), await toFile(logoRef, "logo.png", { type: "image/png" })],
    prompt: prompt(req, color),
    size: "1536x1024",
    quality: IMAGE_QUALITY,
    output_format: "jpeg",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  const jpg = await sharp(Buffer.from(b64, "base64")).resize({ width: 1536, withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const file = await saveFile(jpg, "jpg");
  await mkdir(CACHE, { recursive: true });
  await writeFile(path.join(CACHE, `${key}.json`), JSON.stringify({ url: file.url, color, site: req.site, products: req.products, createdAt: new Date().toISOString() }));
  return { url: file.url, color, cached: false };
}

const inFlight = new Map<string, Promise<BoothResult>>();

/** Cached booths are always served; new renders need an API key, a free slot and rate-limit headroom. */
export async function brandedBooth(req: BoothRequest, ip: string): Promise<BoothResult> {
  const id = LOGO_URL.exec(req.light)?.[1];
  const logo = id ? await loadFile(id) : null;
  if (!logo || logo.data.byteLength > MAX_LOGO_BYTES) throw new BoothError("Loggan hittades inte. Hämta den igen.", 400);
  const print = await logoPrint(logo.data).catch(() => null);
  if (!print) throw new BoothError("Kunde inte läsa loggan. Hämta den igen.", 400);
  const key = hash([VERSION, req.site, print, boothColor(req.color), productKey(req)]);
  const legacy = legacyKey(req);
  const hit = (await readCache(key)) ?? (legacy ? await readCache(legacy) : null);
  if (hit) return hit;

  let job = inFlight.get(key);
  if (!job) {
    if (!hasOpenAIKey()) throw new BoothError("Bildgenerering är inte aktiverad här, så vi visar en neutral monter. Resten av demon fungerar som vanligt.", 503);
    if (inFlight.size >= MAX_CONCURRENT()) throw new BoothError("Många bygger montrar just nu. Försök igen om en minut – eller fortsätt med den neutrala montern.", 429, 60);
    const verdict = limiter.take(ip);
    if (!verdict.ok) {
      const msg =
        verdict.reason === "key"
          ? "Du har byggt många montrar på kort tid. Försök igen om en stund – eller fortsätt med den neutrala montern."
          : "Demon har nått sin gräns för nya montrar just nu. Försök igen senare – eller fortsätt med den neutrala montern.";
      throw new BoothError(msg, 429, verdict.retryAfterSec);
    }
    job = render(req, logo.data, key).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}
