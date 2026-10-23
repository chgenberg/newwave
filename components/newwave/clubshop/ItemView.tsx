/* eslint-disable @next/next/no-img-element -- mockups och wordmarks ritas per klubb */
import Link from "next/link";
import { mockupUrl, printArt, type ShopGroup, type ShopItem, wordmarkSpec } from "@/lib/newwave/clubShop";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { DELIVERY_DAYS, kr } from "./pricing";
import { ProductTile } from "./ProductTile";

/**
 * Varan med bilder, fakta och fler i samma stil. `base` är butiken varan visas i – klubbens butik eller klubbshoppen hos
 * Intersport – och `children` det man gör med varan där.
 */
export function ItemView({ item, groups, clubId, clubName, v, base, home, children }: { item: ShopItem; groups: ShopGroup[]; clubId: string; clubName: string; v: string; base: string; home: string; children: React.ReactNode }) {
  const p = item.product;
  const spec = wordmarkSpec(item.template.id, item.worn);
  const group = groups.find((g) => g.id === item.group);
  const more = (group?.items ?? []).filter((x) => x.id !== item.id).slice(0, 4);
  const details = [
    ["Plagg", `${p.name}, ${p.garmentColor.toLowerCase()}`],
    ["Wordmark", `${item.template.name} · ${item.template.style}${item.worn ? ", slitet tryck" : ""}`],
    ["Storlekar", p.sizes.length > 1 ? `${p.sizes[0]}–${p.sizes.at(-1)}` : "One size"],
    ["Tryck", item.method],
    ["Passar till", p.use],
    ["Leverans", `Trycks på beställning, ${DELIVERY_DAYS[0]}–${DELIVERY_DAYS[1]} arbetsdagar`],
  ];

  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
      <nav aria-label="Brödsmulor" className="pt-5 text-[13px] text-[#6F6B63]">
        <Link href={home} className="hover:text-[#111]">
          {clubName}
        </Link>
        {group ? (
          <>
            {" / "}
            <Link href={`${home}#${group.id}`} className="hover:text-[#111]">
              {group.name}
            </Link>
          </>
        ) : null}
        {" / "}
        <span className="text-[#111]">{item.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:self-start">
          <img src={mockupUrl(p, spec, clubId, v, 1200)} alt={item.name} className="col-span-2 aspect-square w-full rounded-[24px] bg-[#F3F2EF] object-cover" />
          <figure className="relative aspect-square overflow-hidden rounded-[20px]" style={{ background: p.garmentHex }}>
            <img src={printArt(p, spec, clubId, v, 800)} alt={`${item.template.name} som det trycks`} className="absolute inset-[14%] h-[72%] w-[72%] object-contain" />
          </figure>
          <div className="flex aspect-square flex-col justify-end rounded-[20px] bg-[var(--shop-bg)] p-5">
            <p className="text-[15px] font-semibold">{item.template.name}</p>
            <p className="mt-1 text-[13px] leading-snug text-[#4A4740]">Ritat med {genitive(clubName)} namn, färger och märke – precis så här trycks det på plagget.</p>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#6F6B63]">{clubName}</p>
          <h1 className="mt-1 text-[30px] font-black leading-[1.05] tracking-[-0.02em] sm:text-[38px]">{item.name}</h1>
          <p className="mt-3 text-[24px] font-bold">{kr(p.priceSek)}</p>
          <p className="text-[13px] text-[#6F6B63]">Inklusive moms · trycks på beställning</p>
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
          <h2 className="text-[22px] font-black tracking-[-0.02em]">Mer i {group?.name}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-4">
            {more.map((it) => (
              <li key={it.id} className="min-w-0">
                <ProductTile item={it} clubId={clubId} v={v} href={`${base}/${it.id}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
