/* eslint-disable @next/next/no-img-element */
import { nwProduct } from "@/lib/newwave/catalog";
import type { MerchItem } from "@/lib/newwave/merch";
import { ProductMock } from "../shop/ProductMock";

/** Produktbilden: den färdiga bilden, annars märket på produktfotot. */
export function MerchImage({ item, className = "" }: { item: MerchItem; className?: string }) {
  const p = nwProduct(item.productId);
  if (item.image) return <img src={item.image} alt={`${item.name} med ${item.club}`} loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  return p ? <ProductMock product={p} logo={item.art.light} logoDark={item.art.dark} className={`h-full w-full ${className}`} /> : null;
}
