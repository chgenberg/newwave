import { parsePath, type Seg, transformPath } from "@/lib/newwave/vector/path";
import type { Flat, Shape } from "@/lib/newwave/vector/svg";
import type { TextLayerT } from "@/lib/newwave/wordmark/schema";
import { textShape } from "@/lib/newwave/wordmark/render";
import { grasrotClub } from "./clubs";
import { emblemSet, fit, NEGATIVE_INK } from "./emblem";
import { grasrotWordmark } from "./wordmark";

/**
 * Den vävda halsduken i Bilaga 2: 1100 × 150 mm i klubbens färg med ränder mot fransarna, märket vid båda ändarna och
 * föreningens namn i mitten. Tre garnfärger – klubbens två och vitt – så att väveriet kan väva den som den är.
 * Ritningen är i millimeter.
 */

export const SCARF_MM: [number, number] = [1100, 150];

const rect = (x: number, y: number, w: number, h: number, fill: string): Shape => ({ segs: parsePath(`M${x} ${y}H${x + w}V${y + h}H${x}Z`), fill, rule: "nonzero" });

/** Text som kurvor, centrerad i rutan. */
export async function textFlat(text: string, font: string, box: { x: number; y: number; w: number; h: number }, fill: string): Promise<Shape[]> {
  const layer = { kind: "text", slot: "name1", font, case: "upper", color: "primary", box: { x: 0, y: 0, w: 1000, h: 1000 }, align: "center", valign: "middle", maxLines: 1 } as TextLayerT;
  const shape = await textShape(layer, text);
  if (!shape) return [];
  const s = Math.min(box.w / shape.w, box.h / shape.h);
  const segs: Seg[] = transformPath(parsePath(shape.d), [s, 0, 0, s, box.x + (box.w - shape.w * s) / 2 - shape.x * s, box.y + (box.h - shape.h * s) / 2 - shape.y * s]);
  return [{ segs, fill, rule: "nonzero" }];
}

const memo = new Map<string, Promise<Flat | null>>();

export function scarfDesign(id: string): Promise<Flat | null> {
  let p = memo.get(id);
  if (!p) {
    p = build(id);
    p.catch(() => memo.delete(id));
    memo.set(id, p);
  }
  return p;
}

async function build(id: string): Promise<Flat | null> {
  const club = grasrotClub(id);
  const pending = emblemSet(id);
  const wordmark = await grasrotWordmark(id, "original");
  if (!club || !pending || !wordmark) return null;
  const set = await pending;
  const [W, H] = SCARF_MM;
  const [base, accent] = wordmark.colors;
  // Bara en klubbfärg: ränderna vävs i vitt.
  const stripe = accent.toUpperCase() === base.toUpperCase() ? NEGATIVE_INK : accent;
  const shapes: Shape[] = [rect(0, 0, W, H, base)];
  for (const [x, w, fill] of [
    [18, 8, NEGATIVE_INK],
    [32, 22, stripe],
    [60, 8, NEGATIVE_INK],
  ] as const) {
    shapes.push(rect(x, 0, w, H, fill), rect(W - x - w, 0, w, H, fill));
  }
  const mark = set.negativ;
  for (const x of [92, W - 92 - 118]) shapes.push(...fit(mark, { x, y: 16, w: 118, h: 118 }).shapes);
  shapes.push(...(await textFlat(club.name, "holtwood-one-sc", { x: 250, y: 42, w: 600, h: 66 }, NEGATIVE_INK)));
  return { shapes, box: { x: 0, y: 0, w: W, h: H }, issues: [...set.negativ.issues] };
}
