import JSZip from "jszip";
import { type ColorMode, type Ink, toEps, toPdf } from "@/lib/newwave/vector/write";
import { colorsOf, type Flat, recolor, toSvg } from "@/lib/newwave/vector/svg";
import { type GrasrotClub, grasrotClub } from "./clubs";
import { clubInks, inkFor } from "./colors";
import { type EmblemSet, NEGATIVE_INK, SOLID_INK, VARIANTS, type Variant, emblemSet } from "./emblem";
import { grasrotWordmark } from "./wordmark";

/**
 * Tryckfilerna New Wave Group och leverantörerna får – klubbmärket och Gräsrot 360-ordmärket: SVG, PDF och EPS i exakt
 * storlek, med färgerna som Pantone-dekorfärger, process-CMYK eller RGB, och en förhandskontroll som säger vad som
 * måste åtgärdas innan tryck.
 */

export const ARTWORKS = ["klubbmarke", "ordmarke"] as const;
export type Artwork = (typeof ARTWORKS)[number];

export const FORMATS = ["pdf", "eps", "svg"] as const;
export type FileFormat = (typeof FORMATS)[number];
export const MODES: ColorMode[] = ["spot", "cmyk", "rgb"];

export type Check = { level: "ok" | "varning" | "stopp"; text: string };
export type PrintFile = { data: Buffer; mime: string; name: string; checks: Check[] };
export type PrintFileOpts = {
  variant: Variant;
  format: FileFormat;
  /** SVG är alltid RGB. */
  mode?: ColorMode;
  widthMm?: number;
  /** Solid i en av klubbens färger i stället för svart. */
  ink?: string;
};

const MIME: Record<FileFormat, string> = { pdf: "application/pdf", eps: "application/postscript", svg: "image/svg+xml" };
const BLACK: Ink = { name: "PANTONE Black C", cmyk: [0, 0, 0, 100] };
const WHITE: Ink = { name: "White", cmyk: [0, 0, 0, 0] };
export const FONT_CHECK: Check = { level: "varning", text: "Ordmärket är satt i fria ersättare (Holtwood One SC, Lobster) för Casey Bold och Espiritu – byt om NWG licensierar originalen." };

/**
 * Förhandskontrollen för en variant – samma för alla format, så att granskningssidan kan visa den utan att bygga filer.
 * Ordmärket bär alltid märkets solid, även i originalfärger.
 */
export function preflight(set: EmblemSet, artwork: Artwork, variant: Variant, mode: ColorMode, inks: { name: string; note?: string }[], extra: Check[] = []): Check[] {
  const checks: Check[] = [];
  const q = set.quality;
  checks.push({ level: q.kind === "vektor" ? (q.ready ? "ok" : "stopp") : q.ready ? "varning" : "stopp", text: q.note });
  for (const issue of set[artwork === "ordmarke" && variant === "original" ? "solid" : variant].issues) checks.push({ level: "stopp", text: issue });
  if ((variant === "solid" || artwork === "ordmarke") && set.auto.solid) checks.push({ level: "varning", text: "Soliden är ett automatiskt förslag ur originalet – granska vad som trycks och vad som blir hål." });
  if (variant === "negativ" && mode === "cmyk") checks.push({ level: "stopp", text: "Vitt går inte att trycka i CMYK – välj dekorfärg (White) för negativet." });
  if (variant === "original" && mode === "cmyk" && inks.some((i) => i.name === "White"))
    checks.push({ level: "varning", text: "De vita partierna trycks inte i CMYK – på färgade plagg behövs dekorfärgsfilen, där vitt är en egen färg." });
  for (const ink of inks) if (ink.note) checks.push({ level: "varning", text: ink.note });
  checks.push(...extra);
  checks.push({ level: "ok", text: `${inks.length} ${inks.length === 1 ? "färg" : "färger"}: ${inks.map((i) => i.name).join(", ")}` });
  return checks;
}

type Prepared = { club: GrasrotClub; flat: Flat; inks: Record<string, Ink & { note?: string }>; checks: Check[]; mode: ColorMode };

async function prepare(id: string, artwork: Artwork, opts: PrintFileOpts): Promise<Prepared | null> {
  const club = grasrotClub(id);
  const pending = emblemSet(id);
  if (!club || !pending) return null;
  const set = await pending;
  const mode: ColorMode = opts.format === "svg" ? "rgb" : (opts.mode ?? "spot");
  const wordmark = artwork === "ordmarke" ? await grasrotWordmark(id, opts.variant) : null;
  if (artwork === "ordmarke" && !wordmark) return null;

  let flat: Flat = wordmark?.flat ?? set[opts.variant];
  const inks: Prepared["inks"] = {};
  if (opts.variant === "original") {
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
export async function printChecks(id: string, artwork: Artwork, variant: Variant, mode: ColorMode = "spot") {
  return (await prepare(id, artwork, { variant, format: "pdf", mode }))?.checks ?? null;
}

export async function printFile(id: string, artwork: Artwork, opts: PrintFileOpts): Promise<PrintFile | null> {
  const p = await prepare(id, artwork, opts);
  if (!p) return null;
  const { club, flat, inks, mode, checks } = p;
  const widthMm = opts.widthMm ?? 100;
  const title = `${club.name} – ${artwork === "ordmarke" ? "ordmärke" : "klubbmärke"}, ${opts.variant}`;
  const doc = { flat, widthMm, title, mode, inks };
  const data = opts.format === "pdf" ? toPdf(doc) : opts.format === "eps" ? toEps(doc) : Buffer.from(toSvg(flat, { widthMm }));
  return { data, mime: MIME[opts.format], name: `${club.id}-${fileName(artwork, opts.variant, opts.format, mode)}`, checks };
}

/** `ordmarke-negativ-spot.pdf`; SVG är alltid RGB och har inget färgläge i namnet. */
export const fileName = (artwork: Artwork, variant: Variant, format: FileFormat, mode?: ColorMode) =>
  `${artwork}-${variant}${format === "svg" ? "" : `-${mode ?? "spot"}`}.${format}`;

export const fileHref = (id: string, name: string) => `/api/v1/newwave/grasrot/${id}/${name}`;

const FILE = /^(klubbmarke|ordmarke)-(original|solid|negativ)(?:-(spot|cmyk|rgb))?\.(pdf|eps|svg)$/;

export function parseFileName(name: string): { artwork: Artwork; opts: PrintFileOpts } | null {
  const m = FILE.exec(name);
  if (!m) return null;
  const opts: PrintFileOpts = { variant: m[2] as Variant, format: m[4] as FileFormat, mode: m[3] as ColorMode | undefined };
  // Bara det som finns i paketet går att hämta – inte vitt i CMYK, som inte går att trycka.
  if (!FILE_SET.some((f) => f.artwork === m[1] && f.variant === opts.variant && f.format === opts.format && f.mode === opts.mode)) return null;
  return { artwork: m[1] as Artwork, opts };
}

/** Allt som går att trycka: varje motiv och variant som SVG och som PDF och EPS i varje färgläge – utom vitt i CMYK. */
export const FILE_SET = ARTWORKS.flatMap((artwork) =>
  VARIANTS.flatMap((variant) => [
    { artwork, variant, format: "svg" as FileFormat, mode: undefined as ColorMode | undefined },
    ...(["pdf", "eps"] as const).flatMap((format) => MODES.filter((mode) => !(variant === "negativ" && mode === "cmyk")).map((mode) => ({ artwork, variant, format: format as FileFormat, mode }))),
  ]),
);

const FOLDER: Record<ColorMode, string> = { spot: "pantone", cmyk: "cmyk", rgb: "rgb" };
export const VARIANT_TEXT: Record<Variant, string> = { original: "Original – klubbens färger", solid: "Solid – en färg (svart) på ljust", negativ: "Negativ – vitt på mörkt" };

/** Läs mig-filen i paketet: kulörer, mappar och det som måste åtgärdas innan tryck. */
async function specSheet(club: GrasrotClub): Promise<string> {
  const inks = await clubInks(club.id);
  const set = await emblemSet(club.id)!;
  const lines = [
    `${club.name} – Gräsrot 360`,
    `Tryckfiler från Next Wave, ${new Date().toISOString().slice(0, 10)}`,
    "",
    "MAPPAR",
    "  pantone/  PDF och EPS med Pantone-dekorfärger – screentryck, transfer, brodyr (trådmatchning) och gravyr.",
    "  cmyk/     PDF och EPS i process-CMYK – digitaltryck och offset. Vitt trycks inte; negativet finns därför inte här.",
    "  rgb/      PDF, EPS och SVG i RGB – skärm, webbshop och sociala medier.",
    "  Alla filer är ren vektor med texten konverterad till kurvor, 100 mm breda och skalbara utan kvalitetsförlust.",
    "",
    "VARIANTER",
    ...VARIANTS.map((v) => `  ${v.padEnd(9)} ${VARIANT_TEXT[v]}`),
    "",
    "KLUBBMÄRKET",
    `  Källa: ${club.source.from}${club.source.note ? ` – ${club.source.note}` : ""}`,
    `  ${set.quality.note}`,
    "",
    "ORDMÄRKET",
    `  ${FONT_CHECK.text}`,
    "",
    "KULÖRER",
    ...inks.map((i) => `  ${i.hex}  ${i.pantone.padEnd(18)} CMYK ${i.cmyk.join("/").padEnd(14)} ${i.source === "profil" ? "klubbens profil" : "förslag – bekräftas av klubben"}${i.note ? `\n      ! ${i.note}` : ""}`),
    "",
    "FÖRHANDSKONTROLL (Pantone-filerna)",
  ];
  for (const artwork of ARTWORKS)
    for (const variant of VARIANTS) {
      const checks = ((await printChecks(club.id, artwork, variant)) ?? []).filter((c) => c.text !== set.quality.note && c.text !== FONT_CHECK.text);
      lines.push(`  ${artwork} ${variant}`);
      for (const c of checks) lines.push(`    [${c.level}] ${c.text}`);
    }
  return `${lines.join("\n")}\n`;
}

export async function grasrotPackage(id: string): Promise<{ data: Buffer; name: string } | null> {
  const club = grasrotClub(id);
  if (!club || !emblemSet(id)) return null;
  const zip = new JSZip();
  for (const f of FILE_SET) {
    const file = await printFile(id, f.artwork, f);
    if (file) zip.file(`${f.artwork}/${FOLDER[f.mode ?? "rgb"]}/${file.name}`, file.data);
  }
  zip.file("LASMIG.txt", await specSheet(club));
  return { data: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), name: `${id}-grasrot-360.zip` };
}
