/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { HeroVideo } from "@/components/newwave/sportshop/HeroVideo";
import { ProductCard, ProductImage } from "@/components/newwave/sportshop/ProductCard";
import { BASE, bestsellers, CLUBS, clubProducts, type Filter, SHOP, shopProduct } from "@/lib/newwave/sportshop/data";
import { DICT, sportsOf } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

const USP_ICONS = [
  "M2 7h11v9H2zM13 10h4.5l3.5 3.5V16h-8zM6 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM17 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  "M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5",
  "M6 3h9l4 4v14H6zM14.5 3v4.5H19M9 12h7M9 16h5",
  "M4 9.5L5.5 4h13L20 9.5M4 9.5h16M4 9.5V20h16V9.5M9.5 20v-5.5h5V20",
];

/** Kategorirutorna visar en vara ur kategorin från var sin klubb. */
const TILES: { filter: Filter; product: string }[] = [
  { filter: "jerseys", product: "tus-brackwede-home" },
  { filter: "jackets", product: "sc-sennestadt-training" },
  { filter: "fan", product: "fc-heepen-hoodie" },
  { filter: "sale", product: "vfb-joellenbeck-rain" },
];

export default async function SportshopHome() {
  const lang = await shopLang();
  const t = DICT[lang];
  return (
    <>
      <section className="relative isolate overflow-hidden bg-[#0B1A2C]">
        <div className="relative h-[min(72vh,640px)] min-h-[440px]">
          <HeroVideo />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,16,28,0.82)_0%,rgba(6,16,28,0.45)_45%,rgba(6,16,28,0)_75%)]" />
          <div className="relative mx-auto flex h-full max-w-[1320px] flex-col justify-end px-4 pb-14 sm:px-6 md:justify-center md:pb-0">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.18em] text-[#FF6A13]">{t.hero.kicker}</p>
            <h1 className="mt-3 max-w-[11ch] text-[44px] font-black leading-[0.95] tracking-[-0.02em] text-white sm:text-[64px] lg:text-[76px]">{t.hero.title}</h1>
            <p className="mt-4 max-w-[480px] text-[15.5px] leading-relaxed text-white/85 sm:text-[17px]">{t.hero.text}</p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <a href="#vereine" className="inline-flex h-12 items-center rounded-full bg-[#FF6A13] px-6 text-[15px] font-semibold text-white transition hover:bg-[#E85A06]">
                {t.hero.cta}
              </a>
              <a href="#bestseller" className="inline-flex h-12 items-center rounded-full bg-white/15 px-6 text-[15px] font-semibold text-white backdrop-blur-md transition hover:bg-white/25">
                {t.hero.secondary}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section aria-label={t.topbar.join(", ")} className="border-b border-[#ECECE9] bg-white">
        <ul className="mx-auto grid max-w-[1320px] grid-cols-2 gap-px px-4 sm:px-6 lg:grid-cols-4">
          {t.usp.map((u, i) => (
            <li key={u.title} className="flex items-center gap-3 py-4 lg:justify-center">
              <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 fill-none stroke-[#0F2741]" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={USP_ICONS[i]} />
              </svg>
              <span className="leading-tight">
                <span className="block text-[13.5px] font-bold text-[#111]">{u.title}</span>
                <span className="block text-[12.5px] text-[#6F6B63]">{u.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="vereine" className="mx-auto max-w-[1320px] scroll-mt-4 px-4 pt-14 sm:px-6">
        <div className="max-w-[640px]">
          <h2 className="text-[30px] font-black tracking-[-0.01em] text-[#0F2741] sm:text-[36px]">{t.clubs.title}</h2>
          <p className="mt-2 text-[15.5px] text-[#55524B]">{t.clubs.text}</p>
        </div>
        <ul className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {CLUBS.map((c) => (
            <li key={c.id}>
              <Link href={`${BASE}/${c.id}`} className="group relative flex h-full flex-col items-center overflow-hidden rounded-[18px] bg-white px-4 pb-5 pt-7 text-center ring-1 ring-[#ECECE9] transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-28px_rgba(15,39,65,0.5)]">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${c.colors.main} 0 70%, ${c.colors.second === "#FFFFFF" ? "#E4E4E1" : c.colors.second} 70% 100%)` }} />
                <img src={c.crest} alt="" className="h-24 w-24 object-contain transition duration-500 group-hover:scale-105 sm:h-32 sm:w-32" />
                <span className="mt-4 text-[15px] font-bold leading-tight text-[#111] sm:text-[16.5px]">{c.name}</span>
                <span className="mt-1 text-[12.5px] text-[#6F6B63]">
                  {sportsOf(c, lang)} · {t.clubs.since} {c.founded}
                </span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0F2741]">
                  {t.clubs.shop}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current transition group-hover:translate-x-0.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="bestseller" className="mx-auto max-w-[1320px] scroll-mt-4 px-4 pt-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[30px] font-black tracking-[-0.01em] text-[#0F2741] sm:text-[36px]">{t.best.title}</h2>
            <p className="mt-1 text-[15.5px] text-[#55524B]">{t.best.text}</p>
          </div>
          <Link href={`${BASE}/suche`} className="text-[14px] font-semibold text-[#0F2741] underline-offset-4 hover:underline">
            {t.best.all} →
          </Link>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {bestsellers().map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6">
        <h2 className="text-[24px] font-black tracking-[-0.01em] text-[#0F2741]">{t.categoryTitle}</h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {TILES.map(({ filter, product }) => {
            const p = shopProduct(product)!;
            return (
              <li key={filter}>
                <Link href={`${BASE}/suche?kat=${filter}`} className="group relative block overflow-hidden rounded-[18px] bg-white ring-1 ring-[#ECECE9]">
                  <ProductImage product={p} className="transition duration-500 group-hover:scale-[1.04]" />
                  <span className={`absolute bottom-3 left-3 rounded-full px-3.5 py-1.5 text-[14px] font-bold shadow-[0_2px_8px_rgba(0,0,0,0.12)] ${filter === "sale" ? "bg-[#D7262E] text-white" : "bg-white text-[#0F2741]"}`}>{t.searchPage.filters[filter]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6">
        <div className="grid overflow-hidden rounded-[22px] bg-[#0F2741] text-white md:grid-cols-[1.1fr_1fr]">
          <div className="p-7 sm:p-10">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.18em] text-[#FF6A13]">{t.partner.kicker}</p>
            <h2 className="mt-3 text-[28px] font-black leading-tight sm:text-[34px]">{t.partner.title}</h2>
            <p className="mt-3 max-w-[520px] text-[15.5px] leading-relaxed text-white/75">{t.partner.text}</p>
            <p className="mt-6 text-[14px] text-white/70">
              <span className="font-semibold text-white">{t.partner.contact}:</span> {SHOP.phone}
            </p>
          </div>
          <div className="relative grid min-h-[240px] grid-cols-3 items-end gap-2 bg-[linear-gradient(160deg,#16365A,#0F2741)] p-5">
            {CLUBS.slice(0, 3).map((c) => (
              <img key={c.id} src={clubProducts(c.id, "teamwear")[0].image} alt="" className="aspect-square w-full rounded-[12px] bg-white object-contain" />
            ))}
            <span className="absolute right-5 top-5 text-[22px] font-black italic tracking-[0.02em]">CRAFT</span>
          </div>
        </div>
      </section>
    </>
  );
}
