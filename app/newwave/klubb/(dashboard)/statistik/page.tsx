import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatsSections } from "@/components/newwave/clubs/ShopSections";
import { ASA_IF } from "@/lib/newwave/club";
import { loadClubShop } from "@/lib/newwave/clubShop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Statistik` };

export default async function StatsPage() {
  const shop = await loadClubShop(ASA_IF.id);
  if (!shop) notFound();
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Statistik</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">De senaste 30 dagarna i klubbens butik och klubbshoppen hos Intersport, jämfört med 30 dagar innan – utan uppgifter om vem som handlat.</p>
      <div className="mt-8">
        <StatsSections shop={shop} />
      </div>
    </div>
  );
}
