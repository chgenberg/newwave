import sharp from "sharp";
import { LOGO_PRODUCTS } from "./logoMerch";
import { editWithReference, hasOpenAIKey } from "./openai";
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

export type LogoPhoto = { id: string; label: string; url: string; method: "exakt tryck" | "referens" };

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

const ATTEMPTS = 2;

export async function logoPhotos(productId: string, logo: { light: string; dark: string }): Promise<LogoPhoto[]> {
  if (!hasOpenAIKey()) return [];
  const id = (url: string) => url.split("/").pop()!;
  const [light, dark] = await Promise.all([loadFile(id(logo.light)), loadFile(id(logo.dark))]);
  if (!light || !dark) throw new Error("Loggan hittades inte");

  const results = await Promise.allSettled(
    logoScenes(productId).map(async (s) => {
      const print = s.print === "dark" ? dark.data : light.data;
      let jpg: Buffer | null = null;
      for (let i = 0; i < ATTEMPTS && !jpg; i++) {
        const shot = await shootBlank(s).catch(() => null);
        if (shot) jpg = await printOntoFabric(shot.blank, print, shot.marker, { ink: s.print, anchor: s.anchor, width: s.width });
      }
      const method = jpg ? ("exakt tryck" as const) : ("referens" as const);
      if (!jpg) {
        const ref = await sharp(print).flatten({ background: s.print === "dark" ? "#1A1A1A" : "#FFFFFF" }).resize(1024, 1024, { fit: "contain", background: s.print === "dark" ? "#1A1A1A" : "#FFFFFF" }).png().toBuffer();
        jpg = await editWithReference(`${s.prompt.replace(/one flat, solid, pure bright green[\s\S]*$/, "")} the exact logo from the reference image, printed crisply and following the surface.`, ref);
      }
      const file = await saveFile(jpg, "jpg");
      return { id: s.id, label: s.label, url: file.url, method };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
