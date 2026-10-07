import sharp from "sharp";
import type { BoothFormat } from "./demoCatalog";
import { cleanText } from "./demoLimit";
import { TEXT_MODEL, errorMessage, openai } from "./openai";

export type BoothReview = { ok: boolean; issues: string[] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "issues"],
  properties: { ok: { type: "boolean" }, issues: { type: "array", items: { type: "string" } } },
} as const;

const SYSTEM = `You are a strict photo editor doing quality control on AI-generated trade show booth photos before a customer sees them. The photo must be indistinguishable from a real photograph.
You get: (1) the full booth photo, (2) a close-up of the counter area with the staff, (3) the company's logo as reference.
Check carefully, especially the close-up:
- People: exactly two staff members behind the counter. Each has exactly two arms, two hands and five fingers per hand, all connected to their own body. Flag any extra, missing, merged, floating or disembodied arm, hand or finger (also a hand or arm reaching in from nowhere), and any distorted or melted face.
- Objects: nothing floating in the air or merging into other objects; plausible shadows and reflections.
- Text: the logo on the back wall, counter, roll-up and flag must match the reference logo's spelling exactly. Flag misspelled, garbled or invented letters and any nonsense text. Small illegible print on products is fine.
- Layout: the expected elements are listed in the user message. Flag an expected element that is missing or moved so much that the layout changes. Elements not listed are intentionally absent – never flag them as missing.
Ignore background visitors in the blurred hall unless they are grotesquely deformed. Do not flag style choices, colours or minor imperfections a real photo could have.
ok = true only if there are no real issues. issues: short, concrete English fix instructions an image model can act on (e.g. "Remove the extra disembodied hand on the counter in front of the man; he has only his own two hands resting on the counter."), max 5.`;

/** Where the counter and staff sit in each framing, as fractions of the image. */
const CLOSE_UP: Record<BoothFormat, { left: number; top: number; width: number; height: number }> = {
  "3:2": { left: 0.3, top: 0.18, width: 0.4, height: 0.62 },
  "4:3": { left: 0.32, top: 0.24, width: 0.38, height: 0.54 },
};

const FRAMING: Record<BoothFormat, string> = {
  "3:2": "",
  "4:3": "\nFraming: a 4:3 photo where the whole booth is visible with a little hall ceiling above and floor below. Flag it if the beach flag, roll-up, counter or shelving is cut off by any edge of the frame.",
};

const dataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString("base64")}`;

/** Vision QA for one booth render; null when the reviewer itself fails, so the caller keeps the image. */
export async function reviewBooth(jpg: Buffer, logo: Buffer, opts: { name: string; tagline?: string; layout: string[]; format?: BoothFormat }): Promise<BoothReview | null> {
  try {
    const img = sharp(jpg);
    const { width = 1536, height = 1024 } = await img.metadata();
    const full = await sharp(jpg).resize(1536, 1024, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
    const c = CLOSE_UP[opts.format ?? "3:2"];
    const crop = await sharp(jpg)
      .extract({ left: Math.round(width * c.left), top: Math.round(height * c.top), width: Math.round(width * c.width), height: Math.round(height * c.height) })
      .resize(1024, 1024, { fit: "inside" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const logoRef = await sharp(logo, { limitInputPixels: 40_000_000 }).flatten({ background: "#FFFFFF" }).resize(512, 512, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const res = await openai().responses.create(
      {
        model: TEXT_MODEL,
        input: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "input_text", text: `Booth for "${cleanText(opts.name, 40)}".${opts.tagline ? ` The back wall also carries the tagline "${cleanText(opts.tagline, 40)}".` : ""}\nExpected layout from left to right: ${opts.layout.join(", ")}.${FRAMING[opts.format ?? "3:2"]}\n(1) Full photo:` },
              { type: "input_image", image_url: dataUrl(full), detail: "high" },
              { type: "input_text", text: "(2) Close-up of the counter and staff:" },
              { type: "input_image", image_url: dataUrl(crop), detail: "high" },
              { type: "input_text", text: "(3) Reference logo:" },
              { type: "input_image", image_url: dataUrl(logoRef), detail: "low" },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "booth_review", schema: schema as unknown as Record<string, unknown>, strict: true } },
      },
      { timeout: 60_000, maxRetries: 1 },
    );
    const r = JSON.parse(res.output_text) as BoothReview;
    const issues = (Array.isArray(r.issues) ? r.issues : []).map((i) => cleanText(String(i).replace(/\s*[:;–—]\s*/g, ", "), 220)).filter(Boolean).slice(0, 5);
    return { ok: Boolean(r.ok), issues: r.ok ? [] : issues };
  } catch (e) {
    console.error("demo/booth review", errorMessage(e));
    return null;
  }
}
