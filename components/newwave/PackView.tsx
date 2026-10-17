"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { newsletterHtml } from "@/lib/newwave/newsletterHtml";
import type { PackAssets, PackContent, PackPhoto } from "@/lib/newwave/store";

export type PackClub = { name: string; handle: string; logo: string; website: string; colors: { primary: string; accent: string; onAccent: string } };
type Product = { name: string; priceSek: number; mockupUrl: string };

const TABS = [
  ["social", "Sociala medier"],
  ["site", "Hemsidan"],
  ["mail", "Nyhetsbrevet"],
  ["files", "Foton och filer"],
] as const;
type Tab = (typeof TABS)[number][0];

const chip =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--nw-line)] bg-white px-3.5 text-[13px] font-medium text-[var(--nw-ink)] transition-colors hover:border-[var(--nw-ink)]";

function Copy({ text, label = "Kopiera text" }: { text: string | (() => string); label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={chip}
      onClick={() =>
        navigator.clipboard.writeText(typeof text === "function" ? text() : text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        })
      }
    >
      {done ? "Kopierat ✓" : label}
    </button>
  );
}

function Download({ href, name, label = "Ladda ner" }: { href?: string | null; name: string; label?: string }) {
  if (!href) return null;
  return (
    <a href={href} download={name} className={chip}>
      {label}
    </a>
  );
}

const Wait = ({ className, text }: { className: string; text: string }) => (
  <div className={`grid animate-pulse place-items-center bg-[var(--nw-soft)] px-4 text-center text-[12.5px] text-[var(--nw-muted)] ${className}`}>{text}</div>
);

function Avatar({ club, size = 32 }: { club: PackClub; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--nw-line)] bg-white" style={{ width: size, height: size }}>
      <img src={club.logo} alt="" className="h-[70%] w-[70%] object-contain" />
    </span>
  );
}

function More({ text, lines = 4 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 160;
  return (
    <>
      <span className={`whitespace-pre-line [overflow-wrap:anywhere] ${open || !long ? "" : lines === 3 ? "line-clamp-3" : "line-clamp-4"}`}>{text}</span>
      {long && !open ? (
        <button type="button" className="nw-hit text-[var(--nw-muted)]" onClick={() => setOpen(true)}>
          mer
        </button>
      ) : null}
    </>
  );
}

function Social({ club, slogan, content, assets, photos }: { club: PackClub; slogan: string; content: PackContent; assets: PackAssets | null; photos: PackPhoto[] | null }) {
  const tags = content.instagram.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  const lifestyle = photos?.find((p) => p.id === "livsstil");
  const fbImage = lifestyle?.url ?? assets?.feed;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px]">
      <div className="min-w-0">
        <article className="overflow-hidden rounded-2xl border border-[var(--nw-line)] bg-white">
          <header className="flex items-center gap-2.5 px-3 py-2.5">
            <Avatar club={club} />
            <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--nw-ink)]">{club.handle}</p>
            <span className="text-[12px] text-[var(--nw-faint)]">Instagram</span>
          </header>
          {assets ? <img src={assets.feed} alt={slogan} className="aspect-[4/5] w-full object-cover" /> : <Wait className="aspect-[4/5] w-full" text="Inlägget byggs…" />}
          <p className="px-3 pb-3 pt-2.5 text-[13.5px] leading-snug text-[var(--nw-ink)]">
            <span className="font-semibold">{club.handle}</span> <More text={content.instagram.caption} />
            <span className="mt-1 block text-[13px] text-[#00376B] [overflow-wrap:anywhere]">{tags}</span>
          </p>
        </article>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Copy text={`${content.instagram.caption}\n\n${tags}`} />
          <Download href={assets?.feed} name="instagram-4x5.png" label="Bild 4:5" />
        </div>
      </div>

      <div className="min-w-0">
        <article className="overflow-hidden rounded-2xl border border-[var(--nw-line)] bg-white">
          <header className="flex items-center gap-2.5 px-3 pt-3">
            <Avatar club={club} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-[var(--nw-ink)]">{club.name}</p>
              <p className="text-[12px] text-[var(--nw-faint)]">Facebook · Nu</p>
            </div>
          </header>
          <p className="px-3 py-2.5 text-[13.5px] leading-snug text-[var(--nw-ink)]">
            <More text={content.facebook.post} lines={3} />
          </p>
          <div className="relative">
            {fbImage ? <img src={fbImage} alt={slogan} className="aspect-[4/5] w-full object-cover" /> : <Wait className="aspect-[4/5] w-full" text="Bilden tas fram…" />}
            {lifestyle ? <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">AI-genererad bild</span> : null}
          </div>
        </article>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Copy text={content.facebook.post} />
          <Download href={fbImage} name={lifestyle ? "facebook-foto.jpg" : "facebook-4x5.png"} label="Bild" />
        </div>
      </div>

      <div className="mx-auto w-[200px] md:mx-0">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[26px] border border-[var(--nw-line)] bg-black">
          {assets ? <img src={assets.story} alt={`Story ${slogan}`} className="h-full w-full object-cover" /> : <Wait className="h-full w-full" text="Storyn byggs…" />}
          <div className="absolute inset-x-3 top-2.5 h-[3px] overflow-hidden rounded-full bg-white/35">
            <div className="h-full w-1/3 bg-white" />
          </div>
          <div className="absolute left-3 top-5 flex items-center gap-1.5">
            <Avatar club={club} size={22} />
            <span className="text-[11.5px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">{club.handle}</span>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">Story · Reels · TikTok</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Download href={assets?.story} name="story-9x16.png" label="Bild 9:16" />
        </div>
      </div>

      {content.tiktok ? (
        <section className="rounded-2xl bg-[var(--nw-soft)] p-4 md:col-span-3">
          <p className="nw-kicker">Kort film · Reels och TikTok</p>
          <p className="mt-1.5 text-[14px] font-medium text-[var(--nw-ink)]">{content.tiktok.hook}</p>
          <ol className="mt-2 grid gap-1.5 text-[13px] text-[var(--nw-muted)] sm:grid-cols-2">
            {content.tiktok.script.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-medium text-[var(--nw-ink)]">{i + 1}.</span>
                <span className="[overflow-wrap:anywhere]">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <Copy text={`${content.tiktok.hook}\n\n${content.tiktok.script.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n${content.tiktok.caption}`} label="Kopiera manus" />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Site({ club, slogan, content, assets, shopUrl }: { club: PackClub; slogan: string; content: PackContent; assets: PackAssets | null; shopUrl?: string }) {
  const banner = content.banner ?? { headline: slogan, subline: "", altText: slogan };
  const notice = content.newsletter.body.split(/\n{2,}/).filter((p) => !/^hej/i.test(p.trim())).slice(0, 2).join("\n\n");
  const host = club.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-[var(--nw-line)] bg-white">
        <div className="flex items-center gap-3 border-b border-[var(--nw-line)] bg-[var(--nw-soft)] px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate rounded-full bg-white px-3 py-1 text-center text-[12px] text-[var(--nw-muted)]">{host}</span>
        </div>
        <div className="flex items-center gap-4 px-4 py-3">
          <img src={club.logo} alt="" className="h-8 w-auto" />
          <p className="nw-club-heading min-w-0 flex-1 truncate text-[15px] text-[var(--club)]">{club.name}</p>
          <nav className="hidden gap-4 text-[12.5px] text-[var(--nw-muted)] sm:flex" aria-hidden>
            <span>Fotboll</span>
            <span>Pingis</span>
            <span>Innebandy</span>
            <span className="font-medium text-[var(--nw-ink)]">Butik</span>
          </nav>
        </div>
        {assets ? <img src={assets.banner} alt={banner.altText} className="aspect-[1920/600] w-full object-cover" /> : <Wait className="aspect-[1920/600] w-full" text="Bannern byggs…" />}
        <div className="px-4 py-5 sm:px-6">
          <p className="text-[12px] text-[var(--nw-faint)]">Nyhet · Idag</p>
          <h3 className="nw-club-heading mt-1 text-[20px] leading-tight text-[var(--club)] [overflow-wrap:anywhere]">{banner.headline}</h3>
          {banner.subline ? <p className="mt-1 text-[14px] font-medium text-[var(--nw-ink)]">{banner.subline}</p> : null}
          <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--nw-muted)] [overflow-wrap:anywhere]">{notice}</p>
          {shopUrl ? (
            <a href={shopUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13.5px] font-medium text-[var(--club)] underline underline-offset-4">
              Till klubbens butik →
            </a>
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Download href={assets?.banner} name="hemsidebanner-1920x600.png" label="Banner 1920×600" />
        <Copy text={`${banner.headline}\n${banner.subline}\n\n${notice}`} label="Kopiera nyhetsnotisen" />
        <Copy text={banner.altText} label="Kopiera alt-text" />
      </div>
    </div>
  );
}

function Mail({ club, slogan, content, assets, products, shopUrl }: { club: PackClub; slogan: string; content: PackContent; assets: PackAssets | null; products: Product[]; shopUrl: string }) {
  const [height, setHeight] = useState(900);
  const input = (origin: string) => ({
    origin,
    club,
    colors: club.colors,
    subject: content.newsletter.subject,
    body: content.newsletter.body,
    slogan,
    bannerUrl: assets?.banner,
    bannerAlt: content.banner?.altText,
    products,
    shopUrl,
  });
  const preview = newsletterHtml(input("")).replace("<head>", '<head><base target="_blank">');
  const full = () => newsletterHtml(input(window.location.origin));
  const save = () => {
    const url = URL.createObjectURL(new Blob([full()], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nyhetsbrev.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-[var(--nw-line)] bg-white">
        <dl className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-[var(--nw-line)] px-4 py-3 text-[13px]">
          <dt className="text-[var(--nw-faint)]">Från</dt>
          <dd className="truncate text-[var(--nw-ink)]">{club.name}</dd>
          <dt className="text-[var(--nw-faint)]">Till</dt>
          <dd className="truncate text-[var(--nw-ink)]">Utskickslistan – medlemmar, föräldrar och supportrar</dd>
          <dt className="text-[var(--nw-faint)]">Ämne</dt>
          <dd className="font-medium text-[var(--nw-ink)] [overflow-wrap:anywhere]">{content.newsletter.subject}</dd>
        </dl>
        <iframe
          title={`Nyhetsbrevet ${content.newsletter.subject}`}
          srcDoc={preview}
          style={{ height }}
          className="block w-full border-0 bg-[#F2F2F4]"
          onLoad={(e) => {
            const doc = e.currentTarget.contentDocument;
            if (doc) setHeight(doc.documentElement.scrollHeight);
          }}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Copy text={full} label="Kopiera HTML-mallen" />
        <button type="button" className={chip} onClick={save}>
          Ladda ner .html
        </button>
        <Copy text={`${content.newsletter.subject}\n\n${content.newsletter.body}`} label="Kopiera ämnesrad och text" />
      </div>
      <p className="mt-2 text-[12.5px] text-[var(--nw-faint)]">Mallen fungerar i Mailchimp, Brevo och de flesta e-postverktyg. Klistra in som HTML.</p>
    </div>
  );
}

function Files({ slogan, assets, photos, printUrl }: { slogan: string; assets: PackAssets | null; photos: PackPhoto[] | null; printUrl?: string }) {
  const figure = "min-w-0";
  const img = "w-full rounded-xl bg-[var(--nw-soft)] object-cover";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {photos === null ? (
        <>
          <Wait className="aspect-[2/3] rounded-xl" text="Fotografen tar bilderna…" />
          <Wait className="aspect-[2/3] rounded-xl" text="Hemmiljön fotas…" />
        </>
      ) : (
        photos.map((p) => (
          <figure key={p.id} className={figure}>
            <div className="relative">
              <img src={p.url} alt={`${slogan} – ${p.label}`} className={`${img} aspect-[2/3]`} />
              <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">AI-genererad</span>
            </div>
            <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px] text-[var(--nw-muted)]">
              <span className="truncate">Foto · {p.label}</span>
              <a href={p.url} download={`foto-${p.id}.jpg`} className="shrink-0 font-medium text-[var(--nw-ink)] underline underline-offset-2">
                Ladda ner
              </a>
            </figcaption>
          </figure>
        ))
      )}
      <figure className={figure}>
        {assets ? <img src={assets.poster} alt={`Affisch ${slogan}`} className={`${img} aspect-[1240/1754]`} /> : <Wait className="aspect-[1240/1754] rounded-xl" text="Affischen byggs…" />}
        <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px] text-[var(--nw-muted)]">
          <span className="truncate">Affisch A4 med QR</span>
          {assets ? (
            <a href={assets.poster} download="affisch-a4.png" className="shrink-0 font-medium text-[var(--nw-ink)] underline underline-offset-2">
              Ladda ner
            </a>
          ) : null}
        </figcaption>
      </figure>
      {printUrl ? (
        <figure className={figure}>
          <img src={printUrl} alt={`Tryckfil ${slogan}`} className="aspect-[3/4] w-full rounded-xl bg-white object-contain ring-1 ring-[var(--nw-line)]" />
          <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px] text-[var(--nw-muted)]">
            <span className="truncate">Tryckfil 300 dpi</span>
            <a href={printUrl} download="tryckfil.png" className="shrink-0 font-medium text-[var(--nw-ink)] underline underline-offset-2">
              Ladda ner
            </a>
          </figcaption>
        </figure>
      ) : null}
      {photos?.length === 0 ? <p className="col-span-2 self-center text-[13px] text-[var(--nw-muted)]">Inga AI-foton den här gången – produktbilderna används i inläggen.</p> : null}
    </div>
  );
}

/** Allt som ska ut i kanalerna, visat exakt som det publiceras – med kopiera och ladda ner på varje del. */
export function PackView(props: {
  club: PackClub;
  slogan: string;
  content: PackContent;
  assets: PackAssets | null;
  photos: PackPhoto[] | null;
  products: Product[];
  shopUrl?: string;
  printUrl?: string;
}) {
  const [tab, setTab] = useState<Tab>("social");
  const shopUrl = props.shopUrl ?? props.club.website;
  return (
    <section className="mt-6">
      <div role="tablist" aria-label="Kanaler" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`h-9 shrink-0 rounded-full px-4 text-[13.5px] font-medium transition-colors ${tab === id ? "bg-[var(--club)] text-white" : "bg-[var(--nw-soft)] text-[var(--nw-ink)] hover:bg-[var(--nw-soft-2)]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4" role="tabpanel">
        {tab === "social" ? <Social club={props.club} slogan={props.slogan} content={props.content} assets={props.assets} photos={props.photos} /> : null}
        {tab === "site" ? <Site club={props.club} slogan={props.slogan} content={props.content} assets={props.assets} shopUrl={props.shopUrl} /> : null}
        {tab === "mail" ? <Mail club={props.club} slogan={props.slogan} content={props.content} assets={props.assets} products={props.products} shopUrl={shopUrl} /> : null}
        {tab === "files" ? <Files slogan={props.slogan} assets={props.assets} photos={props.photos} printUrl={props.printUrl} /> : null}
      </div>
    </section>
  );
}
