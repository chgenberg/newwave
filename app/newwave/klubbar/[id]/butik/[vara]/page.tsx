import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemView } from "@/components/newwave/clubshop/ItemView";
import { FLOCK_PRICE, kr } from "@/components/newwave/clubshop/pricing";
import { BuyNowLink, ShopBeacon } from "@/components/newwave/clubshop/track";
import { intersportPath } from "@/lib/intersport";
import { findItem, loadClubShop, shopPath } from "@/lib/newwave/clubShop";
import { genitive } from "@/lib/newwave/newsletterHtml";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; vara: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, vara } = await params;
  const shop = await loadClubShop(id);
  const item = shop && findItem(shop.groups, vara);
  return item && shop ? { title: `${item.name} · ${shop.club.name}` } : {};
}

/** Klubbens butik visar varan; man köper den hos Intersport. */
export default async function ClubShopItem({ params }: Props) {
  const { id, vara } = await params;
  const shop = await loadClubShop(id);
  const item = shop && findItem(shop.groups, vara);
  if (!shop || !item) notFound();
  const home = shopPath(id);
  return (
    <ItemView item={item} groups={shop.groups} clubId={id} clubName={shop.club.name} v={shop.v} base={home} home={home}>
      <ShopBeacon clubId={id} item={item.id} />
      <BuyNowLink clubId={id} item={item.id} href={intersportPath(id, item.id)} className="mt-6 flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
        Köp nu hos Intersport
        <span aria-hidden>→</span>
      </BuyNowLink>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[#6F6B63]">
        Du väljer storlek{item.flock ? `, namn och nummer på ryggen (+${kr(FLOCK_PRICE)})` : ""} och betalar i {genitive(shop.club.name)} klubbshop hos Intersport. Varje köp stöttar klubben.
      </p>
    </ItemView>
  );
}
