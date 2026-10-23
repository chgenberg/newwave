import JSZip from "jszip";
import type { ColorMode } from "@/lib/newwave/vector/write";
import { stored } from "./cache";
import { type GrasrotClub, grasrotClub, inkSource } from "./clubs";
import { type ClubInk, clubInks } from "./colors";
import { emblemSet, VARIANTS } from "./emblem";
import { ARTWORKS, FILE_SET, FONT_CHECK, fileName, printChecks, printFile, VARIANT_TEXT } from "./files";
import { heroImage } from "./hero";
import { productMockup } from "./mockup";
import { buildProductionFile, productionFiles, productionOrder, productionSheet } from "./production";
import { GRASROT_PRODUCTS, METHOD_TEXT } from "./products";
import { captionText, SOCIAL_FORMATS, SOCIAL_SLIDES, type SocialFormat, socialSlides } from "./social";

/**
 * Hela leveransen till en förening som en zip: klubbmärket och wordmarket i alla varianter och färglägen, kulörerna,
 * webbshopens produktbilder i varje färg, herobilden, inläggen för sociala medier och produktionsunderlaget per
 * leverantör. Paketet byggs på en halv minut och sparas i produktion tills nästa version är ute. En fil som inte går
 * att bygga stoppar inte paketet; den listas i LASMIG.txt.
 */

const FOLDER: Record<ColorMode, string> = { spot: "pantone", cmyk: "cmyk", rgb: "rgb" };
const SOCIAL_DIR: Record<SocialFormat, string> = { feed: "flode-4x5", story: "story-9x16" };
const nn = (i: number) => String(i + 1).padStart(2, "0");
/** Svensk tid; zip-formatet sparar tiden utan tidszon och JSZip skriver den i UTC. */
const swedish = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }) + " UTC");

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

function inkCsv(club: GrasrotClub, inks: ClubInk[]) {
  const rows = [["Hex", "Pantone", "C", "M", "Y", "K", "Källa", "Anmärkning"], ...inks.map((i) => [i.hex, i.pantone, ...i.cmyk.map(String), inkSource(club, i.source), i.note ?? ""])];
  return `\uFEFF${rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\r\n")}\r\n`;
}

/** Läs mig-filen: vad som finns var, kulörerna och det som måste åtgärdas innan tryck. */
async function readme(club: GrasrotClub, inks: ClubInk[], failed: string[]): Promise<string> {
  const set = await emblemSet(club.id)!;
  const lines = [
    `${club.name} – Gräsrot 360`,
    `Leverans från Next Wave, ${swedish().toISOString().slice(0, 10)}`,
    "",
    ...(failed.length ? ["SAKNAS I DEN HÄR LEVERANSEN – kunde inte byggas, hämta dem på nytt från Next Wave:", ...failed.map((f) => `  ${f}`), ""] : []),
    "MAPPAR",
    "  01-klubbmarke/, 02-ordmarke/  Märket och wordmarket i tre varianter:",
    "      pantone/  PDF och EPS med Pantone-dekorfärger – screentryck, transfer, brodyr och gravyr.",
    "      cmyk/     PDF och EPS i process-CMYK – digitaltryck och offset. Vitt trycks inte; negativet finns därför inte här.",
    "      rgb/      PDF, EPS, SVG och PNG (300 dpi) i RGB – skärm, webbshop och sociala medier.",
    "      Vektorfilerna har texten konverterad till kurvor, är 100 mm breda och skalbara utan kvalitetsförlust.",
    "  03-kulorer/       Kulörerna som CSV och som färgprover (.ase) för Illustrator och InDesign.",
    "  04-webbshop/      Produkterna i Bilaga 2 med föreningens grafik, en bild per färg.",
    "  05-herobild/      Produkterna på klubbstugans veranda under sommarfesten, 1920 × 1080. Miljön är skapad med",
    "                    bildmodellen; klubbmärkena på produkterna är lagda från tryckfilerna.",
    "  06-sociala-medier/ Herobilden följd av varje produkt: flöde 4:5 (1080 × 1350) och story 9:16 (1080 × 1920),",
    "                    och bildtexter.txt med en färdig text till varje inlägg.",
    "  07-produktion/    Per produkt ett produktionsblad (PDF) och tryckfilerna i exakt storlek i metodens format,",
    "                    och produktionsorder.csv över alla placeringar.",
    "",
    "VARIANTER",
    ...VARIANTS.map((v) => `  ${v.padEnd(9)} ${VARIANT_TEXT[v]}`),
    "",
    "PRODUKTER",
    ...GRASROT_PRODUCTS.map((p) => {
      const d = p.design(p.colors[0]);
      const methods = [...new Set(p.colors.map((c) => METHOD_TEXT[p.design(c).method].toLowerCase()))].join(" eller ");
      return `  ${p.short.padEnd(13)} ${p.name} (${p.supplier}) – ${d.art === "halsduk" ? "egen design" : d.art}, ${methods}`;
    }),
    "  Tryckytorna är Bilaga 2:s. Bilagan anger inga mått; måtten är uppmätta på bilagans ritning i storlek M",
    "  (kepsen: brodyrens standardyta). Bekräfta mot leverantörens mall.",
    "",
    "KLUBBMÄRKET",
    `  Källa: ${club.source.from}`,
    `  ${set.quality.note}`,
    "",
    "WORDMARKET",
    `  ${FONT_CHECK.text}`,
    "",
    "KULÖRER",
    ...inks.map((i) => `  ${i.hex}  ${i.pantone.padEnd(18)} CMYK ${i.cmyk.join("/").padEnd(14)} ${i.source === "profil" ? inkSource(club, i.source).toLowerCase() : "förslag – bekräftas av klubben"}${i.note ? `\n      ! ${i.note}` : ""}`),
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

async function build(id: string, club: GrasrotClub): Promise<{ data: Buffer; failed: string[] }> {
  const zip = new JSZip();
  const root = zip.folder(`${id}-grasrot-360`)!;
  const date = swedish();
  const failed: string[] = [];
  /** Lägger filen i paketet; går den inte att bygga listas den i LASMIG.txt i stället. */
  const add = async (name: string, make: () => Promise<Buffer | string | null | undefined>) => {
    try {
      const data = await make();
      if (data) root.file(name, data, { date });
      else failed.push(name);
    } catch (err) {
      console.error("[grasrot] paketfil", id, name, err);
      failed.push(name);
    }
  };

  const inks = await clubInks(id);
  for (const f of FILE_SET)
    await add(`${f.artwork === "klubbmarke" ? "01" : "02"}-${f.artwork}/${FOLDER[f.mode ?? "rgb"]}/${id}-${fileName(f.artwork, f.variant, f.format, f.mode)}`, async () => (await printFile(id, f.artwork, f))?.data);
  await add("03-kulorer/kulorer.csv", async () => inkCsv(club, inks));
  await add(`03-kulorer/${id}-kulorer.ase`, async () => swatches(inks));

  for (const [i, p] of GRASROT_PRODUCTS.entries()) {
    for (const c of p.colors) await add(`04-webbshop/${nn(i)}-${p.id}/${p.id}-${c.id}.jpg`, () => stored(id, `mockup-${p.id}-${c.id}.jpg`, () => productMockup(id, p, c)));
    const dir = `07-produktion/${nn(i)}-${p.id}`;
    await add(`${dir}/${p.id}-produktionsblad.pdf`, () => stored(id, `produktionsblad-${p.id}.pdf`, () => productionSheet(id, p)));
    for (const f of await productionFiles(id, p)) await add(`${dir}/${f.name}`, () => stored(id, f.name, async () => (await buildProductionFile(id, f))?.data ?? null));
  }
  await add("07-produktion/produktionsorder.csv", () => productionOrder(id));

  await add(`05-herobild/${id}-herobild.jpg`, async () => (await heroImage(id))?.jpg);
  for (const format of Object.keys(SOCIAL_FORMATS) as SocialFormat[])
    for (const slide of SOCIAL_SLIDES)
      await add(`06-sociala-medier/${SOCIAL_DIR[format]}/${slide}.jpg`, () => stored(id, `social-${format}-${slide}.jpg`, async () => (await socialSlides(id, format, slide))?.[0]?.jpg ?? null));
  await add("06-sociala-medier/bildtexter.txt", async () => captionText(club));

  root.file("LASMIG.txt", await readme(club, inks, failed), { date });
  return { data: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }), failed };
}

export async function grasrotPackage(id: string): Promise<{ data: Buffer; name: string } | null> {
  const club = grasrotClub(id);
  if (!club || !emblemSet(id)) return null;
  let complete = true;
  const data = await stored(
    id,
    "paket.zip",
    async () => {
      const made = await build(id, club);
      complete = !made.failed.length;
      return made.data;
    },
    () => complete,
  );
  return data && { data, name: `${id}-grasrot-360.zip` };
}
