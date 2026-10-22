import { notFound } from "next/navigation";
import { CollectionView } from "@/components/newwave/clubshop/CollectionView";
import { ItemView } from "@/components/newwave/clubshop/ItemView";
import { BuyBox } from "@/components/newwave/clubshop/ShopParts";
import { intersportClub, intersportPath } from "@/lib/intersport";
import { loadCollection } from "@/lib/newwave/clubCollection";
import { findItem, loadClubShop, mockupUrl, wordmarkSpec } from "@/lib/newwave/clubShop";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ clubId: string; productId: string }> }) {
  const { clubId, productId } = await params;
  const [club, shop] = await Promise.all([intersportClub(clubId), loadClubShop(clubId)]);
  if (!club) notFound();
  const home = intersportPath(clubId);
  const checkout = `${home}/kassa`;

  const { visible } = await loadCollection(clubId, shop?.content.hidden);
  const own = visible.find((c) => c.id === productId);
  if (own) {
    const more = visible.filter((c) => c.dropId === own.dropId && c.id !== own.id).slice(0, 4);
    return (
      <CollectionView item={own} more={more} clubName={club.name} home={home} base={home}>
        <BuyBox clubId={clubId} item={{ id: own.id, name: own.name, priceSek: own.priceSek, image: own.images[0].url, href: intersportPath(clubId, own.id) }} sizes={own.sizes} flock={false} dark={false} garment="#FFFFFF" v="" checkout={checkout} />
      </CollectionView>
    );
  }

  const item = shop && findItem(shop.groups, productId);
  if (!shop || !item) notFound();
  const p = item.product;
  return (
    <ItemView item={item} groups={shop.groups} clubId={clubId} clubName={club.name} v={shop.v} base={home} home={home}>
      <BuyBox
        clubId={clubId}
        item={{ id: item.id, name: item.name, priceSek: p.priceSek, image: mockupUrl(p, wordmarkSpec(item.template.id, item.worn), clubId, shop.v, 480), href: intersportPath(clubId, item.id) }}
        sizes={p.sizes}
        flock={item.flock}
        dark={p.dark}
        garment={p.garmentHex}
        v={shop.v}
        checkout={checkout}
      />
    </ItemView>
  );
}
