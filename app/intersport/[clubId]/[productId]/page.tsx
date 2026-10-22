import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemView } from "@/components/newwave/clubshop/ItemView";
import { BuyBox } from "@/components/newwave/clubshop/ShopParts";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { intersportClub, intersportPath, listProducts } from "@/lib/intersport";
import { findItem, loadClubShop, mockupUrl, wordmarkSpec } from "@/lib/newwave/clubShop";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ clubId: string; productId: string }> }) {
  const { clubId, productId } = await params;
  const club = await intersportClub(clubId);
  if (!club) notFound();
  const home = intersportPath(clubId);
  const checkout = `${home}/kassa`;

  const insider = await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value);
  const product = insider ? (await listProducts(clubId)).find((p) => p.id === productId) : undefined;
  if (product) {
    return (
      <section className="mx-auto mt-6 grid max-w-6xl gap-8 px-4 pb-8 sm:gap-10 sm:px-6 md:grid-cols-[1.3fr_1fr]">
        <div className="grid min-w-0 grid-cols-2 gap-3">
          {product.images.map((img, i) => (
            <div key={img.url} className={`overflow-hidden rounded-xl bg-[#F5F5F7] ${i === 0 ? "col-span-2" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className={`w-full ${img.kind === "mockup" ? "object-contain p-6" : "object-cover"}`} />
            </div>
          ))}
        </div>
        <div className="md:sticky md:top-24 md:self-start">
          <p className="text-xs font-semibold uppercase text-[#6E6E73]">Craft · {club.name}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight [overflow-wrap:anywhere]">{product.title}</h1>
          <p className="mt-3 text-2xl font-black">{product.priceSek} kr</p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#3A3A3C] sm:text-sm">{product.description}</p>
          <BuyBox clubId={clubId} item={{ id: product.id, name: product.title, priceSek: product.priceSek, image: product.images[0].url, href: intersportPath(clubId, product.id) }} sizes={product.sizes} flock={false} dark={false} garment="#FFFFFF" v="" checkout={checkout} />
          <ul className="mt-6 space-y-1.5 text-sm text-[#3A3A3C]">
            <li>✓ Tryckt på beställning för {club.name}</li>
            <li>✓ Varje köp stöttar klubben</li>
          </ul>
          <p className="mt-6 text-xs text-[#86868B]">
            Publicerad automatiskt {new Date(product.publishedAt).toLocaleString("sv-SE")} · SKU {product.sku}
          </p>
          <Link href={home} className="mt-1 inline-block py-3 text-sm text-[#164194] underline sm:mt-4 sm:py-0">
            ← Tillbaka till klubbshoppen
          </Link>
        </div>
      </section>
    );
  }

  const shop = await loadClubShop(clubId);
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
