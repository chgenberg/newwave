import { type MailResult, mailConfigured, sendMail } from "@/lib/mail";
import { contactLine, esc, lineFacts, quoteArt, type QuoteArt, quoteLinks, type QuoteLinks, quotePdf, shopName } from "./quoteDoc";
import { fmtDay, type Quote, type Reseller, sek } from "./reseller";
import { luminance } from "./theme";

/** Offerten som mejl till kunden: produkterna med bild och design, och knappar som godkänner eller tackar nej på offertsidan. */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const on = (hex: string) => (luminance(hex) > 0.4 ? "#0D0C0C" : "#FFFFFF");

/** `src` är bildernas adresser: `cid:` i mejlet, `data:` i förhandsvisningen. */
type Src = { logo: string | null; lines: string[] };

const subject = (q: Quote, r: Reseller) => `Offert ${q.id} från ${shopName(r)} – ${sek(q.totalSek)} exkl. moms`;

function buttons(r: Reseller, links: QuoteLinks) {
  const { accent } = r.theme;
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding:0 8px 8px 0"><a href="${esc(links.accept)}" style="display:inline-block;background:${esc(accent)};color:${on(accent)};font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 26px;border-radius:999px">Godkänn offerten</a></td>
<td style="padding:0 0 8px"><a href="${esc(links.decline)}" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;font-family:${FONT};font-size:15px;font-weight:600;line-height:18px;text-decoration:none;padding:14px 22px;border-radius:999px;border:1px solid #D2D2D7">Tacka nej</a></td>
</tr></table>`;
}

export function quoteMailHtml(q: Quote, r: Reseller, links: QuoteLinks, src: Src) {
  const shop = shopName(r);
  const td = `font-family:${FONT};color:#1D1D1F`;
  const rows = q.lines
    .map((l, i) => {
      const f = lineFacts(l);
      return `<tr><td width="104" valign="top" style="padding:14px 14px 14px 0;border-top:1px solid #EDEDF0"><img src="${esc(src.lines[i])}" width="104" height="104" alt="${esc(l.name)}" style="display:block;width:104px;height:104px;border-radius:12px;background:#F4F4F2"></td>
<td valign="top" style="${td};padding:14px 0;border-top:1px solid #EDEDF0"><p style="margin:0;font-size:15px;font-weight:600">${esc(l.name)}</p><p style="margin:3px 0 0;font-size:12.5px;line-height:18px;color:#6E6E73">${esc(f.spec)}</p><p style="margin:8px 0 0;font-size:12.5px">${esc(f.sizes)}</p><p style="margin:4px 0 0;font-size:12.5px;color:#6E6E73">${esc(f.price)}</p></td>
<td valign="top" align="right" style="${td};padding:14px 0 14px 12px;border-top:1px solid #EDEDF0;font-size:15px;font-weight:600;white-space:nowrap">${esc(sek(l.total))}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject(q, r))}</title></head>
<body style="margin:0;padding:0;background:${esc(r.theme.background)}">
<div style="display:none;max-height:0;overflow:hidden">Godkänn eller tacka nej direkt från mejlet – ${esc(sek(q.totalSek))} exkl. moms.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${esc(r.theme.background)}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:20px">
<tr><td style="padding:28px 28px 0">${src.logo ? `<img src="${esc(src.logo)}" height="32" alt="${esc(shop)}" style="display:block;height:32px;width:auto">` : `<span style="${td};font-size:18px;font-weight:700;color:${esc(r.theme.primary)}">${esc(shop)}</span>`}</td></tr>
<tr><td style="${td};padding:26px 28px 0">
<p style="margin:0;font-size:13px;color:#6E6E73">Offert ${esc(q.id)}${q.validUntil ? ` · giltig till ${esc(fmtDay(q.validUntil))}` : ""}</p>
<h1 style="margin:4px 0 0;font-size:26px;line-height:32px;font-weight:700">Offert till ${esc(q.company.name)}</h1>
${q.reply ? `<p style="margin:16px 0 0;font-size:15px;line-height:23px;white-space:pre-line">${esc(q.reply)}</p>` : ""}
</td></tr>
<tr><td style="padding:22px 28px 6px">${buttons(r, links)}</td></tr>
<tr><td style="padding:14px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
<tr><td colspan="2" style="${td};padding:16px 0 0;border-top:1px solid #1D1D1F;font-size:14px;color:#6E6E73">Totalt exkl. moms</td><td align="right" style="${td};padding:16px 0 0;border-top:1px solid #1D1D1F;font-size:22px;font-weight:700;white-space:nowrap">${esc(sek(q.totalSek))}</td></tr>
<tr><td colspan="2" style="${td};padding:4px 0 0;font-size:13px;color:#6E6E73">Inkl. moms</td><td align="right" style="${td};padding:4px 0 0;font-size:13px;color:#6E6E73;white-space:nowrap">${esc(sek(q.totalSek * 1.25))}</td></tr>
</table></td></tr>
<tr><td style="${td};padding:28px 28px 0">${buttons(r, links)}<p style="margin:6px 0 0;font-size:12.5px;line-height:19px;color:#6E6E73">När ni godkänner går ordern direkt till tryck. Ni får ett provtryck att godkänna först. Offerten finns också som PDF i mejlet och på <a href="${esc(links.page)}" style="color:#1D1D1F">er offertsida</a>.</p></td></tr>
<tr><td style="${td};padding:28px;font-size:12px;line-height:18px;color:#86868B"><span style="font-weight:600;color:#1D1D1F">${esc(shop)}</span>${contactLine(r) ? `<br>${esc(contactLine(r))}` : ""}<br>Produkterna trycks och levereras av New Wave.</td></tr>
</table></td></tr></table></body></html>`;
}

function quoteMailText(q: Quote, r: Reseller, links: QuoteLinks) {
  return [
    `Offert ${q.id} till ${q.company.name}`,
    "",
    ...(q.reply ? [q.reply, ""] : []),
    ...q.lines.map((l) => {
      const f = lineFacts(l);
      return `${l.name} – ${f.spec}\n${f.sizes}\n${f.price} = ${sek(l.total)}`;
    }),
    "",
    `Totalt ${sek(q.totalSek)} exkl. moms (${sek(q.totalSek * 1.25)} inkl. moms)`,
    "",
    `Godkänn offerten: ${links.accept}`,
    `Tacka nej: ${links.decline}`,
    "",
    shopName(r),
    contactLine(r),
  ].join("\n");
}

const fromAddress = (r: Reseller) => {
  const raw = process.env.NW_MAIL_FROM || "onboarding@resend.dev";
  const addr = /<([^>]+)>/.exec(raw)?.[1] ?? raw;
  return `${shopName(r).replace(/["<>,]/g, "")} <${addr}>`;
};

export async function sendQuoteMail(q: Quote, r: Reseller, ws: string | null): Promise<MailResult> {
  if (!mailConfigured()) return { sent: false, reason: "not_configured" };
  const links = quoteLinks(r, q.token, ws);
  const art: QuoteArt = await quoteArt(q, r);
  const pdf = await quotePdf(q, r, links, art).catch(() => null);
  return sendMail({
    from: fromAddress(r),
    to: q.company.email,
    bcc: process.env.NW_MAIL_BCC,
    subject: subject(q, r),
    text: quoteMailText(q, r, links),
    html: quoteMailHtml(q, r, links, { logo: art.logo ? "cid:logo" : null, lines: q.lines.map((_, i) => `cid:rad${i + 1}`) }),
    attachments: [
      ...(art.logo ? [{ filename: "logo.png", content: art.logo, contentId: "logo" }] : []),
      ...art.lines.map((content, i) => ({ filename: `produkt-${i + 1}.jpg`, content, contentId: `rad${i + 1}` })),
      ...(pdf ? [{ filename: `Offert-${q.id}.pdf`, content: pdf }] : []),
    ],
  });
}
