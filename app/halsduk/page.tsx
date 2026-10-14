import type { Metadata } from "next";
import { Anton, Bebas_Neue } from "next/font/google";
import { ScarfStudio } from "@/components/ScarfStudio";

const anton = Anton({ subsets: ["latin"], weight: "400" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400" });

export const metadata: Metadata = { title: "Halsduksagenten – stickad halsduk för klubben" };

export default function HalsdukPage() {
  return <ScarfStudio fonts={{ block: anton.style.fontFamily, tall: bebas.style.fontFamily }} />;
}
