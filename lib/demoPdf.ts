import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright-core";
import { type BoothFormat, sek } from "./demoCatalog";
import type { PricedLine } from "./demoOffer";
import { type EventId, eventOf } from "./demoEvents";
import { delivery, deliveryText, fmtDay, visitorsLabel } from "./demoPackages";
import { loadFile } from "./store";

export type QuoteDoc = {
  reference: string;
  createdAt: string;
  brand: { name: string; site: string };
  /** Swedish label; `eventId` is missing on quotes made before the event choice existed. */
  event: string;
  eventId?: EventId;
  eventDate: string;
  visitors: string;
  boothUrl?: string;
  format?: BoothFormat;
  contact: { name: string; email: string; company: string };
  lines: PricedLine[];
  totalSek: number;
};

export const TRUST = ["Korrektur innan tryck", "Fast leveransdatum", "Ändra fritt fram till korrektur"];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const qty = (n: number) => n.toLocaleString("sv-SE").replace(/\u00a0/g, " ");

async function boothData(url?: string) {
  if (!url) return null;
  if (url.startsWith("/api/v1/files/")) {
    const f = await loadFile(url.slice("/api/v1/files/".length));
    return f ? `data:${f.type};base64,${f.data.toString("base64")}` : null;
  }
  const buf = await readFile(path.join(process.cwd(), "public", url)).catch(() => null);
  return buf ? `data:image/jpeg;base64,${buf.toString("base64")}` : null;
}

export async function quoteHtml(q: QuoteDoc) {
  const booth = await boothData(q.boothUrl);
  const ev = eventOf(q.eventId ?? q.event);
  const d = delivery(q.eventDate, q.lines.map((l) => l.id), new Date(q.createdAt), ev.id);
  const rows: [string, string][] = [
    ["Kund", q.contact.company || q.brand.name],
    ["Typ", ev.label],
    ...(q.eventDate ? ([[ev.pdfDateLabel, fmtDay(q.eventDate)]] as [string, string][]) : []),
    ...(q.visitors ? ([[ev.people.replace(/^./, (c) => c.toUpperCase()), `ca ${visitorsLabel(q.visitors, ev.id).toLowerCase()}`]] as [string, string][]) : []),
    ["Offertdatum", new Date(q.createdAt).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" })],
    ["Kontakt", [q.contact.name, q.contact.email].filter(Boolean).join(" · ")],
  ];
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#1d1d1f}
.page{width:210mm;min-height:297mm;padding:14mm;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:flex-start;font-size:9px;color:#86868b}
.brand{font-size:15px;font-weight:600;letter-spacing:.16em;color:#1d1d1f}
.eyebrow{margin:8mm 0 0;font-size:8px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#6e6e73}
h1{margin:2mm 0 0;font-size:24px;line-height:1.05;letter-spacing:-.01em}
.grid{margin-top:6mm;display:grid;grid-template-columns:${q.format === "4:3" ? "70mm" : "62mm"} 1fr;gap:7mm;align-items:start}
.info{background:#f5f5f7;border-radius:10px;padding:3.5mm}.info div{margin:0 0 2.2mm}.info div:last-child{margin:0}
.k{font-size:8px;color:#86868b}.v{font-size:10px;font-weight:500}
.booth{width:100%;aspect-ratio:${q.format === "4:3" ? "4/3" : "3/2"};object-fit:cover;border-radius:10px;background:#f5f5f7}
.note{margin-top:5mm;padding:3mm 3.5mm;border-radius:10px;font-size:10px;background:${d?.late ? "#fff4e5" : "#f0f7f1"}}
table{margin-top:5mm;width:100%;border-collapse:collapse;font-size:9px}th{text-align:left;font-weight:500;font-size:8px;color:#6e6e73;border-bottom:1px solid #0000001a;padding:1.5mm 0}
td{padding:1.6mm 0;border-bottom:1px solid #0000000f}.r{text-align:right;font-variant-numeric:tabular-nums}
.total{margin-top:3mm;text-align:right;font-size:12px;font-weight:600}.total span{font-weight:400;color:#6e6e73}
.trust{margin-top:6mm;display:flex;gap:6mm;font-size:9px;font-weight:500}.trust span:before{content:"✓";margin-right:1.5mm;color:#1e8e3e}
.foot{margin-top:auto;padding-top:5mm;font-size:7.5px;line-height:1.5;color:#86868b}
</style></head><body><div class="page">
<div class="top"><span class="brand">${esc(q.brand.name.toUpperCase())}</span><span>Offertnummer #${esc(q.reference)}</span></div>
<p class="eyebrow">Offertförslag</p><h1>${esc(ev.title)} med produkter</h1>
<div class="grid"><div class="info">${rows.map(([k, v]) => `<div><p class="k" style="margin:0">${esc(k)}</p><p class="v" style="margin:0">${esc(v)}</p></div>`).join("")}</div>
${booth ? `<img class="booth" src="${booth}" alt="${esc(ev.title)}">` : `<div class="booth"></div>`}</div>
${d ? `<div class="note">${esc(deliveryText(d))}</div>` : ""}
<table><thead><tr><th>Produkt</th><th>Specifikation</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r">Summa</th></tr></thead><tbody>
${q.lines.map((l) => `<tr><td><b style="font-weight:500">${esc(l.name)}</b></td><td style="color:#424245">${esc(l.spec)}</td><td class="r">${qty(l.qty)} ${esc(l.unit)}</td><td class="r">${esc(sek(l.unitSek))}</td><td class="r"><b style="font-weight:500">${esc(sek(l.totalSek))}</b></td></tr>`).join("")}
</tbody></table>
<p class="total">Totalpris <span>(exkl. moms)</span>&nbsp;&nbsp; ${esc(sek(q.totalSek))}</p>
<div class="trust">${TRUST.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
<p class="foot">Priserna är riktpriser och kan variera beroende på antal, design och leveranstid. Moms tillkommer. Offerten är giltig i 30 dagar. Er säljare återkommer inom 1 arbetsdag med korrektur och bekräftat leveransdatum.</p>
</div></body></html>`;
}

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const executablePath = process.env.CHROMIUM_PATH;
  return executablePath ? chromium.launch({ executablePath, args }) : chromium.launch({ channel: "chrome", args });
}

export async function quotePdf(q: QuoteDoc): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(await quoteHtml(q), { waitUntil: "load", timeout: 15_000 });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
