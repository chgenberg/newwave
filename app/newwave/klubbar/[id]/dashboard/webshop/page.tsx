import { notFound } from "next/navigation";
import { WebshopSections } from "@/components/newwave/clubs/ShopSections";
import { loadClubShop } from "@/lib/newwave/clubShop";

export const dynamic = "force-dynamic";

/** Det klubben ändrar i butiken: texterna, kontaktuppgifterna, fotot och sortimentet. */
export default async function ClubWebshop({ params }: { params: Promise<{ id: string }> }) {
  const shop = await loadClubShop((await params).id);
  if (!shop) notFound();
  return (
    <>
      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#6F6B63]">{shop.club.name}</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] min-[760px]:text-[40px]">Webshop</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[#4A4740]">Det supportrarna läser och ser i klubbens butik. Det ni sparar syns direkt i butiken och i klubbshoppen hos Intersport.</p>
      <WebshopSections shop={shop} />
    </>
  );
}
