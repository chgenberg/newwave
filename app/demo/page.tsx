import type { Metadata } from "next";
import { BoothDemo } from "@/components/demo/BoothDemo";

export const metadata: Metadata = {
  title: "Mässmonter med din logga",
  description: "Skapa en varumärkesanpassad mässmonter med profilprodukter och begär offert.",
};

export default function DemoPage() {
  return <BoothDemo />;
}
