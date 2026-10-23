/* eslint-disable @next/next/no-img-element -- produktbilderna ritas per förening */
import Link from "next/link";
import type { ShopProduct } from "@/lib/newwave/grasrot/shop";
import { grasrotBase, mockupSrc, SHOP_PREFIX } from "@/lib/newwave/grasrot/urls";

export const G360_SECTION = { id: "klubbkollektionen", name: "Klubbkollektionen" };

/** En Bilaga 2-produkt i butiken: fotot i färgen den visas i först; vid hover syns trycket på plaggfärgen. */
export function G360Tile({ id, product, color, href, eager }: { id: string; product: ShopProduct; color: string; href: string; eager?: boolean }) {
  const c = product.colors.find((x) => x.id === color) ?? product.colors[0];
  const design = product.designs[c.id];
  return (
    <Link href={href} className="group block">
      <span className="relative block aspect-square overflow-hidden rounded-[18px] bg-white ring-1 ring-[var(--shop-line,#E6E3DC)]">
        <img src={mockupSrc(id, product.id, c.id)} alt={`${product.short} i ${c.name}`} loading={eager ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-contain transition duration-500 group-hover:scale-[1.04] group-hover:opacity-0" />
        {design.art.startsWith("halsduk") ? null : (
          <span className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100" style={{ background: c.hex }}>
            <img src={`${grasrotBase(id)}/${design.art}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[18%]" />
          </span>
        )}
        {product.model ? <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold">3D</span> : null}
      </span>
      <span className="mt-3 block truncate text-[15px] font-semibold">{product.short}</span>
      <span className="mt-0.5 block truncate text-[13.5px] text-[#6F6B63]">
        {product.colors.length > 1 ? `${product.colors.length} färger` : "Klubbens färger"} · {design.methodText}
      </span>
    </Link>
  );
}

/** Klubbkollektionen överst i butiken: Gräsrot 360-produkterna med klubbmärket eller wordmarket. */
export function G360Section({ id, home, products, featured }: { id: string; home: string; products: ShopProduct[]; featured: Record<string, string> }) {
  return (
    <section id={G360_SECTION.id} aria-labelledby={`${G360_SECTION.id}-rubrik`} className="scroll-mt-20 pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--shop-line)] pb-3">
        <h2 id={`${G360_SECTION.id}-rubrik`} className="text-[24px] font-black tracking-[-0.02em] sm:text-[28px]">
          {G360_SECTION.name}
        </h2>
        <p className="text-[14px] text-[#6F6B63]">Gräsrot 360 med New Wave Group – klubbmärket och wordmarket på fem produkter</p>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-5">
        {products.map((p) => (
          <li key={p.id} className="min-w-0">
            <G360Tile id={id} product={p} color={featured[p.id]} href={`${home}/${SHOP_PREFIX}${p.id}`} eager />
          </li>
        ))}
      </ul>
    </section>
  );
}
