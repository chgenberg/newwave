import Image from "next/image";
import Link from "next/link";
import { PORTALS, type PortalId } from "@/lib/newwave/hub";
import { DashBottomBar, DashCrumb, DashMain, DashRail, Icon, type NavItem } from "./DashNav";
import { HubSwitch } from "./HubSwitch";
import { HubFooterSlim } from "./HubFooter";
import { LogoMark } from "./Logo";

type Props = {
  portal: PortalId;
  base: string;
  items: NavItem[];
  label: string;
  title: string;
  subtitle: string;
  logo?: { src: string; width: number; height: number };
  /** Undersidor som räknas till översikten, t.ex. "godkann". */
  overview?: string[];
  badge?: number;
  badges?: Record<string, number>;
  cta: { href: string; label: string; icon?: string };
  /** Innehållets största bredd i px. */
  width: number;
  children: React.ReactNode;
};

/** Dashboardens skal, samma som designstudion: kort på grå botten, toppraden och två infällda menyer till vänster. */
export function DashShell({ portal, base, items, label, title, subtitle, logo, overview, badge, badges, cta, width, children }: Props) {
  const nav = { base, items, label, overview, badge, badges };
  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 pb-28 min-[900px]:p-6 min-[900px]:pb-0">
        <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-4 py-3 backdrop-blur-xl min-[900px]:gap-5 min-[900px]:px-6">
            <Link href="/newwave/start" className="flex min-h-9 min-w-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – till ingångarna">
              <LogoMark size={28} />
              <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
            </Link>
            <div className="flex min-w-0 items-center gap-1.5 text-[14px] text-[#6F6B63]">
              <span className="min-[900px]:hidden">
                <HubSwitch active={portal} bar />
              </span>
              <span className="hidden shrink-0 min-[900px]:inline">{PORTALS.find((p) => p.id === portal)?.short}</span>
              <span aria-hidden className="text-[#C9C7C0]">/</span>
              <DashCrumb base={base} items={items} overview={overview} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link href={cta.href} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--club)] px-3.5 text-[13.5px] font-semibold text-white transition hover:opacity-90 active:scale-[0.97] sm:px-4" aria-label={cta.label}>
                <Icon name={cta.icon ?? "plus"} className="h-[17px] w-[17px]" />
                <span className="hidden sm:inline">{cta.label}</span>
              </Link>
              <Link href={base} className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.3)] lg:pr-3.5" aria-label={`${title} – översikt`}>
                {logo ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#F2F2EF] p-1">
                    <Image src={logo.src} alt="" width={logo.width} height={logo.height} priority className="max-h-full w-auto object-contain" />
                  </span>
                ) : (
                  <span className="nw-club-heading grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--club)] text-[13px] text-white">{title.slice(0, 1)}</span>
                )}
                <span className="hidden min-w-0 leading-tight lg:block">
                  <span className="block max-w-[180px] truncate text-[13.5px] font-semibold">{title}</span>
                  <span className="block max-w-[180px] truncate text-[12px] text-[#6F6B63]">{subtitle}</span>
                </span>
              </Link>
            </div>
          </header>

          <div className="flex flex-1 flex-col min-[900px]:flex-row">
            <div className="sticky top-[65px] hidden h-fit shrink-0 gap-1 py-3 pl-1.5 min-[900px]:flex">
              <HubSwitch active={portal} />
              <DashRail {...nav} />
            </div>
            <DashMain width={width}>{children}</DashMain>
          </div>
        </div>
        <HubFooterSlim />
      </div>
      <DashBottomBar {...nav} />
    </>
  );
}
