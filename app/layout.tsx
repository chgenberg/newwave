import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { VisitTracker } from "@/components/VisitTracker";
import "./globals.css";

const inter = localFont({ src: "./fonts/inter.woff2", weight: "100 900", variable: "--font-inter" });
const brand = localFont({ src: "./fonts/source-sans-3.woff2", weight: "200 900", variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Craft Content Engine – klubbmerch på beställning",
  description: "Mockup: AI-genererade tryckmotiv, Intersport-API och innehåll för sociala medier per klubb.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className={`${inter.variable} ${brand.variable}`}>
      <body className="min-h-screen bg-white font-sans text-[#1D1D1F] antialiased">
        {children}
        <VisitTracker />
      </body>
    </html>
  );
}
