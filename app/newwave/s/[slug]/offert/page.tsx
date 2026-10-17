import type { Metadata } from "next";
import { QuoteCart } from "@/components/newwave/shop/QuoteCart";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export const metadata: Metadata = { title: "Offertkorg" };

export default async function Offertkorg({ params }: { params: Promise<{ slug: string }> }) {
  const r = await getResellerBySlug((await params).slug);
  return r ? <QuoteCart slug={r.slug} markup={r.markup} shopName={r.texts.shopName || r.name} /> : null;
}
