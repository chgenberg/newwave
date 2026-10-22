"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Butikens sidor i sidhuvudet; på mobilen en egen rad under det. */
export function ShopNav({ home, mobile = false }: { home: string; mobile?: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: `${home}#sortiment`, label: "Sortiment", active: false },
    { href: `${home}/om-oss`, label: "Om oss", active: pathname === `${home}/om-oss` },
    { href: `${home}/kontakt`, label: "Kontakta oss", active: pathname === `${home}/kontakt` },
  ];
  return (
    <nav aria-label="Butiken" className={mobile ? "flex gap-1 overflow-x-auto border-t border-[var(--shop-line)] px-3 py-1.5 sm:hidden" : "hidden items-center gap-1 sm:flex"}>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.active ? "page" : undefined}
          className={`inline-flex shrink-0 items-center rounded-full font-medium transition ${mobile ? "h-9 px-3.5 text-[13.5px]" : "h-10 px-4 text-[14px]"} ${l.active ? "bg-[var(--shop-bg)] text-[#111]" : "hover:bg-[var(--shop-bg)]"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
