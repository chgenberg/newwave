import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { ColorMode } from "@/lib/newwave/vector/write";
import { type GrasrotClub, grasrotClub } from "./clubs";
import { type ClubInk, clubInks } from "./colors";
import { emblemSet, VARIANTS } from "./emblem";
import { ARTWORKS, FILE_SET, FONT_CHECK, printChecks, printFile, VARIANT_TEXT } from "./files";
import { heroImage } from "./hero";
import { productMockup } from "./mockup";
import { buildProductionFile, productionFiles, productionOrder, productionSheet } from "./production";
import { GRASROT_PRODUCTS, METHOD_TEXT } from "./products";
import { SOCIAL_FORMATS, type SocialFormat, socialSlides } from "./social";

/**
 * Hela leveransen till en förening som en zip: klubbmärket och ordmärket i alla varianter och färglägen, kulörerna,
 * webbshopens produktbilder i varje färg, herobilden, inläggen för sociala medier och produktionsunderlaget per
 * leverantör. Paketet byggs på en halv minut och sparas i produktion tills nästa version är ute.
 */

const FOLDER: Record<ColorMode, string> = { spot: "pantone", cmyk: "cmyk", rgb: "rgb" };
const SOCIAL_DIR: Record<SocialFormat, string> = { feed: "flode-4x5", story: "story-9x16" };
const nn = (i: number) => String(i + 1).padStart(2, "0");

/** Adobe Swatch Exchange: kulörerna som dekorfärger med sina CMYK-värden, för Illustrator och InDesign. */
export function swatches(inks: ClubInk[]): Buffer {
  const unique = [...new Map(inks.map((i) => [i.pantone, i])).values()];
  const blocks = unique.map((ink) => {
    const name = Buffer.from(`${ink.pantone}\0`, "utf16le").swap16();
    const body = Buffer.alloc(2 + name.length + 4 + 16 + 2);
    let o = body.writeUInt16BE(name.length / 2, 0);
    o += name.copy(body, o);
    o += body.write("CMYK", o, "ascii");
    for (const v of ink.cmyk) o = body.writeFloatBE(v / 100, o);
    body.writeUInt16BE(ink.pantone === "White" ? 2 : 1, o);
    const head = Buffer.alloc(6);
    head.writeUInt16BE(1, 0);
    head.writeUInt32BE(body.length, 2);
    return Buffer.concat([head, body]);
  });
  const head = Buffer.alloc(12);
  head.write("ASEF", 0, "ascii");
  head.writeUInt16BE(1, 4);
  head.writeUInt16BE(0, 6);
  head.writeUInt32BE(blocks.length, 8);
  return Buffer.concat([head, ...blocks]);
}

function inkCsv(inks: ClubInk[]) {
  const rows = [["Hex", "Pantone", "C", "M", "Y", "K", "Källa", "Anmärkning"], ...inks.map((i) => [i.hex, i.pantone, ...i.cmyk.map(String), i.source === "profil" ? "Föreningens profil" : "Förslag", i.note ?? ""])];
  return `\uFEFF${rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\r\n")}\r\n`;
}

/** Läs mig-filen: vad som finns var, kulörerna och det som måste åtgärdas innan tryck. */
async function readme(club: GrasrotClub, inks: ClubInk[]): Promise<string> {
  const set = await emblemSet(club.id)!;
  const lines = [
    `${club.name} – Gräsrot 360`,
    `Leverans från Next Wave, ${new Date().toISOString().slice(0, 10)}`,
    "",
    "MAPPAR",
    "  01-klubbmarke/, 02-ordmarke/  Märket och ordmärket i tre varianter:",
    "      pantone/  PDF och EPS med Pantone-dekorfärger – screentryck, transfer, brodyr och gravyr.",
    "      cmyk/     PDF och EPS i process-CMYK – digitaltryck och offset. Vitt trycks inte; negativet finns därför inte här.",
    "      rgb/      PDF, EPS, SVG och PNG (300 dpi) i RGB – skärm, webbshop och sociala medier.",
    "      Vektorfilerna har texten konverterad till kurvor, är 100 mm breda och skalbara utan kvalitetsförlust.",
    "  03-kulorer/       Kulörerna som CSV och som färgprover (.ase) för Illustrator och InDesign.",
    "  04-webbshop/      Produkterna i Bilaga 2 med föreningens grafik, en bild per färg.",
    "  05-herobild/      Produkterna på klubbstugans veranda under sommarfesten, 1920 × 1080.",
    "  06-sociala-medier/ Herobilden följd av varje produkt: flöde 4:5 (1080 × 1350) och story 9:16 (1080 × 1920).",
    "  07-produktion/    Per produkt ett produktionsblad (PDF) och tryckfilerna i exakt storlek i metodens format,",
    "                    och produktionsorder.csv över alla placeringar.",
    "",
    "VARIANTER",
    ...VARIANTS.map((v) => `  ${v.padEnd(9)} ${VARIANT_TEXT[v]}`),
    "",
    "PRODUKTER",
    ...GRASROT_PRODUCTS.map((p) => {
      const d = p.design(p.colors[0]);
      return `  ${p.short.padEnd(13)} ${p.name} (${p.supplier}) – ${d.art === "halsduk" ? "egen design" : d.art}, ${METHOD_TEXT[d.method].toLowerCase()}`;
    }),
    "  Tryckytorna är Bilaga 2:s. Bilagan anger inga mått; måtten är uppmätta på bilagans ritning i storlek M",
    "  (kepsen: brodyrens standardyta). Bekräfta mot leverantörens mall.",
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

async function build(id: string, club: GrasrotClub): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder(`${id}-grasrot-360`)!;
  const inks = await clubInks(id);
  root.file("LASMIG.txt", await readme(club, inks));
  for (const f of FILE_SET) {
    const file = await printFile(id, f.artwork, f);
    if (file) root.file(`${f.artwork === "klubbmarke" ? "01" : "02"}-${f.artwork}/${FOLDER[f.mode ?? "rgb"]}/${file.name}`, file.data);
  }
  root.file("03-kulorer/kulorer.csv", inkCsv(inks));
  root.file(`03-kulorer/${id}-kulorer.ase`, swatches(inks));

  for (const [i, p] of GRASROT_PRODUCTS.entries()) {
    for (const c of p.colors) {
      const jpg = await productMockup(id, p, c, 90);
      if (jpg) root.file(`04-webbshop/${nn(i)}-${p.id}/${p.id}-${c.id}.jpg`, jpg);
    }
    const dir = `07-produktion/${nn(i)}-${p.id}`;
    const sheet = await productionSheet(id, p);
    if (sheet) root.file(`${dir}/${p.id}-produktionsblad.pdf`, sheet);
    for (const f of await productionFiles(id, p)) {
      const file = await buildProductionFile(id, f);
      if (file) root.file(`${dir}/${f.name}`, file.data);
    }
  }
  root.file("07-produktion/produktionsorder.csv", await productionOrder(id));

  const hero = await heroImage(id);
  if (hero) root.file(`05-herobild/${id}-herobild.jpg`, hero.jpg);
  for (const format of Object.keys(SOCIAL_FORMATS) as SocialFormat[])
    for (const s of (await socialSlides(id, format)) ?? []) root.file(`06-sociala-medier/${SOCIAL_DIR[format]}/${s.name}.jpg`, s.jpg);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

const CACHE = path.join(process.cwd(), ".data", "newwave", "grasrot");
/** Varje deploy bygger nya paket; utan commit-id (och under utveckling) byggs de om varje gång. */
const SHA = process.env.RAILWAY_GIT_COMMIT_SHA;
const VERSION = process.env.NODE_ENV === "production" && SHA ? SHA.slice(0, 12) : null;
const running = new Map<string, Promise<Buffer>>();

export async function grasrotPackage(id: string): Promise<{ data: Buffer; name: string } | null> {
  const club = grasrotClub(id);
  if (!club || !emblemSet(id)) return null;
  const name = `${id}-grasrot-360.zip`;
  const file = VERSION ? path.join(CACHE, `${id}-${VERSION}.zip`) : null;
  if (file) {
    const hit = await readFile(file).catch(() => null);
    if (hit) return { data: hit, name };
  }
  let job = running.get(id);
  const owner = !job;
  if (!job) {
    job = build(id, club);
    running.set(id, job);
  }
  try {
    const data = await job;
    if (owner && file) {
      await mkdir(CACHE, { recursive: true });
      await writeFile(`${file}.tmp`, data);
      await rename(`${file}.tmp`, file);
    }
    return { data, name };
  } finally {
    if (owner && running.get(id) === job) running.delete(id);
  }
}
