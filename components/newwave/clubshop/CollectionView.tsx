/* eslint-disable @next/next/no-img-element -- produktbilderna kommer från klubbens kollektion */
import Link from "next/link";
import type { CollectionDrop, CollectionItem } from "@/lib/newwave/clubCollection";
import { DELIVERY_DAYS, kr } from "./pricing";

export function CollectionTile({ item, href, latest }: { item: CollectionItem; href: string; latest?: boolean }) {
  const img = item.images[0];
  return (
    <Link href={href} className="group block">
      <span className="relative block aspect-square overflow-hidden rounded-[18px] bg-[#F3F2EF]">
        <img src={img.url} alt={img.alt} loading="lazy" className={`absolute inset-0 h-full w-full transition duration-500 group-hover:scale-[1.04] ${img.kind === "mockup" ? "object-contain p-3" : "object-cover"}`} />
        {latest ? <span className="absolute left-3 top-3 rounded-full bg-[var(--shop)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--shop-on)]">Nyhet</span> : null}
      </span>
      <span className="mt-3 block truncate text-[15px] font-semibold">{item.name}</span>
      <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="truncate text-[#6F6B63]">{item.slogan}</span>
        <span className="shrink-0 font-semibold">{kr(item.priceSek)}</span>
      </span>
    </Link>
  );
}

/** Kollektionerna överst i butiken: veckans först. */
export function CollectionSections({ drops, href }: { drops: CollectionDrop[]; href: (item: CollectionItem) => string }) {
  return drops.map((d) => (
    <section key={d.id} id={d.latest ? "kollektion" : `kollektion-${d.id}`} aria-labelledby={`${d.id}-rubrik`} className="scroll-mt-20 pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--shop-line)] pb-3">
        <h2 id={`${d.id}-rubrik`} className="text-[24px] font-black tracking-[-0.02em] sm:text-[28px]">
          {d.latest ? "Veckans kollektion" : d.slogan}
        </h2>
        <p className="text-[14px] text-[#6F6B63]">{d.latest ? `”${d.slogan}” – tryckt på beställning, bara en kort tid` : "Tidigare kollektion"}</p>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4">
        {d.items.map((it) => (
          <li key={it.id} className="min-w-0">
            <CollectionTile item={it} href={href(it)} latest={d.latest} />
          </li>
        ))}
      </ul>
    </section>
  ));
}

/** En vara ur kollektionen; `children` är det man gör med den – köper hos Intersport eller går dit. */
export function CollectionView({ item, more, clubName, home, base, children }: { item: CollectionItem; more: CollectionItem[]; clubName: string; home: string; base: string; children: React.ReactNode }) {
  const details = [
    ["Kollektion", item.slogan],
    ["Storlekar", item.sizes.length > 1 ? `${item.sizes[0]}–${item.sizes.at(-1)}` : "One size"],
    ["Leverans", `Trycks på beställning, ${DELIVERY_DAYS[0]}–${DELIVERY_DAYS[1]} arbetsdagar`],
  ];
  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
      <nav aria-label="Brödsmulor" className="pt-5 text-[13px] text-[#6F6B63]">
        <Link href={home} className="hover:text-[#111]">
          {clubName}
        </Link>
        {" / "}
        <Link href={`${home}#kollektion`} className="hover:text-[#111]">
          {item.slogan}
        </Link>
        {" / "}
        <span className="text-[#111]">{item.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:self-start">
          {item.images.map((img, i) => (
            <img key={img.url} src={img.url} alt={img.alt} className={`aspect-square w-full rounded-[20px] bg-[#F3F2EF] ${i === 0 ? "col-span-2 rounded-[24px]" : ""} ${img.kind === "mockup" ? "object-contain p-4" : "object-cover"}`} />
          ))}
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#6F6B63]">
            {clubName} · {item.slogan}
          </p>
          <h1 className="mt-1 text-[30px] font-black leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[38px]">{item.name}</h1>
          <p className="mt-3 text-[24px] font-bold">{kr(item.priceSek)}</p>
          <p className="text-[13px] text-[#6F6B63]">Inklusive moms · trycks på beställning</p>
          {item.description ? <p className="mt-4 text-[15px] leading-relaxed text-[#3A3A3C]">{item.description}</p> : null}
          {children}
          <dl className="mt-8 divide-y divide-[#ECEAE5] border-y border-[#ECEAE5] text-[14px]">
            {details.map(([k, val]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-3">
                <dt className="text-[#6F6B63]">{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {more.length ? (
        <section className="mt-16">
          <h2 className="text-[22px] font-black tracking-[-0.02em]">Mer ur ”{item.slogan}”</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-4">
            {more.map((it) => (
              <li key={it.id} className="min-w-0">
                <CollectionTile item={it} href={`${base}/${it.id}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
