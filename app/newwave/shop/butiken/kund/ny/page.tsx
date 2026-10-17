import type { Metadata } from "next";
import { CustomerShopCreate } from "@/components/newwave/shop/CustomerShopCreate";
import { CURRENT_RESELLER, customerShopsFor, getReseller } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ny kundbutik · Återförsäljarens dashboard" };

export default async function NyKundbutik() {
  const [reseller, shops] = await Promise.all([getReseller(CURRENT_RESELLER), customerShopsFor(CURRENT_RESELLER)]);
  if (!reseller) return null;
  return <CustomerShopCreate seller={{ name: reseller.name, slug: reseller.slug, logo: reseller.logo, texts: reseller.texts, markup: reseller.markup }} taken={shops.map((s) => s.company.name)} />;
}
