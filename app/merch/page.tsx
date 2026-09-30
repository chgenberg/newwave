import type { Metadata } from "next";
import { LogoMerchStudio } from "@/components/LogoMerchStudio";

export const metadata: Metadata = { title: "Merch med din logga" };

export default function MerchPage() {
  return <LogoMerchStudio />;
}
