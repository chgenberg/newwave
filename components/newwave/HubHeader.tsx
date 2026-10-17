"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/newwave/Logo";
import { EASE } from "@/components/newwave/motion/Motion";
import { PORTALS } from "@/lib/newwave/hub";

const LINKS = [
  ...PORTALS.map((p) => ({ href: p.href, label: p.short, who: p.who })),
  { href: "/newwave/s/vastkust-profil", label: "Webbshop", who: "Demo: Västkust Profil" },
];

/** Navets sidhuvud: ingångarna som länkar, och en helskärmsmeny på mobil. */
export function HubHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const behind = [...document.querySelectorAll<HTMLElement>(".nw > main, .nw > footer")];
    const toggle = button.current;
    document.documentElement.style.overflow = "hidden";
    behind.forEach((el) => (el.inert = true));
    window.addEventListener("keydown", onKey);
    const focus = requestAnimationFrame(() => document.querySelector<HTMLElement>("#nw-menu a")?.focus());
    return () => {
      cancelAnimationFrame(focus);
      document.documentElement.style.overflow = "";
      behind.forEach((el) => (el.inert = false));
      window.removeEventListener("keydown", onKey);
      if (toggle && document.activeElement?.closest("#nw-menu")) toggle.focus();
    };
  }, [open]);

  return (
    <>
    <header data-lenis-prevent={open || undefined} className="sticky top-0 z-40 border-b border-[var(--nw-line)] bg-white/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="nw-container flex h-16 items-center justify-between gap-6">
        <Link href="/newwave" aria-label="Next Wave Production – till navet" className="relative z-10 shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Ingångar" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined} className="nw-link nw-hit text-[14px] font-medium text-[var(--nw-muted)] transition-colors hover:text-[var(--nw-ink)] aria-[current=page]:text-[var(--nw-ink)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          ref={button}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="nw-menu"
          className="nw-mono relative z-10 -mr-2 inline-flex h-10 items-center gap-2.5 rounded-full px-3 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-ink)] lg:hidden"
        >
          <span>{open ? "Stäng" : "Meny"}</span>
          <span aria-hidden className="relative block h-2.5 w-4">
            <span className={`absolute left-0 block h-[1.5px] w-4 bg-current transition-transform duration-300 ${open ? "top-[4px] rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 block h-[1.5px] w-4 bg-current transition-transform duration-300 ${open ? "top-[4px] -rotate-45" : "top-[8px]"}`} />
          </span>
        </button>
      </div>
    </header>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="nw-menu"
            key="menu"
            className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-y-auto bg-white lg:hidden"
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <nav aria-label="Ingångar" className="nw-container flex flex-1 flex-col justify-center py-10">
              <ul className="divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
                {LINKS.map((l, i) => (
                  <li key={l.href} className="overflow-hidden">
                    <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.12 + i * 0.05 }}>
                      <Link href={l.href} aria-current={active(l.href) ? "page" : undefined} className="group flex items-baseline gap-4 py-5">
                        <span className="nw-mono w-6 shrink-0 text-[12px] text-[var(--nw-muted)]">{String(i + 1).padStart(2, "0")}</span>
                        <span className="text-[clamp(34px,9vw,52px)] font-semibold leading-none tracking-[-0.04em] text-[var(--nw-ink)] transition-transform duration-500 group-hover:translate-x-2 group-aria-[current=page]:italic">{l.label}</span>
                        <span className="ml-auto hidden text-[13px] text-[var(--nw-muted)] sm:inline">{l.who}</span>
                      </Link>
                    </motion.div>
                  </li>
                ))}
              </ul>
            </nav>
            <motion.p className="nw-container nw-mono pb-8 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-muted)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              Allt skickas till New Wave via API
            </motion.p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
