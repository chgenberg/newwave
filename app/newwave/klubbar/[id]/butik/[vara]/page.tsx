import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionView } from "@/components/newwave/clubshop/CollectionView";
import { ItemView } from "@/components/newwave/clubshop/ItemView";
import { FLOCK_PRICE, kr } from "@/components/newwave/clubshop/pricing";
import { BuyNowLink, ShopBeacon } from "@/components/newwave/clubshop/track";
import { G360_SECTION, G360Tile } from "@/components/newwave/grasrot/ShopCollection";
import { ShopProductView } from "@/components/newwave/grasrot/ShopProductView";
import { intersportPath } from "@/lib/intersport";
import { loadCollection } from "@/lib/newwave/clubCollection";
import { findItem, loadClubShop, shopPath } from "@/lib/newwave/clubShop";
import { shopProducts } from "@/lib/newwave/grasrot/shop";
import { SHOP_PREFIX } from "@/lib/newwave/grasrot/urls";
import { genitive } from "@/lib/newwave/newsletterHtml";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; vara: string }> };

async function load(id: string, vara: string) {
  const shop = await loadClubShop(id);
  if (!shop) return null;
  if (vara.startsWith(SHOP_PREFIX)) {
    const g360 = await shopProducts(id);
    const product = g360?.products.find((p) => `${SHOP_PREFIX}${p.id}` === vara);
    return g360 && product ? { shop, item: null, own: null, g360: { ...g360, product } } : null;
  }
  const item = findItem(shop.groups, vara);
  if (item) return { shop, item, own: null };
  const { visible } = await loadCollection(id, shop.content.hidden);
  const own = visible.find((c) => c.id === vara);
  return own ? { shop, item: null, own, more: visible.filter((c) => c.dropId === own.dropId && c.id !== own.id).slice(0, 4) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, vara } = await params;
  const found = await load(id, vara);
  return found ? { title: `${found.item?.name ?? found.own?.name ?? found.g360?.product.short} · ${found.shop.club.name}` } : {};
}

/** Klubbens butik visar varan; man köper den hos Intersport. */
export default async function ClubShopItem({ params }: Props) {
  const { id, vara } = await params;
  const found = await load(id, vara);
  if (!found) notFound();
  const { shop, item, own } = found;
  const home = shopPath(id);
  if (found.g360) {
    const { product, products, featured } = found.g360;
    return (
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
        <ShopBeacon clubId={id} item={vara} />
        <nav aria-label="Brödsmulor" className="pt-5 text-[13px] text-[#6F6B63]">
          <Link href={home} className="hover:text-[#111]">
            {shop.club.name}
          </Link>
          {" / "}
          <Link href={`${home}#${G360_SECTION.id}`} className="hover:text-[#111]">
            {G360_SECTION.name}
          </Link>
          {" / "}
          <span className="text-[#111]">{product.short}</span>
        </nav>
        <ShopProductView key={product.id} id={id} product={product} featured={featured[product.id]} clubName={shop.club.name}>
          <Link href={`${home}/kontakt`} className="mt-6 flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
            Fråga klubben
            <span aria-hidden>→</span>
          </Link>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[#6F6B63]">
            Klubbkollektionen tas fram av {shop.club.name} och New Wave Group i Gräsrot 360, och kommer till {genitive(shop.club.name)} klubbshop hos Intersport när föreningen godkänt den.
          </p>
        </ShopProductView>
        <section className="mt-16">
          <h2 className="text-[22px] font-black tracking-[-0.02em]">Mer ur klubbkollektionen</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-4">
            {products
              .filter((p) => p.id !== product.id)
              .map((p) => (
                <li key={p.id} className="min-w-0">
                  <G360Tile id={id} product={p} color={featured[p.id]} href={`${home}/${SHOP_PREFIX}${p.id}`} />
                </li>
              ))}
          </ul>
        </section>
      </div>
    );
  }
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
