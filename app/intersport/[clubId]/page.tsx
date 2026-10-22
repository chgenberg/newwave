/* eslint-disable @next/next/no-img-element -- klubbens märke och produktbilder från API:t */
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductTile } from "@/components/newwave/clubshop/ProductTile";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { intersportClub, intersportPath, listProducts } from "@/lib/intersport";
import { loadClubShop } from "@/lib/newwave/clubShop";
import { shopTexts } from "@/lib/newwave/clubShopContent";
import { luminance } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export default async function ClubShop({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [club, shop, insider] = await Promise.all([intersportClub(clubId), loadClubShop(clubId), hasAccess((await cookies()).get(ACCESS_COOKIE)?.value)]);
  if (!club) notFound();
  // Produkterna från autopiloten har bilder i demomiljön, som klubbens länk inte når.
  const products = insider ? await listProducts(clubId) : [];
  const on = luminance(club.color) > 0.4 ? "#111111" : "#FFFFFF";

  return (
    <section className="mx-auto max-w-[1320px] px-4 pb-8 sm:px-6">
      <p className="pt-4 text-xs text-[#6E6E73]">
        Start / Klubbshop / <span className="text-[#1D1D1F]">{club.name}</span>
      </p>
      <div className="mt-4 flex items-center gap-4 rounded-2xl px-5 py-5 sm:gap-6 sm:px-8 sm:py-7" style={{ background: club.color, color: on }}>
        {club.logo ? <img src={club.logo} alt="" className="h-14 w-auto max-w-20 shrink-0 object-contain sm:h-20 sm:max-w-28" /> : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-black uppercase [overflow-wrap:anywhere] sm:text-3xl">{club.name} klubbshop</h1>
          <p className="text-[15px] opacity-80 sm:text-base">{shopTexts(club, shop?.content ?? { hidden: [] }).tagline} · Tryckt på beställning · Varje köp stöttar klubben</p>
        </div>
      </div>

      {products.length || !shop ? (
        <>
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 className="text-lg font-bold">Nyheter ({products.length})</h2>
            <Link href="/autopilot" className="-my-3 inline-block py-3 text-sm text-[#164194] underline">
              Så publicerades de här →
            </Link>
          </div>
          {products.length === 0 ? (
            <p className="mt-10 rounded-2xl bg-[#F5F5F7] p-10 text-center text-sm text-[#6E6E73]">Inga produkter ännu. Starta autopiloten så publicerar klubbagenten de första produkterna.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-4">
              {products.map((p) => {
                const img = p.images.find((i) => i.kind === "foto") ?? p.images[0];
                return (
                  <Link key={p.id} href={intersportPath(clubId, p.id)} className="group">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#F5F5F7]">
                      <img src={img.url} alt={img.alt} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      <span className="absolute left-3 top-3 rounded bg-[#E30613] px-2 py-0.5 text-[11px] font-bold uppercase text-white">Nyhet</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase text-[#6E6E73]">Craft · {p.tags.includes("Satir") ? "Supporterhumor" : "Klubbmerch"}</p>
                    <p className="mt-0.5 text-sm leading-snug">{p.title}</p>
                    <p className="mt-1 font-bold">{p.priceSek} kr</p>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {shop?.groups.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-rubrik`} className="scroll-mt-20 pt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#E5E5EA] pb-3">
            <h2 id={`${g.id}-rubrik`} className="text-lg font-bold">
              {g.name}
            </h2>
            <p className="text-sm text-[#6E6E73]">{g.blurb}</p>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 md:grid-cols-4">
            {g.items.map((it) => (
              <li key={it.id} className="min-w-0">
                <ProductTile item={it} clubId={clubId} v={shop.v} href={intersportPath(clubId, it.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
