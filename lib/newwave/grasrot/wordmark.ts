import { luminance, mix } from "@/lib/newwave/theme";
import { pathBounds, unionBox } from "@/lib/newwave/vector/path";
import { type Flat, flattenSvg, recolor } from "@/lib/newwave/vector/svg";
import { splitName } from "@/lib/newwave/wordmark/names";
import { type Note, renderWordmark } from "@/lib/newwave/wordmark/render";
import { TEMPLATES } from "@/lib/newwave/wordmark/templates";
import { deltaE2000, hexToLab } from "@/lib/pantone";
import { grasrotClub } from "./clubs";
import { colorAreas, emblemSet, fit, NEGATIVE_INK, SOLID_INK, type Variant } from "./emblem";

/**
 * Gräsrot 360-wordmarket (Bilaga 1): klubbens typord i spärrade versaler, ortnamnet i skrivstil, ett rutat band i
 * klubbens två färger och märket under. Mallen skalar texten efter namnets längd; märket är klubbens vektormärke i
 * samma variant som wordmarket, så att hela wordmarket kan tryckas i original, en färg eller vitt.
 */

export const GRASROT_TEMPLATE = TEMPLATES.find((t) => t.id === "grasrot-360") as (typeof TEMPLATES)[number];

export type GrasrotWordmark = { flat: Flat; words: { caps: string; script: string }; colors: [string, string]; notes: Note[] };

/** Klubbens två färger: låsta kulörer först, annars märkets två största färger som skiljer sig från vitt och varandra. */
async function wordmarkColors(id: string, emblem: Flat): Promise<[string, string]> {
  const locked = grasrotClub(id)?.colors?.map((c) => c.hex) ?? [];
  if (locked.length >= 2) return [locked[0], locked[1]];
  const picked = [...locked];
  for (const { hex, share } of await colorAreas(emblem)) {
    if (picked.length === 2) break;
    if (share < 0.02 || deltaE2000(hexToLab(hex), hexToLab("#FFFFFF")) < 10) continue;
    if (picked.every((p) => deltaE2000(hexToLab(p), hexToLab(hex)) >= 15)) picked.push(hex);
  }
  // Den tydligaste färgen bär versalerna och bandets övre rad, som det blå i Särö Kullaviks wordmark. Ett märke med
  // en enda färg (IF Hallby) får en mörkare ton av den i stället för svart, som inte finns i märket.
  const [a = "#111111", b = mix(a, "#000000", 0.5)] = picked;
  return luminance(a) <= luminance(b) ? [a, b] : [b, a];
}

const memo = new Map<string, Promise<GrasrotWordmark | null>>();

export function grasrotWordmark(id: string, variant: Variant): Promise<GrasrotWordmark | null> {
  const key = `${id}:${variant}`;
  let p = memo.get(key);
  if (!p) {
    p = build(id, variant);
    p.catch(() => memo.delete(key));
    memo.set(key, p);
  }
  return p;
}

async function build(id: string, variant: Variant): Promise<GrasrotWordmark | null> {
  const club = grasrotClub(id);
  const pending = emblemSet(id);
  if (!club || !pending) return null;
  const set = await pending;
  const split = splitName(club.name);
  const words = club.words ?? { caps: split.name1, script: split.name2 };
  const colors = await wordmarkColors(id, set.original);
  const r = await renderWordmark(GRASROT_TEMPLATE, { id, name: club.name, colors }, { icon: false, ornament: true, variant: "light", canvas: true, texts: { name1: words.caps, name2: words.script } });
  const art = flattenSvg(r.svg);
  const icon = GRASROT_TEMPLATE.layers.find((l) => l.kind === "icon")?.box;
  // Som i Bilaga 1 står märket i en färg under wordmarket: soliden i huvudfärgen, svart eller vitt.
  const mark = variant === "original" ? recolor(set.solid, () => colors[0]) : set[variant];
  const emblem = icon ? fit(mark, icon).shapes : [];
  const ink = variant === "solid" ? SOLID_INK : variant === "negativ" ? NEGATIVE_INK : null;
  const shapes = [...(ink ? recolor(art, () => ink) : art).shapes, ...emblem];
  const box = shapes.reduce((b, s) => unionBox(b, pathBounds(s.segs)), null as ReturnType<typeof pathBounds>);
  if (!box) return null;
  return { flat: { shapes, box, issues: [...art.issues, ...set[variant].issues] }, words, colors, notes: r.notes };
}
