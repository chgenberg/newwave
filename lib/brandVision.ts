import sharp from "sharp";
import { cleanText } from "./demoLimit";
import { flatness, type SiteScrape } from "./demoSite";
import { logoFromFile, type LogoResult } from "./logo";
import { TEXT_MODEL, openai } from "./openai";

/**
 * Det mässmontern och återförsäljarens butik delar när de läser ett varumärke från en webbplats:
 * bilder till visionmodellen, kontrollen av loggan mot alla kandidater i sidhuvudet och wordmarket som sista utväg.
 */

const PIXELS = 40_000_000;

export type Content = { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" };

export const asImage = async (buf: Buffer, background = "#FFFFFF", size = 512): Promise<Content> => {
  const jpg = await sharp(buf, { limitInputPixels: PIXELS }).flatten({ background }).resize(size, size, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return { type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "low" };
};

export async function visionJson<T>(system: string, content: Content[], format: { name: string; schema: object }, timeout = 60_000): Promise<T> {
  const res = await openai().responses.create(
    {
      model: TEXT_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      text: { format: { type: "json_schema", name: format.name, schema: format.schema as Record<string, unknown>, strict: true } },
    },
    { timeout, maxRetries: 1 },
  );
  return JSON.parse(res.output_text) as T;
}

/** cleanText drops ":" and ";", which would glue the model's sentences together. */
export const clip = (s: unknown, n: number) => {
  const t = cleanText(typeof s === "string" ? s.replace(/\s*[:;–—]\s*/g, ", ") : "", n + 1);
  return t.length > n ? t.slice(0, t.lastIndexOf(" ", n)).replace(/[ ,]+$/, "") : t;
};

/** The site text and every image the model needs to judge the logo: the one we picked, the header candidates and the site's photos. */
export async function siteContent(scrape: SiteScrape, current: Buffer | null): Promise<Content[]> {
  const content: Content[] = [
    {
      type: "input_text",
      text: `<site>
URL: ${scrape.url}
Pages read: ${scrape.pages.join(", ")}
Title: ${scrape.title}
Site name: ${scrape.siteName}
Description: ${scrape.description}
Navigation: ${scrape.nav.join(" | ")}
Headings: ${scrape.headings.join(" | ")}
Text: ${scrape.text}
</site>`,
    },
  ];
  if (current) content.push({ type: "input_text", text: "LOGO (shown on a light grey background):" }, await asImage(current, "#E8E8ED", 384));
  for (const [i, c] of scrape.logos.entries()) content.push({ type: "input_text", text: `C${i}:` }, await asImage(c.png, "#E8E8ED", 384));
  for (const [i, im] of scrape.images.entries()) content.push({ type: "input_text", text: `P${i}${im.alt ? ` (alt: ${clip(im.alt, 80)})` : ""}:` }, await asImage(im.jpg));
  return content;
}

export const LOGO_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason", "candidate"],
  properties: { verdict: { type: "string", enum: ["ok", "wrong"] }, reason: { type: "string" }, candidate: { type: "integer" } },
} as const;

export const LOGO_CHECK_RULE = `logo: is LOGO really this company's own logo? Look at it carefully and compare with the brand name, the site text and the C candidates. It is wrong if it is a flag, a language or country selector, a generic icon (cart, user, menu, search), a payment, certification or partner logo, another company's logo, a cropped fragment of the real logo, or only a tiny symbol when a full wordmark exists among the C candidates. If there is no LOGO image, it is wrong. verdict "wrong" with candidate = index of the C image that is the real, complete logo, or -1 if none is. reason: one short Swedish sentence for the customer about what the wrong image was (e.g. "Bilden vi först hittade var en språkflagga."), never mention image labels like LOGO, C0 or P1.`;

export type LogoCheck = { verdict: "ok" | "wrong"; reason: string; candidate: number };
export type LogoPick = { status: "ok" | "replaced" | "wordmark"; note: string; result: LogoResult | null };

/** Flags, round language pickers and flat icons: few colours, solid fill, square-to-3:2. */
export async function flagLike(png: Buffer) {
  const { data, info } = await sharp(png, { limitInputPixels: PIXELS }).ensureAlpha().resize(96, 96, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, opaque = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 128) {
      opaque++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return false;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const fill = opaque / (bw * bh);
  const aspect = bw / bh;
  const flat = await flatness(png);
  let saturated = 0;
  for (let k = 0; k < data.length; k += 4) {
    if (data[k + 3] < 128) continue;
    const max = Math.max(data[k], data[k + 1], data[k + 2]), min = Math.min(data[k], data[k + 1], data[k + 2]);
    if (max > 60 && (max - min) / max > 0.45) saturated++;
  }
  return fill > 0.72 && aspect > 0.85 && aspect < 2.1 && flat.top3 > 0.88 && saturated / opaque > 0.35;
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Last resort: a clean typographic wordmark of the brand name. */
async function wordmark(name: string, color: string) {
  const text = escapeXml(cleanText(name, 32) || "Logo");
  const size = 120;
  const width = Math.round(text.length * size * 0.66 + 80);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size * 1.6}"><text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica Neue, Helvetica, Arial, Liberation Sans, DejaVu Sans, sans-serif" font-weight="700" font-size="${size}" letter-spacing="${size * 0.04}" fill="${color}">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Keeps the logo we found when the model (or, without a model answer, the flag check) accepts it.
 * Otherwise the model's candidate is tried first, then the other header candidates, then a wordmark of the brand name.
 */
export async function pickLogo(check: LogoCheck | null, scrape: SiteScrape, current: Buffer | null, brandName: string, color: string, source: string): Promise<LogoPick> {
  const suspicious = current ? await flagLike(current).catch(() => false) : true;
  const wrong = check ? check.verdict === "wrong" || !current : suspicious;
  if (!wrong) return { status: "ok", note: "", result: null };
  const order = [...scrape.logos.keys()];
  const pick = check?.candidate ?? -1;
  if (pick >= 0 && pick < order.length) order.unshift(...order.splice(pick, 1));
  else if (check && current) order.length = 0;
  const said = check ? clip(check.reason, 160) : "";
  const reason = said && !/\b(?:LOGO|[CP]\d+)\b/.test(said) ? said.replace(/\.?$/, ".") : "Bilden vi först hittade var inte er logga.";
  for (const i of order) {
    const c = scrape.logos[i];
    if (await flagLike(c.png).catch(() => true)) continue;
    try {
      const l = await logoFromFile(c.png, brandName);
      return { status: "replaced", note: `${reason} Vi använder loggan från sidhuvudet i stället.`, result: { ...l, name: brandName, site: scrape.host, source: `${source} · ${c.source}`.slice(0, 300) } };
    } catch {}
  }
  try {
    const l = await logoFromFile(await wordmark(brandName, /^#[0-9a-f]{6}$/i.test(color) ? color : "#1D1D1F"), brandName);
    return { status: "wordmark", note: `${reason} Vi satte namnet som wordmark tills ni laddar upp er logga.`, result: { ...l, name: brandName, site: scrape.host, source: `${source} · wordmark` } };
  } catch {
    return { status: "ok", note: "", result: null };
  }
}
