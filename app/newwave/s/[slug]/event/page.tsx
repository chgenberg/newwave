import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventPlanner } from "@/components/newwave/shop/EventPlanner";
import { isOccasion, offeredOccasions } from "@/lib/newwave/occasions";
import { getResellerBySlug } from "@/lib/newwave/shopState";

export const metadata: Metadata = { title: "Planera ert event" };

export default async function ShopEvent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tillfalle?: string }> }) {
  const [{ slug }, { tillfalle }] = await Promise.all([params, searchParams]);
  const r = await getResellerBySlug(slug);
  const offered = r ? offeredOccasions(r).map((o) => o.id) : [];
  if (!r || !offered.length) notFound();
  return <EventPlanner slug={r.slug} markup={r.markup} shopName={r.texts.shopName || r.name} offered={offered} initial={isOccasion(tillfalle) ? tillfalle : undefined} />;
}
