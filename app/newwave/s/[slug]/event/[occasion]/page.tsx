import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventShop } from "@/components/newwave/shop/EventShop";
import { nwProduct } from "@/lib/newwave/catalog";
import { isOccasion, occasion, offeredOccasions } from "@/lib/newwave/occasions";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export async function generateMetadata({ params }: { params: Promise<{ occasion: string }> }): Promise<Metadata> {
  const id = (await params).occasion;
  return isOccasion(id) ? { title: `${occasion(id)!.name} med egen logga` } : {};
}

export default async function ShopOccasion({ params }: { params: Promise<{ slug: string; occasion: string }> }) {
  const { slug, occasion: id } = await params;
  const r = await getResellerBySlug(slug);
  if (!r || !isOccasion(id) || !offeredOccasions(r).some((o) => o.id === id)) notFound();
  const products = occasion(id)!.products.filter((p) => nwProduct(p));
  return <EventShop slug={r.slug} shopName={r.texts.shopName || r.name} markup={r.markup} occasionId={id} products={products} />;
}
