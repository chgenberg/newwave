/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { OfficeMail } from "@/components/newwave/PackZip";
import type { CaseMotif } from "@/lib/newwave/clubCase";
import { fmtBytes } from "@/lib/newwave/hubFormats";
import { caseDelivery, deliveryStats, fileUrl } from "@/lib/newwave/hubDelivery";
import type { ZipPack } from "@/lib/newwave/packZip";
import type { PackAssets, PackContent, PackPhoto } from "@/lib/newwave/store";

type Product = { id: string; name: string; priceSek: number; mockupUrl: string };

const TZ = "Europe/Stockholm";
const fmtTime = (iso: string) => new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

function Head({ kicker, title, lead }: { kicker: string; title: string; lead: string }) {
  return (
    <header className="max-w-[640px]">
      <p className="nw-kicker">{kicker}</p>
      <h2 className="nw-club-heading mt-2 text-[28px] leading-[1.02] text-[var(--club)] sm:text-[38px]">{title}</h2>
      <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--nw-muted)]">{lead}</p>
    </header>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5 text-[12.5px]">
      <span className="w-[68px] shrink-0 text-[var(--nw-muted)]">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
        <span className="block h-full rounded-full bg-[var(--club)]" style={{ width: `${value * 10}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right font-medium tabular-nums text-[var(--nw-ink)]">{value}/10</span>
    </div>
  );
}

/** Steg 1 och 2: veckans signaler, fyra motiv och granskarnas betyg. */
export function MotifSection({ signals, motifs, picked, art }: { signals: { title: string; detail: string }[]; motifs: CaseMotif[]; picked: number; art: string }) {
  const win = motifs[picked];
  const rest = motifs.filter((_, i) => i !== picked);
  return (
    <>
      <Head
        kicker="Steg 1 och 2 · söndag"
        title="Fyra motiv. Det bästa vann."
        lead="Agenten läste veckans signaler och föreslog fyra motiv. Två granskare – en för varumärket och en för försäljningen – satte betyg, och det bästa gick vidare."
      />
      <ul className="mt-6 flex flex-wrap gap-2">
        {signals.map((s) => (
          <li key={s.title} className="rounded-full bg-[var(--nw-soft)] px-3.5 py-1.5 text-[13px] text-[var(--nw-ink)]">
            <span className="font-medium">{s.title}</span> <span className="text-[var(--nw-muted)]">· {s.detail}</span>
          </li>
        ))}
      </ul>
      <article className="mt-5 grid gap-5 rounded-[24px] bg-[var(--club-soft)] p-4 ring-1 ring-[var(--club-accent)] sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
        <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl bg-white p-4">
          <img src={art} alt={`Tryckfilen ${win.slogan}`} className="max-h-full w-auto object-contain" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--club)] px-2.5 py-1 text-[11.5px] font-semibold text-white">Valt</span>
            <span className="text-[12.5px] text-[var(--nw-muted)]">{win.signal}</span>
          </div>
          <h3 className="nw-club-heading mt-3 text-[30px] leading-none text-[var(--club)] [overflow-wrap:anywhere] sm:text-[40px]">{win.slogan}</h3>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--nw-ink)]">{win.story}</p>
          <div className="mt-auto flex flex-col gap-2 pt-5">
            <Score label="Varumärke" value={win.brand} />
            <Score label="Sälj" value={win.sales} />
          </div>
          <p className="mt-3 text-[13px] leading-snug text-[var(--nw-muted)]">Granskarna: {win.note}</p>
        </div>
      </article>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {rest.map((m) => (
          <li key={m.slogan} className="flex min-w-0 flex-col rounded-[20px] bg-[var(--nw-soft)] p-4">
            <p className="text-[12px] text-[var(--nw-faint)]">{m.signal}</p>
            <p className="nw-club-heading mt-1.5 text-[19px] leading-tight text-[var(--club)] [overflow-wrap:anywhere]">{m.slogan}</p>
            <p className="mt-1.5 text-[13px] leading-snug text-[var(--nw-muted)]">{m.story}</p>
            <div className="mt-auto flex flex-col gap-1.5 pt-4">
              <Score label="Varumärke" value={m.brand} />
              <Score label="Sälj" value={m.sales} />
            </div>
            <p className="mt-2.5 text-[12.5px] leading-snug text-[var(--nw-muted)]">{m.note}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Tile({ src, alt, label, ratio, contain }: { src: string; alt: string; label: string; ratio: number; contain?: boolean }) {
  return (
    <figure className="relative min-w-0 overflow-hidden rounded-2xl bg-[var(--nw-soft)]" style={{ aspectRatio: ratio, flex: ratio }}>
      <img src={src} alt={alt} loading="lazy" className={`h-full w-full ${contain ? "object-contain" : "object-cover"}`} />
      <figcaption className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-full bg-black/60 px-2.5 py-1 text-[11.5px] font-medium text-white backdrop-blur">{label}</figcaption>
    </figure>
  );
}

/** Steg 3: allt som tas fram – tryckfil, foton, kanalernas bilder, produktbilder och texterna. */
export function PackSection({ slogan, assets, photos, products, content }: { slogan: string; assets: PackAssets; photos: PackPhoto[]; products: Product[]; content: PackContent }) {
  const photo = (id: string) => photos.find((p) => p.id === id);
  const life = photo("livsstil");
  const home = photo("filt");
  const tags = content.instagram.hashtags.map((h) => `#${h}`).join(" ");
  const lead = content.newsletter.body.split(/\n{2,}/)[1] ?? "";
  return (
    <>
      <Head
        kicker="Steg 3 · söndag natt"
        title="Ett komplett paket."
        lead="Vinnaren blir tryckfil i 300 dpi, AI-foton med det riktiga trycket, inlägg, story, hemsidebanner, affisch och produktbilder – och alla texter är skrivna."
      />
      <div className="mt-6 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:flex">
          {life ? <Tile src={life.url} alt={`${slogan} – AI-foto`} label="AI-foto · Livsstil" ratio={2 / 3} /> : null}
          <Tile src={assets.feed} alt={`Instagraminlägg ${slogan}`} label="Instagram 4:5" ratio={4 / 5} />
          <Tile src={assets.story} alt={`Story ${slogan}`} label="Story 9:16" ratio={9 / 16} />
          {home ? <Tile src={home.url} alt={`${slogan} – ${home.label}`} label={`AI-foto · ${home.label}`} ratio={2 / 3} /> : null}
        </div>
        <Tile src={assets.banner} alt={`Hemsidebanner ${slogan}`} label="Hemsidebanner 1920 × 600" ratio={1920 / 600} />
        <div className="grid grid-cols-2 gap-3 sm:flex">
          {products.map((p) => (
            <Tile key={p.id} src={p.mockupUrl} alt={`${slogan} – ${p.name}`} label={p.name} ratio={1} contain />
          ))}
          <Tile src={assets.poster} alt={`Affisch ${slogan}`} label="Affisch A4 med QR" ratio={1240 / 1754} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <section className="rounded-[20px] bg-[var(--nw-soft)] p-4">
          <p className="nw-kicker">Instagram och Facebook</p>
          <p className="mt-2 text-[13.5px] leading-snug text-[var(--nw-ink)]">{content.instagram.caption}</p>
          <p className="mt-1.5 text-[12.5px] text-[#00376B] [overflow-wrap:anywhere]">{tags}</p>
        </section>
        <section className="rounded-[20px] bg-[var(--nw-soft)] p-4">
          <p className="nw-kicker">Nyhetsbrev</p>
          <p className="mt-2 text-[14px] font-medium leading-snug text-[var(--nw-ink)]">{content.newsletter.subject}</p>
          <p className="mt-1.5 line-clamp-5 text-[13px] leading-snug text-[var(--nw-muted)]">{lead}</p>
        </section>
        {content.tiktok ? (
          <section className="rounded-[20px] bg-[var(--nw-soft)] p-4">
            <p className="nw-kicker">Reels och TikTok</p>
            <p className="mt-2 text-[14px] font-medium leading-snug text-[var(--nw-ink)]">{content.tiktok.hook}</p>
            <ol className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-snug text-[var(--nw-muted)]">
              {content.tiktok.script.map((s) => (
                <li key={s}>{s.split(": ").slice(1).join(": ") || s}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** Steg 4: måndagsmejlet till kansliet med zip-filen. */
export function MailSection({ pack, agent, sentAt }: { pack: ZipPack; agent: string; sentAt: string }) {
  return (
    <>
      <Head
        kicker="Steg 4 · måndag 07.00"
        title="Allt i ett mejl till kansliet."
        lead="På måndagsmorgonen landar paketet hos kansliet: en zip med varje bild, text och en guide för vad som ska upp var och när. Inget publiceras automatiskt."
      />
      <OfficeMail pack={pack} agent={agent} sentAt={sentAt} />
    </>
  );
}

const METHOD_CHIP = "rounded-full bg-[var(--nw-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--nw-ink)]";

/** Steg 5: godkännandet och tryckfilerna som vår hubb skickar till New Waves hubb. */
export async function HubSection({ approvedAt }: { approvedAt: string }) {
  const d = await caseDelivery();
  if (!d) return null;
  const stats = deliveryStats(d);
  return (
    <>
      <Head
        kicker="Steg 5 · godkänt"
        title="Ett klick – och det trycks."
        lead="Kansliet godkände. Samma sekund gjorde vår hubb produktionsfilerna för varje produkt, i exakt det format tryckeriet, brodyren och sublimeringen vill ha, och skickade dem till New Waves hubb."
      />
      <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--club-soft)] px-3.5 py-1.5 text-[13.5px] text-[var(--nw-ink)] ring-1 ring-[var(--club-accent)]">
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-[var(--club)] text-[11px] text-white">
          ✓
        </span>
        Godkänt av kansliet {fmtTime(approvedAt)}
      </p>
      <div className="mt-4 rounded-[24px] bg-[var(--club)] p-4 text-white sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="nw-mono text-[13px]">POST /v1/print-jobs → New Waves hubb</p>
          <p className="nw-mono ml-auto text-[12px] text-white/75">Byggt av demot · skickas i produktion</p>
        </div>
        <p className="mt-1.5 text-[13px] text-white/70">
          {d.jobs.length} tryckjobb · {stats.files} produktionsfiler · {fmtBytes(stats.bytes)} · med kontrollsumma per fil
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {d.jobs.map((j) => (
            <li key={j.key} className="min-w-0 rounded-2xl bg-white p-2.5 text-[var(--nw-ink)]">
              <div className="relative aspect-square overflow-hidden rounded-xl" style={{ background: j.color.hex }}>
                <img src={fileUrl(j.key, j.preview)} alt={`Korrektur ${j.product}`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2" />
              </div>
              <p className="mt-2 truncate text-[13.5px] font-medium">{j.product}</p>
              <p className="mt-0.5 truncate text-[12px] text-[var(--nw-muted)]">
                {j.methodLabel} → {j.receiver.toLowerCase()}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {[...new Set(j.files.map((f) => f.format))].map((f) => (
                  <li key={f} className={METHOD_CHIP}>
                    {f}
                  </li>
                ))}
                <li className="px-1 py-0.5 text-[11.5px] text-[var(--nw-muted)]">{j.files.length} filer</li>
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <Link href={`/newwave/new-wave/tryckfiler/${d.id}`} className="nw-hit mt-4 inline-block text-[13.5px] font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4">
        Se leveransen som New Wave ser den →
      </Link>
    </>
  );
}

export function HubSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-[var(--nw-soft)]" />
      ))}
      <p className="col-span-full text-[13px] text-[var(--nw-muted)]">Hubben gör tryckfilerna…</p>
    </div>
  );
}

/** Steg 5, samtidigt: produkterna i klubbens butik hos Intersport. */
export function ShopSection({ club, logo, slogan, week, products }: { club: string; logo: string; slogan: string; week: number; products: Product[] }) {
  return (
    <>
      <Head
        kicker="Steg 5 · samtidigt"
        title="Ute i klubbens butik."
        lead="Produkterna publicerades i klubbshoppen hos Intersport. Allt trycks på beställning – inget lager, inget svinn – och varje köp stöttar föreningen."
      />
      <div className="mt-6 overflow-hidden rounded-[24px] border border-[var(--nw-line)] bg-white shadow-[0_30px_60px_-40px_rgba(17,17,17,0.35)]">
        <div className="flex items-center gap-3 border-b border-[var(--nw-line)] bg-[var(--nw-soft)] px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate rounded-full bg-white px-3 py-1 text-center text-[12px] text-[var(--nw-muted)]">team.intersport.se/asa-if</span>
        </div>
        <div className="flex items-center gap-6 border-b border-[var(--nw-line)] bg-white px-4 py-3.5 sm:px-6">
          <img src="/intersport-logo.svg" alt="Intersport" className="h-[15px] w-auto sm:h-[17px]" />
          <nav aria-hidden className="hidden gap-4 text-[12.5px] text-[#3A3A3C] sm:flex">
            <span>Herr</span>
            <span>Dam</span>
            <span>Barn</span>
            <span>Sport</span>
            <span className="font-semibold text-[#164196]">Klubbshop</span>
          </nav>
        </div>
        <div className="px-4 py-5 sm:px-6">
          <p className="text-[12px] text-[var(--nw-faint)]">Klubbshop › {club}</p>
          <div className="mt-3 flex items-center gap-3">
            <img src={logo} alt="" className="h-11 w-auto" />
            <div className="min-w-0">
              <p className="nw-club-heading text-[22px] leading-none text-[var(--club)]">{club}</p>
              <p className="mt-1 text-[12.5px] text-[var(--nw-muted)]">Officiell klubbshop · varje köp stöttar föreningen</p>
            </div>
          </div>
          <p className="mt-5 text-[13px] font-semibold text-[var(--nw-ink)]">
            Nyhet vecka {week}: {slogan}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
            {products.map((p) => (
              <li key={p.id} className="min-w-0">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-[#F4F4F2]">
                  <img src={p.mockupUrl} alt={`${slogan} – ${p.name}`} loading="lazy" className="h-full w-full object-contain" />
                  <span className="absolute left-2 top-2 rounded bg-[#E2001A] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">Nyhet</span>
                </div>
                <p className="mt-2 truncate text-[13.5px] font-medium text-[var(--nw-ink)]">
                  {slogan} – {p.name}
                </p>
                <p className="text-[14px] font-bold text-[var(--nw-ink)]">{p.priceSek} kr</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--nw-muted)]">Trycks på beställning · 5–7 dagar</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
