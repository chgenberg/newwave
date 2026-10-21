/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs } from "@/components/newwave/sportshop/Crumbs";
import { ProductCard } from "@/components/newwave/sportshop/ProductCard";
import { BASE, CLUBS, type Filter, FILTERS, isFilter, PRODUCTS, shopClub } from "@/lib/newwave/sportshop/data";
import { DICT, matchesQuery } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

type Props = { searchParams: Promise<{ q?: string; kat?: string; verein?: string }> };

export const metadata: Metadata = { title: "Sport Lindner" };

const CHIPS: Filter[] = ["all", "teamwear", "fan", "jerseys", "jackets", "bestseller", "sale"];

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const kat: Filter = isFilter(sp.kat) ? sp.kat : "all";
  const club = sp.verein ? shopClub(sp.verein) : undefined;
  const lang = await shopLang();
  const t = DICT[lang];
  const hits = PRODUCTS.filter((p) => FILTERS[kat](p) && (!club || p.clubId === club.id) && matchesQuery(p, q, lang)).sort((a, b) => b.sold - a.sold);
  const href = (next: { kat?: Filter; verein?: string | null }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const k = next.kat ?? kat;
    if (k !== "all") params.set("kat", k);
    const v = next.verein === undefined ? club?.id : next.verein;
    if (v) params.set("verein", v);
    const s = params.toString();
    return `${BASE}/suche${s ? `?${s}` : ""}`;
  };
  const title = q ? t.searchPage.title(q) : kat === "all" ? t.searchPage.all : t.searchPage.filters[kat];
  const chip = (active: boolean, sale = false) =>
    `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition ${active ? "bg-[#0F2741] text-white" : `bg-white ring-1 ring-[#DADAD6] hover:ring-[#0F2741] ${sale ? "text-[#D7262E]" : "text-[#3A3833]"}`}`;
  return (
    <>
      <Crumbs items={[{ label: t.product.crumbsHome, href: BASE }, { label: title }]} />
      <section className="mx-auto max-w-[1320px] px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-[28px] font-black tracking-[-0.01em] text-[#0F2741] sm:text-[34px]">{title}</h1>
          <p className="text-[13.5px] text-[#6F6B63]">{t.searchPage.count(hits.length)}</p>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {CHIPS.map((k) => (
            <Link key={k} href={href({ kat: k })} aria-current={k === kat ? "true" : undefined} className={chip(k === kat, k === "sale")}>
              {t.searchPage.filters[k]}
            </Link>
          ))}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Link href={href({ verein: null })} aria-current={!club ? "true" : undefined} className={chip(!club)}>
            {t.searchPage.allClubs}
          </Link>
          {CLUBS.map((c) => (
            <Link key={c.id} href={href({ verein: c.id })} aria-current={club?.id === c.id ? "true" : undefined} className={chip(club?.id === c.id)}>
              <img src={c.crest} alt="" className="h-5 w-5 object-contain" />
              {c.short}
            </Link>
          ))}
        </div>
        {hits.length ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {hits.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 rounded-[18px] bg-white p-8 text-center text-[15px] text-[#55524B] ring-1 ring-[#ECECE9]">{t.searchPage.empty}</p>
        )}
      </section>
    </>
  );
}
