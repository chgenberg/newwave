import sharp from "sharp";
import { type ColorMode, type Ink, toEps, toPdf } from "@/lib/newwave/vector/write";
import { colorsOf, type Flat, recolor, toSvg } from "@/lib/newwave/vector/svg";
import { type GrasrotClub, grasrotClub } from "./clubs";
import { inkFor } from "./colors";
import { type EmblemSet, NEGATIVE_INK, SOLID_INK, VARIANTS, type Variant, emblemSet } from "./emblem";
import { rasterize } from "./mockup";
import { scarfDesign } from "./scarf";
import { grasrotWordmark } from "./wordmark";

/**
 * Tryckfilerna New Wave Group och leverantörerna får – klubbmärket och Gräsrot 360-wordmarket: SVG, PDF och EPS i exakt
 * storlek, med färgerna som Pantone-dekorfärger, process-CMYK eller RGB, och en förhandskontroll som säger vad som
 * måste åtgärdas innan tryck.
 */

export const ARTWORKS = ["klubbmarke", "ordmarke"] as const;
export type Artwork = (typeof ARTWORKS)[number];
/** Halsduken trycks inte utan vävs, men får samma förhandskontroll och filer. */
export type PrintArt = Artwork | "halsduk";

export const FORMATS = ["pdf", "eps", "svg", "png"] as const;
export type FileFormat = (typeof FORMATS)[number];
export const MODES: ColorMode[] = ["spot", "cmyk", "rgb"];

export type Check = { level: "ok" | "varning" | "stopp"; text: string };
export type PrintFile = { data: Buffer; mime: string; name: string; checks: Check[] };
export type PrintFileOpts = {
  variant: Variant;
  format: FileFormat;
  /** SVG och PNG är alltid RGB. */
  mode?: ColorMode;
  widthMm?: number;
  /** Solid i en av klubbens färger i stället för svart. */
  ink?: string;
};

const MIME: Record<FileFormat, string> = { pdf: "application/pdf", eps: "application/postscript", svg: "image/svg+xml", png: "image/png" };
/** Upplösningen leverantörerna kräver för transfer och digitaltryck. */
export const PNG_DPI = 300;
const BLACK: Ink = { name: "PANTONE Black C", cmyk: [0, 0, 0, 100] };
const WHITE: Ink = { name: "White", cmyk: [0, 0, 0, 0] };
export const FONT_CHECK: Check = { level: "varning", text: "Wordmarket är satt i fria ersättare (Holtwood One SC, Lobster) för Casey Bold och Espiritu – byt om NWG licensierar originalen." };

/**
 * Förhandskontrollen för en variant – samma för alla format, så att granskningssidan kan visa den utan att bygga filer.
 * Wordmarket bär alltid märkets solid, även i originalfärger.
 */
export function preflight(set: EmblemSet, artwork: PrintArt, variant: Variant, mode: ColorMode, inks: { name: string; note?: string }[], extra: Check[] = []): Check[] {
  const checks: Check[] = [];
  const q = set.quality;
  checks.push({ level: q.kind === "vektor" ? (q.ready ? "ok" : "stopp") : q.ready ? "varning" : "stopp", text: q.note });
  for (const issue of set[artwork === "ordmarke" && variant === "original" ? "solid" : artwork === "halsduk" ? "negativ" : variant].issues) checks.push({ level: "stopp", text: issue });
  if (set.auto.solid && variant === "solid") checks.push({ level: "varning", text: "Soliden är ett automatiskt förslag ur originalet – granska vad som trycks och vad som blir hål." });
  if (set.auto.solid && artwork === "ordmarke" && variant !== "solid") checks.push({ level: "varning", text: "Märket i wordmarket är en automatisk solid ur originalet – granska vad som trycks och vad som blir hål." });
  if (variant === "negativ" && mode === "cmyk") checks.push({ level: "stopp", text: "Vitt går inte att trycka i CMYK – välj dekorfärg (White) för negativet." });
  if (variant === "original" && mode === "cmyk" && inks.some((i) => i.name === "White"))
    checks.push({ level: "varning", text: "De vita partierna trycks inte i CMYK – på färgade plagg behövs dekorfärgsfilen, där vitt är en egen färg." });
  for (const ink of inks) if (ink.note) checks.push({ level: "varning", text: ink.note });
  checks.push(...extra);
  checks.push({ level: "ok", text: `${inks.length} ${inks.length === 1 ? "färg" : "färger"}: ${inks.map((i) => i.name).join(", ")}` });
  return checks;
}

type Prepared = { club: GrasrotClub; flat: Flat; inks: Record<string, Ink & { note?: string }>; checks: Check[]; mode: ColorMode };

async function prepare(id: string, artwork: PrintArt, opts: PrintFileOpts): Promise<Prepared | null> {
  const club = grasrotClub(id);
  const pending = emblemSet(id);
  if (!club || !pending) return null;
  const set = await pending;
  const mode: ColorMode = opts.format === "svg" || opts.format === "png" ? "rgb" : (opts.mode ?? "spot");
  const wordmark = artwork === "ordmarke" ? await grasrotWordmark(id, opts.variant) : null;
  const scarf = artwork === "halsduk" ? await scarfDesign(id) : null;
  if ((artwork === "ordmarke" && !wordmark) || (artwork === "halsduk" && !scarf)) return null;

  let flat: Flat = wordmark?.flat ?? scarf ?? set[opts.variant];
  const inks: Prepared["inks"] = {};
  if (opts.variant === "original" || artwork === "halsduk") {
    // Toner som blir samma kulör (svart och nästan svart) ska tryckas från en och samma platta.
    const byName = new Map<string, string>();
    const into = new Map<string, string>();
    for (const hex of colorsOf(flat)) {
      const ink = inkFor(club, hex);
      const same = byName.get(ink.pantone);
      if (same) into.set(hex, same);
      else {
        byName.set(ink.pantone, hex);
        inks[hex] = { name: ink.pantone, cmyk: ink.cmyk, note: ink.note };
      }
    }
    if (into.size) flat = recolor(flat, (hex) => into.get(hex) ?? hex);
  } else if (opts.variant === "solid" && opts.ink) {
    const ink = inkFor(club, opts.ink.toUpperCase());
    flat = recolor(flat, () => ink.hex);
    inks[ink.hex] = { name: ink.pantone, cmyk: ink.cmyk, note: ink.note };
  } else inks[opts.variant === "solid" ? SOLID_INK : NEGATIVE_INK] = opts.variant === "solid" ? BLACK : WHITE;

  // Noten om en svag andrafärg gäller bara originalet; solid och negativ är en färg.
  const notes = wordmark?.notes.filter((n) => opts.variant === "original" || n.kind !== "weak-color") ?? [];
  const extra = wordmark ? [FONT_CHECK, ...notes.map((n): Check => ({ level: n.level === "varning" ? "varning" : "ok", text: n.text }))] : [];
  return { club, flat, inks, mode, checks: preflight(set, artwork, opts.variant, mode, Object.values(inks), extra) };
}

/** Förhandskontrollen utan att bygga filen. */
export async function printChecks(id: string, artwork: PrintArt, variant: Variant, mode: ColorMode = "spot") {
  return (await prepare(id, artwork, { variant, format: "pdf", mode }))?.checks ?? null;
}

const ART_TEXT: Record<PrintArt, string> = { klubbmarke: "klubbmärke", ordmarke: "wordmark", halsduk: "vävd halsduk" };

/** Filens innehåll; namnet sätter den som anropar. */
export async function printData(id: string, artwork: PrintArt, opts: PrintFileOpts): Promise<Omit<PrintFile, "name"> | null> {
  const p = await prepare(id, artwork, opts);
  if (!p) return null;
  const { club, flat, inks, mode, checks } = p;
  const widthMm = opts.widthMm ?? 100;
  const title = `${club.name} – ${ART_TEXT[artwork]}, ${opts.variant}`;
  const doc = { flat, widthMm, title, mode, inks };
  let data: Buffer;
  if (opts.format === "pdf") data = toPdf(doc);
  else if (opts.format === "eps") data = toEps(doc);
  else if (opts.format === "svg") data = Buffer.from(toSvg(flat, { widthMm }));
  else {
    const px = await rasterize(flat, Math.round((widthMm / 25.4) * PNG_DPI));
    data = await sharp(px.data, { raw: px.info }).withMetadata({ density: PNG_DPI }).png({ compressionLevel: 9 }).toBuffer();
  }
  return { data, mime: MIME[opts.format], checks };
}

export async function printFile(id: string, artwork: Artwork, opts: PrintFileOpts): Promise<PrintFile | null> {
  const d = await printData(id, artwork, opts);
  return d && { ...d, name: `${id}-${fileName(artwork, opts.variant, opts.format, opts.mode)}` };
}

/** `ordmarke-negativ-spot.pdf`; SVG och PNG är alltid RGB och har inget färgläge i namnet. */
export const fileName = (artwork: Artwork, variant: Variant, format: FileFormat, mode?: ColorMode) =>
  `${artwork}-${variant}${format === "svg" || format === "png" ? "" : `-${mode ?? "spot"}`}.${format}`;

export const fileHref = (id: string, name: string) => `/api/v1/newwave/grasrot/${id}/${name}`;

const FILE = /^(klubbmarke|ordmarke)-(original|solid|negativ)(?:-(spot|cmyk|rgb))?\.(pdf|eps|svg|png)$/;

export function parseFileName(name: string): { artwork: Artwork; opts: PrintFileOpts } | null {
  const m = FILE.exec(name);
  if (!m) return null;
  const opts: PrintFileOpts = { variant: m[2] as Variant, format: m[4] as FileFormat, mode: m[3] as ColorMode | undefined };
  // Bara det som finns i paketet går att hämta – inte vitt i CMYK, som inte går att trycka.
  if (!FILE_SET.some((f) => f.artwork === m[1] && f.variant === opts.variant && f.format === opts.format && f.mode === opts.mode)) return null;
  return { artwork: m[1] as Artwork, opts };
}

/** Allt som går att trycka: varje motiv och variant som SVG, PNG och som PDF och EPS i varje färgläge – utom vitt i CMYK. */
export const FILE_SET = ARTWORKS.flatMap((artwork) =>
  VARIANTS.flatMap((variant) => [
    { artwork, variant, format: "svg" as FileFormat, mode: undefined as ColorMode | undefined },
    { artwork, variant, format: "png" as FileFormat, mode: undefined as ColorMode | undefined },
    ...(["pdf", "eps"] as const).flatMap((format) => MODES.filter((mode) => !(variant === "negativ" && mode === "cmyk")).map((mode) => ({ artwork, variant, format: format as FileFormat, mode }))),
  ]),
);

export const VARIANT_TEXT: Record<Variant, string> = { original: "Original – klubbens färger", solid: "Solid – en färg (svart) på ljust", negativ: "Negativ – vitt på mörkt (filen är vit på transparent)" };
