import { toFile } from "openai";
import sharp from "sharp";
import { openai } from "./openai";
import { SCARF } from "./scarf";

/**
 * Fotografier av en stickad halsduk på en person, gjorda av bildmodellen med halsdukens mönster som underlag.
 * Delas av fotostudion (app/api/v1/scarf/photos) och av materialet för sociala medier.
 *
 * Bildmodellen ritar om halsduken och kan aldrig lova att varje maska stämmer. Två saker gör att bilden ändå visar
 * den halsduk som stickas: modellen får se ändarna precis som de hänger på bröstet (i stället för att själv gissa hur
 * en liggande halsduk ser ut buren), och den får inte lägga till, flytta eller ta bort något.
 *
 * Halsduken ska också vara lika stor mot kroppen som den riktiga. Därför står måtten i varje beställning, och fotot där
 * halsduken hålls uppsträckt tas liggande: i ett stående foto ryms inte hela längden mellan händerna, och då krymper
 * bildmodellen halsduken i stället för att backa med kameran.
 */

/** Halsdukens foton tas med en egen modell och kvalitet – de ska se ut som fotografier, och mönstret ska stämma. */
const PHOTO_MODEL = process.env.SCARF_PHOTO_MODEL || "gpt-image-2.6-sunburst";
const PHOTO_QUALITY = (process.env.SCARF_PHOTO_QUALITY || "high") as "low" | "medium" | "high";

const CARD = "#F5F5F7";
/** Så stor del av halsduken hänger synlig på var sida om halsen. Mitten ligger bakom nacken. */
const END = 0.38;

/** Halsdukens verkliga mått i centimeter, utan fransar. */
const [LENGTH, WIDTH] = [SCARF.lengthMm / 10, SCARF.widthMm / 10];

/**
 * Bildstilen: en vanlig mobilbild som någon i klubben har tagit – inte en reklambild. Blankt ljus, suddig bakgrund och
 * felfria ansikten är det som får en bild att se datorgjord ut.
 */
export const SNAPSHOT =
  "An ordinary, unedited snapshot taken by a friend with a mobile phone – a real amateur photo, not a professional, editorial or advertising picture. Phone camera look: a fairly wide lens, the person and the background both reasonably sharp (no creamy background blur, no bokeh), plain available light – flat grey daylight or ordinary outdoor lamps – with no studio light, no golden glow, no rim light and no colour grading. Colours are a little flat, with slight image noise. Casual framing: not perfectly centred and not perfectly level, the kind of picture people post themselves. The person is an ordinary club member, not a model: average everyday looks, unretouched skin, hair a little untidy, everyday clothes with creases, a relaxed natural expression. The surroundings are ordinary and a bit untidy, and nothing in the background carries readable text. It must look like a real photograph of a real knitted jacquard scarf, with real yarn texture, soft folds and fringes. No extra limbs or fingers, no watermarks, no borders.";

/** För fotot där en riktig person får halsduken på sig: bilden ska förbli samma fotografi. */
export const SAME_PHOTO = "A photorealistic edit of Image 1: the result must look like the same photograph, taken with the same camera in the same light, with a real knitted jacquard scarf added. No extra limbs or fingers, no watermarks.";

/** Storleken mot kroppen. Utan den ritar bildmodellen halsduken så stor som råkar passa i bilden. */
export const SIZE = `Real size (strict): the scarf is ${LENGTH} cm long and ${WIDTH} cm wide, plus short fringes at both ends – ${(LENGTH / WIDTH).toFixed(1)} times as long as it is wide, exactly the proportions of the scarf laid flat in the reference image. Draw it at that true size against the person's body: its width is about the length of an adult hand from wrist to fingertips, and its length is about three quarters of the person's height. Never shorten, lengthen, widen or narrow the scarf to make it fit the picture – step back with the camera instead.`;

/** Vanliga människor i vanliga ytterkläder. Två olika väljs till varje halsduk, så att inte alla klubbar får samma ansikten. */
const PEOPLE = [
  "a woman of about 45 with glasses and shoulder-length brown hair, in a plain dark puffer jacket",
  "a man of about 55 with a greying beard, in a plain dark parka",
  "a woman of about 30 with her hair in a loose ponytail, in a plain grey wool coat",
  "a man of about 25 with short dark hair, in a plain black windbreaker",
  "a woman of about 60 with short grey hair, in a plain navy quilted jacket",
  "a man of about 40 with a plain dark beanie pushed back on his head, in a plain dark softshell jacket",
];

/** `count` olika personer ur listan, varannan kvinna och varannan man. */
export function people(count: number) {
  const first = Math.floor(Math.random() * PEOPLE.length);
  return Array.from({ length: count }, (_, i) => PEOPLE[(first + i) % PEOPLE.length]);
}

/** What the two reference images are. `first` is the number of the image with the hanging ends. */
export const references = (club: string, first = 1) =>
  `Image ${first} shows the two ends of a custom knitted scarf for ${club} exactly as they hang on the wearer's chest, seen from the front: the left strip hangs on the left side of the picture and the right strip on the right side. Image ${first + 1} shows the whole scarf laid flat.`;

/** The one way the scarf is worn: hung around the neck, both ends straight down the chest, each end looking exactly like its strip. */
export const worn = (image = 1) =>
  `How the scarf is worn (strict): the classic supporter way – the scarf lies once loosely around the back of the neck and BOTH ends hang straight down the front of the body, side by side and parallel, one on each side of the chest. ${SIZE} Worn like this, each end hangs about ${Math.round(LENGTH * END)} cm down from the collarbone, so the fringes stop at the belt line – not down at the hips or thighs. Each hanging end lies flat and untwisted, facing the camera and fully readable, and looks exactly like its strip in Image ${image}: the same letters reading in the same direction, the same stripes, patterns and motifs in the same places and proportions, the same colours, and the fringes at the bottom. Do NOT add, move, repeat or remove any crest, logo, text, stripe or motif – if an end has no crest in Image ${image} it has no crest in the photo. The middle of the scarf is hidden behind the neck. The scarf is NOT wrapped around the neck, NOT knotted, NOT looped, NOT tucked into the jacket, NOT thrown over one shoulder and NOT held in the hands. Both hands are relaxed and do not cover the scarf.`;

/** The other pose: the scarf held up like a banner, so that the whole front can be read. A landscape photo, so that the full length fits. */
const HELD = `The scarf is pulled taut and flat like a banner, horizontal, its whole front facing the camera from fringe to fringe, and not covered by anything but the two gripping fists at the very ends. ${SIZE} Because the scarf is ${LENGTH} cm long the two fists are about ${LENGTH - 10} cm apart: the arms reach out wide to both sides and a little forward, and the scarf is about three times as wide as the person's shoulders, sticking out far beyond the body on both sides. Landscape picture taken from a few metres away, showing the person from the thighs up: the whole scarf with both fringed ends is inside the picture with clear empty space to the left and right of it, and spans about three quarters of the picture width. It looks exactly like the reference image: the same letters in the same order and places, the same crests, stripes, patterns and motifs in the same places and proportions, the same colours, fringes at both short ends. Do NOT add, move, repeat or remove any crest, logo, text, stripe or motif. The scarf is not around the neck.`;

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
export async function editToJpg(files: { buf: Buffer; name: string }[], prompt: string, size: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024") {
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

/** Platserna i materialet för sociala medier – vardagliga, och neutrala nog att passa alla sporter och orter. */
const SOCIAL = {
  sport: {
    worn: (who: string) =>
      `Photo from the hips up, facing the camera: ${who}, standing outside the entrance of a local Swedish sports arena before a match on an ordinary grey afternoon, with a bicycle rack, a parked car and a few other supporters walking past behind. The person wears the exact knitted supporter scarf from the reference images.`,
    held: (who: string) =>
      `${who}, standing on the asphalt outside a local Swedish sports arena before a match on an ordinary grey afternoon, with a fence, a few parked cars and other supporters further away. The person proudly holds up the scarf from the reference image for the camera, the classic supporter pose.`,
  },
  vardag: {
    worn: (who: string) =>
      `Photo from the hips up, facing the camera: ${who}, standing on an ordinary Swedish town street on a grey winter afternoon, with shop fronts, parked bicycles and a few passers-by behind. The person wears the exact knitted scarf from the reference images.`,
    held: (who: string) =>
      `${who}, standing in a car park outside an ordinary Swedish workplace on a grey winter day, with a brick wall and a few parked cars behind. The person happily holds up the scarf from the reference image for the camera.`,
  },
} as const;

/**
 * Två fotografier av halsduken: buren om halsen (stående), och uppsträckt mellan händerna så att hela framsidan syns
 * (liggande). `scarf` är framsidan som den blir stickad. Det som inte går att fotografera blir null.
 */
export async function socialPhotos(input: { club: string; scarf: Buffer; setting: "sport" | "vardag" }) {
  const { hanging, flat } = await scarfReferences(input.scarf);
  const scene = SOCIAL[input.setting];
  const [first, second] = people(2);
  const settled = await Promise.allSettled([
    editToJpg(
      [
        { buf: hanging, name: "hanging-ends.png" },
        { buf: flat, name: "scarf.png" },
      ],
      [SNAPSHOT, references(input.club), scene.worn(first), worn(), FAITHFUL, "Vertical picture with some space above the head; both fringed ends are inside the picture."].join("\n"),
      "1024x1536",
    ),
    editToJpg([{ buf: flat, name: "scarf.png" }], [SNAPSHOT, `The reference image shows the front of a custom knitted scarf for ${input.club}, laid flat.`, scene.held(second), HELD, FAITHFUL].join("\n"), "1536x1024"),
  ]);
  const [wornPhoto, heldPhoto] = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
  return { worn: wornPhoto, held: heldPhoto, errors: settled.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : [])) };
}
