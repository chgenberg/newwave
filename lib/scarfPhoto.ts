import { toFile } from "openai";
import sharp from "sharp";
import { openai } from "./openai";

/**
 * Fotografier av en stickad halsduk på en person, gjorda av bildmodellen med halsdukens mönster som underlag.
 * Delas av fotostudion (app/api/v1/scarf/photos) och av materialet för sociala medier.
 *
 * Bildmodellen ritar om halsduken och kan aldrig lova att varje maska stämmer. Två saker gör att bilden ändå visar
 * den halsduk som stickas: modellen får se ändarna precis som de hänger på bröstet (i stället för att själv gissa hur
 * en liggande halsduk ser ut buren), och den får inte lägga till, flytta eller ta bort något.
 */

/** Halsdukens foton tas med en egen modell och kvalitet – de ska se ut som fotografier, och mönstret ska stämma. */
const PHOTO_MODEL = process.env.SCARF_PHOTO_MODEL || "gpt-image-2.6-sunburst";
const PHOTO_QUALITY = (process.env.SCARF_PHOTO_QUALITY || "high") as "low" | "medium" | "high";

const CARD = "#F5F5F7";
/** Så stor del av halsduken hänger synlig på var sida om halsen. Mitten ligger bakom nacken. */
const END = 0.38;

export const REALISM =
  "Hyperrealistic editorial photography shot on a full-frame camera with an 85mm f/1.8 lens, natural skin texture, realistic knitted jacquard wool/acrylic yarn texture and fringes, natural fabric folds and lighting. Indistinguishable from a real photograph. No extra limbs or fingers, no watermarks.";

/** What the two reference images are. `first` is the number of the image with the hanging ends. */
export const references = (club: string, first = 1) =>
  `Image ${first} shows the two ends of a custom knitted scarf for ${club} exactly as they hang on the wearer's chest, seen from the front: the left strip hangs on the left side of the picture and the right strip on the right side. Image ${first + 1} shows the whole scarf laid flat.`;

/** The one way the scarf is worn: hung around the neck, both ends straight down the chest, each end looking exactly like its strip. */
export const worn = (image = 1) =>
  `How the scarf is worn (strict): the classic supporter way – the scarf lies once loosely around the back of the neck and BOTH ends hang straight down the front of the body, side by side and parallel, one on each side of the chest, reaching about to the waist. Each hanging end lies flat and untwisted, facing the camera and fully readable, and looks exactly like its strip in Image ${image}: the same letters reading in the same direction, the same stripes, patterns and motifs in the same places and proportions, the same colours, and the fringes at the bottom. Do NOT add, move, repeat or remove any crest, logo, text, stripe or motif – if an end has no crest in Image ${image} it has no crest in the photo. The middle of the scarf is hidden behind the neck. The scarf is NOT wrapped around the neck, NOT knotted, NOT looped, NOT tucked into the jacket, NOT thrown over one shoulder and NOT held in the hands. Both hands are relaxed and do not cover the scarf.`;

/** The other pose: the scarf held up like a banner, so that the whole front can be read. */
const HELD =
  "The scarf is pulled taut and flat like a banner, horizontal, its whole front facing the camera from fringe to fringe, fully inside the frame and not covered by anything but the two gripping hands at the very ends. It looks exactly like the reference image: the same letters in the same order and places, the same crests, stripes, patterns and motifs in the same places and proportions, the same colours, fringes at both short ends. Do NOT add, move, repeat or remove any crest, logo, text, stripe or motif. The scarf is not around the neck.";

export const FAITHFUL = "Realistic knitted yarn texture. Fictional generic person, no other brand logos.";

/** Hela halsduken liggande på ett neutralt kort, så att bildmodellen ser färger, märke och text. */
async function flatCard(image: Buffer) {
  const scarf = await sharp(image).resize({ width: 1400, withoutEnlargement: true }).flatten({ background: CARD }).png().toBuffer();
  const meta = await sharp(scarf).metadata();
  const w = meta.width ?? 1400;
  const h = meta.height ?? 200;
  const padY = Math.max(120, Math.round((w * 0.55 - h) / 2));
  return sharp({ create: { width: w + 80, height: h + padY * 2, channels: 3, background: CARD } })
    .composite([{ input: scarf, left: 40, top: padY }])
    .png()
    .toBuffer();
}

/** De två ändarna som de hänger på bröstet, sedda framifrån: vänster del vriden moturs och höger del medurs, fransarna nederst. */
async function wornCard(image: Buffer) {
  const flat = await sharp(image).resize({ width: 3000 }).flatten({ background: CARD }).png().toBuffer();
  const meta = await sharp(flat).metadata();
  const [w, h] = [meta.width ?? 3000, meta.height ?? 380];
  const part = Math.round(w * END);
  // Varje steg görs för sig: sharp vrider annars före utsnittet.
  const end = async (left: number, turn: 90 | 270) => {
    const cut = await sharp(flat).extract({ left, top: 0, width: part, height: h }).png().toBuffer();
    return sharp(await sharp(cut).rotate(turn).png().toBuffer()).resize({ height: 1240 }).png().toBuffer();
  };
  const [a, b] = await Promise.all([end(0, 270), end(w - part, 90)]);
  const strip = (await sharp(a).metadata()).width ?? 400;
  return sharp({ create: { width: 1024, height: 1536, channels: 3, background: CARD } })
    .composite([
      { input: a, left: 512 - strip - 50, top: 148 },
      { input: b, left: 512 + 50, top: 148 },
    ])
    .png()
    .toBuffer();
}

/** Underlaget bildmodellen får: ändarna som de hänger, och hela halsduken liggande. `image` är framsidan som den blir stickad. */
export async function scarfReferences(image: Buffer) {
  const [hanging, flat] = await Promise.all([wornCard(image), flatCard(image)]);
  return { hanging, flat };
}

/** Bildmodellen gör ett fotografi utifrån referensbilderna. Ger en JPG. */
export async function editToJpg(files: { buf: Buffer; name: string }[], prompt: string, size: "1024x1024" | "1024x1536" = "1024x1024") {
  const res = await openai().images.edit({
    model: PHOTO_MODEL,
    image: await Promise.all(files.map((f) => toFile(f.buf, f.name, { type: "image/png" }))),
    prompt,
    size,
    quality: PHOTO_QUALITY,
    output_format: "jpeg",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return sharp(Buffer.from(b64, "base64")).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** Personerna och platserna i materialet för sociala medier. Platsen är neutral, så att den passar alla sporter och orter. */
const SOCIAL = {
  sport: {
    worn: "Waist-up photo, facing the camera: a smiling Scandinavian woman in her late 20s in a dark wool coat outside a Swedish sports arena on a match evening, warm floodlights and softly blurred supporters far behind her, wearing the exact knitted supporter scarf from the reference images.",
    held: "Waist-up photo, facing the camera: a joyful Scandinavian man in his 30s in a neutral dark jacket on a Swedish town street in golden late-afternoon light, on his way to the match. He holds the scarf from the reference image stretched out wide in front of his chest with both hands, one hand gripping each end just inside the fringes, the classic supporter pose.",
  },
  vardag: {
    worn: "Waist-up photo, facing the camera: a smiling Scandinavian woman in her early 30s in a dark wool coat on a Swedish city street on a crisp winter afternoon with softly blurred shop windows behind her, wearing the exact knitted scarf from the reference images.",
    held: "Waist-up photo, facing the camera: a friendly Scandinavian man in his 40s in a dark jacket on a frosty park path in golden afternoon light. He holds the scarf from the reference image stretched out wide in front of his chest with both hands, one hand gripping each end just inside the fringes.",
  },
} as const;

/**
 * Två stående fotografier av halsduken: buren om halsen, och uppsträckt mellan händerna så att hela framsidan syns.
 * `scarf` är framsidan som den blir stickad. Det som inte går att fotografera hoppas över – listan kan bli kortare, eller tom.
 */
export async function socialPhotos(input: { club: string; scarf: Buffer; setting: "sport" | "vardag" }) {
  const { hanging, flat } = await scarfReferences(input.scarf);
  const scene = SOCIAL[input.setting];
  const settled = await Promise.allSettled([
    editToJpg(
      [
        { buf: hanging, name: "hanging-ends.png" },
        { buf: flat, name: "scarf.png" },
      ],
      [REALISM, references(input.club), scene.worn, worn(), FAITHFUL, "Vertical composition with the person centred and some calm space above the head."].join("\n"),
      "1024x1536",
    ),
    editToJpg([{ buf: flat, name: "scarf.png" }], [REALISM, `The reference image shows the front of a custom knitted scarf for ${input.club}, laid flat.`, scene.held, HELD, FAITHFUL, "Vertical composition with the person centred."].join("\n"), "1024x1536"),
  ]);
  const [wornPhoto, heldPhoto] = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
  return { worn: wornPhoto, held: heldPhoto, errors: settled.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : [])) };
}
