"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TIP } from "./tip";

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  spark: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  bag: <path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8" />,
  drop: <path d="M12 3.5c3.5 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-10.5z" />,
  chat: <path d="M5 5.5h14a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-8l-4.5 3.5V17H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cube: <path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  shield: <path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z" />,
  grid: <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z" />,
  send: <path d="M4 11.5 20 4l-6.5 16-2.5-6.5z" />,
  chart: <path d="M5 19.5V11M10 19.5V5M15 19.5v-6M20 19.5V8" />,
  rules: <path d="M9 6.5h10M9 12h10M9 17.5h10M4.5 6.5l1 1 2-2M4.5 12l1 1 2-2M4.5 17.5l1 1 2-2" />,
  truck: <path d="M3.5 6.5h10v10h-10zM13.5 10h3.8l3.2 3.2v3.3h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  store: <path d="M4.5 9.5 6 4.5h12l1.5 5M4.5 9.5h15M4.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M6 12v7.5h12V12M10 19.5v-4.5h4v4.5" />,
  doc: <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6" />,
  layers: <path d="M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />,
  users: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.5c1.7.6 2.8 2.4 3 5.5" />,
};

export type NavItem = { href: string; label: string; icon: string };

export function Icon({ name, className = "h-[19px] w-[19px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {ICONS[name]}
    </svg>
  );
}

function useActive(base: string, overview: string[], home = base) {
  const pathname = usePathname();
  return (href: string) => (href === home ? pathname === home || overview.some((p) => pathname.startsWith(`${base}/${p}`)) : pathname.startsWith(href));
}

type Props = {
  base: string;
  /** Översiktens adress, om den inte är `base`. */
  home?: string;
  items: NavItem[];
  label: string;
  /** Undersidor som räknas till översikten, t.ex. "godkann". */
  overview?: string[];
  badge?: number;
  /** Siffror per menyval, nyckel = href. */
  badges?: Record<string, number>;
};

const SLIDE = { type: "spring", bounce: 0.16, duration: 0.55 } as const;

const countFor = (item: NavItem, home: string, badge?: number, badges?: Record<string, number>) => badges?.[item.href] ?? (item.href === home ? badge : undefined);

/** Portalens infällda meny med symboler, samma form som designstudions verktygsmeny. */
export function DashRail({ base, home = base, items, label, overview = [], badge, badges }: Props) {
  const active = useActive(base, overview, home);
  return (
    <nav aria-label={label} className="flex flex-col items-center gap-1 rounded-[22px] bg-[#F1F1EE] p-1.5 py-2.5 shadow-[inset_0_1px_3px_rgba(17,17,17,0.07),inset_0_0_0_1px_rgba(17,17,17,0.04)]">
      {items.map((item) => {
        const on = active(item.href);
        const count = countFor(item, home, badge, badges);
        return (
          <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} aria-label={count ? `${item.label} (${count})` : item.label} className={`group relative grid h-11 w-11 place-items-center rounded-[14px] transition-colors duration-300 active:scale-95 ${on ? "text-[var(--club)]" : "text-[#55524B] hover:bg-white/70 hover:text-[#111]"}`}>
            {on ? <motion.span layoutId={`${base}-rail`} transition={SLIDE} aria-hidden className="absolute inset-0 rounded-[14px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.08),0_6px_14px_-8px_rgba(17,17,17,0.35)]" /> : null}
            <Icon name={item.icon} className="relative h-[19px] w-[19px]" />
            {count ? <span className="absolute right-0.5 top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[var(--club)] px-1 text-[11px] font-semibold text-white">{count}</span> : null}
            <span className={TIP}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Var i portalen man är, till toppraden. */
export function DashCrumb({ base, home, items, overview = [] }: Pick<Props, "base" | "home" | "items" | "overview">) {
  const active = useActive(base, overview, home);
  const item = items.find((i) => active(i.href));
  return item ? <span className="min-w-0 truncate text-[14px] font-medium text-[#111] min-[380px]:max-w-[60%] min-[380px]:shrink-0">{item.label}</span> : null;
}

export function DashBottomBar({ base, home = base, items, label, overview = [], badge, badges }: Props) {
  const active = useActive(base, overview, home);
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 grid gap-1 rounded-[24px] bg-white/90 p-1.5 shadow-[0_0_0_1px_rgba(17,17,17,0.06),0_18px_40px_-14px_rgba(17,17,17,0.45)] backdrop-blur-xl min-[900px]:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const on = active(item.href);
        const count = countFor(item, home, badge, badges);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] transition-colors active:scale-[0.96] [transition-property:color,transform] ${on ? "text-white" : "text-[#55524B]"}`}
          >
            {on ? <motion.span layoutId={`${base}-bar`} transition={SLIDE} aria-hidden className="absolute inset-0 rounded-[18px] bg-[var(--club)]" /> : null}
            <Icon name={item.icon} className="relative h-5 w-5" />
            <span className="relative max-w-full truncate px-0.5 text-[12px] font-medium">{item.label}</span>
            {count ? <span className={`absolute right-2 top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[11px] font-semibold ${on ? "bg-white text-[var(--club)]" : "bg-[var(--club)] text-white"}`}>{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidans innehåll med dashboardens bredd; designmotorn (`/designa`) får hela ytan bredvid menyn. */
export function DashMain({ width, children }: { width: number; children: React.ReactNode }) {
  const wide = usePathname().endsWith("/designa");
  return (
    <main className={`min-w-0 flex-1 ${wide ? "" : "px-4 py-6 min-[900px]:px-10 min-[900px]:py-10"}`}>
      <div className="mx-auto" style={{ maxWidth: wide ? undefined : width }}>
        {children}
      </div>
    </main>
  );
}
