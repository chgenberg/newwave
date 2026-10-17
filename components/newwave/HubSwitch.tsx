"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { HUB_TARGETS, type HubTarget } from "@/lib/newwave/hub";
import { Icon } from "./DashNav";
import { reopenGuide } from "./DemoGuide";
import { ShareDemo } from "./ShareDemo";
import { STORAGE_PREFIX } from "./workspace/roles";

/** Studions val av öppen panel är en inställning, inte demodata. */
const RAIL_KEY = "nw.studio.rail";

/** Rensar besökarens egen demomiljö på servern och det studion sparat i webbläsaren. */
function Restart() {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");

  const restart = async () => {
    setStep("busy");
    await fetch("/api/v1/newwave/demo", { method: "DELETE" }).catch(() => null);
    for (const k of Object.keys(localStorage)) if ((k.startsWith(STORAGE_PREFIX) && k !== RAIL_KEY) || k.startsWith("nw-shop:")) localStorage.removeItem(k);
    if (window.location.pathname === "/newwave") window.location.reload();
    else router.push("/newwave");
  };

  return (
    <div className="px-2 pb-1">
      {step === "idle" ? (
        <button type="button" onClick={() => setStep("confirm")} className="flex min-h-9 w-full items-center gap-2 rounded-full px-1 text-left text-[13px] text-[#6F6B63] transition hover:text-[#111]">
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Börja om demon
        </button>
      ) : (
        <div role="group" aria-label="Börja om demon">
          <p className="px-1 text-[12.5px] leading-snug text-[#6F6B63]">Allt du har skapat och ändrat försvinner. Ingen annan påverkas.</p>
          <div className="mt-2 flex gap-1.5">
            <button type="button" disabled={step === "busy"} onClick={restart} className="min-h-9 flex-1 rounded-full bg-[#111] px-3 text-[13px] font-semibold text-white transition disabled:opacity-60">
              {step === "busy" ? "Börjar om…" : "Ja, börja om"}
            </button>
            <button type="button" disabled={step === "busy"} onClick={() => setStep("idle")} className="min-h-9 rounded-full px-3 text-[13px] text-[#6F6B63] transition hover:bg-[#F2F2EF] hover:text-[#111]">
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Växlar mellan designmotorn och de fyra dashboardsen. På datorn en diskret pil längst till vänster om menyn,
 * i toppraden på mobil (`bar`), där namnet på den aktuella ytan blir knappen.
 */
export function HubSwitch({ active, bar }: { active: HubTarget; bar?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = HUB_TARGETS.find((t) => t.id === active);

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
            ? "flex min-h-9 min-w-0 items-center gap-1 rounded-full py-1 pl-2 pr-1.5 text-[14px] text-[#6F6B63] transition hover:bg-[#F2F2EF] hover:text-[#111]"
            : "group grid w-5 place-items-center rounded-full text-[#A6A39B] transition hover:bg-[#F2F2EF] hover:text-[#111]"
        }
      >
        {bar ? <span className="truncate">{current?.short}</span> : null}
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
            {HUB_TARGETS.map((t) => {
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
            <div className="mt-1 border-t border-[rgba(17,17,17,0.07)] px-2 pt-2">
              {active !== "studio" ? (
                <button
                  type="button"
                  onClick={() => {
                    reopenGuide(active);
                    setOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-full px-1 text-left text-[13px] text-[#6F6B63] transition hover:text-[#111]"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
                  </svg>
                  Visa guiden
                </button>
              ) : null}
              <ShareDemo variant="menu" />
            </div>
            <Restart />
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
