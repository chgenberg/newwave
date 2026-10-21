import type { Metadata } from "next";
import { CartView } from "@/components/newwave/sportshop/CartView";
import { Crumbs } from "@/components/newwave/sportshop/Crumbs";
import { BASE } from "@/lib/newwave/sportshop/data";
import { DICT } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${DICT[await shopLang()].cartPage.title} · Sport Lindner` };
}

export default async function CartPage() {
  const t = DICT[await shopLang()];
  return (
    <>
      <Crumbs items={[{ label: t.product.crumbsHome, href: BASE }, { label: t.cartPage.title }]} />
      <section className="mx-auto max-w-[1320px] px-4 pt-4 sm:px-6">
        <h1 className="mb-6 text-[28px] font-black tracking-[-0.01em] text-[#0F2741] sm:text-[34px]">{t.cartPage.title}</h1>
        <CartView />
      </section>
    </>
  );
}
