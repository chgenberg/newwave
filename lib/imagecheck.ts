import sharp from "sharp";
import { openai, TEXT_MODEL } from "./openai";
import { allowedPalette } from "./rules";
import type { Club, Concept, RuleCheck } from "./types";

type RGB = [number, number, number];

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function distToSegment(p: RGB, a: RGB, b: RGB) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len));
  return Math.hypot(p[0] - (a[0] + t * ab[0]), p[1] - (a[1] + t * ab[1]), p[2] - (a[2] + t * ab[2]));
}

function hueOf([r, g, b]: RGB) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255, s = max === 0 ? 0 : (max - min) / max;
  if (max === min) return { h: 0, s, v };
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, v };
}

const FORBIDDEN_HUES: Record<string, (h: number) => boolean> = {
  Grön: (h) => h >= 75 && h <= 165,
  Röd: (h) => h < 14 || h > 340,
  Gul: (h) => h >= 40 && h < 70,
  Blå: (h) => h >= 190 && h <= 260,
};

export type PaletteReport = {
  inPalette: number;
  forbidden: Record<string, number>;
  coverage: number;
  edgeTouch: number;
};

export async function analyzePalette(png: Buffer, club: Club, mode: Concept["mode"] = "standard"): Promise<PaletteReport & { satire: boolean }> {
  const { data, info } = await sharp(png)
    .resize(256, 256, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const satire = mode === "satir";
  const palette = allowedPalette(club, { mode }).map((c) => hexToRgb(c.hex));
  const segments: [RGB, RGB][] = [];
  palette.forEach((a, i) => palette.slice(i).forEach((b) => segments.push([a, b])));

  const forbiddenNames = club.forbiddenColors.map((f) => f.name).filter((n) => FORBIDDEN_HUES[n]);
  const forbidden: Record<string, number> = Object.fromEntries(forbiddenNames.map((n) => [n, 0]));
  let opaque = 0, ok = 0, edge = 0;
  const margin = Math.round(info.width * 0.02);

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] < 128) continue;
      opaque++;
      if (x < margin || y < margin || x >= info.width - margin || y >= info.height - margin) edge++;
      const p: RGB = [data[i], data[i + 1], data[i + 2]];
      if (segments.some(([a, b]) => distToSegment(p, a, b) < 42)) {
        ok++;
        continue;
      }
      const { h, s, v } = hueOf(p);
      if (s > 0.35 && v > 0.25) for (const n of forbiddenNames) if (FORBIDDEN_HUES[n](h)) forbidden[n]++;
    }
  }
  const total = info.width * info.height;
  const share = (n: number) => (opaque ? n / opaque : 0);
  return {
    satire,
    inPalette: share(ok),
    forbidden: Object.fromEntries(Object.entries(forbidden).map(([k, v]) => [k, share(v)])),
    coverage: opaque / total,
    edgeTouch: share(edge),
  };
}

export function paletteChecks(r: PaletteReport & { satire?: boolean }): RuleCheck[] {
  const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
  const worst = Object.entries(r.forbidden).sort((a, b) => b[1] - a[1])[0];
  return [
    { rule: "Bilden håller klubbens färger", ok: r.inPalette >= 0.96, note: `${pct(r.inPalette)} i klubbens färger` },
    r.satire
      ? {
          rule: "Satir: motståndarfärger högst en tredjedel",
          ok: Object.values(r.forbidden).reduce((a, b) => a + b, 0) <= 0.34,
          note: `${pct(Object.values(r.forbidden).reduce((a, b) => a + b, 0))} motståndarfärg`,
        }
      : {
          rule: "Inga spärrade färger i bilden",
          ok: Object.values(r.forbidden).every((v) => v <= 0.01),
          note: worst && worst[1] > 0 ? `${worst[0]}: ${pct(worst[1])}` : undefined,
        },
    { rule: "Motivet är stort nog för tryck", ok: r.coverage >= 0.08, note: `täcker ${pct(r.coverage)}` },
    { rule: "Luft mot kanterna", ok: r.edgeTouch <= 0.01, note: r.edgeTouch > 0.01 ? "motivet går ut i kanten" : undefined },
  ];
}

type Vision = {
  containsTextOrLetters: boolean;
  containsLogoOrCrest: boolean;
  resemblesOtherBrandOrCharacter: boolean;
  containsRealPerson: boolean;
  printableForDTG: boolean;
  notes: string;
};

const visionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["containsTextOrLetters", "containsLogoOrCrest", "resemblesOtherBrandOrCharacter", "containsRealPerson", "printableForDTG", "notes"],
  properties: {
    containsTextOrLetters: { type: "boolean" },
    containsLogoOrCrest: { type: "boolean" },
    resemblesOtherBrandOrCharacter: { type: "boolean" },
    containsRealPerson: { type: "boolean" },
    printableForDTG: { type: "boolean" },
    notes: { type: "string" },
  },
};

export async function visionReview(png: Buffer, club: Club): Promise<RuleCheck[]> {
  const small = await sharp(png).resize(512, 512, { fit: "inside" }).png().toBuffer();
  const res = await openai().responses.create({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content: `Du granskar tryckmotiv till ${club.kind === "brand" ? "merchprodukter" : "supporterkläder"} för ${club.name} innan de trycks. Var strikt men rättvis.
- containsTextOrLetters: finns bokstäver, siffror eller läsbar text i bilden?
- containsLogoOrCrest: finns en sköldform/vapensköld som kan förväxlas med en klubbs officiella sköld, eller ett varumärkes logotyp? Runda märken, emblem-känsla och symboler UTAN text och UTAN sköldform är OK och ska inte flaggas.
- resemblesOtherBrandOrCharacter: liknar något ett känt varumärke, en annan klubbs symbol eller en upphovsrättsskyddad figur (t.ex. Disney, Pokémon)?
- containsRealPerson: föreställer bilden en verklig, igenkännbar person?
- printableForDTG: fungerar motivet för digitaltryck på textil (tydliga former, inga hårfina linjer eller små detaljer som försvinner)?
- notes: en kort mening på svenska om det viktigaste.`,
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Granska motivet." },
          { type: "input_image", image_url: `data:image/png;base64,${small.toString("base64")}`, detail: "low" },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "vision_review", schema: visionSchema, strict: true } },
  });
  const v = JSON.parse(res.output_text) as Vision;
  return [
    { rule: "Ingen text i illustrationen", ok: !v.containsTextOrLetters },
    { rule: "Ingen egen logga eller sköld", ok: !v.containsLogoOrCrest },
    { rule: "Liknar inget annat varumärke eller figur", ok: !v.resemblesOtherBrandOrCharacter },
    { rule: "Inga verkliga personer", ok: !v.containsRealPerson },
    { rule: "Tryckbart med DTG", ok: v.printableForDTG, note: v.notes },
  ];
}
