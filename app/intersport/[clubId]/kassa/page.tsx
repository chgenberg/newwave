import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/newwave/clubshop/Checkout";
import { CartStock } from "@/components/poc/shop/CartStock";
import { intersportClub, intersportPath } from "@/lib/intersport";

export const metadata: Metadata = { title: "Kassan · Intersport" };

export default async function IntersportCheckout({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await intersportClub(clubId);
  if (!club) notFound();
  return (
    <>
      {/* Lagret i New Waves hubb: det som är slut syns innan beställningen läggs. */}
      <CartStock clubId={clubId} />
      <Checkout clubId={clubId} clubName={club.name} home={intersportPath(clubId)} />
    </>
  );
}
