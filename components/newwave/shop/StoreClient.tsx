"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { nwProduct, type NwProduct } from "@/lib/newwave/catalog";
import { type Occasion, occasion as occasionOf, type OccasionId } from "@/lib/newwave/occasions";
import { genitive, useBrandedScene } from "./brandAgent";
import { BrandIntake, EventPicker } from "./BrandIntake";
import { type CustomerLogo, useCart } from "./cart";
import { CATEGORY_EVENT, CartLink } from "./ShopClient";
import { StoreSearch } from "./StoreSearch";

type Search = { slug: string; products: string[]; occasions: OccasionId[]; markup: number };

/** Butikens sidhuvud: sök (utom på startsidan, där sökrutan är stor), menyn, Dashboard och varukorgen. */
export function StoreHeader({ brand, search, preview }: { brand: React.ReactNode; search: Search; preview?: boolean }) {
  const home = `/newwave/s/${search.slug}`;
  const onHome = usePathname() === home;
  const events = search.occasions.length > 0;
  const links = [
    { href: `${home}#produkter`, label: "Produkter" },
    ...(events ? [{ href: `${home}#event`, label: "Event" }] : []),
    { href: `${home}#om`, label: "Om oss" },
  ];
  return (
    <header className={`${preview ? "" : "sticky top-0 z-30 backdrop-blur-md"} border-b border-[var(--shop-line)] bg-white/90`}>
      <div className="mx-auto flex h-[68px] max-w-[1320px] items-center gap-3 px-5 @4xl:gap-6 @4xl:px-8">
        <Link href={home} className="shrink-0">
          {brand}
        </Link>
        {onHome || preview ? null : (
          <div className="hidden w-full max-w-[380px] @4xl:block">
            <StoreSearch {...search} variant="header" />
          </div>
        )}
        <nav className="ml-auto hidden items-center gap-6 text-[14px] font-medium @4xl:flex" aria-label="Butiken">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="py-2.5 opacity-70 transition-opacity hover:opacity-100">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 @4xl:ml-0">
          {preview ? null : (
            <Link href="/newwave/shop/butiken" className="group inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] @md:pl-4 @md:pr-1.5 font-semibold shadow-[inset_0_0_0_1px_var(--shop-line)] transition-shadow hover:shadow-[inset_0_0_0_1px_#1D1D1F]" title="Redigera butiken som återförsäljare">
              Dashboard
              <span className="hidden rounded-full bg-[#1D1D1F] px-2 py-1 text-[10px] font-bold leading-none tracking-[0.08em] text-white @md:inline">DEMO</span>
            </Link>
          )}
          <CartLink slug={search.slug} preview={preview} />
        </div>
      </div>
    </header>
  );
}

/** Startsidans topp: "Vilken typ av event ska ni ha?", sökrutan, tillfällena och karusellen med scenerna. */
export function StoreHero({ tagline, search, preview }: { tagline: string; search: Search; preview?: boolean }) {
  const [cart] = useCart(search.slug);
  const logo = preview ? null : cart.logo;
  const events = search.occasions.map((id) => occasionOf(id)!);
  return (
    <section className="bg-white">
      <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-5 pb-12 pt-8 @4xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] @4xl:gap-14 @4xl:px-8 @4xl:pb-16 @4xl:pt-12">
        <div className="min-w-0">
          {tagline ? <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">{tagline}</p> : null}
          <h1 className="mt-3 text-[40px] font-bold leading-[1.02] tracking-[-0.035em] @2xl:text-[52px] @6xl:text-[60px]">{events.length ? "Vilken typ av event ska ni ha?" : "Vad behöver ni?"}</h1>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed opacity-65 @2xl:text-[17px]">
            {logo ? `Allt visas med ${genitive(logo.name)} logga. Sök eller välj ett tillfälle.` : "Sök bland event och produkter. Allt trycks med er logga, och ni ser resultatet innan ni beställer."}
          </p>
          <StoreSearch {...search} variant="hero" />
          {events.length ? (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Tillfällen">
              {events.map((o) => (
                <li key={o.id}>
                  <Link href={`/newwave/s/${search.slug}/event/${o.id}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 text-[13.5px] font-semibold shadow-[inset_0_0_0_1px_var(--shop-line)] transition hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_var(--shop)]">
                    <img src={o.scene} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />
                    {o.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {events.length ? <HeroCarousel slug={search.slug} events={events} logo={logo} /> : null}
      </div>
    </section>
  );
}

const DURATION = 6000;

function Slide({ o, logo, on }: { o: Occasion; logo: CustomerLogo | null; on: boolean }) {
  const branded = useBrandedScene(o.id, logo);
  return <img src={branded ?? o.scene} alt={o.title} className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] ${on ? "scale-100 opacity-100 duration-[1100ms,7000ms]" : "scale-[1.08] opacity-0 duration-[1100ms,0ms]"}`} style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1), linear" }} />;
}

/** Scenerna en i taget, med kundens logga när den finns. Pausar när muspekaren är över, lutar lätt mot pekaren. */
function HeroCarousel({ slug, events, logo }: { slug: string; events: Occasion[]; logo: CustomerLogo | null }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const touch = useRef<number | null>(null);
  const go = useCallback((n: number) => setI((n + events.length) % events.length), [events.length]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(i + 1), DURATION);
    return () => clearTimeout(t);
  }, [i, paused, go]);

  const o = events[i];
  return (
    <div
      className="relative min-w-0 [perspective:1400px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => (setPaused(false), setTilt({ x: 0, y: 0 }))}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -4, y: ((e.clientX - r.left) / r.width - 0.5) * 6 });
      }}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
      aria-roledescription="karusell"
      aria-label="Tillfällena"
    >
      <div className="relative aspect-[3/2] overflow-hidden rounded-[32px] bg-[#E9E5DD] shadow-[0_40px_80px_-48px_rgba(27,26,23,0.6)] transition-transform duration-500" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
        {events.map((e, n) => (
          <Slide key={e.id} o={e} logo={logo} on={n === i} />
        ))}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 to-transparent" />
        {logo ? <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[12px] font-semibold backdrop-blur">Med {genitive(logo.name)} logga</span> : null}
        <Link key={o.id} href={`/newwave/s/${slug}/event/${o.id}`} className="nw-pop absolute bottom-4 left-4 grid gap-0.5 rounded-[18px] border border-white/30 bg-white/15 py-3 pl-4 pr-5 text-white backdrop-blur-[14px] transition-colors hover:bg-white/30 @2xl:bottom-5 @2xl:left-5">
          <span className="text-[12px] opacity-85">{o.name}</span>
          <b className="text-[16px]">{o.title} →</b>
        </Link>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex max-w-[320px] flex-1 gap-1.5" role="tablist" aria-label="Välj tillfälle">
          {events.map((e, n) => (
            <button key={e.id} type="button" role="tab" aria-selected={n === i} aria-label={e.name} onClick={() => go(n)} className="h-5 flex-1 py-2">
              <i className="relative block h-[3px] overflow-hidden rounded-full bg-black/15">
                {n === i ? <i key={i} className="nw-step-fill absolute inset-y-0 left-0 bg-[#1D1D1F]" style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }} /> : null}
              </i>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[
            { label: "Föregående", d: -1, glyph: "‹" },
            { label: "Nästa", d: 1, glyph: "›" },
          ].map((b) => (
            <button key={b.label} type="button" aria-label={b.label} onClick={() => go(i + b.d)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[22px] leading-none shadow-[inset_0_0_0_1px_var(--shop-line)] transition hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_#1D1D1F]">
              {b.glyph}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Varumärkesrutan: webbadressen eller loggan in, agenten läser av, kunden bekräftar och väljer tillfälle. */
export function BrandBand({ slug, title, text, offered, preview }: { slug: string; title: string; text: string; offered: OccasionId[]; preview?: boolean }) {
  const [picker, setPicker] = useState(false);
  const plan = offered.length ? () => setPicker(true) : undefined;
  return (
    <section className="mx-auto max-w-[1320px] px-5 @4xl:px-8">
      <div className="grid gap-6 rounded-[32px] bg-[var(--shop-bg)] p-6 @2xl:p-9 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @4xl:items-center @4xl:gap-12 @4xl:p-12">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--shop-accent)]" />
            Varumärkesagenten
          </p>
          <h2 className="mt-4 text-[28px] font-bold leading-[1.08] tracking-[-0.025em] text-[var(--shop)] @2xl:text-[38px]">{title || "Er logga på allt"}</h2>
          {text ? <p className="mt-3 max-w-[52ch] text-[15.5px] leading-relaxed opacity-70">{text}</p> : null}
          <ol className="mt-5 grid gap-2 text-[14px]">
            {["Agenten hämtar logga, färger och vad ni gör", "Ni ser scener och produkter med er logga", "Designa i 3D och beställ, eller be om offert"].map((s, n) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--shop)] text-[11.5px] font-bold text-[var(--shop-on)]">{n + 1}</span>
                <span className="opacity-80">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="min-w-0 @4xl:-mt-7">
          <BrandIntake slug={slug} variant="hero" preview={preview} cta={offered.length ? "Ser bra ut – välj tillfälle" : "Ser bra ut – visa produkterna"} onDone={plan} onPlan={plan} />
        </div>
      </div>
      <AnimatePresence>{picker ? <EventPicker key="picker" slug={slug} offered={offered} onClose={() => setPicker(false)} /> : null}</AnimatePresence>
    </section>
  );
}

/** Sortimentet per kategori; en ruta väljer kategorin i produktlistan längre ned. */
export function Assortment({ products }: { products: string[] }) {
  const items = products.map(nwProduct).filter((p): p is NwProduct => Boolean(p));
  const groups = [...new Set(items.map((p) => p.category))].map((c) => ({ name: c, items: items.filter((p) => p.category === c) }));
  if (groups.length < 2) return null;
  return (
    <section className="mx-auto max-w-[1320px] px-5 pt-14 @4xl:px-8 @4xl:pt-20">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[24px] font-bold tracking-[-0.02em] @2xl:text-[28px]">Vårt sortiment</h2>
        <a href="#produkter" className="border-b border-current text-[14px] font-semibold">
          Alla {items.length} →
        </a>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @4xl:grid-cols-5">
        {groups.map((g) => (
          <li key={g.name}>
            <a
              href="#produkter"
              onClick={() => window.dispatchEvent(new CustomEvent(CATEGORY_EVENT, { detail: g.name }))}
              className="group grid rounded-[20px] bg-white shadow-[inset_0_0_0_1px_var(--shop-line)] transition duration-300 hover:-translate-y-[3px] hover:shadow-[0_22px_40px_-26px_rgba(17,17,17,0.45)]"
            >
              <span className="block h-[150px] p-4 @4xl:h-[180px]">
                <img src={g.items[0].photo} alt="" className="h-full w-full object-contain transition-transform duration-700 group-hover:scale-[1.05]" loading="lazy" />
              </span>
              <span className="px-3 pb-4 text-center text-[14px] font-bold tracking-[-0.02em]">
                {g.name}
                <span className="block text-[12px] font-medium opacity-50">{g.items.length} produkter</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SPANS = ["@2xl:col-span-4 @2xl:row-span-2 col-span-2", "@2xl:col-span-2", "@2xl:col-span-2"];

function Tile({ o, href, logo, big }: { o: Occasion; href: string; logo: CustomerLogo | null; big: boolean }) {
  const branded = useBrandedScene(o.id, logo);
  return (
    <Link href={href} className="group relative block h-full min-h-[168px] overflow-hidden rounded-[22px] bg-[#ECE9E3] text-white transition-transform duration-400 hover:-translate-y-0.5">
      <img src={branded ?? o.scene} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]" loading="lazy" />
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(17,16,14,0.72))]" />
      {branded ? <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#1D1D1F]">Med er logga</span> : null}
      <span className={`absolute grid gap-1 ${big ? "bottom-6 left-6 right-16 @4xl:bottom-8 @4xl:left-8" : "bottom-5 left-5 right-5 @2xl:right-16"}`}>
        <span className={`font-bold leading-[1.05] tracking-[-0.03em] ${big ? "text-[26px] @4xl:text-[44px]" : "text-[20px] @4xl:text-[26px]"}`}>{o.name}</span>
        <small className="truncate text-[13.5px] opacity-85">{o.hint}</small>
      </span>
      <span aria-hidden className={`absolute bottom-5 right-5 h-10 w-10 place-items-center rounded-full bg-white text-[#1D1D1F] transition-transform group-hover:translate-x-0.5 ${big ? "grid" : "hidden @2xl:grid"}`}>
        →
      </span>
    </Link>
  );
}

/** "Välj en händelse": scenerna som mosaik, med kundens logga när den finns. */
export function EventMosaic({ slug, offered, preview }: { slug: string; offered: OccasionId[]; preview?: boolean }) {
  const [cart] = useCart(slug);
  if (!offered.length) return null;
  const logo = preview ? null : cart.logo;
  return (
    <section id="event" data-preview="event" className="mx-auto max-w-[1320px] scroll-mt-24 px-5 pt-14 @4xl:px-8 @4xl:pt-20">
      <h2 className="text-[24px] font-bold tracking-[-0.02em] @2xl:text-[28px]">Välj en händelse</h2>
      <p className="mt-1 text-[14px] opacity-60">{logo ? `Agenterna bygger miljön med ${genitive(logo.name)} logga och väljer produkterna som passar.` : "Varje tillfälle har en färdig miljö, produkter som passar och paket i tre nivåer."}</p>
      <ul className="mt-5 grid auto-rows-[168px] grid-cols-2 gap-3 @2xl:auto-rows-[minmax(168px,19cqw)] @2xl:grid-cols-6">
        {offered.map((id, n) => (
          <li key={id} className={`${SPANS[n] ?? "@2xl:col-span-2"}${n === offered.length - 1 && n % 2 === 1 ? " col-span-2" : ""}`}>
            <Tile o={occasionOf(id)!} href={`/newwave/s/${slug}/event/${id}`} logo={logo} big={n === 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}
