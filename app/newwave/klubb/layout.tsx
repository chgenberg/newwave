import localFont from "next/font/local";
import { ASA_IF as CLUB } from "@/lib/club";
import { ASA_IF } from "@/lib/newwave/club";
import { readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

const oswald = localFont({ src: "../../fonts/oswald.woff2", weight: "500 700", variable: "--font-club" });

/** Klubbens färger och typsnitt, för både visningen och dashboarden. */
export default async function ClubLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const saved = await readBrand(ASA_IF.id);
  const theme = clubTheme(saved.palette ?? CLUB.palette);
  return (
    <div
      className={`nw-club ${oswald.variable} flex flex-1 flex-col`}
      style={
        {
          "--club": theme.primary,
          "--club-accent": theme.accent,
          "--club-on-accent": theme.onAccent,
          "--club-soft": theme.soft,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
