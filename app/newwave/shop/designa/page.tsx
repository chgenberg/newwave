import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/newwave/workspace/Workspace";
import { CURRENT_RESELLER, getReseller } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Återförsäljare · Designa" };

export default async function ResellerDesign() {
  const r = await getReseller(CURRENT_RESELLER);
  if (!r) notFound();
  return <Workspace role={{ kind: "shop", slug: r.slug, reseller: r.name, markup: r.markup, products: r.products }} embedded />;
}
