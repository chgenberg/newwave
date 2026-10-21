import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/newwave/sportshop/Crumbs";
import { ProductCard } from "@/components/newwave/sportshop/ProductCard";
import { ProductView } from "@/components/newwave/sportshop/ProductView";
import { BASE, clubProducts, shopClub, shopProduct } from "@/lib/newwave/sportshop/data";
import { DICT, productName } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = shopProduct((await params).id);
  const club = p && shopClub(p.clubId);
  return p && club ? { title: `${productName(p.kind, club, await shopLang())} · Sport Lindner` } : {};
}

/** "Passend dazu": klubbens mest sålda, tre ur samma linje och en ur den andra. */
const bySold = (a: { sold: number }, b: { sold: number }) => b.sold - a.sold;

export default async function ProductPage({ params }: Props) {
  const product = shopProduct((await params).id);
  const club = product && shopClub(product.clubId);
  if (!product || !club) notFound();
  const lang = await shopLang();
  const t = DICT[lang];
  const others = clubProducts(club.id).filter((p) => p.id !== product.id);
  const match = [...others.filter((p) => p.line === product.line).sort(bySold).slice(0, 3), ...others.filter((p) => p.line !== product.line).sort(bySold).slice(0, 1)];
  return (
    <>
      <Crumbs
        items={[
          { label: t.product.crumbsHome, href: BASE },
          { label: club.short, href: `${BASE}/${club.id}` },
          { label: t.line[product.line].title, href: `${BASE}/${club.id}?linie=${product.line}` },
          { label: productName(product.kind, club, lang) },
        ]}
      />
      <section className="mx-auto max-w-[1320px] px-4 pt-6 sm:px-6">
        <ProductView product={product} club={club} />
      </section>
      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6">
        <h2 className="text-[24px] font-black tracking-[-0.01em] text-[#0F2741]">{t.product.match}</h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {match.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} showClub={false} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
