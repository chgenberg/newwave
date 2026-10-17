import Image from "next/image";
import { Oswald } from "next/font/google";
import { DashBottomBar, DashSidebar, type NavItem } from "@/components/newwave/DashNav";
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
      <div className="nw-container grid gap-8 pb-28 pt-6 md:grid-cols-[76px_minmax(0,1fr)] md:pb-12 xl:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <DashSidebar
          base={BASE}
          items={ITEMS}
          label="Klubbens dashboard"
          title={ASA_IF.name}
          subtitle={`Sedan ${ASA_IF.founded}`}
          logo={{ src: ASA_IF.logo, width: 480, height: 419 }}
          overview={["godkann"]}
          badge={pending}
          cta={{ href: `${BASE}/material`, label: "Skapa" }}
        />
        <div className="min-w-0">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <Image src={ASA_IF.logo} alt="" width={480} height={419} priority className="h-9 w-auto" />
            <p className="nw-club-heading text-[20px] leading-none text-[var(--club)]">{ASA_IF.name}</p>
          </div>
          <div className="max-w-[860px]">{children}</div>
        </div>
      </div>
      <DashBottomBar base={BASE} items={ITEMS} label="Klubbens dashboard" overview={["godkann"]} badge={pending} />
    </div>
  );
}
