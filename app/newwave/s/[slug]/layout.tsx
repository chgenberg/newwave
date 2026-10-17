import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SmoothScroll } from "@/components/newwave/motion/SmoothScroll";
import { ShopFrame } from "@/components/newwave/shop/Storefront";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await getResellerBySlug((await params).slug);
  return r ? { title: { default: `${r.texts.shopName || r.name} · Profilprodukter`, template: `%s · ${r.texts.shopName || r.name}` }, description: r.texts.tagline } : {};
}

export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const r = await getResellerBySlug((await params).slug);
  if (!r || r.status !== "publicerad") notFound();
  return (
    <ShopFrame shop={r}>
      <SmoothScroll />
      {children}
    </ShopFrame>
  );
}
