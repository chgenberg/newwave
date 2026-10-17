import type { NavItem } from "@/components/newwave/DashNav";
import { DashShell } from "@/components/newwave/DashShell";
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
      <DashShell portal="craft" base={BASE} items={ITEMS} label="Crafts dashboard" title="Craft" subtitle="Klubbmerch centralt" overview={["klubb"]} badges={badges} cta={{ href: `${BASE}/skapa`, label: "Skapa och tilldela" }} width={980}>
        {children}
      </DashShell>
    </div>
  );
}
