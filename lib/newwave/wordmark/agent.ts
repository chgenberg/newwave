import sharp from "sharp";
import { toFile } from "openai";
import { type Content, visionJson } from "@/lib/brandVision";
import { cleanText } from "@/lib/demoLimit";
import { IMAGE_MODEL, IMAGE_QUALITY, openai, TEXT_MODEL } from "@/lib/openai";
import { saveFile } from "@/lib/store";
import { FONT_ROLES } from "./fonts";
import { splitName } from "./names";
import type { WordmarkClub } from "./render";
import { COLOR_SLOTS, type Layer, LayerSchema, SHAPES, TEXT_SLOTS, type Template, TemplateSchema, WARPS } from "./schema";
import { TEMPLATES } from "./templates";

/**
 * Mallagenten: tittar på referensbilder och föreslår nya mallar i samma format som de inbyggda. Modellen svarar i ett
 * platt schema som sedan byggs om och valideras lager för lager, så att bara ritbara mallar når Craft.
 */

const NONE = "none";
const LayerOut = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "slot", "font_role", "case", "color", "x", "y", "w", "h", "tracking", "max_lines", "arc", "rotate", "skew", "warp", "warp_amount", "condense", "outline_color", "outline_width", "outer_color", "outer_width", "shadow_color", "shadow_dx", "shadow_dy", "shadow_solid", "shape", "shape_colors", "count", "rows"],
  properties: {
    kind: { type: "string", enum: ["text", "shape", "icon"] },
    slot: { type: "string", enum: [...TEXT_SLOTS, NONE] },
    font_role: { type: "string", enum: [...FONT_ROLES] },
    case: { type: "string", enum: ["upper", "asis"] },
    color: { type: "string", enum: [...COLOR_SLOTS] },
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
    tracking: { type: "number", description: "Spärrning i em för ett kort namn, 0 = ingen" },
    max_lines: { type: "integer", enum: [1, 2] },
    arc: { type: "number", description: "Böjning i grader för tio tecken, plus = båge uppåt, minus = leende, 0 = rak" },
    rotate: { type: "number" },
    skew: { type: "number" },
    warp: { type: "string", enum: [...WARPS, NONE], description: "Upprätta bokstäver i välvd rad: bridge = toppen välver sig, arch = hela raden, bulge = mitten sväller" },
    warp_amount: { type: "number", description: "-1 till 1, minus vänder välvningen" },
    condense: { type: "number", description: "Bokstävernas bredd, 1 = normal, 0.6 = höga smala collegebokstäver" },
    outline_color: { type: "string", enum: [...COLOR_SLOTS, NONE] },
    outline_width: { type: "number" },
    outer_color: { type: "string", enum: [...COLOR_SLOTS, NONE], description: "En andra kontur utanför den första, t.ex. paper innerst och secondary ytterst" },
    outer_width: { type: "number" },
    shadow_color: { type: "string", enum: [...COLOR_SLOTS, NONE] },
    shadow_dx: { type: "number" },
    shadow_dy: { type: "number" },
    shadow_solid: { type: "boolean", description: "Massivt djup som 3D-block i stället för en platt skugga" },
    shape: { type: "string", enum: [...SHAPES, NONE] },
    shape_colors: { type: "array", items: { type: "string", enum: [...COLOR_SLOTS] } },
    count: { type: "integer" },
    rows: { type: "integer" },
  },
} as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "style", "height", "ideal_min", "ideal_max", "max_chars", "layers"],
        properties: {
          name: { type: "string" },
          style: { type: "string" },
          height: { type: "number" },
          ideal_min: { type: "integer" },
          ideal_max: { type: "integer" },
          max_chars: { type: "integer" },
          layers: { type: "array", items: LayerOut },
        },
      },
    },
  },
} as const;

type LayerRaw = {
  kind: "text" | "shape" | "icon";
  slot: (typeof TEXT_SLOTS)[number] | typeof NONE;
  font_role: (typeof FONT_ROLES)[number];
  case: "upper" | "asis";
  color: (typeof COLOR_SLOTS)[number];
  x: number;
  y: number;
  w: number;
  h: number;
  tracking: number;
  max_lines: number;
  arc: number;
  rotate: number;
  skew: number;
  warp: (typeof WARPS)[number] | typeof NONE;
  warp_amount: number;
  condense: number;
  outline_color: (typeof COLOR_SLOTS)[number] | typeof NONE;
  outline_width: number;
  outer_color: (typeof COLOR_SLOTS)[number] | typeof NONE;
  outer_width: number;
  shadow_color: (typeof COLOR_SLOTS)[number] | typeof NONE;
  shadow_dx: number;
  shadow_dy: number;
  shadow_solid: boolean;
  shape: (typeof SHAPES)[number] | typeof NONE;
  shape_colors: (typeof COLOR_SLOTS)[number][];
  count: number;
  rows: number;
};
type ProposalRaw = { name: string; style: string; height: number; ideal_min: number; ideal_max: number; max_chars: number; layers: LayerRaw[] };

const EXAMPLES = ["retro-skript", "kapsel", "stadion"].map((id) => TEMPLATES.find((t) => t.id === id)!);
const brief = (t: Template) => ({ name: t.name, style: t.style, height: t.height, fit: t.fit, layers: t.layers });

const SYSTEM = `Du är formgivare av wordmarks för idrottsklubbar och översätter referensbilder till mallar för en motor som ritar exakt vektorgrafik.

Duken är 1000 enheter bred, y nedåt. Varje lager har en ruta (x, y, w, h). Text skalas så att den fyller rutan utan att gå utanför, så ett kort namn blir högt och ett långt smalare. Välj därför rutor efter det längsta namn mallen är gjord för.
Slottar: name = hela namnet på en rad (IFK GÖTEBORG), name1 = föreningsförkortningen eller första ordet (IF, IFK, MIAMI), name2 = huvudnamnet (Åsa, Göteborg, Dolphins), tagline = "Sedan 1919" eller sporterna, monogram = förkortningen eller första bokstaven (det stora H:et på en Harvardtröja), sport = huvudsporten (FOTBOLL som UNIVERSITY under märket), est och year = "Est." och grundandeåret, t.ex. på var sin sida om märket; de är tomma när året saknas, så mallen måste se hel ut utan dem. player och number = namn och nummer på ryggen; jubilee och span = "100 år" och "1926–2026" – använd dem bara när referensen är en rygg eller ett jubileum.
Färgslottar: primary = klubbens huvudfärg, secondary = andrafärgen, ink = svart/vitt mot plagget, paper = plaggets färg (för konturer som skär ut), on = text som ligger på en yta i primary.
Typsnittsroller: ${FONT_ROLES.join(", ")}. Välj den roll som liknar referensens typsnitt mest.
Former (kind shape): checker = rutband, stripes = ränder, stars = stjärnor (count), rule = tunn linje, diamond = romb, banner = banderoll bakom text, ring = ring (count 2 = dubbel), disc = fylld cirkel, swash = svans under skrivstil, shield = sköld bakom innehållet, pill = kapselram runt ett namn (rows 2 = dubbel), plate = fylld kapsel, laurel = lagerkrans runt märket, burst = solstrålar bakom märket, pennant = vimpel, tail = basebollsvans med plats för text, bars = tjock och tunn balk. Lager ritas i ordning – lägg bakgrundsformer först.
Stilen är amerikanska vintagetryck från NFL, NHL och college: fet skrivstil eller collegebokstäver med konturer och djup, tunga serifer i båge över märket i en färg, spärrade versaler, kapslar och kransar.
kind icon = klubbens märke. Använd "none" och 0 för fält som inte gäller lagret.
Svara med 1–3 förslag som fångar referensens komposition, inte dess text. Ge varje förslag ett kort svenskt namn.

Exempel på mallar i motorns format:
${JSON.stringify(EXAMPLES.map(brief))}`;

const num = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));

function toLayer(l: LayerRaw): Layer | null {
  const box = { x: num(l.x, -200, 1200), y: num(l.y, -200, 3000), w: num(l.w, 1, 1400), h: num(l.h, 1, 3000) };
  const bend = { ...(l.arc ? { arc: num(l.arc, -240, 240) } : {}), ...(l.rotate ? { rotate: num(l.rotate, -45, 45) } : {}), ...(l.skew ? { skew: num(l.skew, -30, 30) } : {}) };
  const outlines = [
    [l.outline_color, l.outline_width],
    [l.outer_color, l.outer_width],
  ].flatMap(([color, width]) => (color !== NONE && Number(width) > 0 ? [{ color, width: num(Number(width), 0.5, 60) }] : []));
  const raw =
    l.kind === "icon"
      ? { kind: "icon", box }
      : l.kind === "shape"
        ? { kind: "shape", shape: l.shape, colors: l.shape_colors.length ? l.shape_colors.slice(0, 3) : [l.color], box, ...(l.count > 0 ? { count: Math.round(num(l.count, 1, 40)) } : {}), ...(l.rows > 0 ? { rows: Math.round(num(l.rows, 1, 4)) } : {}), ...bend }
        : {
            kind: "text",
            slot: l.slot,
            font: `role:${l.font_role}`,
            case: l.case,
            color: l.color,
            box,
            maxLines: l.max_lines === 2 ? 2 : 1,
            ...(l.tracking > 0 ? { tracking: [num(l.tracking, 0, 1), num(l.tracking / 2, 0, 1)] } : {}),
            ...(outlines.length ? { outline: outlines } : {}),
            ...(l.shadow_color !== NONE && (l.shadow_dx || l.shadow_dy) ? { shadow: { color: l.shadow_color, dx: num(l.shadow_dx, -60, 60), dy: num(l.shadow_dy, -60, 60), ...(l.shadow_solid ? { solid: true } : {}) } } : {}),
            ...(l.warp !== NONE && l.warp_amount ? { warp: { kind: l.warp, amount: num(l.warp_amount, -1, 1) } } : {}),
            ...(l.condense > 0 && l.condense !== 1 ? { condense: num(l.condense, 0.4, 1.6) } : {}),
            ...bend,
          };
  const r = LayerSchema.safeParse(raw);
  return r.success ? r.data : null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);

/**
 * Förslag på nya mallar ur referensbilderna, eller – med `popular` och utan bilder – nya varianter i samma anda som
 * de mallar klubbarna väljer mest. Ogiltiga lager tas bort och mallar utan namn kastas.
 */
export async function proposeTemplates(images: Buffer[], note: string, popular: Template[] = []): Promise<{ templates: Template[]; dropped: number }> {
  const wish = note ? ` Önskemål från Craft: ${cleanText(note, 300)}` : "";
  const intro = popular.length
    ? `Klubbarna väljer de här mallarna mest. Föreslå nya mallar i samma anda – byt typsnitt, former och komposition så att de blir egna, inte kopior:\n${JSON.stringify(popular.map(brief))}`
    : "Referenser till nya wordmarks.";
  const content: Content[] = [{ type: "input_text", text: intro + wish }];
  for (const img of images) {
    const jpg = await sharp(img, { limitInputPixels: 40_000_000 }).flatten({ background: "#FFFFFF" }).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
    content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "high" });
  }
  const out = await visionJson<{ proposals: ProposalRaw[] }>(SYSTEM, content, { name: "wordmark_templates", schema: SCHEMA }, 120_000);
  let dropped = 0;
  const made = { ai: { task: "draw" as const, model: TEXT_MODEL, at: new Date().toISOString() } };
  const templates = out.proposals.slice(0, 3).flatMap((p, i) => {
    const layers = p.layers.slice(0, 40).flatMap((l) => toLayer(l) ?? []);
    dropped += p.layers.length - layers.length;
    const lo = Math.round(num(p.ideal_min, 1, 40));
    const r = TemplateSchema.safeParse({
      id: `${slug(p.name) || "agent"}-${i + 1}`,
      name: cleanText(p.name, 40) || `Förslag ${i + 1}`,
      style: cleanText(p.style, 30) || "Agent",
      height: num(p.height, 100, 3000),
      layers,
      fit: { ideal: [lo, Math.max(lo, Math.round(num(p.ideal_max, 1, 40)))], max: Math.max(lo, Math.round(num(p.max_chars, 1, 60))) },
      source: "agent",
      made,
    });
    if (!r.success || !r.data.layers.some((l) => l.kind === "text" && l.slot !== "tagline")) {
      dropped++;
      return [];
    }
    return [r.data];
  });
  return { templates, dropped };
}

/**
 * Skissa med AI: en rasterskiss i referensens stil med klubbens namn och färger. Bara inspiration – klubbmärket ritas
 * aldrig av AI, så skissen får en tom plats där märket ska sitta, och den kan inte tryckas.
 */
export async function sketchWordmark(reference: Buffer, club: WordmarkClub, note: string) {
  const { name1, name2 } = splitName(club.name);
  const ref = await sharp(reference, { limitInputPixels: 40_000_000 }).flatten({ background: "#FFFFFF" }).resize(1024, 1024, { fit: "contain", background: "#FFFFFF" }).png().toBuffer();
  const prompt = [
    "Design a sports club wordmark in the same graphic style, composition and typography mood as the reference image.",
    `Top text in capital letters: "${name1 || club.name}". Main text: "${name2 || club.name}". Spell every letter exactly, including Swedish å, ä and ö.`,
    `Use only these colours: ${club.colors.join(", ")}, plus black and white.`,
    "Where the reference has an emblem or mascot, draw only a simple empty circle outline as a placeholder – never draw a club crest or logo.",
    "Flat vector look, centred on a plain white background, no garment, no mockup.",
    note ? `Extra wishes: ${cleanText(note, 200)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const res = await openai().images.edit({ model: IMAGE_MODEL, image: [await toFile(ref, "reference.png", { type: "image/png" })], prompt, size: "1024x1024", quality: IMAGE_QUALITY, output_format: "png" });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return (await saveFile(Buffer.from(b64, "base64"), "png")).url;
}
