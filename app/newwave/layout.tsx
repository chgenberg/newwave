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

/** Docker-bygget får inga Railway-variabler, och /newwave är statisk – därför produktionsadressen som reserv. */
const SITE = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : process.env.NODE_ENV === "production" ? "https://newwave-production.up.railway.app" : "http://localhost:3210";

const SHARE = {
  title: "Next Wave – testa själv",
  description: "En motor för klubbar, Craft, New Wave och återförsäljare. Se filmen, välj din ingång och prova – du får en egen demo.",
  images: [{ url: "/newwave/og.jpg", width: 1200, height: 630, alt: "Next Wave – testa själv" }],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Next Wave Production",
  description: SHARE.description,
  openGraph: { ...SHARE, type: "website", locale: "sv_SE", siteName: "Next Wave" },
  twitter: { card: "summary_large_image", ...SHARE },
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
