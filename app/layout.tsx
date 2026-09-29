import type { Metadata } from "next";
import { Inter, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const brand = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "900"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Craft Content Engine – klubbmerch på beställning",
  description: "Mockup: AI-genererade tryckmotiv, Intersport-API och innehåll för sociala medier per klubb.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className={`${inter.variable} ${brand.variable}`}>
      <body className="min-h-screen bg-white font-sans text-[#1D1D1F] antialiased">{children}</body>
    </html>
  );
}
