import type { Metadata } from "next";
import localFont from "next/font/local";
import { MotionRoot } from "@/components/newwave/motion/Motion";
import { ScrollToTop } from "@/components/newwave/ScrollToTop";
import "./newwave.css";

const sans = localFont({
  src: [
    { path: "../fonts/schibsted-grotesk.woff2", weight: "400 900", style: "normal" },
    { path: "../fonts/schibsted-grotesk-italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-nw",
});
const mono = localFont({ src: "../fonts/fragment-mono.woff2", weight: "400", variable: "--font-nw-mono" });

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
