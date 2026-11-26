import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FindOrder } from "@/components/poc/shop/FindOrder";
import { intersportClub } from "@/lib/intersport";

export const metadata: Metadata = { title: "Hitta din order · Intersport" };

/** Kunden hittar sin order med ordernumret och e-postadressen från beställningen, och kommer till statussidan. */
export default async function FindOrderPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  if (!(await intersportClub(clubId))) notFound();
  return (
    <div className="mx-auto max-w-[480px] px-4 pt-12 sm:px-6">
      <h1 className="text-[30px] font-black tracking-[-0.02em] sm:text-[36px]">Hitta din order</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[#4A4740]">Skriv ordernumret och e-postadressen från beställningen, så ser du var ordern är och spårningsnumret när den skickats.</p>
      <FindOrder />
      <p className="mt-6 text-[13px] text-[#6F6B63]">Hittar du inte ordernumret? Hör av dig till kundservice@intersport.se.</p>
    </div>
  );
}
