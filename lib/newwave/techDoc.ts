import { htmlToPdf } from "@/lib/pdf";
import { PAYLOADS } from "./hub";
import { FORMATS } from "./hubFormats";
import { esc } from "./quoteDoc";
import { SITE } from "./site";
import { API_POINTS, AWS_REGION, FAQ, FLOW, LAYERS, type Point, PRINCIPLES, PRINT_CHECKS, PROMISES, RUN, TECH_LEAD, TECH_TITLE } from "./tech";

/** Den tekniska översikten på två A4-sidor, ur samma innehåll som sidan /newwave/teknik. */

const PROD = '<span class="prod">I produktion</span>';
const cards = (list: readonly Point[], cls = "") => `<div class="cards ${cls}">${list.map((p) => `<div class="card"><p class="ct">${esc(p.title)}${p.prod ? PROD : ""}</p><p class="cx">${esc(p.text)}</p></div>`).join("")}</div>`;

function html() {
  const flow = FLOW.map((s, i) => `<div class="step"><span class="n">${i + 1}</span><p class="ct">${esc(s.title)}${s.prod ? PROD : ""}</p><p class="cx">${esc(s.text)}</p></div>`).join("");
  const payloads = PAYLOADS.map((p) => `<li><b>${esc(p.label)}</b> – ${esc(p.description)}</li>`).join("");
  const formats = FORMATS.map((f) => `<tr><td class="b">${esc(f.label)}</td><td class="m">${esc(f.files)}</td><td>${f.rules.map(esc).join(" · ")}</td></tr>`).join("");
  const layers = LAYERS.map((l, i) => `<div class="layer l${i}"><p class="ct">${esc(l.title)}</p><p class="cx">${l.items.map(esc).join(" · ")}</p></div>`).join('<div class="down">↓</div>');
  const run = RUN.map((r) => `<tr><td class="b">${esc(r.area)}</td><td class="mu">${esc(r.demo)}</td><td>${esc(r.prod)}</td></tr>`).join("");
  const faq = FAQ.map((f) => `<div class="card"><p class="ct">${esc(f.q)}</p><p class="cx">${esc(f.a)}</p></div>`).join("");

  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
@page{size:A4;margin:12mm 14mm 10mm}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#1e1f22;font-size:9.5px;line-height:1.45}
p{margin:0}
.top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #e4e4e1;padding-bottom:3mm}
.brand{font-size:10px;font-weight:700;letter-spacing:.18em}.ref{font-size:8px;color:#6e7076}
.k{font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#6e7076}
h1{margin:5mm 0 0;font-size:24px;line-height:1.05;letter-spacing:-.02em}
.lead{margin-top:2mm;font-size:11px;color:#3d4046;max-width:150mm}
h2{margin:5mm 0 2mm;font-size:13px;letter-spacing:-.01em;break-after:avoid}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm}.cards.two{grid-template-columns:repeat(2,1fr)}
.card,.step{background:#f4f4f2;border-radius:3mm;padding:3mm;break-inside:avoid}
.ct{font-weight:600;font-size:10px;color:#2b2d31}.cx{margin-top:.8mm;color:#6e7076}
.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm}
.step{background:#fff;border:1px solid #e4e4e1}.n{display:inline-block;width:5mm;height:5mm;border-radius:50%;background:#2b2d31;color:#fff;text-align:center;line-height:5mm;font-size:8px;font-weight:600;margin-bottom:1.5mm}
ul{margin:2mm 0 0;padding-left:4mm}li{margin:.6mm 0}
table{width:100%;border-collapse:collapse;margin-top:1mm}td{border-top:1px solid #e4e4e1;padding:1.3mm 2mm 1.3mm 0;vertical-align:top}
td.b{font-weight:600;width:30mm}td.m{font-family:ui-monospace,Menlo,monospace;font-size:8.5px;width:40mm}td.mu{color:#6e7076;width:52mm}
.layer{border:1px solid #e4e4e1;border-radius:3mm;padding:2.5mm 3mm}.l1{background:#141416;border-color:#141416}.l3{background:#1d4ed8;border-color:#1d4ed8}
.l1 .ct,.l3 .ct{color:#fff}.l1 .cx,.l3 .cx{color:rgba(255,255,255,.75)}
.down{text-align:center;color:#a3a5aa;font-size:10px;line-height:1;margin:1mm 0}
.arch{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.region{display:inline-block;margin-left:2mm;padding:.6mm 2mm;border-radius:99px;background:#f4f4f2;font-family:ui-monospace,Menlo,monospace;font-size:8px;font-weight:400}
.prod{display:inline-block;margin-left:1.5mm;padding:.3mm 1.5mm;border-radius:99px;background:#fef3c7;color:#92400e;font-size:7px;font-weight:400;vertical-align:1px}
.page2{break-before:page}
.foot{margin-top:5mm;font-size:8px;color:#6e7076}
</style></head><body>
<div class="top"><span class="brand">NEXT WAVE</span><span class="ref">Teknisk översikt · Next Wave Commerce Hub</span></div>
<p class="k" style="margin-top:5mm">För IT</p>
<h1>${esc(TECH_TITLE)}</h1>
<p class="lead">${esc(TECH_LEAD)}</p>
<div style="margin-top:4mm">${cards(PROMISES)}</div>

<h2>01 · Integrationer – ett API in i ert system</h2>
<div class="flow">${flow}</div>
<div style="margin-top:2.5mm">${cards(API_POINTS)}</div>
<ul>${payloads}</ul>

<h2>02 · Tryckfiler – filer som tryckeriet kör direkt</h2>
${cards(PRINT_CHECKS)}
<table>${formats}</table>

<div class="page2">
<h2 style="margin-top:0">03 · Arkitektur – så är plattformen byggd</h2>
<div class="arch"><div>${layers}</div>${cards(PRINCIPLES, "two")}</div>

<h2>04 · Säkerhet och drift <span class="region">AWS · ${esc(AWS_REGION)}</span></h2>
<table><tr><td class="b k">Område</td><td class="mu k">Demo i dag</td><td class="k">Produktion i AWS</td></tr>${run}</table>

<h2>05 · Frågor och svar</h2>
<div class="cards two">${faq}</div>
<p class="foot">Interaktiv version med riktigt API-anrop och filpaket: ${esc(SITE)}/newwave/teknik</p>
</div>
</body></html>`;
}

let cached: Promise<Buffer> | null = null;

export function techPdf(): Promise<Buffer> {
  cached ??= htmlToPdf(html()).catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
