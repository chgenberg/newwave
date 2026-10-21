/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/newwave/sportshop/Crumbs";
import { ProductCard, ProductImage } from "@/components/newwave/sportshop/ProductCard";
import { BASE, clubProducts, type Line, shopClub } from "@/lib/newwave/sportshop/data";
import { DICT, sportsOf } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

type Props = { params: Promise<{ klubb: string }>; searchParams: Promise<{ linie?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = shopClub((await params).klubb);
  return club ? { title: `${club.name} · Sport Lindner` } : {};
}

const LINES: Line[] = ["teamwear", "fan"];
/** Bilden på valet: hemmatröjan för Craft-linjen och hoodien för fanartiklarna. */
const COVER: Record<Line, string> = { teamwear: "home", fan: "hoodie" };

export default async function ClubPage({ params, searchParams }: Props) {
  const club = shopClub((await params).klubb);
  if (!club) notFound();
  const line: Line = (await searchParams).linie === "fan" ? "fan" : "teamwear";
  const lang = await shopLang();
  const t = DICT[lang];
  const products = clubProducts(club.id, line);
  return (
    <>
      <Crumbs items={[{ label: t.product.crumbsHome, href: BASE }, { label: t.nav.clubs, href: `${BASE}#vereine` }, { label: club.short }]} />
      <section className="mx-auto mt-4 max-w-[1320px] px-4 sm:px-6">
        <div className="relative isolate grid items-center gap-6 overflow-hidden rounded-[22px] p-6 sm:grid-cols-[auto_1fr] sm:gap-10 sm:p-10" style={{ background: club.colors.main, color: club.colors.on }}>
          <span aria-hidden className="absolute -right-16 -top-24 -z-10 h-[340px] w-[340px] rounded-full opacity-20" style={{ background: club.colors.second }} />
          <span aria-hidden className="absolute -bottom-28 right-40 -z-10 h-[220px] w-[220px] rounded-full opacity-10" style={{ background: club.colors.second }} />
          <span className="grid h-32 w-32 place-items-center rounded-[26px] bg-white p-3 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)] sm:h-40 sm:w-40">
            <img src={club.crest} alt={club.name} className="h-full w-full object-contain" />
          </span>
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.16em] opacity-75">
              {sportsOf(club, lang)} · {t.clubs.since} {club.founded}
            </p>
            <h1 className="mt-2 text-[32px] font-black leading-[1.05] tracking-[-0.01em] sm:text-[46px]">{club.name}</h1>
            <p className="mt-3 max-w-[620px] text-[15.5px] leading-relaxed opacity-85">{t.clubAbout(club, sportsOf(club, lang))}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="linie" className="mx-auto max-w-[1320px] px-4 pt-10 sm:px-6">
        <h2 id="linie" className="text-[22px] font-black text-[#0F2741] sm:text-[26px]">
          {t.line.choose}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {LINES.map((l) => {
            const active = l === line;
            const cover = clubProducts(club.id, l).find((p) => p.kind === COVER[l])!;
            return (
              <li key={l}>
                <Link
                  href={`${BASE}/${club.id}?linie=${l}#sortiment`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`group grid h-full grid-cols-[112px_1fr] items-center gap-4 rounded-[18px] bg-white p-3 pr-5 transition sm:grid-cols-[150px_1fr] ${active ? "ring-2 ring-[#0F2741] shadow-[0_18px_40px_-26px_rgba(15,39,65,0.6)]" : "ring-1 ring-[#ECECE9] hover:ring-[#C9C7C0]"}`}
                >
                  <span className="overflow-hidden rounded-[12px]">
                    <ProductImage product={cover} className="transition duration-500 group-hover:scale-105" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[19px] font-black leading-tight text-[#111] sm:text-[22px]">{t.line[l].title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${l === "teamwear" ? "bg-[#111] text-white" : "bg-[#F1F1EF] text-[#3A3833]"}`}>{t.line[l].tag}</span>
                    </span>
                    <span className="mt-1.5 block text-[14px] leading-snug text-[#55524B]">{t.line[l].text}</span>
                    <span className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-[#0F2741]">
                      {active ? (
                        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-[#0F2741]" aria-hidden>
                          <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zm-1.2 12.1L5.2 10l1.2-1.2 2.4 2.4 4.8-4.8 1.2 1.2z" />
                        </svg>
                      ) : null}
                      {t.line.count(clubProducts(club.id, l).length)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="sortiment" aria-label={t.line[line].title} className="mx-auto max-w-[1320px] scroll-mt-4 px-4 pt-8 sm:px-6">
        <div className="flex items-baseline justify-between gap-3 border-b border-[#ECECE9] pb-3">
          <h2 className="text-[18px] font-bold text-[#111]">
            {t.line[line].title} <span className="font-normal text-[#8A8780]">· {club.short}</span>
          </h2>
          <span className="text-[13px] text-[#6F6B63]">{t.line.count(products.length)}</span>
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} showClub={false} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
