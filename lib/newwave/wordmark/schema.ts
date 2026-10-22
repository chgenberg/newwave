import { z } from "zod";
import { isFontRef } from "./fonts";

/**
 * En ordmärkesmall är data, inte ritad kod: lager på en duk som är 1000 enheter bred. Samma format används för
 * de inbyggda mallarna, för mallar som importeras från Illustrator och för förslag från mallagenten.
 */

export const COLOR_SLOTS = ["primary", "secondary", "ink", "paper", "on"] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];
/**
 * name = hela namnet på en rad (IFK Göteborg), name1/name2 = namnet delat, tagline = "Sedan 1919" eller sporterna, monogram = förkortningen eller första bokstaven,
 * sport = huvudsporten eller lagets namn, est/year = "Est." och grundandeåret, player/number = namn och nummer på ryggen,
 * jubilee/span = "100 år" och "1926–2026" för klubbens nästa jubileum. Fält utan underlag (inget grundandeår) är tomma.
 */
export const TEXT_SLOTS = ["name", "name1", "name2", "tagline", "monogram", "sport", "est", "year", "player", "number", "jubilee", "span"] as const;
export type TextSlot = (typeof TEXT_SLOTS)[number];
export const SHAPES = ["checker", "stripes", "stars", "rule", "diamond", "banner", "ring", "disc", "swash", "shield", "pill", "plate", "laurel", "burst", "pennant", "tail", "bars"] as const;
export type ShapeKind = (typeof SHAPES)[number];

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const Color = z.enum(COLOR_SLOTS);
const Box = z.object({ x: num(-200, 1200), y: num(-200, 3000), w: num(1, 1400), h: num(1, 3000) });
const bend = {
  /** Total böjning i grader för en text på tio tecken (kortare böjs mindre); plus är en båge uppåt, minus ett leende. */
  arc: num(-240, 240).optional(),
  rotate: num(-45, 45).optional(),
  skew: num(-30, 30).optional(),
};

const Outline = z.object({ color: Color, width: num(0.5, 60) });
export const WARPS = ["bridge", "arch", "bulge"] as const;

const TextLayer = z.object({
  kind: z.literal("text"),
  slot: z.enum(TEXT_SLOTS),
  font: z.string().refine(isFontRef, "Okänt typsnitt"),
  case: z.enum(["upper", "asis", "lower"]).default("asis"),
  color: Color,
  box: Box,
  /** Spärrning i em för korta och för långa namn; däremellan räknas den fram efter antal tecken. */
  tracking: z.tuple([num(-0.2, 1.5), num(-0.2, 1.5)]).optional(),
  align: z.enum(["center", "left", "right"]).default("center"),
  valign: z.enum(["middle", "top", "bottom"]).default("middle"),
  maxLines: z.number().int().min(1).max(2).default(1),
  /** En kontur eller flera, innerst först – som varsitybokstäver med vit spalt och färgad kant. */
  outline: z.union([Outline, z.array(Outline).min(1).max(3)]).optional(),
  /** `solid` drar ut skuggan till ett massivt djup bakom bokstäverna, som 3D-block. */
  shadow: z.object({ color: Color, dx: num(-60, 60), dy: num(-60, 60), solid: z.boolean().optional() }).optional(),
  /** Bokstäverna står upprätt medan raden välvs: bridge = toppen välver sig (minus = sänka), arch = hela raden, bulge = mitten sväller. */
  warp: z.object({ kind: z.enum(WARPS), amount: num(-1, 1) }).optional(),
  /** Bredden på bokstäverna, under 1 = smalare och högre, som collegebokstäver. */
  condense: num(0.4, 1.6).optional(),
  /** Största teckenstorlek i dukens enheter, så att ett kort namn får samma bokstavshöjd som ett normallångt i stället för att fylla rutan. */
  size: num(10, 3000).optional(),
  /** Minsta luft i dukens enheter till textlagren efter det här; raden flyttas upp i stället för att gå in i dem – som en kort versalrad över skrivstilens höga bokstäver. */
  clear: num(1, 200).optional(),
  ...bend,
});

const ShapeLayer = z.object({
  kind: z.literal("shape"),
  shape: z.enum(SHAPES),
  colors: z.array(Color).min(1).max(3),
  box: Box,
  count: z.number().int().min(1).max(40).optional(),
  rows: z.number().int().min(1).max(4).optional(),
  ...bend,
});

const IconLayer = z.object({ kind: z.literal("icon"), box: Box });

/** Fri vektorgrafik från en importerad fil; färgerna står som {primary} osv. och byts mot klubbens. */
const ArtLayer = z.object({
  kind: z.literal("art"),
  box: Box,
  viewBox: z.tuple([num(-1e5, 1e5), num(-1e5, 1e5), num(0.01, 1e5), num(0.01, 1e5)]),
  svg: z.string().max(200_000),
});

export const LayerSchema = z.discriminatedUnion("kind", [TextLayer, ShapeLayer, IconLayer, ArtLayer]);
export type Layer = z.infer<typeof LayerSchema>;
export type TextLayerT = z.infer<typeof TextLayer>;
export type ShapeLayerT = z.infer<typeof ShapeLayer>;

/**
 * Hur mallen kom till: vad en AI-modell läste eller föreslog, vad som mättes fram utan AI och vad en människa ändrade –
 * så att den som trycker kan se vad AI gjort och att rätten att använda designen är bekräftad.
 */
export const MadeSchema = z.object({
  file: z.string().max(80).optional(),
  ai: z.object({ task: z.enum(["read", "draw"]), model: z.string().max(40), at: z.string().max(30), memory: z.boolean().optional(), lessons: z.number().int().min(0).max(40).optional() }).optional(),
  fonts: z.array(z.object({ text: z.string().max(60), font: z.string().max(40), score: z.number().int().min(0).max(100) })).max(8).optional(),
  likeness: z.number().int().min(0).max(100).optional(),
  /** Craft ändrade agentens tolkning av filen. */
  corrected: z.boolean().optional(),
  /** Senast ändrad för hand i designstudion. */
  edited: z.string().max(30).optional(),
  /** När rätten att använda designen bekräftades, och varumärket agenten kände igen i den. */
  rights: z.object({ at: z.string().max(30), mark: z.string().max(120).optional() }).optional(),
});
export type Made = z.infer<typeof MadeSchema>;

export const TemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().min(1).max(40),
  style: z.string().min(1).max(30),
  height: num(100, 3000),
  layers: z.array(LayerSchema).min(1).max(40),
  /** Hur många tecken i Namn 2 mallen är ritad för: bäst inom ideal, ingen förhandsvisning över max. */
  fit: z.object({ ideal: z.tuple([z.number().int().min(1).max(40), z.number().int().min(1).max(40)]), max: z.number().int().min(1).max(60) }),
  /** Textfält som måste ha innehåll; utan dem visas mallen inte för klubben, som jubileum utan grundandeår. */
  needs: z.array(z.enum(TEXT_SLOTS)).max(4).optional(),
  /** Mallen som används för små tryck; saknas = stilens lilla standardversion. */
  small: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  /** Små versioner som bara används automatiskt och inte listas bland ordmärkena. */
  hidden: z.boolean().optional(),
  source: z.enum(["inbyggd", "import", "agent"]).default("inbyggd"),
  made: MadeSchema.optional(),
});
export type Template = z.infer<typeof TemplateSchema>;
export type TemplateInput = z.input<typeof TemplateSchema>;

/** 1 när namnet ligger i mallens idealintervall, sjunker mot 0 vid max. */
export function fitScore(t: Pick<Template, "fit">, chars: number) {
  const [lo, hi] = t.fit.ideal;
  if (chars >= lo && chars <= hi) return 1;
  if (chars > t.fit.max) return 0;
  const off = chars < lo ? (lo - chars) / Math.max(1, lo) : (chars - hi) / Math.max(1, t.fit.max - hi);
  return Math.max(0.05, 1 - off);
}
