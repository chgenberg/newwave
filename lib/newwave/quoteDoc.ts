import sharp from "sharp";
import { htmlToPdf } from "@/lib/pdf";
import { readAsset } from "./asset";
import { nwProduct } from "./catalog";
import { colorName } from "./colors";
import { designSummary } from "./marking";
import { logoFor, type Quote, type QuoteLine, type Reseller, sek, shopUrl } from "./reseller";
import { mockupJpeg } from "./serverMockup";
import { SITE } from "./site";
import { withDemo } from "./workspaceId";

/** Offerten som dokument utanför sajten: produktbilderna med kundens design, länkarna till kundens svar och PDF:en. */

const BG = "#F4F4F2";

/** Radens bild som JPEG: designstudions bild, annars produktfotot med loggan där den trycks – samma som på offertsidan. */
async function lineImage(line: QuoteLine, size = 480): Promise<Buffer> {
  const preview = line.preview ? await readAsset(line.preview) : null;
  if (preview) return sharp(preview).flatten({ background: BG }).resize(size, size, { fit: "cover" }).jpeg({ quality: 84 }).toBuffer();
  const p = nwProduct(line.productId);
  if (!p) return sharp({ create: { width: size, height: size, channels: 3, background: BG } }).jpeg({ quality: 84 }).toBuffer();
  const src = logoFor(p, { logo: line.design.logo ?? line.logo, logoDark: line.design.logo ? line.design.logoDark : line.logoDark });
  const mock = src ? await mockupJpeg(p, src, size, line.design.zone) : null;
  if (mock) return mock;
  const photo = await readAsset(p.photo);
  return (photo ? sharp(photo).resize(size, size, { fit: "fill" }) : sharp({ create: { width: size, height: size, channels: 3, background: BG } })).jpeg({ quality: 84 }).toBuffer();
}

export type QuoteArt = { logo: Buffer | null; lines: Buffer[] };

export async function quoteArt(q: Pick<Quote, "lines">, r: Pick<Reseller, "logo">): Promise<QuoteArt> {
  const raw = r.logo ? await readAsset(r.logo) : null;
  const [logo, lines] = await Promise.all([
    raw ? sharp(raw).resize({ height: 96, withoutEnlargement: true }).png().toBuffer().catch(() => null) : null,
    Promise.all(q.lines.map((l) => lineImage(l).catch(() => sharp({ create: { width: 8, height: 8, channels: 3, background: BG } }).jpeg().toBuffer()))),
  ]);
  return { logo, lines };
}

export const dataUri = (buf: Buffer, type: "png" | "jpeg") => `data:image/${type};base64,${buf.toString("base64")}`;

/** Kundens offertsida, och samma sida med svaret förvalt. `?demo=` tar mottagaren in i avsändarens demomiljö. */
export type QuoteLinks = { page: string; accept: string; decline: string };

export function quoteLinks(r: Pick<Reseller, "slug">, token: string, ws: string | null): QuoteLinks {
  const page = withDemo(`${SITE}${shopUrl(r)}/offert/${token}`, ws);
  const answer = (svar: string) => `${page}${page.includes("?") ? "&" : "?"}svar=${svar}#svar`;
  return { page, accept: answer("godkann"), decline: answer("neka") };
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Det kunden ska se om en rad, i samma ordning som på offertsidan. */
export function lineFacts(l: QuoteLine) {
  const p = nwProduct(l.productId);
  return {
    spec: [colorName(l.color), p ? designSummary(p, l.design) : ""].filter(Boolean).join(" · "),
    sizes: Object.entries(l.sizes)
      .map(([s, n]) => (s === "One size" ? `${n} st` : `${s}: ${n}`))
      .join(" · "),
    price: `${l.qty} st × ${sek(l.unit)}${l.setup ? ` + tryckstart ${sek(l.setup)}` : ""}`,
  };
}

export const shopName = (r: Reseller) => r.texts.shopName || r.name;

export const contactLine = (r: Reseller) => [r.texts.address, r.texts.phone, r.texts.email].filter(Boolean).join(" · ");

const longDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" });

function pdfHtml(q: Quote, r: Reseller, links: QuoteLinks, art: QuoteArt) {
  const shop = shopName(r);
  const info: [string, string][] = [
    ["Kund", q.company.name],
    ["Kontakt", [q.company.contact, q.company.email, q.company.phone].filter(Boolean).join(" · ")],
    ["Offertdatum", longDay(q.events.findLast((e) => e.who === r.name)?.at ?? q.createdAt)],
    ...(q.validUntil ? ([["Giltig till", longDay(q.validUntil)]] as [string, string][]) : []),
    ...(q.needBy ? ([["Önskad leverans", longDay(q.needBy)]] as [string, string][]) : []),
  ];
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
@page{size:A4;margin:12mm 0}@page:first{margin-top:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#1d1d1f}
.page{width:210mm;padding:14mm}
.top{display:flex;justify-content:space-between;align-items:center;gap:8mm}.top img{max-height:11mm;max-width:70mm}
.brand{font-size:16px;font-weight:700;color:${esc(r.theme.primary)}}.ref{font-size:9px;color:#86868b;text-align:right}
.eyebrow{margin:9mm 0 0;font-size:8px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#6e6e73}
h1{margin:2mm 0 0;font-size:24px;line-height:1.1;letter-spacing:-.01em}
.info{margin-top:6mm;display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 6mm;background:#f5f5f7;border-radius:10px;padding:4mm}
.k{margin:0;font-size:8px;color:#86868b}.v{margin:.5mm 0 0;font-size:10px;font-weight:500}
.reply{margin:6mm 0 0;font-size:11px;line-height:1.5;white-space:pre-line}
.line{display:flex;gap:5mm;padding:4mm 0;border-bottom:1px solid #0000000f;break-inside:avoid}
.line img{width:30mm;height:30mm;border-radius:8px;object-fit:cover;flex-shrink:0}
.body{flex:1;min-width:0}.name{margin:0;font-size:12px;font-weight:600}.spec{margin:1mm 0 0;font-size:9px;color:#6e6e73}
.sizes{margin:2mm 0 0;font-size:9px}.price{margin:1.5mm 0 0;font-size:9px;color:#6e6e73}.sum{font-size:12px;font-weight:600;white-space:nowrap}
.lines{margin-top:6mm;border-top:1px solid #0000001a}
.totals{margin-top:4mm;margin-left:auto;width:75mm;font-size:10px;break-inside:avoid}.totals p{display:flex;justify-content:space-between;margin:1mm 0}
.totals .big{font-size:14px;font-weight:700;border-top:1px solid #1d1d1f;padding-top:2mm;margin-top:2mm}
.answer{margin-top:8mm;padding:4mm 5mm;border-radius:10px;background:${esc(r.theme.background)};font-size:10px;line-height:1.5;break-inside:avoid}
.answer a{color:#1d1d1f;font-weight:600;word-break:break-all}
.foot{margin-top:8mm;font-size:8px;line-height:1.6;color:#86868b}
</style></head><body><div class="page">
<div class="top">${art.logo ? `<img src="${dataUri(art.logo, "png")}" alt="${esc(shop)}">` : `<span class="brand">${esc(shop)}</span>`}<span class="ref">Offert ${esc(q.id)}</span></div>
<p class="eyebrow">Offert</p><h1>${esc(q.company.name)}</h1>
<div class="info">${info.map(([k, v]) => `<div><p class="k">${esc(k)}</p><p class="v">${esc(v)}</p></div>`).join("")}</div>
${q.reply ? `<p class="reply">${esc(q.reply)}</p>` : ""}
<div class="lines">${q.lines
    .map((l, i) => {
      const f = lineFacts(l);
      return `<div class="line"><img src="${dataUri(art.lines[i], "jpeg")}" alt="${esc(l.name)}"><div class="body"><p class="name">${esc(l.name)}</p><p class="spec">${esc(f.spec)}</p><p class="sizes">${esc(f.sizes)}</p><p class="price">${esc(f.price)}</p></div><span class="sum">${esc(sek(l.total))}</span></div>`;
    })
    .join("")}</div>
<div class="totals"><p><span>Summa exkl. moms</span><span>${esc(sek(q.totalSek))}</span></p><p><span>Moms 25 %</span><span>${esc(sek(q.totalSek * 0.25))}</span></p><p class="big"><span>Att betala</span><span>${esc(sek(q.totalSek * 1.25))}</span></p></div>
<div class="answer">Godkänn offerten eller tacka nej på er offertsida. När ni godkänner går ordern direkt till tryck, och ni får ett provtryck att godkänna först.<br><a href="${esc(links.page)}">${esc(links.page)}</a></div>
<p class="foot">${esc(shop)}${contactLine(r) ? ` · ${esc(contactLine(r))}` : ""}<br>Priserna är exkl. moms om inget annat anges.${q.validUntil ? ` Offerten gäller till ${esc(longDay(q.validUntil))}.` : ""} Produkterna trycks och levereras av New Wave.</p>
</div></body></html>`;
}

export const quotePdf = (q: Quote, r: Reseller, links: QuoteLinks, art: QuoteArt) => htmlToPdf(pdfHtml(q, r, links, art));
