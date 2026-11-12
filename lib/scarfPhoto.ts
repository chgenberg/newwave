import { toFile } from "openai";
import sharp from "sharp";
import { errorMessage, generateJson, openai } from "./openai";
import { SCARF } from "./scarf";
import { people, settingOf } from "./scarfScene";

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
 *
 * Varje foto granskas sedan mot mönstret av språkmodellen: rätt text, rätt antal märken, rätt storlek. Avviker fotot
 * tas det om en gång, med granskarens anmärkning i beställningen. Var och när fotot tas står i scarfScene.ts.
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
  "An ordinary, unedited snapshot taken by a friend with a mobile phone – a real amateur photo, not a professional, editorial or advertising picture. Phone camera look: a fairly wide lens, the person and the background both reasonably sharp (no creamy background blur, no bokeh), plain available light exactly as it is on the spot, with no studio light, no golden glow, no rim light and no colour grading. Colours are a little flat, with slight image noise. Casual framing: not perfectly centred and not perfectly level, the kind of picture people post themselves. The person is an ordinary club member, not a model: average everyday looks, unretouched skin, hair a little untidy, everyday clothes with creases, a relaxed natural expression. The surroundings are ordinary and a bit untidy, and nothing in the background carries readable text. It must look like a real photograph of a real knitted jacquard scarf, with real yarn texture, soft folds and fringes. No extra limbs or fingers, no watermarks, no borders.";

/** För fotot där en riktig person får halsduken på sig: bilden ska förbli samma fotografi. */
export const SAME_PHOTO = "A photorealistic edit of Image 1: the result must look like the same photograph, taken with the same camera in the same light, with a real knitted jacquard scarf added. No extra limbs or fingers, no watermarks.";

/** Storleken mot kroppen. Utan den ritar bildmodellen halsduken så stor som råkar passa i bilden. */
export const SIZE = `Real size (strict): the scarf is ${LENGTH} cm long and ${WIDTH} cm wide, plus short fringes at both ends – ${(LENGTH / WIDTH).toFixed(1)} times as long as it is wide, exactly the proportions of the scarf laid flat in the reference image. Draw it at that true size against the person's body: its width is about the length of an adult hand from wrist to fingertips, and its length is about three quarters of the person's height. Never shorten, lengthen, widen or narrow the scarf to make it fit the picture – step back with the camera instead.`;

/** What the two reference images are. `first` is the number of the image with the hanging ends. */
export const references = (club: string, first = 1) =>
  `Image ${first} shows the two ends of a custom knitted scarf for ${club} exactly as they hang on the wearer's chest, seen from the front: the left strip hangs on the left side of the picture and the right strip on the right side. Image ${first + 1} shows the whole scarf laid flat.`;

/** The one way the scarf is worn: hung around the neck, both ends straight down the chest, each end looking exactly like its strip. */
export const worn = (image = 1) =>
  `How the scarf is worn (strict): the classic supporter way – the scarf lies once loosely around the back of the neck and BOTH ends hang straight down the front of the body, side by side and parallel, one on each side of the chest. ${SIZE} Worn like this, each end hangs about ${Math.round(LENGTH * END)} cm down from the collarbone, so the fringes stop at the belt line – not down at the hips or thighs. Each hanging end lies flat and untwisted, facing the camera and fully readable, and looks exactly like its strip in Image ${image}: the same letters reading in the same direction, the same stripes, patterns and motifs in the same places and proportions, the same colours, and the fringes at the bottom. Do NOT add, move, repeat or remove any crest, logo, text, stripe or motif – if an end has no crest in Image ${image} it has no crest in the photo. The middle of the scarf is hidden behind the neck. The scarf is NOT wrapped around the neck, NOT knotted, NOT looped, NOT tucked into the jacket, NOT thrown over one shoulder and NOT held in the hands. Both hands are relaxed and do not cover the scarf.`;

/** The other pose: the scarf held up like a banner, so that the whole front can be read. A landscape photo, so that the full length fits. */
const HELD = `The scarf is pulled taut and flat like a banner, horizontal, its whole front facing the camera from fringe to fringe, and not covered by anything but the two gripping fists at the very ends. ${SIZE} Because the scarf is ${LENGTH} cm long the two fists are about ${LENGTH - 10} cm apart: the arms reach out wide to both sides and a little forward, and the scarf is about three times as wide as the person's shoulders, sticking out far beyond the body on both sides. Landscape picture taken from a few metres away, showing the person from the thighs up: the whole scarf with both fringed ends is inside the picture with clear empty space to the left and right of it, and spans about three quarters of the picture width. It looks exactly like the reference image: the same letters in the same order and places, the same crests, stripes, patterns and motifs in the same places and proportions, the same colours, fringes at both short ends. Do NOT add, move, repeat or remove any crest, logo, text, stripe or motif. The scarf is not around the neck.`;

export const FAITHFUL = "Realistic knitted yarn texture. Fictional generic person, no other brand logos.";
/** Stående foto av halsduken buren: båda ändarna ska rymmas i bilden. */
export const UPRIGHT = "Vertical picture with some space above the head; both fringed ends are inside the picture.";

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

// --- Granskaren -------------------------------------------------------------------

export type PhotoKind = "worn" | "held";
/** Det granskaren jämför fotot med: referensbilderna bildmodellen fick, och texten som stickas på framsidan. */
export type PhotoFacts = { hanging: Buffer; flat: Buffer; text?: string };
type Verdict = { ok: boolean; failed: number; fix: string };

const REVIEW_ON = process.env.SCARF_PHOTO_REVIEW !== "0";
/** Kortare än så här mellan händerna är halsduken tydligt för kort. Den riktiga är ungefär tre axelbredder. */
const MIN_SHOULDERS = 2.3;

const bool = { type: "boolean" };
const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["textOnScarf", "textRight", "crestsInReference", "crestsInPhoto", "patternRight", "lengthInShoulderWidths", "sizeRight", "wholeScarfInPicture", "wornRight", "bodyRight", "fix"],
  properties: {
    textOnScarf: { type: "array", items: { type: "string" } },
    textRight: bool,
    crestsInReference: { type: "integer" },
    crestsInPhoto: { type: "integer" },
    patternRight: bool,
    lengthInShoulderWidths: { type: "number" },
    sizeRight: bool,
    wholeScarfInPicture: bool,
    wornRight: bool,
    bodyRight: bool,
    fix: { type: "string" },
  },
};
type Review = { textOnScarf: string[]; textRight: boolean; crestsInReference: number; crestsInPhoto: number; patternRight: boolean; lengthInShoulderWidths: number; sizeRight: boolean; wholeScarfInPicture: boolean; wornRight: boolean; bodyRight: boolean; fix: string };

const REVIEWER = `You check AI-generated photographs of a knitted supporter scarf before a sports club publishes them. The scarf will be knitted exactly as in the reference, so the photo must show that same scarf, at its real size (${LENGTH} cm long, ${WIDTH} cm wide). You get the reference first and the photo last.
Judge only what you can clearly see. Small differences in knit detail, shade, fringe length and tiny pattern elements are fine. Report only clear errors that a club member would notice: wrong, missing or added text, a different number of crests, elements in the wrong order, a scarf that is clearly the wrong size, a scarf cut off by the picture edge, or a body with extra or missing parts.
"fix" is one or two short sentences in English telling the photographer exactly what to correct (for example: "The text must read BLÅVITT, not BLAVITT. The scarf must be longer: three shoulder widths."). It is an empty string when the photo is fine.`;

const QUESTIONS: Record<PhotoKind, (text?: string) => string> = {
  held: (text) => `Image 1 is the reference: the front of the scarf laid flat. Image 2 is the photo, where a person holds the scarf stretched out.
${text ? `The designer ordered this text on the front: ${text}. Image 1 decides if the two differ.` : ""}
- textOnScarf: every text you can read on the scarf in the photo, spelled as it is there.
- textRight: true if the scarf in the photo carries exactly the texts of Image 1 – no misspelled, missing, repeated or added words, and the Swedish letters å, ä and ö right.
- crestsInReference, crestsInPhoto: how many crests or logos the scarf carries in Image 1 and in the photo.
- patternRight: true if the same elements (crests, texts, stripes, pattern bands) sit in the same order from left to right as in Image 1, in the same colours.
- lengthInShoulderWidths: the scarf's length from end to end divided by the width of the person's shoulders.
- sizeRight: true if the scarf is its real size on the person – about three shoulder widths long (2.4 to 3.6) and about as wide as a hand is long. False if it is clearly too short, too long, too narrow or too wide.
- wholeScarfInPicture: true if both fringed ends are inside the picture.
- wornRight: true if the scarf is held flat and roughly horizontal with a hand at each end, and is not around the neck.
- bodyRight: true if the person has no visible errors such as extra or missing arms, hands or fingers.`,
  worn: () => `Image 1 is the reference: the two ends of the scarf exactly as they should hang on the chest, the left strip on the left and the right strip on the right. Image 2 is the whole scarf laid flat. Image 3 is the photo, where a person wears the scarf.
- textOnScarf: the letters and words you can read on the two hanging ends in the photo.
- textRight: true if every letter or word on the hanging ends in the photo also stands at that place on the strips of Image 1. Words that are partly hidden behind the neck are fine. False if the photo carries text that Image 1 does not, or clearly misspelled text.
- crestsInReference, crestsInPhoto: how many crests or logos the two strips of Image 1 carry together, and how many the two hanging ends in the photo carry together.
- patternRight: true if each hanging end shows the same elements in the same order from top to bottom as its strip in Image 1, in the same colours.
- lengthInShoulderWidths: 0.
- sizeRight: true if the ends hang down to about the belt line (somewhere between the bottom of the ribs and the hips) and each end is about as wide as a hand is long. False if they hang down to the thighs or stop high on the chest.
- wholeScarfInPicture: true if both fringed ends are inside the picture.
- wornRight: true if the scarf hangs once around the back of the neck with both ends straight down the front – not wrapped around the neck, knotted, held in the hands or thrown over a shoulder.
- bodyRight: true if the person has no visible errors such as extra or missing arms, hands or fingers.`,
};

/** Språkmodellen ser referensen och fotot, och svarar på samma frågor varje gång. Domen räknas ut här, inte av modellen. */
export async function reviewPhoto(kind: PhotoKind, photo: Buffer, facts: PhotoFacts): Promise<Verdict & { review: Review }> {
  const small = (buf: Buffer) => sharp(buf).resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  const images = await Promise.all([...(kind === "worn" ? [facts.hanging] : []), facts.flat, photo].map(small));
  const review = await generateJson<Review>({ system: REVIEWER, user: QUESTIONS[kind](facts.text), schemaName: "scarf_photo_review", schema: reviewSchema, images });
  const checks = [review.textRight, review.crestsInReference === review.crestsInPhoto, review.patternRight, review.sizeRight && (kind === "worn" || review.lengthInShoulderWidths >= MIN_SHOULDERS), review.wholeScarfInPicture, review.wornRight, review.bodyRight];
  const failed = checks.filter((c) => !c).length;
  return { ok: failed === 0, failed, fix: review.fix.trim() || "Follow the reference image and the real size of the scarf exactly.", review };
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Granskaren svarade inte i tid")), ms))]);

/**
 * Ett fotografi som har granskats mot mönstret. Avviker det tas det om en gång, och det bästa av de två används.
 * Går granskningen inte att göra (ingen modell, inget svar) används fotot som det är – granskaren får aldrig kosta bilden.
 */
export async function shoot(kind: PhotoKind, files: { buf: Buffer; name: string }[], prompt: string, size: "1024x1024" | "1024x1536" | "1536x1024", facts: PhotoFacts | null) {
  const first = await editToJpg(files, prompt, size);
  if (!REVIEW_ON || !facts) return first;
  const judge = (photo: Buffer) =>
    withTimeout(reviewPhoto(kind, photo, facts), 60_000).catch((err) => {
      console.error("scarfPhoto granskning", errorMessage(err));
      return null;
    });
  const a = await judge(first);
  if (!a || a.ok) return first;
  console.info(`scarfPhoto granskning (${kind}): tas om – ${a.fix}`);
  const second = await editToJpg(files, `${prompt}\nAn earlier attempt at this photo was rejected by the reviewer. Correct this: ${a.fix}`, size).catch((err) => {
    console.error("scarfPhoto omtagning", errorMessage(err));
    return null;
  });
  if (!second) return first;
  const b = await judge(second);
  if (b && !b.ok) console.info(`scarfPhoto granskning (${kind}): omtagningen har också fel – ${b.fix}`);
  return !b || b.failed <= a.failed ? second : first;
}

// --- Materialets två fotografier -----------------------------------------------------

/**
 * Två fotografier av halsduken: buren om halsen (stående), och uppsträckt mellan händerna så att hela framsidan syns
 * (liggande). `scarf` är framsidan som den blir stickad, `text` det som står på den. Platsen följer `sport` och
 * årstiden följer dagens datum; `winter` är sant för julhalsdukar. Det som inte går att fotografera blir null.
 */
export async function socialPhotos(input: { club: string; scarf: Buffer; setting: "sport" | "vardag"; sport?: string | null; winter?: boolean; text?: string; date?: Date }) {
  const { hanging, flat } = await scarfReferences(input.scarf);
  const facts: PhotoFacts = { hanging, flat, text: input.text };
  const everyday = input.setting === "vardag";
  const scene = settingOf({ sport: input.sport, everyday, winter: input.winter, date: input.date });
  // Buren vid ingången, uppsträckt där det finns plats att sträcka ut den.
  const [near, wide] = [scene.at("entrance"), scene.at("open")];
  const [first, second] = people([near.wear, wide.wear]);
  const what = everyday ? "scarf" : "supporter scarf";
  const settled = await Promise.allSettled([
    shoot(
      "worn",
      [
        { buf: hanging, name: "hanging-ends.png" },
        { buf: flat, name: "scarf.png" },
      ],
      [SNAPSHOT, references(input.club), `Photo from the hips up, facing the camera: ${first}, ${near.where} The person wears the exact knitted ${what} from the reference images.`, worn(), FAITHFUL, UPRIGHT].join("\n"),
      "1024x1536",
      facts,
    ),
    shoot(
      "held",
      [{ buf: flat, name: "scarf.png" }],
      [SNAPSHOT, `The reference image shows the front of a custom knitted scarf for ${input.club}, laid flat.`, `${second}, ${wide.where} The person proudly holds up the ${what} from the reference image for the camera${everyday ? "" : ", the classic supporter pose"}.`, HELD, FAITHFUL].join("\n"),
      "1536x1024",
      facts,
    ),
  ]);
  const [wornPhoto, heldPhoto] = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
  return { worn: wornPhoto, held: heldPhoto, errors: settled.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : [])) };
}
