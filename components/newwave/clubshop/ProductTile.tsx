/* eslint-disable @next/next/no-img-element -- mockups och ordmärken ritas per klubb */
import Link from "next/link";
import { mockupUrl, printArt, type ShopItem, wordmarkSpec } from "@/lib/newwave/clubShop";
import { kr } from "./pricing";

/** Produkten på fotot; vid hover syns ordmärket som det trycks. */
export function ProductTile({ item, clubId, v, href, eager }: { item: ShopItem; clubId: string; v: string; href: string; eager?: boolean }) {
  const spec = wordmarkSpec(item.template.id, item.worn);
  return (
    <Link href={href} className="group block">
      <span className="relative block aspect-square overflow-hidden rounded-[18px] bg-[#F3F2EF]">
        <img src={mockupUrl(item.product, spec, clubId, v)} alt={item.name} loading={eager ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] group-hover:opacity-0" />
        <span className="absolute inset-0 grid place-items-center p-[14%] opacity-0 transition duration-500 group-hover:opacity-100" style={{ background: item.product.garmentHex }}>
          <img src={printArt(item.product, spec, clubId, v, 800)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
        </span>
        {item.flock ? <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold">Namn och nummer</span> : null}
      </span>
      <span className="mt-3 block truncate text-[15px] font-semibold">{item.name}</span>
      <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="truncate text-[#6F6B63]">
          {item.product.garmentColor} · {item.template.style}
        </span>
        <span className="shrink-0 font-semibold">{kr(item.product.priceSek)}</span>
      </span>
    </Link>
  );
}
