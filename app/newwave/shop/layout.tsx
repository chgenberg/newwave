import { DashBottomBar, DashSidebar, type NavItem } from "@/components/newwave/DashNav";
import { shopUrl } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { clubTheme } from "@/lib/newwave/theme";


const BASE = "/newwave/shop";
const ITEMS: NavItem[] = [
  { href: BASE, label: "Översikt", icon: "home" },
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
  const cta = live ? { href: shopUrl(reseller), label: "Visa butiken", icon: "store" } : { href: `${BASE}/butiken`, label: "Bygg butiken", icon: "plus" };
  return (
    <div
      className="nw-club nw-club--plain"
      style={{ "--club": theme.primary, "--club-accent": theme.accent, "--club-on-accent": theme.onAccent, "--club-soft": theme.soft } as React.CSSProperties}
    >
      <div className="nw-container grid gap-8 pb-28 pt-6 md:grid-cols-[76px_minmax(0,1fr)] md:pb-12 xl:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <DashSidebar base={BASE} items={ITEMS} label="Återförsäljarens dashboard" title={reseller.name} subtitle={`Återförsäljare · ${reseller.city}`} badges={badges} cta={cta} />
        <div className="min-w-0">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <span className="nw-club-heading grid h-9 w-9 place-items-center rounded-xl bg-[var(--club)] text-[13px] text-white">{reseller.name.slice(0, 1)}</span>
            <p className="nw-club-heading truncate text-[20px] leading-none text-[var(--club)]">{reseller.name}</p>
          </div>
          <div className="max-w-[1040px]">{children}</div>
        </div>
      </div>
      <DashBottomBar base={BASE} items={ITEMS} label="Återförsäljarens dashboard" badges={badges} />
    </div>
  );
}
