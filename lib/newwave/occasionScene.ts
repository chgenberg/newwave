import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toFile } from "openai";
import sharp from "sharp";
import { cleanText } from "@/lib/demoLimit";
import { IMAGE_MODEL, IMAGE_QUALITY, openai } from "@/lib/openai";
import { loadFile, saveFile } from "@/lib/store";
import { type OccasionId, occasion } from "./occasions";

/** Hur varje scen ska brandas: vad den föreställer, vilka ytor som får märkesfärgen och vilka personer som är med. */
const DIRECTION: Record<OccasionId, { subject: string; colours: string; people: string }> = {
  massa: {
    subject: "a professionally built trade show booth",
    colours: "the back wall, roll-up, beach flag, counter front and the staff's shirts",
    people: "Exactly two staff stand behind the counter, relaxed and facing the camera, each with both hands resting on the counter top.",
  },
  konferens: {
    subject: "a branded corporate conference stage and registration area",
    colours: "the stage backdrop, roll-up, floor sign, lectern front, registration desk front and the staff's clothing",
    people: "Exactly two people, both behind the registration desk; nobody on the stage.",
  },
  kickoff: {
    subject: "a branded company kick-off in a bright Scandinavian loft",
    colours: "the banner wall, the tablecloths, the beach flag and the team's hoodies",
    people: "Exactly six adults in the centre group with natural adult proportions, everyone on the same floor plane.",
  },
  sommar: {
    subject: "a branded company summer party on a lawn by a Swedish lake",
    colours: "the backdrop, beach flag, picnic blanket, cooler bag, tote bags and the team's t-shirts and caps",
    people: "Exactly five smiling adults in front of the backdrop, natural proportions, everyone on the same ground plane.",
  },
  event: {
    subject: "a branded evening brand event with a photo wall and a bar",
    colours: "the bar front, the cocktail table cover, the beach flag, the floor sign and accents on the photo wall; the warm evening light stays",
    people: "Exactly five people: two bartenders behind the bar and three guests at the cocktail table; glasses held naturally.",
  },
  julklapp: {
    subject: "a branded corporate Christmas gift table in a cosy Scandinavian office",
    colours: "the beach flag, tablecloth, wall panel, gift boxes and gift bags",
    people: "Exactly two people behind the table, each with both hands resting on it.",
  },
};

/** Höjs när prompten ändras så mycket att gamla scener ska göras om. */
const VERSION = "s1";
const CACHE = path.join(process.cwd(), ".data", "newwave", "scenes");
const FILE_PNG = /^\/api\/v1\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png)$/;
const PUBLIC_PNG = /^\/newwave\/[a-z0-9/_-]+\.png$/;
export const LOGO_SRC = new RegExp(`${FILE_PNG.source}|${PUBLIC_PNG.source}`);

export class SceneError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readLogo(src: string): Promise<Buffer> {
  const file = FILE_PNG.exec(src)?.[1];
  if (file) {
    const f = await loadFile(file);
    if (f) return f.data;
  } else if (PUBLIC_PNG.test(src) && !src.includes("..")) {
    const buf = await readFile(path.join(process.cwd(), "public", src)).catch(() => null);
    if (buf) return buf;
  }
  throw new SceneError("Loggan hittades inte. Ladda upp den igen.", 400);
}

/** Grovt fingeravtryck av loggans pixlar: samma logga hittar cachen även om filen laddats upp på nytt. */
async function logoPrint(png: Buffer) {
  const px = await sharp(png, { limitInputPixels: 40_000_000 }).flatten({ background: "#FFFFFF" }).resize(24, 24, { fit: "contain", background: "#FFFFFF" }).greyscale().raw().toBuffer();
  return createHash("sha1").update(px.map((v) => v >> 5)).digest("hex").slice(0, 16);
}

const keyOf = (id: OccasionId, print: string, color: string) => createHash("sha1").update([VERSION, id, print, color].join("|")).digest("hex").slice(0, 20);

async function readCache(key: string) {
  try {
    const { url } = JSON.parse(await readFile(path.join(CACHE, `${key}.json`), "utf8")) as { url: string };
    return (await loadFile(url.split("/").pop()!)) ? url : null;
  } catch {
    return null;
  }
}

function prompt(id: OccasionId, company: string, color: string, about: string) {
  const d = DIRECTION[id];
  return `Photorealistic photo of ${d.subject} for "${company}", shot on a full-frame camera, eye level, straight on, landscape. It must look like it was produced specifically for this company by a top agency.
${about ? `About the company: ${about}. Let small details (screen content, props, styling) quietly suit this business without adding any text.\n` : ""}The first reference image shows the exact layout, camera angle, framing, lighting, people and object positions: keep all of them the same, only restyle and brand the scene for this company.
The second reference image is the company's logo. Replace every "DIN LOGO" placeholder with this exact logo – identical shapes, letters and proportions, no invented or distorted characters. On dark surfaces print the logo in white, on light surfaces in its own colours.
${color ? `Brand colour: ${color}. Use it as the dominant colour of ${d.colours}, combined with white and natural materials.` : `Use the logo's own colours on ${d.colours}, combined with white and natural materials.`} Premium, clean Scandinavian design.
Realism requirements (most important):
- It must look like an unedited photo by a professional event photographer: physically plausible light, shadows and reflections, correct perspective, nothing floating in the air.
- ${d.people} Every person has one head, two arms, two hands and five fingers per hand; natural relaxed faces with real skin texture; people are fictional and generic.
- Every logo is spelled exactly as in the logo reference. No garbled, invented or nonsense text anywhere.`;
}

const running = new Map<string, Promise<string>>();

export type SceneRequest = { occasion: OccasionId; logo: string; name: string; color: string; about?: string };

/** Scenen med kundens logga. `cachedOnly` svarar bara om den redan är gjord, utan att rita en ny. */
export async function brandedScene(req: SceneRequest, opts: { cachedOnly?: boolean; allow?: () => boolean } = {}): Promise<string | null> {
  const o = occasion(req.occasion)!;
  const logo = await readLogo(req.logo);
  const color = /^#[0-9A-F]{6}$/i.test(req.color) ? req.color.toUpperCase() : "";
  const key = keyOf(o.id, await logoPrint(logo), color);
  const hit = await readCache(key);
  if (hit || opts.cachedOnly) return hit;
  const busy = running.get(key);
  if (busy) return busy;
  if (opts.allow && !opts.allow()) throw new SceneError("Ni har skapat många scener på kort tid. Försök igen om en stund.", 429);

  const job = (async () => {
    const scene = await readFile(path.join(process.cwd(), "public", o.scene));
    const logoRef = await sharp(logo, { limitInputPixels: 40_000_000 })
      .resize(860, 860, { fit: "inside" })
      .extend({ top: 82, bottom: 82, left: 82, right: 82, background: "#FFFFFF" })
      .flatten({ background: "#FFFFFF" })
      .resize(1024, 1024, { fit: "contain", background: "#FFFFFF" })
      .png()
      .toBuffer();
    const res = await openai().images.edit({
      model: IMAGE_MODEL,
      image: [await toFile(scene, "scene.jpg", { type: "image/jpeg" }), await toFile(logoRef, "logo.png", { type: "image/png" })],
      prompt: prompt(o.id, cleanText(req.name, 40) || "the company", color, cleanText(req.about ?? "", 180)),
      size: "1536x1024",
      quality: IMAGE_QUALITY,
      output_format: "jpeg",
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
    const jpg = await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const { url } = await saveFile(jpg, "jpg");
    await mkdir(CACHE, { recursive: true });
    await writeFile(path.join(CACHE, `${key}.json`), JSON.stringify({ url, occasion: o.id, at: new Date().toISOString() }));
    return url;
  })();
  running.set(key, job);
  try {
    return await job;
  } finally {
    running.delete(key);
  }
}
