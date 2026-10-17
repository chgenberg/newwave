import { DashBottomBar, DashSidebar, type NavItem } from "@/components/newwave/DashNav";
import { craftOverview } from "@/lib/newwave/craft";


const BASE = "/newwave/craft";
const ITEMS: NavItem[] = [
  { href: BASE, label: "Klubbar", icon: "shield" },
  { href: `${BASE}/material`, label: "Material", icon: "grid" },
  { href: `${BASE}/skapa`, label: "Skapa", icon: "send" },
  { href: `${BASE}/insikter`, label: "Insikter", icon: "chart" },
  { href: `${BASE}/regler`, label: "Regler", icon: "rules" },
];

export default async function CraftLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const queue = (await craftOverview()).reduce((n, r) => n + r.stats.queue, 0);
  const badges = { [`${BASE}/material`]: queue };
  return (
    <div
      className="nw-club nw-club--plain"
      style={{ "--club": "#111111", "--club-accent": "#FFFFFF", "--club-on-accent": "#111111", "--club-soft": "#F2F2F0" } as React.CSSProperties}
    >
      <div className="nw-container grid gap-8 pb-28 pt-6 md:grid-cols-[76px_minmax(0,1fr)] md:pb-12 xl:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <DashSidebar
          base={BASE}
          items={ITEMS}
          label="Crafts dashboard"
          title="Craft"
          subtitle="Klubbmerch centralt"
          overview={["klubb"]}
          badges={badges}
          cta={{ href: `${BASE}/skapa`, label: "Skapa och tilldela" }}
        />
        <div className="min-w-0">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <span className="nw-club-heading grid h-9 w-9 place-items-center rounded-xl bg-[var(--club)] text-[13px] text-white">C</span>
            <p className="nw-club-heading text-[20px] leading-none text-[var(--club)]">Craft</p>
          </div>
          <div className="max-w-[980px]">{children}</div>
        </div>
      </div>
      <DashBottomBar base={BASE} items={ITEMS} label="Crafts dashboard" overview={["klubb"]} badges={badges} />
    </div>
  );
}
