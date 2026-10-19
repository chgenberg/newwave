import type { Metadata } from "next";
import { MerchShop } from "@/components/newwave/merch/MerchShop";
import { MERCH, MERCH_CLUBS } from "@/lib/newwave/merch";
import { MERCH_SCENES } from "@/lib/newwave/scenes";

export const metadata: Metadata = { title: "Merch · Next Wave", description: "All klubbmerch i en lista. Hitta din klubb och köp i klubbens butik hos Intersport." };

export default function MerchPage() {
  return <MerchShop items={MERCH} clubs={MERCH_CLUBS} scenes={MERCH_SCENES} />;
}
