import sharp from "sharp";
import { SCARF, deltaE, hexToRgb } from "./scarf";
import { crestColors, forKnitting } from "./scarfClub";
import { W_MM, type ScarfDesign, type Section } from "./scarfDesign";
import { knitDesign } from "./scarfEngine";
import { inspect } from "./scarfProduction";

/**
 * Halsduken från sidans 3D-vy som stickfil: en enda garnfärg och loggan på de två ändarna, strax innanför fransarna.
 * Loggan står rätt när halsduken hänger om halsen – alltså vriden ett kvarts varv mot mitten på den liggande halsduken.
 * En bred logga ligger i stället längs änden, som text. Samma mått som trycket i components/ScarfHero3D.tsx.
 */

/** Loggor bredare än så här läggs längs änden. */
const WIDE = 1.7;
/** Så stor del av bredden loggan får ta. */
const ACROSS = 0.62;
/** Längsta liggande logga, och avståndet från halsdukens ände, i mm. */
const MAX_ALONG = 280;
const FROM_END = 45;

const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
};

export async function knitLogoScarf(logo: Buffer, color: string) {
  const crest = await forKnitting(logo);
  const meta = await sharp(crest).metadata();
  const aspect = (meta.width || 1) / (meta.height || 1);

  // Garn 1 är halsdukens färg; loggans färger läggs till efter yta. En nyans nära ett garn som redan finns delar på det.
  const ground = color.toUpperCase();
  const palette = [ground];
  const add = (hex: string) => {
    const h = hex.toUpperCase();
    const found = palette.findIndex((p) => deltaE(p, h) < 12);
    if (found >= 0) return found;
    if (palette.length >= SCARF.maxColors) return palette.reduce((best, p, i) => (deltaE(p, h) < deltaE(palette[best], h) ? i : best), 0);
    palette.push(h);
    return palette.length - 1;
  };
  // Plattan bakom en logga som annars försvinner i bottnen: vitt eller svart, det som syns bäst.
  const plate = add(Math.abs(lum(ground) - 255) >= Math.abs(lum(ground) - 10) ? "#FFFFFF" : "#0A0A0A");
  const yarns = [...new Set((await crestColors(crest)).map((c) => add(c.hex)))];

  const along = aspect > WIDE;
  const across = W_MM * ACROSS;
  // Stående logga: bredden går tvärs över halsduken. Liggande: höjden går tvärs över.
  const wide = along ? Math.min(MAX_ALONG, across * aspect) : Math.min(across, W_MM * 0.8 * aspect);
  const [lengthMm, widthMm] = along ? [wide, wide / aspect] : [wide / aspect, wide];
  const end = (turn: 1 | -1): Section => ({ mm: lengthMm, fill: { kind: "solid", yarn: 0 }, content: { kind: "crest", yarns, plate, turn: along ? undefined : turn }, pad: [0, (W_MM - widthMm) / 2] });
  const gap = (): Section => ({ mm: FROM_END, fill: { kind: "solid", yarn: 0 } });
  const face = () => ({ sections: [gap(), end(1), { fill: { kind: "solid" as const, yarn: 0 } }, end(-1), gap()] });
  const design: ScarfDesign = { palette, front: face(), back: face(), backReads: "hold-up" };

  let knit = await knitDesign(design, { crest });
  let report = inspect(knit);
  // Samma städning som i flödet: en logga med tunna linjer ger annars ensamma maskor.
  if (report.checks.some((c) => c.id === "loose" && c.level === "varning")) {
    const cleaned = await knitDesign(design, { crest }, { clean: true });
    const again = inspect(cleaned);
    if (again.checks.every((c) => c.id !== "loose" || c.level === "ok")) [knit, report] = [cleaned, again];
  }
  return { knit, report, turned: !along };
}
