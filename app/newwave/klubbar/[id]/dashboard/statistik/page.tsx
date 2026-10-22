import { notFound } from "next/navigation";
import { KpiTiles, RecentOrders, Section, TopItems, VisitsChart } from "@/components/newwave/clubs/DashboardParts";
import { loadClubShop, shopPath } from "@/lib/newwave/clubShop";
import { clubShopStats } from "@/lib/newwave/clubShopStats";

export const dynamic = "force-dynamic";

export default async function ClubStats({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await loadClubShop(id);
  if (!shop) notFound();
  const stats = await clubShopStats(id);
  return (
    <>
      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#6F6B63]">{shop.club.name}</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] min-[760px]:text-[40px]">Statistik</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[#4A4740]">De senaste 30 dagarna, jämfört med 30 dagar innan. Räknas i klubbens butik och i klubbshoppen hos Intersport, utan uppgifter om vem som handlat.</p>

      <Section id="nyckeltal" title="Så går butiken">
        <KpiTiles stats={stats} />
        <div className="mt-3">
          <VisitsChart stats={stats} />
        </div>
      </Section>

      <Section id="varor" title="Varor och beställningar">
        <div className="grid gap-3 min-[1000px]:grid-cols-2">
          <TopItems stats={stats} items={shop.assortment.flatMap((g) => g.items)} clubId={id} v={shop.v} home={shopPath(id)} />
          <RecentOrders stats={stats} />
        </div>
      </Section>
    </>
  );
}
