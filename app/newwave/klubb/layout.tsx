import { Oswald } from "next/font/google";
import type { NavItem } from "@/components/newwave/DashNav";
import { DashShell } from "@/components/newwave/DashShell";
import { ASA_IF } from "@/lib/newwave/club";
import { ASA_IF as CLUB } from "@/lib/club";
import { listApprovals, readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

const BASE = "/newwave/klubb";
const ITEMS: NavItem[] = [
  { href: BASE, label: "Översikt", icon: "home" },
  { href: `${BASE}/material`, label: "Material", icon: "spark" },
  { href: `${BASE}/butik`, label: "Butik", icon: "bag" },
  { href: `${BASE}/varumarke`, label: "Varumärke", icon: "drop" },
  { href: `${BASE}/support`, label: "Support", icon: "chat" },
];

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-club" });

export default async function ClubLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [approvals, saved] = await Promise.all([listApprovals(ASA_IF.id), readBrand(ASA_IF.id)]);
  const pending = approvals.filter((a) => a.status === "väntar").length;
  const theme = clubTheme(saved.palette ?? CLUB.palette);
  return (
    <div
      className={`nw-club ${oswald.variable}`}
      style={
        {
          "--club": theme.primary,
          "--club-accent": theme.accent,
          "--club-on-accent": theme.onAccent,
          "--club-soft": theme.soft,
        } as React.CSSProperties
      }
    >
      <DashShell
        portal="klubb"
        base={BASE}
        items={ITEMS}
        label="Klubbens dashboard"
        title={ASA_IF.name}
        subtitle={`Sedan ${ASA_IF.founded}`}
        logo={{ src: ASA_IF.logo, width: 480, height: 419 }}
        overview={["godkann"]}
        badge={pending}
        cta={{ href: `${BASE}/material`, label: "Skapa" }}
        width={860}
      >
        {children}
      </DashShell>
    </div>
  );
}
