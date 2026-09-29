"use client";

import JSZip from "jszip";
import { dataUrlToBase64 } from "./compose";
import { CHANNELS } from "./links";
import type { Club, Concept, ContentPack } from "./types";

export type CampaignImages = {
  feed: string;
  story: string;
  linkedin: string;
  banner: string;
  bannerMobile: string;
  tv: string;
  poster: string;
};

export type PackItem = {
  concept: Concept;
  prints: { light: string; dark: string };
  vectorUrl: string;
  images: CampaignImages;
  photos: { id: string; label: string; url: string }[];
  video: { blob: Blob; ext: "mp4" | "webm"; url: string } | null;
  backPrints: { label: string; file: string; dataUrl: string }[];
  familyPack: string | null;
  content: ContentPack;
  intersport: unknown;
  shopUrl: string;
  links: Record<string, string>;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim().replace(/[.\s]+$/, "");
const hashtags = (tags: string[]) => tags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");

function channelTexts(it: PackItem) {
  const c = it.content;
  const l = it.links;
  return {
    instagram: `${c.instagram.caption}\n\n${hashtags(c.instagram.hashtags)}\n\nLänk i bio:\n${l.instagram}\n\nLänkklistermärke i storyn:\n${l["instagram-story"]}\n\nTips: lägg upp som karusell – foto-livsstil.jpg, inlagg-4x5.png, foto-produkt.jpg.\n`,
    facebook: `${c.facebook.post}\n`,
    linkedin: `${c.linkedin.post}\n`,
    tiktok: `KROK (första 2 sekunderna):\n${c.tiktok.hook}\n\nFILMEN ÄR KLAR: film-9x16.${it.video?.ext ?? "mp4"} (10 sekunder). Lägg på ett populärt ljud i appen innan du publicerar.\n\nOm ni hellre filmar själva – manus:\n${c.tiktok.script.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nBILDTEXT:\n${c.tiktok.caption}\n`,
    newsletter: `ÄMNESRAD:\n${c.newsletter.subject}\n\nTEXT:\n${c.newsletter.body}\n`,
    banner: `Bild: banner-1920x600.png (dator) och banner-mobil-1080x1080.png (mobil)\nLänka bannern till:\n${l.hemsida}\n\nAlt-text (för tillgänglighet):\n${c.banner.altText}\n`,
    tv: `Bild: tv-1920x1080.png – med QR-kod till klubbshoppen.\nVisa på skärmar i klubbhuset, kansliet eller på arenan (USB-minne eller skärmsystem).\n`,
    poster: `Skriv ut affisch-A4.png i A4 eller A3 och sätt upp i klubbhuset, omklädningsrummet eller kiosken.\nQR-koden går till klubbshoppen och räknas som kanalen "affisch".\n`,
    links: `LÄNKAR OCH SPÅRNING\n\nVarje kanal har en egen länk. Då syns i försäljningsrapporten exakt vilken kanal som sålde.\nAnvänd rätt länk i rätt kanal – texterna i mapparna har redan rätt länk.\n\n${CHANNELS.map((ch) => `${ch.label}:\n${l[ch.id]}`).join("\n\n")}\n`,
  };
}

function guideHtml(club: Club, items: PackItem[], folders: string[]) {
  const plans = items
    .map((it, i) => {
      const rows = it.content.plan
        .map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.channel)}</td><td>${esc(p.action)}</td></tr>`)
        .join("");
      return `<h3>${esc(it.concept.slogan)}</h3>
<p class="muted">Mapp: <b>${esc(folders[i])}</b> · Bygger på: ${esc(it.concept.signal)}</p>
<table><thead><tr><th>Datum</th><th>Kanal</th><th>Gör så här</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
  const family = items.filter((i) => i.familyPack).map((i) => i.familyPack);

  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><title>Så här gör du – ${esc(club.name)}</title>
<style>
body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1d1d1f;line-height:1.55}
h1{font-size:30px;margin-bottom:4px}h2{margin-top:36px;font-size:20px;border-bottom:1px solid #d2d2d7;padding-bottom:6px}
h3{margin:22px 0 2px;color:#234B9A}.muted{color:#6e6e73;margin-top:0}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}td:first-child,td:nth-child(2){white-space:nowrap}
ol li{margin-bottom:8px}.box{background:#f5f5f7;border-radius:12px;padding:14px 18px}.warn{background:#fff4e5;border-radius:12px;padding:14px 18px}
code{background:#f5f5f7;padding:1px 5px;border-radius:4px}
</style></head><body>
<h1>Så här gör du</h1>
<p class="muted">${esc(club.name)} · Nytt innehåll för klubbshoppen hos Intersport · skapat ${new Date().toISOString().slice(0, 10)}</p>

<div class="box">Allt i den här mappen är klart att publicera. Produkterna trycks på beställning – klubben behöver inte köpa in något eller ha lager.
Varje kanal har en egen spårbar länk, så att ni ser vad som säljer. Ju fler som ser inläggen, desto mer går tillbaka till föreningen.</div>

<h2>1. Publiceringsplan</h2>${plans}

<h2>2. Kanal för kanal</h2>
<ol>
<li><b>Instagram</b> – lägg upp en karusell: <code>foto-livsstil.jpg</code>, <code>inlagg-4x5.png</code>, <code>foto-produkt.jpg</code>. Klistra in <code>text.txt</code>. Lägg <code>story-9x16.png</code> som story med länkklistermärke.</li>
<li><b>Reels och TikTok</b> – filmen <code>film-9x16</code> är klar. Ladda upp den, lägg på ett populärt ljud i appen och klistra in bildtexten.</li>
<li><b>Facebook</b> – publicera <code>inlagg-4x5.png</code> eller fotona med texten. Dela i föräldra- och supportergrupper.</li>
<li><b>LinkedIn</b> – publicera <code>inlagg-1200x627.png</code> med texten. Tagga gärna klubbens partners.</li>
<li><b>Hemsidan</b> – lägg bannern överst på startsidan och länka den med länken i <code>instruktion.txt</code>.</li>
<li><b>TV-skärmar</b> – visa <code>tv-1920x1080.png</code>. QR-koden tar besökaren direkt till klubbshoppen.</li>
<li><b>Affisch</b> – skriv ut <code>affisch-A4.png</code> och sätt upp i klubbhuset och kiosken.</li>
<li><b>Nyhetsbrev</b> – kopiera ämnesrad och text till ert utskicksverktyg.</li>
</ol>

<h2>3. Namn och nummer på ryggen</h2>
<p>T-shirts och hoodies kan beställas med eget namn och nummer på ryggen, till exempel till barnen i ungdomslagen. Typsnitt och färger är låsta i klubbens stil och namnen kontrolleras automatiskt innan tryck.
${family.length ? `<br><b>Familjepaket:</b> ${family.map((f) => esc(f!)).join(", ")} – perfekt att lyfta i inläggen.` : ""}</p>

<h2>4. Regler – ändra inte</h2>
<div class="warn"><ul>
${club.rules.map((r) => `<li>${esc(r)}</li>`).join("")}
<li>Alla motiv har kontrollerats automatiskt: färger pixel för pixel, att inga andra varumärken eller verkliga personer förekommer, och att motivet går att trycka.</li>
<li>Skölden läggs alltid på automatiskt från klubbens officiella filer (mappen <code>Grafisk profil</code>). Använd bara de filerna – rita aldrig om eller färglägg skölden.</li>
</ul></div>

<h2>5. För Craft och Intersport</h2>
<p><code>Tryckfiler</code> innehåller tryckfiler i 300 dpi för ljusa och mörka plagg, motivet som vektorfil (SVG) och baksidor med namn och nummer. <code>intersport-produkter.json</code> är det som skickas till Intersports klubbshop via API. Alla länkar och spårningskoder finns i <code>Länkar och spårning.txt</code>.</p>
</body></html>`;
}

async function fetchBytes(url: string) {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

export async function buildCampaignZip(club: Club, items: PackItem[], onProgress?: (percent: number) => void) {
  const zip = new JSZip();
  const date = new Date().toISOString().slice(0, 10);
  const root = zip.folder(`${safe(club.name)} – innehåll ${date}`)!;
  const folders = items.map((it, i) => `${String(i + 1).padStart(2, "0")} ${safe(it.concept.slogan)}`);
  const png = (f: JSZip, name: string, url: string) => f.file(name, dataUrlToBase64(url), { base64: true });

  for (const [i, it] of items.entries()) {
    const f = root.folder(folders[i])!;
    const t = channelTexts(it);
    const photos = await Promise.all(it.photos.map(async (p) => ({ ...p, bytes: await fetchBytes(p.url) })));

    const ig = f.folder("Instagram")!;
    png(ig, "inlagg-4x5.png", it.images.feed);
    png(ig, "story-9x16.png", it.images.story);
    photos.forEach((p) => ig.file(`foto-${p.id === "livsstil" ? "livsstil" : "produkt"}.jpg`, p.bytes));
    ig.file("text.txt", t.instagram);

    const fb = f.folder("Facebook")!;
    png(fb, "inlagg-4x5.png", it.images.feed);
    photos.forEach((p) => fb.file(`foto-${p.id === "livsstil" ? "livsstil" : "produkt"}.jpg`, p.bytes));
    fb.file("text.txt", t.facebook);

    const li = f.folder("LinkedIn")!;
    png(li, "inlagg-1200x627.png", it.images.linkedin);
    li.file("text.txt", t.linkedin);

    const tt = f.folder("TikTok och Reels")!;
    if (it.video) tt.file(`film-9x16.${it.video.ext}`, it.video.blob);
    png(tt, "omslag-9x16.png", it.images.story);
    tt.file("text.txt", t.tiktok);

    const web = f.folder("Hemsida")!;
    png(web, "banner-1920x600.png", it.images.banner);
    png(web, "banner-mobil-1080x1080.png", it.images.bannerMobile);
    web.file("instruktion.txt", t.banner);

    const tv = f.folder("TV-skärmar")!;
    png(tv, "tv-1920x1080.png", it.images.tv);
    tv.file("instruktion.txt", t.tv);

    const poster = f.folder("Affisch")!;
    png(poster, "affisch-A4.png", it.images.poster);
    poster.file("instruktion.txt", t.poster);

    f.folder("Nyhetsbrev")!.file("text.txt", t.newsletter);

    const pr = f.folder("Tryckfiler")!;
    png(pr, "tryckfil-ljusa-plagg-300dpi.png", it.prints.light);
    png(pr, "tryckfil-morka-plagg-300dpi.png", it.prints.dark);
    pr.file("motiv-vektor.svg", await fetchBytes(it.vectorUrl));
    it.backPrints.forEach((b) => png(pr, b.file, b.dataUrl));

    f.file("Länkar och spårning.txt", t.links);
  }

  const profile = root.folder("Grafisk profil")!;
  for (const [variant, file] of Object.entries(club.brand.crest)) {
    for (const ext of ["svg", "png"]) {
      const res = await fetch(`/api/v1/brand/${club.id}/${file.replace(/\.svg$/, `.${ext}`)}`);
      if (res.ok) profile.file(`skold-${variant}.${ext}`, new Uint8Array(await res.arrayBuffer()));
    }
  }
  profile.file(
    "färger-och-typsnitt.txt",
    `${club.name} – grafisk profil\n\nFärger:\n${club.palette.map((c) => `${c.name}: ${c.hex}`).join("\n")}\nGuld (endast i skölden): #FBC323\n\nTypsnitt: ${club.brand.fonts.brand} (varumärke), ${club.brand.fonts.web} (webb)\n\nSköld: fullfärg som standard, svart eller vit vid tryck i en färg.\n`,
  );

  root.file("SÅ HÄR GÖR DU.html", guideHtml(club, items, folders));
  root.file("intersport-produkter.json", JSON.stringify(items.map((it) => it.intersport), null, 2));
  return zip.generateAsync({ type: "blob" }, (meta) => onProgress?.(meta.percent));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
