import type { Metadata } from "next";
import { Fragment_Mono, Schibsted_Grotesk } from "next/font/google";
import { MotionRoot } from "@/components/newwave/motion/Motion";
import { ScrollToTop } from "@/components/newwave/ScrollToTop";
import "./newwave.css";

const sans = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], variable: "--font-nw" });
const mono = Fragment_Mono({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-nw-mono" });

export const metadata: Metadata = {
  title: "Next Wave Production",
  description: "Navet där klubbar, Craft, New Wave och återförsäljare skapar material – och skickar det vidare till New Wave via API.",
};

export default function NewWaveLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`nw ${sans.variable} ${mono.variable} flex min-h-screen flex-col`}>
      <MotionRoot>
        <ScrollToTop />
        {children}
      </MotionRoot>
    </div>
  );
}
