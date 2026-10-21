import { esc, genitive } from "./newsletterHtml";
import { publishPlan, type ZipPack, zipName } from "./packZip";
import { luminance } from "./theme";

/** Måndagsmejlet till kansliet som e-post: veckans motiv med alla bilder, produkterna, planen och zip-filen. */

export const OFFICE_MAIL_CONTENTS = [
  "Inlägg med bild och text till Instagram och Facebook",
  "Story och manus till Reels och TikTok",
  "Banner och nyhetsnotis till hemsidan",
  "Nyhetsbrevet som färdig HTML-mall",
  "Affisch i A4 med QR-kod",
  "AI-foton, produktbilder och tryckfiler",
  "”Så här gör du” – vad som ska upp var och när",
];

export const officeMailSubject = (p: Pick<ZipPack, "week" | "slogan">) => `${p.week ? `Vecka ${p.week}: ` : ""}”${p.slogan}” – allt material i en zip`;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = "#1D1D1F";
const MUTED = "#6E6E73";
const LINE = "#EDEDF0";

const heading = (text: string) => `<p style="margin:0 0 12px;font:600 11px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${MUTED}">${esc(text)}</p>`;

function tile(src: string, alt: string, label: string) {
  return `<img src="${esc(src)}" alt="${esc(alt)}" width="100%" style="display:block;width:100%;height:auto;border-radius:12px;background:#F4F4F2">
<p style="margin:8px 0 0;font:500 12px/1.35 ${SANS};color:${MUTED}">${esc(label)}</p>`;
}

/** Rader med lika breda celler; tomma celler fyller ut sista raden. */
function grid(cells: string[], cols: number) {
  const w = `${Math.floor(100 / cols)}%`;
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += cols) {
    const row = cells.slice(i, i + cols);
    while (row.length < cols) row.push("");
    rows.push(`<tr>${row.map((c) => `<td width="${w}" valign="top" style="padding:6px">${c}</td>`).join("")}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${rows.join("")}</table>`;
}

export function officeMailHtml(p: ZipPack, opts: { origin: string; agent: string; sentAt: string }) {
  const abs = (url: string) => (url.startsWith("/") ? `${opts.origin}${url}` : url);
  const { primary, accent, onAccent } = p.club.colors;
  const light = luminance(primary) > 0.4;
  const onPrimary = light ? INK : "#FFFFFF";
  const faint = light ? "rgba(0,0,0,.6)" : "rgba(255,255,255,.72)";
  const a = p.assets;
  const images = p.photos.length + (a ? 4 : 0) + p.products.length;
  const channels = a
    ? [tile(abs(a.feed), `Inlägg ${p.slogan}`, "Instagram och Facebook 4:5"), tile(abs(a.story), `Story ${p.slogan}`, "Story 9:16"), tile(abs(a.poster), `Affisch ${p.slogan}`, "Affisch A4 med QR")]
    : [];
  const photos = p.photos.map((x) => tile(abs(x.url), `${p.slogan} – ${x.label}`, `AI-foto · ${x.label}`));
  const products = p.products.map(
    (x) => `<img src="${esc(abs(x.mockupUrl))}" alt="${esc(x.name)}" width="100%" style="display:block;width:100%;height:auto;border-radius:12px;background:#F4F4F2">
<p style="margin:8px 0 0;font:600 13px/1.3 ${SANS};color:${INK}">${esc(x.name)}</p>
<p style="margin:2px 0 0;font:13px/1.3 ${SANS};color:${MUTED}">${x.priceSek} kr</p>`,
  );
  const plan = publishPlan(p)
    .map(
      (s) => `<tr><td valign="top" style="padding:10px 12px 10px 0;border-top:1px solid ${LINE};font:600 13px/1.4 ${SANS};color:${INK};white-space:nowrap">${esc(s.when)}</td>
<td valign="top" style="padding:10px 0;border-top:1px solid ${LINE};font:13px/1.45 ${SANS};color:${MUTED}"><span style="color:${INK};font-weight:600">${esc(s.channel)}</span> – ${esc(s.action)}</td></tr>`,
    )
    .join("");
  const contents = OFFICE_MAIL_CONTENTS.map((c) => `<tr><td width="20" valign="top" style="padding:3px 0;font:600 13px/1.45 ${SANS};color:${primary}">✓</td><td style="padding:3px 0;font:13px/1.45 ${SANS};color:${INK}">${esc(c)}</td></tr>`).join("");
  const button = (label: string, solid: boolean) =>
    `<a href="#" style="display:inline-block;padding:14px 24px;border-radius:999px;font:600 15px/1 ${SANS};text-decoration:none;${solid ? `background:${accent};color:${onAccent}` : `background:#FFFFFF;color:${INK};border:1px solid #D2D2D7`}">${esc(label)}</a>`;

  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(officeMailSubject(p))}</title></head>
<body style="margin:0;padding:0;background:#EEEDE9">
<div style="display:none;max-height:0;overflow:hidden">Veckans material för ${esc(p.club.name)} är klart – ${images} bilder, alla texter och en guide i zip-filen.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEEDE9"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:20px;overflow:hidden">
<tr><td style="padding:20px 28px;background:${primary}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><img src="${esc(abs(p.club.logo))}" alt="${esc(p.club.name)}" height="44" style="display:block;height:44px;width:auto"></td>
<td valign="middle" align="right" style="font:600 11px/1.5 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${faint}">Veckans material${p.week ? `<br><span style="color:${onPrimary}">Vecka ${p.week}</span>` : ""}</td>
</tr></table></td></tr>
<tr><td style="height:6px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
${a ? `<tr><td><img src="${esc(abs(a.banner))}" alt="${esc(p.content.banner?.altText ?? p.slogan)}" width="600" style="display:block;width:100%;height:auto"></td></tr>` : ""}
<tr><td style="padding:30px 28px 0">
<p style="margin:0;font:13px/1.4 ${SANS};color:${MUTED}">${esc(opts.agent)} har tagit fram veckans motiv${p.occasion ? ` · ${esc(p.occasion)}` : ""}</p>
${a ? `<h1 style="margin:8px 0 0;font:700 26px/1.15 ${SANS};letter-spacing:-.01em;color:${INK}">Veckans material är klart</h1>` : `<h1 style="margin:8px 0 0;font:800 32px/1.02 ${SANS};letter-spacing:-.01em;text-transform:uppercase;color:${primary}">${esc(p.slogan)}</h1>`}
${p.story ? `<p style="margin:14px 0 0;font:15px/1.55 ${SANS};color:${INK}">${esc(p.story)}</p>` : ""}
<p style="margin:14px 0 0;font:15px/1.55 ${SANS};color:${INK}">Hej! Här är veckans material för ${esc(p.club.name)}. Allt är klart att lägga upp – ingenting publiceras automatiskt, så ni väljer vad som ska ut och när.</p>
</td></tr>
<tr><td style="padding:22px 28px 0">${button("Godkänn och lägg i butiken", true)}&nbsp; ${button("Neka", false)}
<p style="margin:10px 0 0;font:12.5px/1.5 ${SANS};color:${MUTED}">Passar motivet inte? Neka, så kommer det näst bästa samma dag.</p></td></tr>
${channels.length ? `<tr><td style="padding:30px 22px 0"><div style="padding:0 6px">${heading("Klart att lägga upp")}</div>${grid(channels, 3)}</td></tr>` : ""}
${photos.length ? `<tr><td style="padding:12px 22px 0">${grid(photos, 2)}</td></tr>` : ""}
${products.length ? `<tr><td style="padding:24px 22px 0"><div style="padding:0 6px">${heading(`I ${genitive(p.club.name)} butik när ni godkänner`)}</div>${grid(products, Math.min(4, products.length))}<p style="margin:6px 6px 0;font:12.5px/1.5 ${SANS};color:${MUTED}">Trycks på beställning hos Intersport – inget lager, och varje köp stöttar föreningen.</p></td></tr>` : ""}
<tr><td style="padding:30px 28px 0">${heading("Förslag på veckan")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${plan}</table></td></tr>
<tr><td style="padding:28px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;border-radius:16px"><tr><td style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="48" valign="middle"><div style="width:44px;height:44px;border-radius:12px;background:${primary};color:${onPrimary};font:700 11px/44px ${SANS};text-align:center">ZIP</div></td>
<td valign="middle" style="padding-left:12px"><p style="margin:0;font:600 14px/1.3 ${SANS};color:${INK}">${esc(zipName(p))}</p><p style="margin:3px 0 0;font:12.5px/1.3 ${SANS};color:${MUTED}">Bilaga · ${images} bilder, alla texter och guiden</p></td>
<td valign="middle" align="right"><a href="#" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#FFFFFF;border:1px solid #D2D2D7;font:600 13px/1 ${SANS};color:${INK};text-decoration:none;white-space:nowrap">Ladda ner</a></td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${contents}</table>
</td></tr></table></td></tr>
<tr><td style="padding:26px 28px 30px;font:14px/1.55 ${SANS};color:${INK}">Ha en fin vecka!<br><span style="color:${MUTED}">${esc(opts.agent)}</span></td></tr>
<tr><td style="padding:20px 28px;background:${primary}">
<p style="margin:0;font:600 13px/1.4 ${SANS};color:${onPrimary}">${esc(p.club.name)} · Next Wave</p>
<p style="margin:4px 0 0;font:12px/1.5 ${SANS};color:${faint}">Skickat ${esc(opts.sentAt.charAt(0).toLowerCase() + opts.sentAt.slice(1))} till kansliet. Ni får veckans material varje måndag – inget publiceras utan att ni gör det.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
