import type { Metadata } from "next";
import localFont from "next/font/local";
import { ScarfStudio } from "@/components/ScarfStudio";

const anton = localFont({ src: "../fonts/anton.woff2", weight: "400" });
const bebas = localFont({ src: "../fonts/bebas-neue.woff2", weight: "400" });
const caveat = localFont({ src: "../fonts/caveat.woff2", weight: "700" });

export const metadata: Metadata = { title: "Halsduksagenten – stickad halsduk för klubben" };

export default function HalsdukPage() {
  return <ScarfStudio fonts={{ block: anton.style.fontFamily, tall: bebas.style.fontFamily, script: caveat.style.fontFamily }} />;
}
