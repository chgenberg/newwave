import type { Metadata } from "next";
import { MerchStudio } from "@/components/MerchStudio";
import { CIRCLE_K } from "@/lib/club";
import { copyFor } from "@/lib/copy";

export const metadata: Metadata = { title: "Circle K Merch" };

export default function CircleKPage() {
  return <MerchStudio copy={copyFor(CIRCLE_K)} kind="brand" defaultClubId={CIRCLE_K.id} />;
}
