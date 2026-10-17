import { ShopHome } from "@/components/newwave/shop/Storefront";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export default async function ShopStart({ params }: { params: Promise<{ slug: string }> }) {
  const r = await getResellerBySlug((await params).slug);
  return r ? <ShopHome shop={r} /> : null;
}
