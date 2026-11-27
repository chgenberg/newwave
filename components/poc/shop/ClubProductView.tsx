/* eslint-disable @next/next/no-img-element -- mockuperna ritas per klubb */
import Link from "next/link";
import { DELIVERY_DAYS, kr } from "@/components/newwave/clubshop/pricing";
import type { CatalogProduct, ClubProduct } from "@/lib/poc/types";
import { ClubProductTile, shopScenes } from "./ClubProducts";
import { shopStock } from "./data";

/**
 * Crafts klubbprodukt i klubbshoppen; `children` är köprutan (med lagret, ClubBuyBox). Har Craft skapat en miljöbild
 * visas den som andra bild.
 */
export async function ClubProductView({ product, base, more, clubName, home, children }: { product: ClubProduct; base?: CatalogProduct; more: ClubProduct[]; clubName: string; home: string; children: React.ReactNode }) {
  const [scenes, stock] = await Promise.all([shopScenes([product, ...more]), shopStock(more)]);
  const scene = scenes.get(product.id);
  const made = product.kind === "halsduk" ? "Stickas på beställning" : "Trycks på beställning";
  const sizes = base?.sizes ?? [];
  const details = [
    ["Produkt", base?.name ?? (product.kind === "halsduk" ? "Halsduk" : "Plagg")],
    ["Storlekar", sizes.length > 1 ? `${sizes[0]}–${sizes.at(-1)}` : "One size"],
    ["Leverans", `${made}, ${DELIVERY_DAYS[0]}–${DELIVERY_DAYS[1]} arbetsdagar`],
  ];
  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
      <nav aria-label="Brödsmulor" className="pt-5 text-[13px] text-[#6F6B63]">
        <Link href={home} className="hover:text-[#111]">
          {clubName}
        </Link>
        {" / "}
        <Link href={`${home}#craft`} className="hover:text-[#111]">
          Craft × {clubName}
        </Link>
        {" / "}
        <span className="text-[#111]">{product.title}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        {/* På mobilen bläddras bilderna i sidled, på större skärmar står de under varandra. */}
        <div className={`min-w-0 lg:self-start ${scene ? "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-4 lg:overflow-visible lg:px-0" : ""}`}>
          <div className={scene ? "w-[86%] shrink-0 snap-center lg:w-full" : ""}>
            {product.mockupUrl ? <img src={product.mockupUrl} alt={product.title} className="aspect-square w-full rounded-[24px] bg-[#F3F2EF] object-contain p-4" /> : <div className="aspect-square w-full rounded-[24px] bg-[#F3F2EF]" />}
          </div>
          {scene ? (
            <div className="w-[86%] shrink-0 snap-center lg:w-full">
              <img src={scene} alt={`${product.title} på en person i klubbens miljö`} className="aspect-square w-full rounded-[24px] bg-[#F3F2EF] object-cover lg:aspect-[4/5]" />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#6F6B63]">Craft × {clubName}</p>
          <h1 className="mt-1 text-[30px] font-black leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[38px]">{product.title}</h1>
          <p className="mt-3 text-[24px] font-bold">{kr(product.priceSek)}</p>
          <p className="text-[13px] text-[#6F6B63]">Inklusive moms · {made.toLowerCase()}</p>
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
          <h2 className="text-[22px] font-black tracking-[-0.02em]">Mer från Craft × {clubName}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-4">
            {more.map((p) => (
              <li key={p.id} className="min-w-0">
                <ClubProductTile product={p} href={`${home}/${p.id}`} scene={scenes.get(p.id)} stock={stock.get(p.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
