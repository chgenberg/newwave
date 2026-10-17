import { DashBottomBar, DashSidebar, type NavItem } from "@/components/newwave/DashNav";
import { readShop } from "@/lib/newwave/shopState";


const BASE = "/newwave/new-wave";
const ITEMS: NavItem[] = [
  { href: BASE, label: "Navet", icon: "home" },
  { href: `${BASE}/ordrar`, label: "Ordrar", icon: "truck" },
  { href: `${BASE}/aterforsaljare`, label: "Återförsäljare", icon: "store" },
  { href: `${BASE}/klubbar`, label: "Klubbar", icon: "shield" },
];

export const dynamic = "force-dynamic";

export default async function NewWaveDashLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { quotes } = await readShop();
  const badges = { [`${BASE}/ordrar`]: quotes.filter((q) => q.status === "godkänd").length };
  return (
    <div className="nw-club nw-club--plain" style={{ "--club": "#0F1B2D", "--club-accent": "#5CC8FF", "--club-on-accent": "#0D0C0C", "--club-soft": "#E6F6FF" } as React.CSSProperties}>
      <div className="nw-container grid gap-8 pb-28 pt-6 md:grid-cols-[76px_minmax(0,1fr)] md:pb-12 xl:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <DashSidebar base={BASE} items={ITEMS} label="New Waves dashboard" title="New Wave" subtitle="Profile hub · produktion" badges={badges} cta={{ href: "/newwave", label: "Navkartan", icon: "spark" }} />
        <div className="min-w-0">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <span className="nw-club-heading grid h-9 w-9 place-items-center rounded-xl bg-[var(--club)] text-[13px] text-white">N</span>
            <p className="nw-club-heading text-[20px] leading-none text-[var(--club)]">New Wave</p>
          </div>
          <div className="max-w-[1080px]">{children}</div>
        </div>
      </div>
      <DashBottomBar base={BASE} items={ITEMS} label="New Waves dashboard" badges={badges} />
    </div>
  );
}
