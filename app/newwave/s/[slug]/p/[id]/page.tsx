import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDesigner } from "@/components/newwave/shop/ProductDesigner";
import { nwProduct } from "@/lib/newwave/catalog";
import { sellableProducts } from "@/lib/newwave/occasions";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = nwProduct((await params).id);
  return p ? { title: `${p.name} med egen logga` } : {};
}

export default async function ShopProduct({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await getResellerBySlug(slug);
  if (!r || !sellableProducts(r).has(id) || !nwProduct(id)) notFound();
  return <ProductDesigner slug={slug} productId={id} markup={r.markup} shopName={r.texts.shopName || r.name} />;
}
