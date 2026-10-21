import JSZip from "jszip";
import type { PackClub } from "@/components/newwave/PackView";
import { genitive, newsletterHtml } from "./newsletterHtml";
import type { PackAssets, PackContent, PackPhoto } from "./store";

export type ZipPack = {
  club: PackClub;
  clubId: string;
  slogan: string;
  story?: string;
  occasion?: string;
  week?: number;
  content: PackContent;
  assets: PackAssets | null;
  photos: PackPhoto[];
  products: { name: string; priceSek: number; mockupUrl: string }[];
  printFiles?: { light: string; dark: string };
  shopUrl: string;
};

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim().replace(/[.\s]+$/, "");
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const tags = (c: PackContent) => c.instagram.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");

export const zipName = (p: Pick<ZipPack, "club" | "slogan" | "week">) => `${slug(p.club.name)}-${p.week ? `vecka-${p.week}` : slug(p.slogan)}.zip`;

async function bytes(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte hämta ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

type Step = { when: string; channel: string; action: string; folder: string };

/** Agentens publiceringsplan, eller en enkel vecka om planen saknas. */
export function publishPlan(p: ZipPack): Step[] {
  const folderFor = (channel: string) =>
    /insta/i.test(channel) ? "01 Instagram" : /face/i.test(channel) ? "02 Facebook" : /story|reels|tiktok/i.test(channel) ? "03 Story och Reels" : /hemsid|sajt|webb|banner/i.test(channel) ? "04 Hemsidan" : /nyhetsbrev|mejl|e-post/i.test(channel) ? "05 Nyhetsbrev" : /affisch|klubbhus|skärm|tv/i.test(channel) ? "06 Affisch" : "";
  if (p.content.plan?.length) return p.content.plan.map((s) => ({ when: s.date, channel: s.channel, action: s.action, folder: folderFor(s.channel) }));
  return [
    { when: "Måndag", channel: "Hemsidan", action: "Lägg upp bannern och nyhetsnotisen.", folder: "04 Hemsidan" },
    { when: "Tisdag", channel: "Instagram och Facebook", action: "Publicera inläggen med bild och text.", folder: "01 Instagram" },
    { when: "Onsdag", channel: "Story", action: "Lägg upp storyn med länk till butiken.", folder: "03 Story och Reels" },
    { when: "Torsdag", channel: "Nyhetsbrev", action: "Skicka nyhetsbrevet till utskickslistan.", folder: "05 Nyhetsbrev" },
    { when: "Fredag", channel: "Klubbhuset", action: "Skriv ut affischen och sätt upp den.", folder: "06 Affisch" },
  ];
}

function guide(p: ZipPack, steps: Step[], files: Record<string, string[]>) {
  const c = p.content;
  const block = (title: string, folder: string, body: string) => `<section><h2>${esc(title)}</h2><p class="dir">Mapp: ${esc(folder)} · ${files[folder]?.map(esc).join(", ") ?? ""}</p>${body}</section>`;
  const pre = (t: string) => `<pre>${esc(t)}</pre>`;
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><title>Så här gör du – ${esc(p.slogan)}</title>
<style>body{font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:28px;margin:0 0 4px;text-transform:uppercase;color:${p.club.colors.primary}}h2{font-size:18px;margin:32px 0 4px}.k{color:#6e6e73}.dir{color:#6e6e73;font-size:13px;margin:0 0 10px}pre{white-space:pre-wrap;background:#f5f5f7;border-radius:12px;padding:14px;font:14px/1.5 inherit;font-family:inherit}table{width:100%;border-collapse:collapse}td{padding:8px 6px;border-bottom:1px solid #e5e5ea;vertical-align:top}td:first-child{white-space:nowrap;color:#6e6e73}.note{background:${p.club.colors.accent};color:${p.club.colors.onAccent};border-radius:12px;padding:12px 14px}</style></head><body>
<p class="k">${esc(p.club.name)}${p.week ? ` · vecka ${p.week}` : ""}${p.occasion ? ` · ${esc(p.occasion)}` : ""}</p>
<h1>${esc(p.slogan)}</h1>
${p.story ? `<p>${esc(p.story)}</p>` : ""}
<p class="note">Inget är publicerat. Lägg upp det ni vill, när ni vill – allt nedan är klart att kopiera.</p>
<h2>Förslag på när</h2>
<table>${steps.map((s) => `<tr><td>${esc(s.when)}</td><td><strong>${esc(s.channel)}</strong> – ${esc(s.action)}${s.folder ? ` <span class="k">(${esc(s.folder)})</span>` : ""}</td></tr>`).join("")}</table>
${block("Instagram", "01 Instagram", pre(`${c.instagram.caption}\n\n${tags(c)}`))}
${block("Facebook", "02 Facebook", pre(c.facebook.post))}
${c.tiktok ? block("Story och Reels", "03 Story och Reels", pre(`${c.tiktok.hook}\n\n${c.tiktok.script.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n${c.tiktok.caption}`)) : ""}
${block("Hemsidan", "04 Hemsidan", pre(`${c.banner?.headline ?? p.slogan}\n${c.banner?.subline ?? ""}\n\nLänka bannern till: ${p.shopUrl}\nAlt-text: ${c.banner?.altText ?? p.slogan}`))}
${block("Nyhetsbrev", "05 Nyhetsbrev", `<p>Öppna <strong>nyhetsbrev.html</strong> och klistra in den som HTML i ert e-postverktyg (Mailchimp, Brevo m.fl.). Bilderna i mallen hämtas från Next Wave – vill ni ladda upp dem själva finns de i mapparna.</p>${pre(`Ämnesrad: ${c.newsletter.subject}\n\n${c.newsletter.body}`)}`)}
${block("Affisch", "06 Affisch", "<p>Skriv ut i A4 eller A3 och sätt upp i klubbhuset, kiosken eller omklädningsrummet. QR-koden går till butiken.</p>")}
${p.photos.length ? block("AI-foton", "07 Foton", "<p>Fotona är AI-genererade med det riktiga trycket. Märk inläggen med ”AI-genererad bild” när ni använder dem.</p>") : ""}
${block("Produkterna i butiken", "08 Produkter", `<table>${p.products.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.priceSek} kr</td></tr>`).join("")}</table><p class="k">Butik: ${esc(p.shopUrl)}</p>`)}
</body></html>`;
}

/** Hela veckans paket som en zip: en mapp per kanal med bild och text, nyhetsbrevet som HTML och en guide. */
export async function buildPackZip(p: ZipPack, onProgress?: (percent: number) => void) {
  const zip = new JSZip();
  const root = zip.folder(safe(`${p.club.name} – ${p.week ? `vecka ${p.week} – ` : ""}${p.slogan}`))!;
  const files: Record<string, string[]> = {};
  const put = (folder: string, name: string, data: string | Uint8Array) => {
    root.folder(folder)!.file(name, data);
    (files[folder] ??= []).push(name);
  };
  const c = p.content;
  const lifestyle = p.photos.find((x) => x.id === "livsstil");
  const [photoBytes, assetBytes, productBytes, printBytes] = await Promise.all([
    Promise.all(p.photos.map(async (x) => ({ ...x, data: await bytes(x.url) }))),
    p.assets ? Promise.all(Object.entries(p.assets).map(async ([k, url]) => [k, await bytes(url)] as const)).then(Object.fromEntries) : null,
    Promise.all(p.products.map(async (x) => ({ ...x, data: await bytes(x.mockupUrl) }))),
    p.printFiles ? Promise.all([bytes(p.printFiles.light), bytes(p.printFiles.dark)]) : null,
  ]);
  onProgress?.(40);

  const a = assetBytes as Record<keyof PackAssets, Uint8Array> | null;
  if (a) put("01 Instagram", "inlagg-4x5.png", a.feed);
  if (lifestyle) put("01 Instagram", "foto-livsstil.jpg", photoBytes.find((x) => x.id === "livsstil")!.data);
  put("01 Instagram", "text.txt", `${c.instagram.caption}\n\n${tags(c)}\n`);

  if (lifestyle) put("02 Facebook", "foto-livsstil.jpg", photoBytes.find((x) => x.id === "livsstil")!.data);
  else if (a) put("02 Facebook", "inlagg-4x5.png", a.feed);
  put("02 Facebook", "text.txt", `${c.facebook.post}\n${lifestyle ? "\nMärk bilden: AI-genererad bild\n" : ""}`);

  if (a) put("03 Story och Reels", "story-9x16.png", a.story);
  if (c.tiktok) put("03 Story och Reels", "filmmanus.txt", `KROK (första 2 sekunderna):\n${c.tiktok.hook}\n\nMANUS:\n${c.tiktok.script.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nBILDTEXT:\n${c.tiktok.caption}\n`);

  if (a) put("04 Hemsidan", "banner-1920x600.png", a.banner);
  put("04 Hemsidan", "nyhetsnotis.txt", `${c.banner?.headline ?? p.slogan}\n${c.banner?.subline ?? ""}\n\n${c.newsletter.body.split(/\n{2,}/).filter((x) => !/^hej/i.test(x.trim())).slice(0, 2).join("\n\n")}\n\nLänka bannern till:\n${p.shopUrl}\n\nAlt-text:\n${c.banner?.altText ?? p.slogan}\n`);

  put(
    "05 Nyhetsbrev",
    "nyhetsbrev.html",
    newsletterHtml({ origin: window.location.origin, club: p.club, colors: p.club.colors, subject: c.newsletter.subject, body: c.newsletter.body, slogan: p.slogan, bannerUrl: p.assets?.banner, bannerAlt: c.banner?.altText, products: p.products, shopUrl: p.shopUrl }),
  );
  put("05 Nyhetsbrev", "text.txt", `ÄMNESRAD:\n${c.newsletter.subject}\n\nTEXT:\n${c.newsletter.body}\n`);

  if (a) put("06 Affisch", "affisch-A4.png", a.poster);
  put("06 Affisch", "instruktion.txt", "Skriv ut i A4 eller A3 och sätt upp i klubbhuset, kiosken eller omklädningsrummet.\nQR-koden går direkt till produkten i butiken.\n");

  photoBytes.forEach((x) => put("07 Foton", `foto-${slug(x.label)}.jpg`, x.data));
  if (photoBytes.length) put("07 Foton", "om-fotona.txt", "Fotona är AI-genererade med det exakta trycket på plagget.\nMärk inläggen med ”AI-genererad bild” när ni använder dem.\n");

  productBytes.forEach((x) => put("08 Produkter", `${slug(x.name)}.jpg`, x.data));
  if (printBytes) {
    put("08 Produkter", "tryckfil-ljusa-plagg-300dpi.png", printBytes[0]);
    put("08 Produkter", "tryckfil-morka-plagg-300dpi.png", printBytes[1]);
  }
  put("08 Produkter", "produkter.txt", `${p.products.map((x) => `${x.name} – ${x.priceSek} kr`).join("\n")}\n\nTrycks på beställning – varje köp stöttar ${p.club.name}.\nButik: ${p.shopUrl}\n`);

  for (const v of ["farg", "svart", "vit"]) {
    const res = await fetch(`/api/v1/brand/${p.clubId}/skold-${v}.png`);
    if (res.ok) put("Klubbmärke", `skold-${v}.png`, new Uint8Array(await res.arrayBuffer()));
  }
  onProgress?.(70);

  root.file("SÅ HÄR GÖR DU.html", guide(p, publishPlan(p), files));
  root.file("LÄS MIG.txt", `${genitive(p.club.name)} material${p.week ? ` för vecka ${p.week}` : ""}: ${p.slogan}\n\nÖppna "SÅ HÄR GÖR DU.html" – där står vad som ska upp var och när, med alla texter klara att kopiera.\nInget är publicerat automatiskt.\n`);
  return zip.generateAsync({ type: "blob" }, (m) => onProgress?.(70 + m.percent * 0.3));
}

