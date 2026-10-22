/* eslint-disable @next/next/no-img-element -- klubbens märke */
import { notFound } from "next/navigation";
import { CollectionSections } from "@/components/newwave/clubshop/CollectionView";
import { ProductTile } from "@/components/newwave/clubshop/ProductTile";
import { intersportClub, intersportPath } from "@/lib/intersport";
import { loadCollection } from "@/lib/newwave/clubCollection";
import { loadClubShop } from "@/lib/newwave/clubShop";
import { shopTexts } from "@/lib/newwave/clubShopContent";
import { luminance } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export default async function ClubShop({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [club, shop] = await Promise.all([intersportClub(clubId), loadClubShop(clubId)]);
  if (!club) notFound();
  const { drops } = await loadCollection(clubId, shop?.content.hidden);
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

      <CollectionSections drops={drops} href={(it) => intersportPath(clubId, it.id)} />
      {!drops.length && !shop?.groups.length ? <p className="mt-10 rounded-2xl bg-[#F5F5F7] p-10 text-center text-sm text-[#6E6E73]">Klubbshoppen fylls på inom kort.</p> : null}

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
