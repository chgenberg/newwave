import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toFile } from "openai";
import sharp from "sharp";
import type { BoothFormat } from "./demoCatalog";
import { SITE, cleanText, createLimiter, envInt } from "./demoLimit";
import { type BoothReview, reviewBooth } from "./demoBoothQa";
import { type SiteAnalysis, readAnalysis } from "./demoSiteCache";
import { IMAGE_MODEL, IMAGE_QUALITY, hasOpenAIKey, openai } from "./openai";
import { loadFile, saveFile } from "./store";

export const BOOTH_ITEMS = ["massvagg", "rollup", "beachflagga", "massdisk", "skyltstall"] as const;
export type BoothItem = (typeof BOOTH_ITEMS)[number];

export type BoothRequest = { name: string; site: string; color: string; light: string; products: BoothItem[]; analysisId?: string; format: BoothFormat };
export type BoothResult = { url: string; color: string; cached: boolean; attempts?: number; format: BoothFormat };

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
const TAILORED = "v2";
/** Bumped whenever prompt or QA changes enough that older cached booths should be rendered again. */
const PIPELINE = "q1";
const MAX_IMAGES = 3;
const FILE_JPG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const CACHE = path.join(process.cwd(), ".data", "demo", "booths");
/**
 * The image API has no 4:3 size, so 4:3 booths are rendered square from a square reference (the neutral booth with extra ceiling
 * and floor) and the band that holds the booth is cut out; scripts/demo-assets.mjs crops the 4:3 placeholder at the same offset.
 */
const FORMATS: Record<BoothFormat, { reference: string; size: "1536x1024" | "1024x1024"; width: number; crop?: { top: number; height: number }; framing: string }> = {
  "3:2": { reference: "booth-placeholder.jpg", size: "1536x1024", width: 1536, framing: "landscape" },
  "4:3": {
    reference: "booth-placeholder-43-sq.jpg",
    size: "1024x1024",
    width: 1024,
    crop: { top: 112, height: 768 },
    framing:
      "square frame. Keep the framing of the first reference image exactly: the whole booth fits horizontally with small margins at both sides (the beach flag and the shelving are never cut off), the booth sits in the vertical middle, with the hall ceiling above and the carpet floor below",
  },
};
const reference = (f: BoothFormat) => path.join(process.cwd(), "public", "demo", FORMATS[f].reference);

/** Horizontal positions (percent of the image width) in each format's reference. */
const AT: Record<BoothFormat, { flag: string; rollup: string; stand: string; shelves: string }> = {
  "3:2": { flag: "4-12%", rollup: "14-24%", stand: "26-33%", shelves: "68-92%" },
  "4:3": { flag: "8-15%", rollup: "17-26%", stand: "28-34%", shelves: "67-89%" },
};

const layout = (f: BoothFormat) => `Fixed composition, left to right, exactly as in the first reference image:
- FAR LEFT (about ${AT[f].flag} from the left edge): a tall curved beach flag (feather flag) on a pole.
- LEFT (about ${AT[f].rollup}): a roll-up banner standing on the floor.
- LEFT OF CENTRE (about ${AT[f].stand}): a black brochure stand with several stacked leaflets.
- CENTRE: a straight back wall across the booth with the large logo centred at the top of the wall, and a wall-mounted flat screen slightly right of centre. In front, centred in the lower half, a reception counter with the logo on its front panel. Two friendly staff, a man and a woman in matching branded polo shirts, stand behind the counter, relaxed and facing the camera, each with both hands resting on the counter top. On the counter: two branded coffee mugs, two branded water bottles, a bowl of wrapped candy and a few pens.
- RIGHT (about ${AT[f].shelves}): open wooden shelving with branded t-shirts and polo shirts on hangers, branded baseball caps on a shelf, branded tote bags hanging on hooks and a row of branded mugs.`;

/** Same positions as LAYOUT, but the content comes from the site analysis. */
const positions = (f: BoothFormat) => `Fixed composition, left to right, exactly as in the first reference image (keep every object at the same position and size):
- FAR LEFT (about ${AT[f].flag} from the left edge): a tall curved beach flag (feather flag) on a pole.
- LEFT (about ${AT[f].rollup}): a roll-up banner standing on the floor.
- LEFT OF CENTRE (about ${AT[f].stand}): a black brochure stand with several stacked leaflets.
- CENTRE: a straight back wall across the booth with the large logo centred at the top of the wall, and a wall-mounted flat screen slightly right of centre. In front, centred in the lower half, a reception counter with the logo on its front panel and two staff behind it, standing relaxed and facing the camera, each with both hands resting on the counter top or one hand holding a single item naturally. On the counter, next to the company's own items, two branded coffee mugs, a branded water bottle and a few pens.
- RIGHT (about ${AT[f].shelves}): open shelving that mixes the company's own products with branded t-shirts on hangers, branded caps and branded tote bags.`;

const REALISM = `Realism requirements (most important):
- It must look like an unedited photo by a professional event photographer: physically plausible light, shadows and reflections, correct perspective, nothing floating in the air.
- Exactly two people stand behind the counter. Each has an anatomically correct body: one head, two arms, two hands, five fingers per hand, all clearly connected to their own body. No extra, missing, merged or disembodied arms, hands or fingers, and no hands reaching in from outside. Nobody else touches the counter.
- Natural, relaxed faces with real skin texture; people are fictional and generic.
- Every logo is spelled exactly as in the logo reference, letter for letter. No garbled, invented or nonsense text anywhere; small print on products may be illegible but must not look like fake letters.
- The exhibition hall behind the booth stays softly out of focus with a few visitors at a distance.`;

/** What the reviewer should expect to see, in the fixed left-to-right order. */
const EXPECTED: [BoothItem | null, string][] = [
  ["beachflagga", "a beach flag on a pole"],
  ["rollup", "a roll-up banner"],
  ["skyltstall", "a brochure stand"],
  ["massvagg", "a back wall with the logo and a wall screen"],
  [null, "a centred reception counter with two staff behind it"],
  [null, "open shelving with products and merch on the right"],
];

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
  return `Photorealistic photo of a professionally built trade show booth for the company "${promptName(req.name, req.site)}"${SITE.test(req.site) ? ` (${req.site})` : ""}, shot on a full-frame camera, eye level, straight on, ${FORMATS[req.format].framing}.
The first reference image shows the exact booth layout, camera angle, framing, lighting, people and object positions: keep all of them the same, only rebrand the booth.
The second reference image is the company's logo. Replace every "DIN LOGO" placeholder with this exact logo – identical shapes, letters and proportions, no invented or distorted characters, no other text. On dark surfaces print the logo in white, on light surfaces in its own colours.
Brand colour: ${color}. Use it as the dominant colour of the back wall, roll-up, beach flag, counter front and staff shirts, combined with white and a little warm wood. Premium, clean Scandinavian design.
${layout(req.format)}
${missing.join("\n")}
${REALISM}`;
}

function tailoredPrompt(req: BoothRequest, a: SiteAnalysis, color: string, refs: string[]) {
  const missing = BOOTH_ITEMS.filter((i) => !req.products.includes(i)).map((i) => MISSING[i]);
  const name = promptName(a.brandName || req.name, req.site);
  const what = [a.industryEn && `a ${a.industryEn} company`, a.offeringEn].filter(Boolean).join(" – ");
  const s = a.scene;
  const line = (label: string, v: string) => (v ? `- ${label}: ${v}` : "");
  return `Photorealistic photo of a professionally built trade show booth for "${name}"${what ? `, ${what}` : ""}, shot on a full-frame camera, eye level, straight on, ${FORMATS[req.format].framing}. It must look like it was designed specifically for this company and its industry by a top exhibition agency.
The first reference image shows the exact booth layout, camera angle, framing and object positions: keep them, but restyle and refill the booth for this company.
The second reference image is the company's logo. Replace every "DIN LOGO" placeholder with this exact logo – identical shapes, letters and proportions, no invented or distorted characters. On dark surfaces print the logo in white, on light surfaces in its own colours.
${refs.length ? `The remaining reference images are the company's real products or services from its website: ${refs.map((d, i) => `(${i + 3}) ${d}`).join("; ")}. Reproduce these exact items – same shapes, packaging and colours, without readable small print – on the counter, on the shelves and on the roll-up and wall screen.
` : ""}Brand colour: ${color}. ${a.tone ? `Visual tone: ${a.tone}. ` : ""}Use the brand colour as the dominant accent of the back wall, roll-up, beach flag and counter front.
${positions(req.format)}
Industry-specific content at those positions:
${[
    `- Back wall: the logo centred at the top${a.tagline ? `, and below it the tagline "${a.tagline}" in clean, well-spaced type (this is the only other text allowed)` : ", no other text"}.`,
    line("Wall screen", s.screen),
    line("Roll-up", s.rollup && `${s.rollup}, logo at the top`),
    "- Beach flag: brand colour with the logo.",
    line("Counter", s.counter),
    line("Staff clothing and styling (two people, a man and a woman; keep the relaxed pose described above and ignore any demonstration or action in this line)", s.staff),
    line("Shelving on the right", s.shelves),
    line("Floor and materials", s.materials),
    line("Lighting", s.lighting),
  ]
    .filter(Boolean)
    .join("\n")}
${missing.join("\n")}
${REALISM}`;
}

/** The logo's own colour wins; monochrome logos borrow the brand colour the analysis saw on the site. */
function tailoredColor(logoColor: string, a: SiteAnalysis | null) {
  const own = boothColor(logoColor);
  if (own !== "#14233C" || !a?.brandColor) return own;
  const [r, g, b] = hexToRgb(a.brandColor);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 225 ? own : a.brandColor.toUpperCase();
}

async function referenceImages(a: SiteAnalysis) {
  const out: { buf: Buffer; description: string }[] = [];
  for (const im of a.images.filter((i) => i.selected).slice(0, 2)) {
    const id = im.url.split("/").pop() ?? "";
    const f = FILE_JPG.test(id) ? await loadFile(id) : null;
    if (f) out.push({ buf: f.data, description: im.description || im.caption || "a product of the company" });
  }
  return out;
}

const hash = (parts: string[]) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 20);
const productKey = (req: BoothRequest) => [...req.products].sort().join(",");

/** Coarse fingerprint of the logo pixels, so re-fetching the same logo still hits the cache but another logo never does. */
export async function logoPrint(png: Buffer) {
  const px = await sharp(png, { limitInputPixels: 40_000_000 })
    .flatten({ background: "#FFFFFF" })
    .resize(24, 24, { fit: "contain", background: "#FFFFFF" })
    .greyscale()
    .raw()
    .toBuffer();
  return createHash("sha1").update(px.map((v) => v >> 5)).digest("hex").slice(0, 16);
}

async function readCache(key: string): Promise<BoothResult | null> {
  try {
    const hit = JSON.parse(await readFile(path.join(CACHE, `${key}.json`), "utf8")) as { url: string; color: string; format?: BoothFormat };
    const id = hit.url.split("/").pop()!;
    return (await loadFile(id)) ? { url: hit.url, color: hit.color, cached: true, format: hit.format ?? "3:2" } : null;
  } catch {
    return null;
  }
}

async function render(req: BoothRequest, logo: Buffer, key: string, analysis: SiteAnalysis | null): Promise<BoothResult> {
  const color = tailoredColor(req.color, analysis);
  const refs = analysis ? await referenceImages(analysis) : [];
  const refFiles = await Promise.all(
    refs.map(async (r, i) => {
      const jpg = await sharp(r.buf, { limitInputPixels: 40_000_000 }).flatten({ background: "#FFFFFF" }).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
      return toFile(jpg, `product-${i + 1}.jpg`, { type: "image/jpeg" });
    }),
  );
  const logoRef = await sharp(logo, { limitInputPixels: 40_000_000 })
    .resize(860, 860, { fit: "inside" })
    .extend({ top: 82, bottom: 82, left: 82, right: 82, background: "#FFFFFF" })
    .flatten({ background: "#FFFFFF" })
    .resize(1024, 1024, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toBuffer();
  const booth = await readFile(reference(req.format));
  const fmt = FORMATS[req.format];
  const base = analysis ? tailoredPrompt(req, analysis, color, refs.map((r) => r.description)) : prompt(req, color);
  const generate = async (fixes: string[]) => {
    const res = await openai().images.edit({
      model: IMAGE_MODEL,
      image: [await toFile(booth, "booth.jpg", { type: "image/jpeg" }), await toFile(logoRef, "logo.png", { type: "image/png" }), ...refFiles],
      prompt: fixes.length ? `${base}\nA previous attempt had these problems – make sure they do not happen this time:\n${fixes.map((f) => `- ${f}`).join("\n")}` : base,
      size: fmt.size,
      quality: IMAGE_QUALITY,
      output_format: "jpeg",
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
    const out = await sharp(Buffer.from(b64, "base64")).resize({ width: fmt.width, withoutEnlargement: true }).toBuffer();
    const cut = fmt.crop ? sharp(out).extract({ left: 0, top: fmt.crop.top, width: fmt.width, height: fmt.crop.height }) : sharp(out);
    return cut.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  };

  /** Keeps the first clean render, else the one with the fewest issues; a failing reviewer never blocks the booth. */
  let best: { jpg: Buffer; review: BoothReview | null } | null = null;
  let attempts = 0;
  let fixes: string[] = [];
  while (attempts < MAX_IMAGES) {
    attempts++;
    const t0 = Date.now();
    let jpg: Buffer;
    try {
      jpg = await generate(fixes);
    } catch (e) {
      if (!best) throw e;
      break;
    }
    const review = await reviewBooth(jpg, logo, { name: promptName(analysis?.brandName || req.name, req.site), tagline: analysis?.tagline, layout: EXPECTED.filter(([i]) => !i || req.products.includes(i)).map(([, d]) => d), format: req.format });
    console.info(`demo/booth ${req.site} attempt ${attempts}: ${review ? (review.ok ? "ok" : review.issues.join(" | ")) : "review failed"} (${Date.now() - t0} ms)`);
    if (!best || (review && (!best.review || review.issues.length < best.review.issues.length))) best = { jpg, review };
    if (!review || review.ok) break;
    fixes = review.issues;
  }
  const file = await saveFile(best!.jpg, "jpg");
  await mkdir(CACHE, { recursive: true });
  await writeFile(
    path.join(CACHE, `${key}.json`),
    JSON.stringify({ url: file.url, color, format: req.format, site: req.site, products: req.products, analysisId: analysis?.id, attempts, review: best!.review, createdAt: new Date().toISOString() }),
  );
  return { url: file.url, color, cached: false, attempts, format: req.format };
}

const inFlight = new Map<string, Promise<BoothResult>>();

/** Cached booths are always served; new renders need an API key, a free slot and rate-limit headroom. */
export async function brandedBooth(req: BoothRequest, ip: string): Promise<BoothResult> {
  const id = LOGO_URL.exec(req.light)?.[1];
  const logo = id ? await loadFile(id) : null;
  if (!logo || logo.data.byteLength > MAX_LOGO_BYTES) throw new BoothError("Loggan hittades inte. Hämta den igen.", 400);
  const print = await logoPrint(logo.data).catch(() => null);
  if (!print) throw new BoothError("Kunde inte läsa loggan. Hämta den igen.", 400);
  const found = req.analysisId ? await readAnalysis(req.analysisId) : null;
  const analysis = found && found.host === req.site ? found : null;
  /** 3:2 keys are unchanged so existing desktop booths stay cached. */
  const framing = req.format === "3:2" ? [] : [req.format];
  const key = analysis
    ? hash([PIPELINE, TAILORED, req.site, print, tailoredColor(req.color, analysis), productKey(req), analysis.id, ...analysis.images.filter((i) => i.selected).map((i) => i.hash), ...framing])
    : hash([PIPELINE, VERSION, req.site, print, boothColor(req.color), productKey(req), ...framing]);
  const hit = await readCache(key);
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
    job = render(req, logo.data, key, analysis).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}
