import sharp from "sharp";
import { ENGRAVABLE, LOGO_PRODUCTS, engraveInkFor, type LogoFinish } from "./logoMerch";
import { editWithReference, hasOpenAIKey, openai, TEXT_MODEL } from "./openai";
import { printOntoFabric } from "./photoComposite";
import { type Scene, shootBlank } from "./photos";
import { loadFile, saveFile } from "./store";

const LOOK = `Hyperrealistic editorial lifestyle campaign photo, shot on a full-frame camera with a 50mm lens, natural light, shallow depth of field. Real skin texture, natural hands and faces, realistic materials – indistinguishable from a real photo shoot.
Any people are fictional and generic, not famous. No logos, no brands, no text anywhere in the image.`;

const mark = (shape: string, where: string) =>
  `one flat, solid, pure bright green (#00FF00) rectangle in ${shape} orientation, ${where}, following the surface of the product naturally. The rectangle has no texture, text or pattern, and there is no other bright green anywhere in the image.`;

type Spec = { fabric: string; width: number; shape: string; where: string; lifestyle: string; product: string };

const SPECS: Record<string, Spec> = {
  tee: {
    fabric: "plain white cotton t-shirt fabric",
    width: 0.6,
    shape: "landscape (4:3)",
    where: "centred on the chest",
    lifestyle: "a young adult, relaxed and smiling, wearing a plain white crew-neck cotton t-shirt, standing in a sunny Scandinavian city street. On the chest of the t-shirt there is",
    product: "Product photo, no people: a plain white crew-neck t-shirt laid flat and neatly styled on a light oak table next to a ceramic coffee cup and sunglasses, soft daylight. On the chest of the t-shirt there is",
  },
  hoodie: {
    fabric: "plain navy blue cotton hoodie fabric",
    width: 0.6,
    shape: "landscape (4:3)",
    where: "centred on the chest above the kangaroo pocket",
    lifestyle: "a young adult wearing a plain navy blue pullover hoodie, walking in a Scandinavian park on a crisp autumn day, front view. On the chest of the hoodie there is",
    product: "Product photo, no people: a plain navy blue pullover hoodie hanging on a wooden hanger against a light plaster wall, soft window light. On the chest of the hoodie there is",
  },
  keps: {
    fabric: "plain navy blue cotton twill cap fabric",
    width: 0.8,
    shape: "small landscape (2:1)",
    where: "on the front panel of the cap just above the brim",
    lifestyle: "a smiling young adult wearing a plain navy blue six-panel baseball cap at a sunny harbour, three-quarter front view with the front of the cap clearly visible. On the front of the cap there is",
    product: "Product photo, no people: a plain navy blue six-panel baseball cap resting on a weathered wooden bench, three-quarter front view, soft daylight. On the front of the cap there is",
  },
  paraply: {
    fabric: "black umbrella canopy nylon fabric",
    width: 0.72,
    shape: "landscape (3:2)",
    where: "in the middle of the canopy panel that faces the camera",
    lifestyle: "a person in a beige trench coat holding an open large black golf umbrella on a rainy Scandinavian city street at dusk, warm street lights reflecting on the wet cobblestones, the canopy tilted towards the camera. On the canopy there is",
    product: "Product photo, no people: an open large black golf umbrella standing on a wet stone terrace in light rain, the canopy tilted towards the camera, soft overcast light. On the canopy there is",
  },
  kaffekopp: {
    fabric: "matte light grey glazed ceramic surface",
    width: 0.66,
    shape: "square",
    where: "on the front of the cup facing the camera",
    lifestyle: "two hands holding a matte light grey ceramic coffee cup with a handle at a café table by a window, morning light, the front of the cup facing the camera. On the front of the cup there is",
    product: "Product photo, no people: a matte light grey ceramic coffee cup with a handle on a light wooden desk next to a laptop and a notebook, morning light, side view. On the front of the cup there is",
  },
  emaljmugg: {
    fabric: "white enamel surface",
    width: 0.66,
    shape: "square",
    where: "on the front of the mug facing the camera",
    lifestyle: "a hiker in a wool sweater holding a white enamel camping mug with a black rolled rim by a campfire at dusk, the front of the mug facing the camera. On the front of the mug there is",
    product: "Product photo, no people: a white enamel camping mug with a black rolled rim on a flat rock by a calm Scandinavian lake at sunrise, side view. On the front of the mug there is",
  },
  yeti: {
    fabric: "white powder-coated stainless steel surface",
    width: 0.64,
    shape: "portrait (3:4)",
    where: "on the front of the tumbler body",
    lifestyle: "a young professional holding a tall white insulated travel tumbler with a handle and a straw while walking to work on a sunny city morning, the front of the tumbler facing the camera. On the tumbler there is",
    product: "Product photo, no people: a tall white insulated travel tumbler with a handle and a straw on a light office desk next to a keyboard and a plant, side view. On the tumbler there is",
  },
  termos: {
    fabric: "white powder-coated stainless steel surface",
    width: 0.62,
    shape: "portrait (3:4)",
    where: "in the middle of the bottle",
    lifestyle: "a hiker holding a white powder-coated steel water bottle with a bamboo lid on a mountain trail in Swedish fjäll, the front of the bottle facing the camera. On the bottle there is",
    product: "Product photo, no people: a white powder-coated steel water bottle with a bamboo lid standing on a wooden table in the sun next to a backpack, front view. On the bottle there is",
  },
  anteckningsbok: {
    fabric: "plain white hardcover book cloth",
    width: 0.62,
    shape: "portrait (3:4)",
    where: "covering the middle of the front cover",
    lifestyle: "a person at a bright meeting table holding a white A5 hardcover notebook with the front cover facing the camera. On the front cover there is",
    product: "Product photo, no people: a closed white A5 hardcover notebook lying on a light oak desk next to a pen and a cup of coffee, seen from above at a slight angle. On the front cover there is",
  },
  filt: {
    fabric: "soft cream white fleece blanket fabric",
    width: 0.62,
    shape: "portrait (3:4)",
    where: "large, on the visible front of the blanket",
    lifestyle: "a person sitting on a wooden porch of a red Swedish cottage in the evening with a soft cream white fleece blanket wrapped over the knees, holding a mug. On the front of the blanket there is",
    product: "Interior photo, no people: a soft cream white fleece throw blanket draped over the back and seat of a light grey sofa in a cosy Scandinavian living room, warm lamp light. On the front of the draped blanket there is",
  },
};

export type LogoReview = {
  realism: number;
  logo: number;
  placement: number;
  sales: number;
  score: number;
  verdict: "godkänd" | "underkänd";
  strengths: string[];
  issues: string[];
  summary: string;
};

export type LogoPhoto = { id: string; label: string; url: string; method: "exakt tryck" | "referens"; review: LogoReview | null; attempts: number };

export function logoScenes(productId: string): (Scene & { width: number })[] {
  const p = LOGO_PRODUCTS.find((x) => x.id === productId);
  const s = SPECS[productId];
  if (!p || !s) return [];
  const m = mark(s.shape, s.where);
  const ink = p.variant === "dark" ? "dark" : "light";
  return [
    { id: "livsstil", label: "Livsstil", print: ink, anchor: "center", fabric: s.fabric, width: s.width, prompt: `${LOOK}\n${s.lifestyle} ${m}` },
    { id: "produkt", label: "Produkt", print: ink, anchor: "center", fabric: s.fabric, width: s.width, prompt: `${LOOK}\n${s.product} ${m}` },
  ];
}

const MAX_SHOTS = 3;
const PASS = 8;

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["realism", "logo", "placement", "sales", "strengths", "issues", "summary"],
  properties: {
    realism: { type: "integer", minimum: 1, maximum: 10 },
    logo: { type: "integer", minimum: 1, maximum: 10 },
    placement: { type: "integer", minimum: 1, maximum: 10 },
    sales: { type: "integer", minimum: 1, maximum: 10 },
    strengths: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

const asInput = async (img: Buffer, background: string) => {
  const jpg = await sharp(img).flatten({ background }).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
  return { type: "input_image" as const, image_url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "auto" as const };
};

async function reviewPhoto(photo: Buffer, logo: Buffer, ctx: { product: string; scene: string; finish: LogoFinish; darkLogo: boolean }): Promise<LogoReview> {
  const technique = ctx.finish === "engrave" ? "lasergraverad (en tonad silhuett av loggan i materialets gravyrfärg – inte i loggans färger)" : "tryckt i loggans egna färger";
  const res = await openai().responses.create({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content: `Du är en kräsen art director som godkänner produktfoton till en merchbutik. Var ärlig: 8 betyder "jag skulle själv publicera det här i dag", 10 är sällsynt.

Betygsätt 1–10:
- realism: ser fotot ut som ett riktigt kampanjfoto? Naturliga människor, händer, ansikten, material och ljus. Allt som ser AI-genererat ut drar ner kraftigt.
- logo: är loggan på produkten samma logga som referensbilden – samma form, bokstäver och proportioner, inga påhittade eller förvrängda tecken? Loggan ska vara ${technique}.
- placement: sitter loggan naturligt på produkten – rätt storlek, följer ytans form, veck och ljus, varken klistrad ovanpå eller för liten?
- sales: skulle bilden sälja produkten i ett flöde?
strengths/issues: korta konkreta punkter på svenska som en fotograf kan åtgärda. summary: en mening.`,
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: `Foto (${ctx.scene}) av produkten ${ctx.product}. Första bilden är fotot, andra bilden är företagets logga som referens.` },
          await asInput(photo, "#FFFFFF"),
          await asInput(logo, ctx.darkLogo ? "#1A1A1A" : "#FFFFFF"),
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "photo_review", schema: reviewSchema, strict: true } },
  });
  const r = JSON.parse(res.output_text) as Omit<LogoReview, "score" | "verdict">;
  const score = Math.round(((r.realism + r.logo + r.placement + r.sales) / 4) * 10) / 10;
  const pass = Math.min(r.realism, r.logo, r.placement) >= PASS && r.sales >= PASS - 1;
  return { ...r, score, verdict: pass ? "godkänd" : "underkänd" };
}

/** Flat tone silhouette of the logo in the engraving colour; white parts of the logo stay unengraved. */
async function engraveArt(logo: Buffer, productId: string) {
  const [r, g, b, a] = engraveInkFor(productId);
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k += 4) {
    const white = Math.min(1, Math.max(0, (Math.min(data[k], data[k + 1], data[k + 2]) / 255 - 0.8) / 0.15));
    out[k] = r;
    out[k + 1] = g;
    out[k + 2] = b;
    out[k + 3] = Math.round(data[k + 3] * a * (1 - white));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const total = (r: LogoReview | null) => (r ? r.realism + r.logo + r.placement + r.sales : -1);

export async function logoPhotos(productId: string, logo: { light: string; dark: string }, finish: LogoFinish = "print"): Promise<LogoPhoto[]> {
  if (!hasOpenAIKey()) return [];
  const id = (url: string) => url.split("/").pop()!;
  const [light, dark] = await Promise.all([loadFile(id(logo.light)), loadFile(id(logo.dark))]);
  if (!light || !dark) throw new Error("Loggan hittades inte");
  const engrave = finish === "engrave" && ENGRAVABLE.includes(productId);
  const product = LOGO_PRODUCTS.find((p) => p.id === productId)!;

  const meta = await sharp(light.data).metadata();
  const wide = (meta.width ?? 1) / (meta.height ?? 1) > 3.5;

  const results = await Promise.allSettled(
    logoScenes(productId).map(async (s) => {
      const width = wide ? Math.min(0.92, s.width * 1.35) : s.width;
      const original = s.print === "dark" ? dark.data : light.data;
      const print = engrave ? await engraveArt(light.data, productId) : original;
      const ink = engrave ? ("dark" as const) : s.print;
      let best: { jpg: Buffer; review: LogoReview | null; method: LogoPhoto["method"] } | null = null;
      let feedback: string | undefined;
      let attempts = 0;
      while (attempts < MAX_SHOTS) {
        attempts++;
        let jpg: Buffer | null = null;
        for (let i = 0; i < 2 && !jpg; i++) {
          const shot = await shootBlank(s, feedback).catch(() => null);
          if (shot) jpg = await printOntoFabric(shot.blank, print, shot.marker, { ink, anchor: s.anchor, width });
        }
        const method = jpg ? ("exakt tryck" as const) : ("referens" as const);
        if (!jpg) {
          const bg = ink === "dark" ? "#1A1A1A" : "#FFFFFF";
          const ref = await sharp(print).flatten({ background: bg }).resize(1024, 1024, { fit: "contain", background: bg }).png().toBuffer();
          const how = engrave ? "laser engraved as a subtle tone-on-tone mark into the surface" : "printed crisply and following the surface";
          const base = s.prompt.replace(/one flat, solid, pure bright green[\s\S]*$/, "");
          jpg = await editWithReference(`${base} the exact logo from the reference image, ${how}.${feedback ? `\nFix: ${feedback}` : ""}`, ref);
        }
        const review = await reviewPhoto(jpg, original, { product: `${product.name} (${product.blurb})`, scene: s.label.toLowerCase(), finish: engrave ? "engrave" : "print", darkLogo: s.print === "dark" }).catch(() => null);
        if (!best || total(review) > total(best.review)) best = { jpg, review, method };
        if (!review || review.verdict === "godkänd") break;
        feedback = review.issues.join("; ");
      }
      const file = await saveFile(best!.jpg, "jpg");
      return { id: s.id, label: s.label, url: file.url, method: best!.method, review: best!.review, attempts };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
