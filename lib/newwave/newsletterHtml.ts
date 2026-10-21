export type NewsletterInput = {
  /** Läggs före relativa bildadresser så att mallen fungerar i klubbens e-postverktyg. */
  origin: string;
  club: { name: string; logo: string; website: string };
  colors: { primary: string; accent: string; onAccent: string };
  subject: string;
  body: string;
  slogan: string;
  bannerUrl?: string;
  bannerAlt?: string;
  products: { name: string; priceSek: number; mockupUrl: string }[];
  shopUrl: string;
};

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Åsa IF:s", "Mölndals", "IFK Göteborgs". */
export const genitive = (name: string) => (/[A-ZÅÄÖ]$/.test(name) ? `${name}:s` : /[sxz]$/i.test(name) ? name : `${name}s`);

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Klubbens nyhetsbrev som e-postmall: tabeller och inline-stilar, max 600 px bred. */
export function newsletterHtml(n: NewsletterInput) {
  const abs = (url: string) => (url.startsWith("/") ? `${n.origin}${url}` : url);
  const link = `color:${n.colors.primary};font-weight:600;text-decoration:underline`;
  const paragraphs = n.body
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      esc(p)
        .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="${link}">${esc(genitive(n.club.name))} butik</a>`)
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 16px;font:16px/1.55 ${SANS};color:#1D1D1F">${p}</p>`)
    .join("");
  const cells = n.products.slice(0, 4).map(
    (p) => `<td width="50%" valign="top" style="padding:6px">
  <a href="${esc(n.shopUrl)}" style="text-decoration:none;color:#1D1D1F">
    <img src="${esc(abs(p.mockupUrl))}" alt="${esc(p.name)}" width="270" style="display:block;width:100%;height:auto;border-radius:12px;background:#F5F5F7">
    <p style="margin:10px 0 0;font:600 14px/1.3 ${SANS}">${esc(p.name)}</p>
    <p style="margin:2px 0 0;font:14px/1.3 ${SANS};color:#6E6E73">${p.priceSek} kr</p>
  </a>
</td>`,
  );
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`);
  const host = n.club.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.subject)}</title></head>
<body style="margin:0;padding:0;background:#F2F2F4">
<div style="display:none;max-height:0;overflow:hidden">${esc(n.slogan)} – nytt i ${esc(genitive(n.club.name))} butik</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">
  <tr><td align="center" style="padding:24px 24px 18px"><img src="${esc(abs(n.club.logo))}" alt="${esc(n.club.name)}" height="52" style="display:block;height:52px;width:auto"></td></tr>
  <tr><td style="height:6px;background:${n.colors.accent};font-size:0;line-height:0">&nbsp;</td></tr>
  ${n.bannerUrl ? `<tr><td><img src="${esc(abs(n.bannerUrl))}" alt="${esc(n.bannerAlt ?? n.slogan)}" width="600" style="display:block;width:100%;height:auto"></td></tr>` : ""}
  <tr><td style="padding:28px 28px 8px">
    ${n.bannerUrl ? "" : `<h1 style="margin:0 0 18px;font:700 26px/1.15 ${SANS};color:${n.colors.primary};text-transform:uppercase;letter-spacing:.01em">${esc(n.slogan)}</h1>`}
    ${paragraphs}
  </td></tr>
  ${rows.length ? `<tr><td style="padding:0 22px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table></td></tr>` : ""}
  <tr><td align="center" style="padding:20px 28px 32px">
    <a href="${esc(n.shopUrl)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${n.colors.accent};color:${n.colors.onAccent};font:600 16px/1 ${SANS};text-decoration:none">Till klubbens butik</a>
    <p style="margin:12px 0 0;font:13px/1.4 ${SANS};color:#6E6E73">Trycks när du beställer – varje köp stöttar ${esc(n.club.name)}.</p>
  </td></tr>
  <tr><td style="padding:20px 28px;background:${n.colors.primary}">
    <p style="margin:0;font:600 14px/1.4 ${SANS};color:#FFFFFF">${esc(n.club.name)}</p>
    <p style="margin:4px 0 0;font:12px/1.5 ${SANS};color:rgba(255,255,255,.7)">Du får det här mejlet för att du står på ${esc(genitive(n.club.name))} utskickslista. <a href="${esc(n.club.website)}" style="color:#FFFFFF">${esc(host)}</a> · <a href="{{unsubscribe}}" style="color:#FFFFFF">Avregistrera</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
