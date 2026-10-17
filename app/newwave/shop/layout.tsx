import type { NavItem } from "@/components/newwave/DashNav";
import { DashShell } from "@/components/newwave/DashShell";
import { shopUrl } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { clubTheme } from "@/lib/newwave/theme";

const BASE = "/newwave/shop";
const ITEMS: NavItem[] = [
  { href: BASE, label: "Översikt", icon: "home" },
  { href: `${BASE}/designa`, label: "Designa", icon: "cube" },
  { href: `${BASE}/butiken`, label: "Butiken", icon: "store" },
  { href: `${BASE}/offerter`, label: "Offerter", icon: "doc" },
  { href: `${BASE}/ordrar`, label: "Ordrar", icon: "truck" },
];

export const dynamic = "force-dynamic";

export default async function ResellerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [reseller, quotes] = await Promise.all([getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER)]);
  if (!reseller) return children;
  const theme = clubTheme([
    { name: "primary", hex: reseller.theme.primary },
    { name: "accent", hex: reseller.theme.accent },
  ]);
  const badges = { [`${BASE}/offerter`]: quotes.filter((q) => q.status === "ny").length };
  const live = reseller.status === "publicerad";
  const cta = live ? { href: shopUrl(reseller), label: "Visa butiken", icon: "store" } : { href: `${BASE}/butiken/ny`, label: "Bygg butiken", icon: "plus" };
  return (
    <div
      className="nw-club nw-club--plain"
      style={{ "--club": theme.primary, "--club-accent": theme.accent, "--club-on-accent": theme.onAccent, "--club-soft": theme.soft } as React.CSSProperties}
    >
      <DashShell portal="shop" base={BASE} items={ITEMS} label="Återförsäljarens dashboard" title={reseller.name} subtitle={`Återförsäljare · ${reseller.city}`} badges={badges} cta={cta} width={1040}>
        {children}
      </DashShell>
    </div>
  );
}
