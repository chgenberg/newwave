"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  spark: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  bag: <path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8" />,
  drop: <path d="M12 3.5c3.5 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-10.5z" />,
  chat: <path d="M5 5.5h14a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-8l-4.5 3.5V17H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  shield: <path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z" />,
  grid: <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z" />,
  send: <path d="M4 11.5 20 4l-6.5 16-2.5-6.5z" />,
  chart: <path d="M5 19.5V11M10 19.5V5M15 19.5v-6M20 19.5V8" />,
  rules: <path d="M9 6.5h10M9 12h10M9 17.5h10M4.5 6.5l1 1 2-2M4.5 12l1 1 2-2M4.5 17.5l1 1 2-2" />,
  truck: <path d="M3.5 6.5h10v10h-10zM13.5 10h3.8l3.2 3.2v3.3h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  store: <path d="M4.5 9.5 6 4.5h12l1.5 5M4.5 9.5h15M4.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M6 12v7.5h12V12M10 19.5v-4.5h4v4.5" />,
  doc: <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6" />,
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

function useActive(base: string, overview: string[]) {
  const pathname = usePathname();
  return (href: string) => (href === base ? pathname === base || overview.some((p) => pathname.startsWith(`${base}/${p}`)) : pathname.startsWith(href));
}

type Props = {
  base: string;
  items: NavItem[];
  label: string;
  title: string;
  subtitle: string;
  logo?: { src: string; width: number; height: number };
  /** Undersidor som räknas till översikten, t.ex. "godkann". */
  overview?: string[];
  badge?: number;
  /** Siffror per menyval, nyckel = href. */
  badges?: Record<string, number>;
  cta: { href: string; label: string; icon?: string };
};

const SLIDE = { type: "spring", bounce: 0.16, duration: 0.55 } as const;

const countFor = (item: NavItem, base: string, badge?: number, badges?: Record<string, number>) => badges?.[item.href] ?? (item.href === base ? badge : undefined);

export function DashSidebar({ base, items, label, title, subtitle, logo, overview = [], badge, badges, cta }: Props) {
  const active = useActive(base, overview);
  return (
    <aside className="sticky top-24 hidden h-[calc(100dvh-8rem)] max-h-[680px] flex-col rounded-[28px] bg-[var(--club)] p-3 text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.45)] md:flex xl:p-4">
      <Link href={base} className="flex items-center gap-3 rounded-2xl p-1.5 xl:p-2" aria-label={`${title} – översikt`}>
        {logo ? (
          <Image src={logo.src} alt="" width={logo.width} height={logo.height} priority className="h-9 w-auto shrink-0" />
        ) : (
          <span className="nw-club-heading grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[13px] text-[var(--club)]">{title.slice(0, 1)}</span>
        )}
        <span className="hidden min-w-0 xl:block">
          <span className="nw-club-heading block truncate text-[19px] leading-none">{title}</span>
          <span className="mt-1 block truncate text-[11.5px] text-white/50">{subtitle}</span>
        </span>
      </Link>

      <nav aria-label={label} className="mt-6 flex flex-col gap-1">
        {items.map((item) => {
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              title={item.label}
              className={`group relative flex h-11 items-center justify-center gap-3 rounded-2xl text-[14px] font-medium transition-colors duration-300 xl:justify-start xl:px-3 ${on ? "text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
            >
              {on ? (
                <motion.span layoutId={`${base}-side`} transition={SLIDE} aria-hidden className="absolute inset-0 rounded-2xl bg-white/[0.12]">
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--club-accent)]" />
                </motion.span>
              ) : null}
              <Icon name={item.icon} className="relative h-[19px] w-[19px] shrink-0 transition-transform duration-300 group-hover:scale-110" />
              <span className="relative hidden xl:inline">{item.label}</span>
              {countFor(item, base, badge, badges) ? (
                <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--club-accent)] px-1 text-[10.5px] font-semibold text-[var(--club-on-accent)] xl:static xl:ml-auto">
                  {countFor(item, base, badge, badges)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <Link
        href={cta.href}
        title={cta.label}
        className="mt-auto flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--club-accent)] text-[14px] font-semibold text-[var(--club-on-accent)] transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        <Icon name={cta.icon ?? "plus"} className="h-[18px] w-[18px]" />
        <span className="hidden xl:inline">{cta.label}</span>
      </Link>
    </aside>
  );
}

export function DashBottomBar({ base, items, label, overview = [], badge, badges }: Pick<Props, "base" | "items" | "label" | "overview" | "badge" | "badges">) {
  const active = useActive(base, overview);
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 grid gap-1 rounded-[24px] bg-[var(--club)] p-1.5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const on = active(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] transition-colors active:scale-[0.96] [transition-property:color,transform] ${on ? "text-white" : "text-white/55"}`}
          >
            {on ? (
              <motion.span layoutId={`${base}-bar`} transition={SLIDE} aria-hidden className="absolute inset-0 rounded-[18px] bg-white/[0.12]">
                <span className="absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--club-accent)]" />
              </motion.span>
            ) : null}
            <Icon name={item.icon} className="relative h-5 w-5" />
            <span className="relative max-w-full truncate px-0.5 text-[10.5px] font-medium">{item.label}</span>
            {countFor(item, base, badge, badges) ? (
              <span className="absolute right-2 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--club-accent)] px-1 text-[9.5px] font-semibold text-[var(--club-on-accent)]">
                {countFor(item, base, badge, badges)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
