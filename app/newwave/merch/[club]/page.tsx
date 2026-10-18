import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MerchClubPage } from "@/components/newwave/merch/MerchShop";
import { MERCH, MERCH_CLUBS, merchClub } from "@/lib/newwave/merch";

export function generateStaticParams() {
  return MERCH_CLUBS.map((c) => ({ club: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ club: string }> }): Promise<Metadata> {
  const c = merchClub((await params).club);
  return c ? { title: `${c.owner} merch · Next Wave`, description: c.about } : {};
}

export default async function MerchClubRoute({ params }: { params: Promise<{ club: string }> }) {
  const c = merchClub((await params).club);
  if (!c) notFound();
  return <MerchClubPage club={c} items={MERCH.filter((x) => x.clubId === c.id)} clubs={[c]} />;
}
