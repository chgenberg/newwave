import OpenAI, { toFile } from "openai";

export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-6-astra";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
export const IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "medium") as "low" | "medium" | "high";

export const hasOpenAIKey = () => Boolean(process.env.OPENAI_API_KEY);

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function generateJson<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const res = await openai().responses.create({
    model: TEXT_MODEL,
    input: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    text: {
      format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true },
    },
  });
  return JSON.parse(res.output_text) as T;
}

export async function generateTransparentPng(prompt: string): Promise<Buffer> {
  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1024",
    quality: IMAGE_QUALITY,
    background: "transparent",
    output_format: "png",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return Buffer.from(b64, "base64");
}

export async function generatePhoto(prompt: string, size: "1024x1536" | "1024x1024" = "1024x1536") {
  const res = await openai().images.generate({ model: IMAGE_MODEL, prompt, size, quality: IMAGE_QUALITY, output_format: "jpeg" });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return Buffer.from(b64, "base64");
}

export async function editWithMask(image: Buffer, mask: Buffer, prompt: string, size: "1024x1536" | "1024x1024" = "1024x1536") {
  const res = await openai().images.edit({
    model: IMAGE_MODEL,
    image: await toFile(image, "photo.png", { type: "image/png" }),
    mask: await toFile(mask, "mask.png", { type: "image/png" }),
    prompt,
    size,
    quality: IMAGE_QUALITY,
    output_format: "png",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return Buffer.from(b64, "base64");
}

export async function editWithReference(prompt: string, reference: Buffer, size: "1024x1536" | "1024x1024" = "1024x1536") {
  const res = await openai().images.edit({
    model: IMAGE_MODEL,
    image: await toFile(reference, "reference.png", { type: "image/png" }),
    prompt,
    size,
    quality: IMAGE_QUALITY,
    output_format: "jpeg",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return Buffer.from(b64, "base64");
}

export function errorMessage(err: unknown) {
  if (err instanceof OpenAI.APIError) return `OpenAI ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
