// Bygger ett lokalt varumärkespaket för IFK Göteborg av de insamlade logofilerna.
// Kräver poppler (pdftocairo). Kör: node scripts/build-brand-kit.mjs
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import potrace from "potrace";

const { Potrace } = potrace;

const ROOT = path.join(process.cwd(), ".data", "brand", "ifk-goteborg");
const SRC = path.join(ROOT, "logotyper", "uploads", "2018", "10");
const KIT = path.join(ROOT, "kit");
const tmp = await mkdtemp(path.join(tmpdir(), "ifk-kit-"));
await mkdir(KIT, { recursive: true });

async function aiToSvg(name) {
  const pdf = path.join(tmp, `${name}.pdf`);
  const svg = path.join(tmp, `${name}.svg`);
  await copyFile(path.join(SRC, `${name}.ai`), pdf);
  execFileSync("pdftocairo", ["-svg", pdf, svg]);
  return readFile(svg, "utf8");
}

async function tighten(svg) {
  const [, , vw, vh] = svg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
  const density = 300;
  const { info } = await sharp(Buffer.from(svg), { density }).trim().toBuffer({ resolveWithObject: true });
  const rendered = await sharp(Buffer.from(svg), { density }).metadata();
  const scale = vw / rendered.width;
  const x = -info.trimOffsetLeft * scale;
  const y = -info.trimOffsetTop * scale;
  const w = info.width * scale;
  const h = info.height * scale;
  const pad = w * 0.01;
  const box = `${(x - pad).toFixed(2)} ${(y - pad).toFixed(2)} ${(w + pad * 2).toFixed(2)} ${(h + pad * 2).toFixed(2)}`;
  void vh;
  return svg
    .replace(/width="[^"]+" height="[^"]+" viewBox="[^"]+"/, `width="${(w + pad * 2).toFixed(2)}" height="${(h + pad * 2).toFixed(2)}" viewBox="${box}"`);
}

const color = await tighten(await aiToSvg("ifkgoteborg_logo_CMYK"));
const blackRaw = await aiToSvg("ifkgoteborg_logo_black");
const black = await tighten(blackRaw);
async function knockoutWhite(blackSvg) {
  const ink = await sharp(Buffer.from(blackSvg), { density: 600 })
    .resize({ height: 2000 })
    .flatten({ background: "#FFFFFF" })
    .greyscale()
    .threshold(128)
    .png()
    .toBuffer();
  const svg = await new Promise((resolve, reject) => {
    const p = new Potrace({ turdSize: 4, optTolerance: 0.2, threshold: 128, blackOnWhite: true });
    p.loadImage(ink, (err) => (err ? reject(err) : resolve(p.getSVG().replace(/fill="black"/g, 'fill="#FFFFFF"'))));
  });
  return svg;
}
const white = await knockoutWhite(black);

const variants = { "skold-farg": color, "skold-svart": black, "skold-vit": white };
for (const [name, svg] of Object.entries(variants)) {
  await writeFile(path.join(KIT, `${name}.svg`), svg);
  await sharp(Buffer.from(svg), { density: 600 }).resize({ height: 2000 }).png().toFile(path.join(KIT, `${name}.png`));
}

const meta = await sharp(path.join(KIT, "skold-farg.png")).metadata();
const kit = {
  club: "IFK Göteborg",
  tagline: "Hela stadens lag",
  crest: {
    aspect: meta.width / meta.height,
    variants: {
      farg: { svg: "skold-farg.svg", png: "skold-farg.png", use: "Standard på vita och ljusa plagg samt i digitala kanaler" },
      svart: { svg: "skold-svart.svg", png: "skold-svart.png", use: "Tryck i en färg på ljusa plagg" },
      vit: { svg: "skold-vit.svg", png: "skold-vit.png", use: "Tryck i en färg på mörka plagg" },
    },
    colors: { guld: "#FBC323", sköldblå: "#197BC4", vit: "#FFFFFF" },
  },
  colors: { primary: "#234B9A", primaryDark: "#1A3770", crestBlue: "#197BC4", gold: "#FBC323", white: "#FFFFFF", black: "#0A0A0A" },
  fonts: { brand: "Akkurat / Akkurat Black (licensierat, ej nedladdat)", web: "Source Sans Pro" },
  source: "https://ifkgoteborg.se – insamlat för lokal demo",
};
await writeFile(path.join(KIT, "kit.json"), JSON.stringify(kit, null, 2));
console.log("Varumärkespaket klart:", Object.keys(variants).join(", "), `aspect ${kit.crest.aspect.toFixed(3)}`);
