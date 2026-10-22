import type { NavItem } from "@/components/newwave/DashNav";
import { DashShell } from "@/components/newwave/DashShell";
import { readShop } from "@/lib/newwave/shopState";

const BASE = "/newwave/new-wave";
const ITEMS: NavItem[] = [
  { href: BASE, label: "Hubben", icon: "home" },
  { href: `${BASE}/ordrar`, label: "Ordrar", icon: "truck" },
  { href: `${BASE}/tryckfiler`, label: "Tryckfiler", icon: "layers" },
  { href: `${BASE}/aterforsaljare`, label: "Återförsäljare", icon: "store" },
  { href: `${BASE}/klubbar`, label: "Klubbar", icon: "shield" },
];

export const dynamic = "force-dynamic";

export default async function NewWaveDashLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { quotes } = await readShop();
  const badges = { [`${BASE}/ordrar`]: quotes.filter((q) => q.status === "godkänd").length };
  return (
    <div className="nw-club nw-club--plain" style={{ "--club": "#0F1B2D", "--club-accent": "#5CC8FF", "--club-on-accent": "#0D0C0C", "--club-soft": "#E6F6FF" } as React.CSSProperties}>
      <DashShell portal="new-wave" base={BASE} items={ITEMS} label="New Waves dashboard" title="New Wave" subtitle="Profile hub · produktion" badges={badges} cta={{ href: "/newwave/studio", label: "Designstudion", icon: "drop" }} width={1080}>
        {children}
      </DashShell>
    </div>
  );
}
