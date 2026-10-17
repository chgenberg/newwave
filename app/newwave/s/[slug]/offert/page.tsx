import type { Metadata } from "next";
import { ShopCart } from "@/components/newwave/shop/ShopCart";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export const metadata: Metadata = { title: "Varukorg" };

export default async function Varukorg({ params }: { params: Promise<{ slug: string }> }) {
  const r = await getResellerBySlug((await params).slug);
  return r ? <ShopCart slug={r.slug} markup={r.markup} shopName={r.texts.shopName || r.name} /> : null;
}
