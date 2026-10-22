"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/newwave/DashNav";

type Item = { href: string; label: string; icon: string; out?: boolean };

/** Sidomenyn i klubbens dashboard; på mobilen en rad överst. */
export function ClubDashNav({ base, more }: { base: string; more: Item[] }) {
  const pathname = usePathname();
  const main: Item[] = [
    { href: base, label: "Översikt", icon: "home" },
    { href: `${base}/statistik`, label: "Statistik", icon: "chart" },
    { href: `${base}/webshop`, label: "Webshop", icon: "store" },
  ];
  const link = (it: Item) => {
    const active = pathname === it.href;
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? "page" : undefined}
        className={`flex h-10 shrink-0 items-center gap-2.5 rounded-full px-3.5 text-[14px] font-medium transition min-[900px]:rounded-xl ${active ? "bg-[#111] text-white" : "text-[#4A4740] hover:bg-[#F2F1EE] hover:text-[#111]"}`}
      >
        <Icon name={it.icon} className="h-[18px] w-[18px] shrink-0" />
        <span className="whitespace-nowrap">{it.label}</span>
        {it.out ? (
          <span aria-hidden className="ml-auto hidden text-[#9A968C] min-[900px]:inline">
            ↗
          </span>
        ) : null}
      </Link>
    );
  };
  return (
    <nav aria-label="Dashboard" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 min-[900px]:sticky min-[900px]:top-24 min-[900px]:mx-0 min-[900px]:flex-col min-[900px]:overflow-visible min-[900px]:px-0">
      {main.map(link)}
      <p className="hidden px-3.5 pb-1 pt-5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A968C] min-[900px]:block">Mer</p>
      <span aria-hidden className="mx-1 w-px shrink-0 bg-[#E6E4DE] min-[900px]:hidden" />
      {more.map(link)}
    </nav>
  );
}
