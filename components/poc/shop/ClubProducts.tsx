/* eslint-disable @next/next/no-img-element -- mockuperna ritas per klubb */
import Link from "next/link";
import { kr } from "@/components/newwave/clubshop/pricing";
import { catalogProduct } from "@/lib/poc/catalog";
import { scenePhotos } from "@/lib/poc/content";
import type { ClubProduct } from "@/lib/poc/types";

/** Miljöbilderna som Craft skapat för produkterna (lib/poc/content.ts). Går de inte att läsa visas shoppen utan dem. */
export async function shopScenes(products: Pick<ClubProduct, "id">[]): Promise<Map<string, string>> {
  try {
    return await scenePhotos(products.map((p) => p.id));
  } catch (e) {
    console.error("[klubbshop] miljöbilderna kunde inte läsas", e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** Klubbprodukten i shoppen: mockupen i klubbens färger, titel och pris. Med en miljöbild visas den när muspekaren är över. */
export function ClubProductTile({ product, href, scene }: { product: ClubProduct; href: string; scene?: string }) {
  const base = catalogProduct(product.sku);
  return (
    <Link href={href} className="group block">
      <span className="relative block aspect-square overflow-hidden rounded-[18px] bg-[#F3F2EF]">
        {product.mockupUrl ? <img src={product.mockupUrl} alt={product.title} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.04]" /> : null}
        {scene ? <img src={scene} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" /> : null}
      </span>
      <span className="mt-3 block truncate text-[15px] font-semibold">{product.title}</span>
      <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="truncate text-[#6F6B63]">{base?.name ?? (product.kind === "halsduk" ? "Halsduk" : "Plagg")}</span>
        <span className="shrink-0 font-semibold">{kr(product.priceSek)}</span>
      </span>
    </Link>
  );
}

/** Crafts klubbkollektion överst i klubbshoppen. */
export async function ClubProductsSection({ clubName, products, href }: { clubName: string; products: ClubProduct[]; href: (p: ClubProduct) => string }) {
  if (!products.length) return null;
  const scenes = await shopScenes(products);
  return (
    <section id="craft" aria-labelledby="craft-rubrik" className="scroll-mt-20 pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--shop-line)] pb-3">
        <h2 id="craft-rubrik" className="text-[24px] font-black tracking-[-0.02em] sm:text-[28px]">
          Craft × {clubName}
        </h2>
        <p className="text-[14px] text-[#6F6B63]">Designat av Craft, i klubbens färger och med klubbens märke</p>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id} className="min-w-0">
            <ClubProductTile product={p} href={href(p)} scene={scenes.get(p.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
