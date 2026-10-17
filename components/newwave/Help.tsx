"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GUIDES, PAGE_HELP, visited } from "@/lib/newwave/guide";
import type { PortalId } from "@/lib/newwave/hub";
import { STORAGE_PREFIX } from "./workspace/roles";

const KEY = `${STORAGE_PREFIX}guide`;
/** Skickas när hjälpen öppnas från menyn. */
const OPEN_EVENT = "nw-help";

const readSeen = (): string[] => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { seen?: unknown } | null;
    return Array.isArray(s?.seen) ? s.seen.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const writeSeen = (seen: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ seen }));
  } catch {}
};

export function openHelp() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Frågetecknet längst ner till höger. Öppnar hjälpen i nederkanten: tre saker att prova i ingången, som bockas av när
 * man varit där, nästa led i kedjan och förklaringen till sidan man står på.
 */
export function HelpButton({ portal }: { portal: PortalId }) {
  const pathname = usePathname();
  const guide = GUIDES[portal];
  const page = PAGE_HELP.find((h) => h.path === pathname);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const s = readSeen();
    const here = guide.steps.filter((step) => visited(step, pathname) && !s.includes(step.href)).map((step) => step.href);
    const next = here.length ? [...s, ...here] : s;
    if (here.length) writeSeen(next);
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage går bara att läsa efter mount */
    setSeen(next);
  }, [pathname, guide]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const button = buttonRef.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [open]);

  const done = seen ? guide.steps.filter((s) => seen.includes(s.href)).length : guide.steps.length;
  const all = done === guide.steps.length;
  // Designstudion fyller skärmen och har egna knappar i hörnet; hjälpen nås där från menyn.
  const hidden = pathname.endsWith("/designa");

  return (
    <>
      {hidden ? null : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={all ? "Hjälp" : `Hjälp, ${guide.steps.length - done} saker kvar att prova`}
          aria-expanded={open}
          aria-controls="nw-help"
          className="fixed bottom-[calc(max(12px,env(safe-area-inset-bottom))+84px)] right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-[#111] text-[20px] font-semibold text-white shadow-[0_14px_34px_-12px_rgba(17,17,17,0.6)] transition-transform hover:scale-105 active:scale-95 min-[900px]:bottom-8 min-[900px]:right-8"
        >
          ?
          {all ? null : (
            <span aria-hidden className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--club)] px-1 text-[11px] font-bold text-white ring-2 ring-white">
              {guide.steps.length - done}
            </span>
          )}
        </button>
      )}

      <AnimatePresence>
        {open ? (
          <>
            <motion.div key="backdrop" aria-hidden onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-black/25 backdrop-blur-[2px]" />
            <motion.section
              key="sheet"
              id="nw-help"
              role="dialog"
              aria-modal="true"
              aria-labelledby="nw-help-title"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0.12, duration: 0.5 }}
              className="fixed inset-x-0 bottom-0 z-[120] mx-auto max-h-[85svh] w-full max-w-[760px] overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_60px_-20px_rgba(17,17,17,0.45)] sm:px-7"
            >
              <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-[#E2E1DC]" />
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="nw-mono text-[11.5px] uppercase tracking-[0.08em] text-[#6F6B63]">
                    Prova så här · {done} av {guide.steps.length}
                  </p>
                  <h2 id="nw-help-title" className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#111]">
                    {guide.role}
                  </h2>
                </div>
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Stäng hjälpen" className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#6F6B63] transition hover:bg-[#F4F4F1] hover:text-[#111]">
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <ol className="mt-4 grid gap-2 sm:grid-cols-3">
                {guide.steps.map((s, i) => {
                  const ok = seen?.includes(s.href);
                  const here = visited(s, pathname);
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        onClick={() => setOpen(false)}
                        aria-current={here ? "page" : undefined}
                        className={`flex h-full min-h-12 items-center gap-2.5 rounded-2xl bg-[#F4F4F1] p-2 pr-3 text-[13.5px] font-medium text-[#111] transition hover:bg-[#ECECE8] ${here ? "shadow-[inset_0_0_0_1.5px_#111]" : ""}`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${ok ? "bg-[var(--club)] text-white" : "bg-white text-[#6F6B63]"}`}>
                          {ok ? (
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        {s.label}
                      </Link>
                    </li>
                  );
                })}
              </ol>

              <Link
                href={guide.next.href}
                onClick={() => setOpen(false)}
                className={`mt-2 flex min-h-11 flex-wrap items-center gap-x-2 rounded-2xl px-4 py-2.5 text-[13px] transition ${all ? "bg-[#111] text-white hover:opacity-90" : "bg-white text-[#6F6B63] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)] hover:text-[#111]"}`}
              >
                <span>{guide.next.text}</span>
                <span className="ml-auto font-semibold">
                  {guide.next.label} <span aria-hidden>→</span>
                </span>
              </Link>

              {page ? (
                <div className="mt-6 border-t border-[rgba(17,17,17,0.08)] pt-5">
                  <p className="nw-mono text-[11.5px] uppercase tracking-[0.08em] text-[#6F6B63]">Om sidan</p>
                  <p className="mt-1 text-[16px] font-semibold text-[#111]">{page.title}</p>
                  {page.text ? <p className="mt-1 text-[13.5px] leading-relaxed text-[#6F6B63]">{page.text}</p> : null}
                  {page.steps ? (
                    <ol className="mt-4 grid gap-4 sm:grid-cols-2">
                      {page.steps.map((h, i) => (
                        <li key={h.title} className="flex gap-3">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--club)] text-[11.5px] font-bold text-white">{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-medium text-[#111]">{h.title}</span>
                            <span className="block text-[12.5px] leading-snug text-[#6F6B63]">{h.text}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
