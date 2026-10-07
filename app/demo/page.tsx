import type { Metadata } from "next";
import { BoothDemo } from "@/components/demo/BoothDemo";

export const metadata: Metadata = {
  title: "Mässa, konferens, kick-off och event med din logga",
  description: "Välj mässa, konferens, kick-off eller event och se det med er logga, era färger och profilprodukter. Begär offert direkt.",
};

export default function DemoPage() {
  return <BoothDemo />;
}
