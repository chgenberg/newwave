"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { PORTALS, type PortalId } from "@/lib/newwave/hub";
import { Icon } from "./DashNav";

type Target = PortalId | "studio";

const ICON: Record<PortalId, string> = { klubb: "users", craft: "spark", "new-wave": "truck", shop: "store" };

const TARGETS: { id: Target; href: string; title: string; who: string; icon: string }[] = [
  { id: "studio", href: "/newwave#studio", title: "Designmotorn", who: "Designa med ert varumärke", icon: "drop" },
  ...PORTALS.map((p) => ({ id: p.id, href: p.href, title: p.title, who: p.who, icon: ICON[p.id] })),
];

/**
 * Växlar mellan designmotorn och de fyra dashboardsen. På datorn en diskret pil längst till vänster om menyn,
 * i toppraden på mobil (`bar`), där namnet på den aktuella ytan blir knappen.
 */
export function HubSwitch({ active, bar }: { active: Target; bar?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = TARGETS.find((t) => t.id === active);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative ${bar ? "min-w-0" : "flex self-stretch"}`}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={bar ? `${current?.title ?? "Byt yta"} – byt till designmotorn eller en dashboard` : open ? "Dölj dashboards" : "Visa designmotorn och dashboards"}
        className={
          bar
            ? "flex min-w-0 items-center gap-1 rounded-full py-1 pl-2 pr-1.5 text-[14px] text-[#6F6B63] transition hover:bg-[#F2F2EF] hover:text-[#111]"
            : "group grid w-5 place-items-center rounded-full text-[#A6A39B] transition hover:bg-[#F2F2EF] hover:text-[#111]"
        }
      >
        {bar ? <span className="truncate">{current?.id === "studio" ? "Studio" : (PORTALS.find((p) => p.id === active)?.short ?? "")}</span> : null}
        <svg viewBox="0 0 24 24" aria-hidden className={`h-4 w-4 shrink-0 fill-none stroke-current transition-transform duration-300 ${open ? "rotate-180" : bar ? "" : "group-hover:translate-x-0.5"}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={bar ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
        </svg>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.nav
            id={id}
            aria-label="Designmotorn och dashboards"
            initial={{ opacity: 0, x: bar ? 0 : -10, y: bar ? -6 : 0, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: bar ? 0 : -10, y: bar ? -6 : 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute z-[100] grid w-[260px] gap-0.5 rounded-[22px] bg-white p-2 shadow-[0_0_0_1px_rgba(17,17,17,0.06),0_24px_60px_-20px_rgba(17,17,17,0.45)] ${bar ? "left-0 top-[calc(100%+8px)] origin-top-left" : "left-[calc(100%+6px)] top-0 origin-left"}`}
          >
            {TARGETS.map((t) => {
              const on = t.id === active;
              return (
                <Link key={t.id} href={t.href} onClick={() => setOpen(false)} aria-current={on ? "page" : undefined} className={`flex items-center gap-3 rounded-[16px] p-2 transition ${on ? "bg-[#F1F1EE]" : "hover:bg-[#F6F6F3]"}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] ${on ? "bg-white text-[#111] shadow-[0_1px_2px_rgba(17,17,17,0.08),0_6px_14px_-8px_rgba(17,17,17,0.35)]" : "bg-[#F1F1EE] text-[#55524B]"}`}>
                    <Icon name={t.icon} />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[14px] font-semibold text-[#111]">{t.title}</span>
                    <span className="block truncate text-[12px] text-[#6F6B63]">{t.who}</span>
                  </span>
                </Link>
              );
            })}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
