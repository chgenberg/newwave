import JSZip from "jszip";
import type { NwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import { defaultDesign, type Design, fitPlacement, markingPrice, METHOD_INFO, type Method } from "@/lib/newwave/marking";
import { fileSlug, isDarkHex, type MadeJob, makeJob } from "@/lib/newwave/printFiles";
import { paletteFor } from "./render";
import { wordmarkFile } from "./serve";
import type { WordmarkQuery } from "./spec";
import { wordmarkClub } from "./store";

/**
 * Tryckfärdiga filer för ett ordmärke: samma produktionsmotor som hubben använder för godkända kampanjer –
 * schabloner med Pantone för screentryck, DST och stygnplan för brodyr, filmer för transfer och DTG – plus
 * originalet som vektor, och priset per plagg för vanliga upplagor.
 */
export const EXPORT_METHODS: Method[] = ["screentryck", "brodyr", "transfer", "dtg"];
export const QTYS = [25, 50, 100, 250];

export type WordmarkJob = {
  job: MadeJob;
  club: string;
  colors: number;
  prices: { qty: number; perUnit: number; setup: number; each: number }[];
  svg: Buffer;
  slug: string;
};

const memo = new Map<string, Promise<WordmarkJob | null>>();

/** Färgerna motivet trycks i: bokstävernas och formernas färger (inte plaggets egen) plus en för märket. */
function inkCount(svg: string, colors: readonly string[], dark: boolean) {
  const paper = paletteFor(colors, dark ? "dark" : "light").paper;
  const fills = new Set([...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()).filter((c) => c !== paper));
  return fills.size + (svg.includes("<image") ? 1 : 0);
}

async function make(q: WordmarkQuery, product: NwProduct, method: Method, sizeCm: number, garment: string): Promise<WordmarkJob | null> {
  const dark = isDarkHex(garment);
  const base = { ...q, variant: dark ? ("dark" as const) : ("light" as const), size: 3543 };
  const [png, svg, club] = await Promise.all([wordmarkFile({ ...base, format: "png" }), wordmarkFile({ ...base, format: "svg" }), wordmarkClub(q.club)]);
  if (!png || !svg || !club) return null;
  const info = METHOD_INFO[method];
  const colors = info.fixedColors ?? Math.min(info.maxColors, Math.max(1, inkCount(svg.data.toString("utf8"), club.colors, dark)));
  const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg.data.toString("utf8"));
  const aspect = box ? Number(box[1]) / Number(box[2]) : 1;
  const placement = fitPlacement(product, { method, colors, shape: "original" as const, zone: defaultDesign(product, method).zone, sizeCm }, aspect);
  const slug = `${fileSlug(club.name)}-${q.template}`;
  const job = await makeJob({ club: club.name, palette: [...club.colors], product, color: garment, placement, art: png.data, slug });
  const prices = QTYS.map((qty) => {
    const p = markingPrice(placement as Design, qty);
    return { qty, ...p, each: Math.round(p.perUnit + p.setup / qty) };
  });
  return { job, club: club.name, colors, prices, svg: svg.data, slug };
}

export function wordmarkJob(q: WordmarkQuery, product: NwProduct, method: Method, sizeCm: number, garment: string) {
  const key = JSON.stringify([q, product.id, method, sizeCm, garment]);
  let p = memo.get(key);
  if (!p) {
    p = make(q, product, method, sizeCm, garment).catch(() => null);
    memo.set(key, p);
    if (memo.size > 24) memo.delete(memo.keys().next().value!);
  }
  return p;
}

const kr = (n: number) => `${new Intl.NumberFormat("sv-SE").format(n)} kr`;

export async function wordmarkZip(w: WordmarkJob, product: NwProduct, garment: string) {
  const { job } = w;
  const spec = [
    `${w.club} – ordmärke ${job.methodLabel.toLowerCase()} på ${product.name.toLowerCase()} (${colorName(garment).toLowerCase()})`,
    "",
    ...job.facts.map((f) => `${f.label}: ${f.value}`),
    "",
    ...(job.inks.length ? ["Färger:", ...job.inks.map((i) => `  ${i.name.padEnd(10)} ${i.hex}  ${i.pantone}${i.detail ? `  (${i.detail})` : ""}`), ""] : []),
    "Pris för trycket per plagg (exkl. plagg och moms):",
    ...w.prices.map((p) => `  ${String(p.qty).padStart(4)} st: ${kr(p.each)} (${kr(p.perUnit)} + startkostnad ${kr(p.setup)})`),
    "",
    ...job.notes,
  ].join("\n");
  const zip = new JSZip();
  for (const f of job.files) zip.file(f.name, f.data);
  zip.file(`${w.slug}-original.svg`, w.svg);
  zip.file("specifikation.txt", spec);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
