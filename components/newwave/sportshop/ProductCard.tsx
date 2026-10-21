"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { BASE, type ShopProduct, shopClub } from "@/lib/newwave/sportshop/data";
import { productName } from "@/lib/newwave/sportshop/i18n";
import { ProductMock } from "../shop/ProductMock";
import { useLang } from "./Lang";

/** Craft-plaggets eget foto, annars katalogfotot med klubbmärket tryckt. */
export function ProductImage({ product, className = "" }: { product: ShopProduct; className?: string }) {
  const { lang } = useLang();
  const club = shopClub(product.clubId);
  if (product.image || !product.catalog || !club)
    return (
      <div className={`relative aspect-square overflow-hidden bg-white ${className}`}>
        <img src={product.image} alt={club ? productName(product.kind, club, lang) : ""} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
      </div>
    );
  return <ProductMock product={product.catalog} logo={club.crest} logoDark={club.crest} className={`bg-white! ${className}`} />;
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="relative inline-block leading-none" style={{ width: size * 5, height: size }} aria-hidden>
      <span className="absolute inset-0 flex text-[#D9D9D6]">{STARS(size)}</span>
      <span className="absolute inset-0 flex overflow-hidden text-[#F2A900]" style={{ width: `${(rating / 5) * 100}%` }}>
        {STARS(size)}
      </span>
    </span>
  );
}

const STARS = (size: number) =>
  Array.from({ length: 5 }, (_, i) => (
    <svg key={i} viewBox="0 0 20 20" width={size} height={size} className="shrink-0 fill-current">
      <path d="M10 1.5l2.6 5.5 6 .7-4.4 4.1 1.1 6-5.3-3-5.3 3 1.1-6L1.4 7.7l6-.7z" />
    </svg>
  ));

const BADGE = { bestseller: "bg-[#0F2741] text-white", new: "bg-[#FF6A13] text-white", sale: "bg-[#D7262E] text-white" } as const;

export function Price({ product, extra = 0, large = false }: { product: ShopProduct; extra?: number; large?: boolean }) {
  const { t, money } = useLang();
  return (
    <div>
      <p className={`flex flex-wrap items-baseline gap-x-2 font-semibold ${large ? "text-[28px]" : "text-[16px]"} ${product.was ? "text-[#D7262E]" : "text-[#111]"}`}>
        {money(product.price + extra)}
        {product.was ? <s className={`font-normal text-[#8A8780] ${large ? "text-[17px]" : "text-[13px]"}`}>{money(product.was + extra)}</s> : null}
      </p>
      <p className="text-[11.5px] text-[#8A8780]">{t.vatShipping}</p>
    </div>
  );
}

export function ProductCard({ product, showClub = true }: { product: ShopProduct; showClub?: boolean }) {
  const { lang, t } = useLang();
  const club = shopClub(product.clubId);
  if (!club) return null;
  const name = productName(product.kind, club, lang);
  return (
    <Link href={`${BASE}/p/${product.id}`} className="group flex h-full flex-col rounded-[14px] bg-white p-2 pb-3 ring-1 ring-[#ECECE9] transition hover:shadow-[0_18px_40px_-24px_rgba(15,39,65,0.45)] hover:ring-[#D9D9D6]">
      <div className="relative overflow-hidden rounded-[10px]">
        <ProductImage product={product} className="transition duration-500 group-hover:scale-[1.03]" />
        {product.badges.length ? (
          <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {product.badges.map((b) => (
              <span key={b} className={`rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${BADGE[b]}`}>
                {b === "sale" && product.was ? `-${Math.round((1 - product.price / product.was) * 100)} %` : t.badge[b]}
              </span>
            ))}
          </span>
        ) : null}
        {product.line === "teamwear" ? <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold italic tracking-[0.02em] text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.1)]">CRAFT</span> : null}
      </div>
      <div className="flex flex-1 flex-col px-1.5 pt-3">
        {showClub ? (
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6F6B63]">
            <img src={club.crest} alt="" className="h-4 w-4 object-contain" />
            <span className="truncate">{club.short}</span>
          </p>
        ) : null}
        <h3 className="mt-1 text-[14.5px] font-semibold leading-snug text-[#111] group-hover:underline">{name}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[#6F6B63]">
          <Stars rating={product.rating} size={12} />
          <span className="tabular-nums">({product.reviews})</span>
          <span className="sr-only">{`${product.rating} / 5, ${t.reviews(product.reviews)}`}</span>
        </p>
        <div className="mt-auto pt-2.5">
          <Price product={product} />
        </div>
      </div>
    </Link>
  );
}
