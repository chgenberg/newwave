import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerStore } from "@/components/newwave/shop/CustomerStore";
import { customerShopByToken } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const found = await customerShopByToken((await params).token);
  return { title: found ? `Profilbutik · ${found.shop.company.name}` : "Profilbutik", robots: { index: false } };
}

export default async function Kundbutik({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await customerShopByToken(token);
  if (!found) notFound();
  const { shop, reseller } = found;
  if (!shop.open)
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shop.logo} alt={shop.company.name} className="mx-auto h-14 w-auto object-contain" />
        <h1 className="mt-6 text-[28px] font-bold tracking-tight">Butiken är stängd just nu</h1>
        <p className="mt-2 text-[15px] opacity-70">
          Hör av er till {reseller.texts.shopName || reseller.name}
          {reseller.texts.email ? ` på ${reseller.texts.email}` : ""} så öppnar de den igen.
        </p>
      </main>
    );
  return <CustomerStore shop={shop} seller={{ name: reseller.name, slug: reseller.slug, logo: reseller.logo, texts: reseller.texts }} token={token} />;
}
