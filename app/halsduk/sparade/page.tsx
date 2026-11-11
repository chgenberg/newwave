import type { Metadata } from "next";
import { ScarfSaved } from "@/components/ScarfSaved";

export const metadata: Metadata = { title: "Sparade designer – Halsduksagenten" };

export default function ScarfSavedPage() {
  return <ScarfSaved />;
}
