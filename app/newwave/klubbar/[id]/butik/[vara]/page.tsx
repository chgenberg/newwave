import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionView } from "@/components/newwave/clubshop/CollectionView";
import { ItemView } from "@/components/newwave/clubshop/ItemView";
import { FLOCK_PRICE, kr } from "@/components/newwave/clubshop/pricing";
import { BuyNowLink, ShopBeacon } from "@/components/newwave/clubshop/track";
import { intersportPath } from "@/lib/intersport";
import { loadCollection } from "@/lib/newwave/clubCollection";
import { findItem, loadClubShop, shopPath } from "@/lib/newwave/clubShop";
import { genitive } from "@/lib/newwave/newsletterHtml";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; vara: string }> };

async function load(id: string, vara: string) {
  const shop = await loadClubShop(id);
  if (!shop) return null;
  const item = findItem(shop.groups, vara);
  if (item) return { shop, item, own: null };
  const { visible } = await loadCollection(id, shop.content.hidden);
  const own = visible.find((c) => c.id === vara);
  return own ? { shop, item: null, own, more: visible.filter((c) => c.dropId === own.dropId && c.id !== own.id).slice(0, 4) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, vara } = await params;
  const found = await load(id, vara);
  return found ? { title: `${found.item?.name ?? found.own?.name} · ${found.shop.club.name}` } : {};
}

/** Klubbens butik visar varan; man köper den hos Intersport. */
export default async function ClubShopItem({ params }: Props) {
  const { id, vara } = await params;
  const found = await load(id, vara);
  if (!found) notFound();
  const { shop, item, own } = found;
  const home = shopPath(id);
  const flock = Boolean(item?.flock);
  const buy = (
    <>
      <ShopBeacon clubId={id} item={vara} />
      <BuyNowLink clubId={id} item={vara} href={intersportPath(id, vara)} className="mt-6 flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
        Köp nu hos Intersport
        <span aria-hidden>→</span>
      </BuyNowLink>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[#6F6B63]">
        Du väljer storlek{flock ? `, namn och nummer på ryggen (+${kr(FLOCK_PRICE)})` : ""} och betalar i {genitive(shop.club.name)} klubbshop hos Intersport. Varje köp stöttar klubben.
      </p>
    </>
  );
  return item ? (
    <ItemView item={item} groups={shop.groups} clubId={id} clubName={shop.club.name} v={shop.v} base={home} home={home}>
      {buy}
    </ItemView>
  ) : (
    <CollectionView item={own!} more={found.more ?? []} clubName={shop.club.name} home={home} base={home}>
      {buy}
    </CollectionView>
  );
}
