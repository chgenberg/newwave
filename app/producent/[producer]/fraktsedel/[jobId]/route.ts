import { type NextRequest, NextResponse } from "next/server";
import { loginPath, producerRequestOk } from "@/components/poc/producer/access";
import { addressLines, isCancelled, queueJob } from "@/components/poc/producer/data";
import { isProducer, PRODUCER_NAME } from "@/lib/poc/orders";

type Ctx = { params: Promise<{ producer: string; jobId: string }> };

/**
 * Fraktsedeln för ett jobb, att skriva ut och sätta på paketet: mottagaren stort, leveranssättet, ordernumren och
 * innehållet. En fristående sida utan butikens ramar, så att utskriften blir ren (och inte stoppas av kopieringsskyddet
 * som resten av sajten har i produktion).
 */

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const day = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" });

export async function GET(req: NextRequest, ctx: Ctx) {
  const { producer, jobId } = await ctx.params;
  if (!isProducer(producer)) return new NextResponse("Finns inte.", { status: 404 });
  if (!(await producerRequestOk(req, producer))) return NextResponse.redirect(new URL(loginPath(producer, req.nextUrl.pathname), req.url), 303);
  const job = await queueJob(producer, jobId);
  if (!job) return new NextResponse("Jobbet finns inte.", { status: 404 });

  const c = job.customer;
  const [name, ...address] = addressLines(job);
  const shipping = job.order.shipping?.label ?? "";
  const contents = job.lines.map((l) => `<li><b>${l.qty} ×</b> ${esc(l.title)}${l.size ? ` · ${esc(l.size)}` : ""}</li>`).join("");
  const meta: [string, string][] = [
    ["Order", job.orderNumber],
    ...(job.order.erpRef ? ([["Crafts order", job.order.erpRef]] as [string, string][]) : []),
    ["Klubb", job.clubName],
    ["Datum", day.format(new Date(job.createdAt))],
    ...(job.tracking ? ([["Spårningsnummer", job.tracking]] as [string, string][]) : []),
  ];

  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fraktsedel ${esc(job.orderNumber)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#F2F2F2;color:#111;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  .bar{max-width:520px;margin:24px auto 0;padding:0 16px;display:flex;gap:8px;align-items:center;justify-content:space-between}
  .bar p{margin:0;color:#555;font-size:13px}
  button{height:36px;padding:0 14px;border:0;border-radius:6px;background:#111;color:#fff;font:600 14px inherit;font-family:inherit;cursor:pointer}
  .label{max-width:520px;margin:12px auto 40px;background:#fff;border:2px solid #111;border-radius:4px}
  .row{padding:14px 18px;border-bottom:1px solid #111}
  .row:last-child{border-bottom:0}
  .k{margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#555}
  .to{font-size:22px;line-height:1.3}
  .to b{display:block;font-size:24px}
  .contact{margin-top:8px;font-size:14px;color:#333}
  .method{font-size:18px;font-weight:700}
  .warn{color:#B42318}
  dl{display:grid;grid-template-columns:auto 1fr;gap:2px 16px;margin:0;font-size:14px}
  dt{color:#555}
  dd{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}
  ul{margin:0;padding-left:18px;font-size:14px}
  @page{size:A5;margin:12mm}
  @media print{
    body{background:#fff}
    .bar{display:none}
    .label{margin:0;max-width:none;border-radius:0}
  }
</style>
</head>
<body>
<div class="bar"><p>${esc(PRODUCER_NAME[producer].The)} · fraktsedel för ${esc(job.orderNumber)}</p><button type="button" onclick="window.print()">Skriv ut</button></div>
<main class="label">
  ${isCancelled(job) ? `<div class="row warn"><p class="k warn">Avbruten</p><b>Ordern är avbruten – skicka inte.</b>${job.order.cancelReason ? ` ${esc(job.order.cancelReason)}` : ""}</div>` : ""}
  <div class="row">
    <p class="k">Till</p>
    <div class="to"><b>${esc(name)}</b>${address.map((a) => `${esc(a)}<br>`).join("")}</div>
    <div class="contact">${[c.phone, c.email].filter(Boolean).map(esc).join(" · ")}</div>
  </div>
  <div class="row">
    <p class="k">Leveranssätt</p>
    <div class="method">${esc(shipping || "Ej angivet")}</div>
  </div>
  <div class="row">
    <p class="k">Från</p>
    <div>${esc(PRODUCER_NAME[producer].The)} för Craft × ${esc(job.clubName)}, via Intersport</div>
  </div>
  <div class="row"><dl>${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
  <div class="row"><p class="k">Innehåll</p><ul>${contents}</ul></div>
</main>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
