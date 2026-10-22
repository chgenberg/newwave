import sharp from "sharp";
import { htmlToPdf } from "@/lib/pdf";
import type { ColorMode } from "@/lib/newwave/vector/write";
import { grasrotClub } from "./clubs";
import { inkFor } from "./colors";
import { type Check, type FileFormat, PNG_DPI, printChecks, printData } from "./files";
import { colorsOf } from "@/lib/newwave/vector/svg";
import { placementArt, productMockup } from "./mockup";
import { GRASROT_PRODUCTS, type GrasrotProduct, METHOD_TEXT, type Method, type Placement, type ProductColor } from "./products";

/**
 * Produktionsunderlaget till leverantörerna: för varje produkt och placering filerna i det format metoden kräver, i exakt
 * storlek, ett produktionsblad med mockups, mått, kulörer och förhandskontroll, och en orderlista över allt.
 */

/** Vad varje metod tar emot: vektor med dekorfärger för schabloner, tråd och gravyr, pixlar i 300 dpi för transfer och digitaltryck. */
const FORMATS_FOR: Record<Method, { format: FileFormat; mode?: ColorMode }[]> = {
  screentryck: [{ format: "pdf", mode: "spot" }, { format: "eps", mode: "spot" }],
  transfer: [{ format: "pdf", mode: "spot" }, { format: "png" }],
  brodyr: [{ format: "pdf", mode: "spot" }, { format: "eps", mode: "spot" }],
  digitaltryck: [{ format: "pdf", mode: "cmyk" }, { format: "png" }],
  lasergravyr: [{ format: "pdf", mode: "spot" }, { format: "eps", mode: "spot" }],
  vavt: [{ format: "pdf", mode: "spot" }, { format: "eps", mode: "spot" }, { format: "png" }],
};

const VARIANT_USE: Record<Method, string> = {
  screentryck: "schablon per färg",
  transfer: "tryckt transfer, vitt underlag på mörka plagg",
  brodyr: "underlag för punchning; tråden matchas mot Pantone-koden",
  digitaltryck: "fyrfärg",
  lasergravyr: "svart = graveras, stålet tas fram",
  vavt: "garnfärger enligt Pantone",
};

export type Job = { product: GrasrotProduct; placement: Placement; colors: ProductColor[]; widthMm: number; heightMm: number };
export type ProductionFile = { name: string; job: Job; format: FileFormat; mode?: ColorMode };

/** Placeringarna som behövs för produktens alla färger, med motivets storlek i mm. */
export async function productionJobs(id: string, product: GrasrotProduct): Promise<Job[]> {
  const jobs = new Map<string, Job>();
  for (const color of product.colors) {
    const placement = product.design(color);
    const key = `${placement.zone}-${placement.art}-${placement.variant}-${placement.method}`;
    const job = jobs.get(key);
    if (job) {
      job.colors.push(color);
      continue;
    }
    const flat = await placementArt(id, placement);
    if (!flat) continue;
    const [bw, bh] = placement.box;
    const aspect = flat.box.w / flat.box.h;
    const widthMm = Math.round(Math.min(bw, bh * aspect));
    jobs.set(key, { product, placement, colors: [color], widthMm, heightMm: Math.round(widthMm / aspect) });
  }
  return [...jobs.values()];
}

const nameOf = (job: Job, format: FileFormat, mode?: ColorMode) =>
  `${job.product.id}-${job.placement.zone}-${job.placement.art}-${job.placement.variant}${mode ? `-${mode}` : ""}.${format}`;

const filesOf = (job: Job): ProductionFile[] => FORMATS_FOR[job.placement.method].map(({ format, mode }) => ({ name: nameOf(job, format, mode), job, format, mode }));

export async function productionFiles(id: string, product: GrasrotProduct): Promise<ProductionFile[]> {
  return (await productionJobs(id, product)).flatMap(filesOf);
}

export async function buildProductionFile(id: string, f: ProductionFile) {
  const { placement } = f.job;
  return printData(id, placement.art, { variant: placement.variant, format: f.format, mode: f.mode, widthMm: f.job.widthMm });
}

/** Leta upp en produktionsfil på namnet, för nedladdning en och en. */
export async function findProductionFile(id: string, name: string) {
  for (const p of GRASROT_PRODUCTS) if (name.startsWith(`${p.id}-`)) return (await productionFiles(id, p)).find((f) => f.name === name) ?? null;
  return null;
}

async function inksOf(id: string, job: Job) {
  const club = grasrotClub(id)!;
  if (job.placement.method === "lasergravyr") return [{ name: "Gravyr", detail: "ingen färg – lacken bränns bort" }];
  if (job.placement.variant === "negativ") return [{ name: "White", detail: "vit dekorfärg" }];
  if (job.placement.variant === "solid") return [{ name: "PANTONE Black C", detail: "CMYK 0/0/0/100" }];
  const flat = await placementArt(id, job.placement);
  const seen = new Map<string, string>();
  for (const hex of flat ? colorsOf(flat) : []) {
    const ink = inkFor(club, hex);
    if (!seen.has(ink.pantone)) seen.set(ink.pantone, `${hex} · CMYK ${ink.cmyk.join("/")}${ink.source === "förslag" ? " · förslag" : ""}`);
  }
  return [...seen].map(([name, detail]) => ({ name, detail }));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Produktionsbladet som A4-PDF. */
export async function productionSheet(id: string, product: GrasrotProduct): Promise<Buffer | null> {
  const club = grasrotClub(id);
  if (!club) return null;
  const jobs = await productionJobs(id, product);
  const mockups = await Promise.all(
    product.colors.map(async (c) => {
      const jpg = await productMockup(id, product, c, 80);
      return jpg ? { c, src: `data:image/jpeg;base64,${(await sharp(jpg).resize(360).jpeg({ quality: 78 }).toBuffer()).toString("base64")}` } : null;
    }),
  );
  const rows = await Promise.all(
    jobs.map(async (job) => {
      const inks = await inksOf(id, job);
      const checks: Check[] = ((await printChecks(id, job.placement.art, job.placement.variant)) ?? []).filter((c) => c.level !== "ok");
      return { job, inks, checks, files: filesOf(job).map((f) => f.name) };
    }),
  );
  const zone = (zid: string) => product.zones.find((z) => z.id === zid)!;
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 14mm 14mm 16mm; }
body { font-family: "Liberation Sans", Helvetica, Arial, sans-serif; color: #151515; font-size: 9.5pt; line-height: 1.4; }
h1 { font-size: 17pt; margin: 0; } h2 { font-size: 11pt; margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
.muted { color: #666; } .kicker { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #666; }
table { width: 100%; border-collapse: collapse; } td, th { text-align: left; vertical-align: top; padding: 4px 6px 4px 0; border-bottom: 1px solid #eee; }
th { font-size: 8pt; color: #666; font-weight: normal; text-transform: uppercase; letter-spacing: .05em; }
.grid { display: flex; flex-wrap: wrap; gap: 6px; } .grid figure { margin: 0; width: 86px; } .grid img { width: 86px; height: 86px; border: 1px solid #eee; border-radius: 4px; }
figcaption { font-size: 7.5pt; color: #444; margin-top: 2px; } code { font-size: 8pt; }
.place td:first-child { width: 18%; } .place td:nth-child(3) { width: 21%; } .place td:last-child { width: 34%; } .place code { font-size: 7pt; white-space: nowrap; } .stopp { color: #B42318; } .varning { color: #8A5A00; }
</style></head><body>
<p class="kicker">Gräsrot 360 · Produktionsunderlag · ${new Date().toISOString().slice(0, 10)}</p>
<h1>${esc(club.name)} – ${esc(product.name)}</h1>
<p class="muted">${esc(product.supplier)}${product.article ? ` · art.nr ${esc(product.article)}` : ""}${product.url ? ` · ${esc(product.url)}` : ""}</p>

<h2>Mockups per färg</h2>
<div class="grid">${mockups
    .filter((m) => m)
    .map((m) => `<figure><img src="${m!.src}"><figcaption>${esc(m!.c.name)}</figcaption></figure>`)
    .join("")}</div>

<h2>Placeringar</h2>
<table class="place"><tr><th>Färger</th><th>Placering</th><th>Metod</th><th>Motiv</th><th>Storlek</th><th>Filer</th></tr>
${rows
  .map(
    ({ job, files: names }) =>
      `<tr><td>${job.colors.map((c) => esc(c.name)).join(", ")}</td><td>${esc(zone(job.placement.zone).label)}</td><td>${METHOD_TEXT[job.placement.method]}<br><span class="muted">${VARIANT_USE[job.placement.method]}</span></td><td>${job.placement.art === "halsduk" ? "Halsduksdesign" : job.placement.art === "ordmarke" ? "Ordmärke" : "Klubbmärke"}, ${job.placement.variant}</td><td>${job.widthMm} × ${job.heightMm} mm${names.some((n) => n.endsWith(".png")) ? `<br><span class="muted">PNG ${PNG_DPI} dpi</span>` : ""}</td><td>${names.map((n) => `<code>${esc(n)}</code>`).join("<br>")}</td></tr>`,
  )
  .join("")}
</table>

<h2>Kulörer</h2>
<table><tr><th>Placering</th><th>Färg</th><th>Värden</th></tr>
${rows.flatMap(({ job, inks }) => inks.map((i) => `<tr><td>${esc(zone(job.placement.zone).label)} · ${job.placement.variant}</td><td>${esc(i.name)}</td><td class="muted">${esc(i.detail)}</td></tr>`)).join("")}
</table>
${product.id === "keps" ? `<p class="muted">Brodyr: tråden matchas mot Pantone-koderna i brodyrens trådtabell. Detaljer under 1 mm och text under 5 mm höjd förenklas vid punchningen.</p>` : ""}

<h2>Tryckytor enligt Bilaga 2</h2>
<table><tr><th>Yta</th><th>Max storlek</th><th>Tekniker</th></tr>
${product.zones.map((z) => `<tr><td>${esc(z.label)}</td><td>${z.widthMm} × ${z.heightMm} mm</td><td>${z.techniques.map((m) => METHOD_TEXT[m]).join(", ")}</td></tr>`).join("")}
</table>
<p class="muted">Bilagan visar ytorna men inte måtten. Måtten är uppmätta på bilagans ritning i storlek M (kepsen: brodyrens standardyta) och bekräftas mot leverantörens mall före produktion.</p>

<h2>Förhandskontroll</h2>
${
  rows.some((r) => r.checks.length)
    ? `<ul>${[...new Map(rows.flatMap((r) => r.checks).map((c) => [c.text, c])).values()].map((c) => `<li class="${c.level}">${esc(c.text)}</li>`).join("")}</ul>`
    : "<p>Inga anmärkningar.</p>"
}
<p class="muted">Alla vektorfiler har texten konverterad till kurvor och är i exakt tryckstorlek. Dekorfärgsfilerna har varje färg som egen separation.</p>
</body></html>`;
  return htmlToPdf(html);
}

/** Orderlistan över alla produkter och placeringar, semikolonseparerad för Excel. */
export async function productionOrder(id: string): Promise<string> {
  const lines = [["Produkt", "Leverantör", "Artikel", "Färger", "Placering", "Metod", "Motiv", "Variant", "Bredd mm", "Höjd mm", "Kulörer", "Filer"].join(";")];
  for (const p of GRASROT_PRODUCTS) {
    for (const job of await productionJobs(id, p)) {
      const inks = (await inksOf(id, job)).map((i) => i.name).join(", ");
      const zone = p.zones.find((z) => z.id === job.placement.zone)!;
      lines.push(
        [p.name, p.supplier, p.article ?? "", job.colors.map((c) => c.name).join(", "), zone.label, METHOD_TEXT[job.placement.method], job.placement.art, job.placement.variant, job.widthMm, job.heightMm, inks, filesOf(job).map((f) => f.name).join(" ")]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      );
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
