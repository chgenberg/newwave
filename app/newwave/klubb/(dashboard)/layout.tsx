import type { NavItem } from "@/components/newwave/DashNav";
import { DashShell } from "@/components/newwave/DashShell";
import { ASA_IF } from "@/lib/newwave/club";
import { listApprovals } from "@/lib/newwave/store";

const BASE = "/newwave/klubb";
const HOME = `${BASE}/oversikt`;
const ITEMS: NavItem[] = [
  { href: HOME, label: "Översikt", icon: "home" },
  { href: `${BASE}/designa`, label: "Designa", icon: "cube" },
  { href: `${BASE}/material`, label: "Material", icon: "spark" },
  { href: `${BASE}/butik`, label: "Butik", icon: "bag" },
  { href: `${BASE}/varumarke`, label: "Varumärke", icon: "drop" },
  { href: `${BASE}/ordmarken`, label: "Ordmärken", icon: "layers" },
  { href: `${BASE}/support`, label: "Support", icon: "chat" },
];

export default async function ClubDashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pending = (await listApprovals(ASA_IF.id)).filter((a) => a.status === "väntar").length;
  return (
    <DashShell
      portal="klubb"
      base={BASE}
      home={HOME}
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
  );
}
