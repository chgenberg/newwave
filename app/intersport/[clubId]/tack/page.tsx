import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Confirmation } from "@/components/newwave/clubshop/Checkout";
import { intersportClub, intersportPath } from "@/lib/intersport";

export const metadata: Metadata = { title: "Tack för beställningen · Intersport" };

export default async function IntersportThanks({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await intersportClub(clubId);
  if (!club) notFound();
  return <Confirmation clubId={clubId} clubName={club.name} home={intersportPath(clubId)} />;
}
