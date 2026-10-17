"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GUIDES, visited } from "@/lib/newwave/guide";
import type { PortalId } from "@/lib/newwave/hub";
import { STORAGE_PREFIX } from "./workspace/roles";

const KEY = `${STORAGE_PREFIX}guide`;
/** Skickas när guiden visas igen från menyn, så att den öppna sidan uppdateras utan omladdning. */
export const GUIDE_EVENT = "nw-guide";

type Saved = { seen: string[]; closed: PortalId[] };

const read = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    return { seen: Array.isArray(s?.seen) ? s.seen.filter((x) => typeof x === "string") : [], closed: Array.isArray(s?.closed) ? s.closed : [] };
  } catch {
    return { seen: [], closed: [] };
  }
};

const write = (s: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};

/** Visar guiden för en ingång igen efter att den stängts. */
export function reopenGuide(portal: PortalId) {
  const s = read();
  write({ ...s, closed: s.closed.filter((p) => p !== portal) });
  window.dispatchEvent(new Event(GUIDE_EVENT));
}

/** Tre saker att prova i ingången, som bockas av när man varit där, och nästa led i kedjan. */
export function DemoGuide({ portal }: { portal: PortalId }) {
  const pathname = usePathname();
  const guide = GUIDES[portal];
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    const s = read();
    const here = guide.steps.filter((step) => visited(step, pathname) && !s.seen.includes(step.href)).map((step) => step.href);
    const next = here.length ? { ...s, seen: [...s.seen, ...here] } : s;
    if (here.length) write(next);
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage går bara att läsa efter mount */
    setSaved(next);
  }, [pathname, guide]);

  useEffect(() => {
    const sync = () => setSaved(read());
    window.addEventListener(GUIDE_EVENT, sync);
    return () => window.removeEventListener(GUIDE_EVENT, sync);
  }, []);

  if (!saved || saved.closed.includes(portal) || pathname.endsWith("/designa")) return null;

  const done = guide.steps.filter((s) => saved.seen.includes(s.href)).length;
  const all = done === guide.steps.length;
  const close = () => {
    const s = { ...saved, closed: [...saved.closed, portal] };
    write(s);
    setSaved(s);
  };

  return (
    <section aria-label="Prova så här" className="nw-fade mb-7 rounded-[22px] bg-[#F4F4F1] p-3 sm:p-4">
      <div className="flex items-center gap-3 px-1">
        <p className="nw-mono shrink-0 text-[11.5px] uppercase tracking-[0.08em] text-[#6F6B63]">
          Prova så här · {done} av {guide.steps.length}
        </p>
        <p className="hidden min-w-0 truncate text-[13px] text-[#6F6B63] md:block">{guide.role}</p>
        <button type="button" onClick={close} aria-label="Stäng guiden" className="-my-1 ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#6F6B63] transition hover:bg-white hover:text-[#111]">
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <ol className="mt-2.5 flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {guide.steps.map((s, i) => {
          const seen = saved.seen.includes(s.href);
          const here = visited(s, pathname);
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                aria-current={here ? "page" : undefined}
                className={`flex h-10 items-center gap-2 rounded-full bg-white pl-1.5 pr-4 text-[13.5px] font-medium text-[#111] transition hover:shadow-[0_6px_18px_-10px_rgba(17,17,17,0.45)] ${here ? "shadow-[inset_0_0_0_1.5px_#111]" : ""}`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${seen ? "bg-[var(--club)] text-white" : "bg-[#F2F2EF] text-[#6F6B63]"}`}>
                  {seen ? (
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
        <li className="shrink-0 sm:ml-auto">
          <Link
            href={guide.next.href}
            className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] transition ${all ? "bg-[#111] text-white hover:opacity-90" : "text-[#6F6B63] hover:bg-white hover:text-[#111]"}`}
          >
            <span className="hidden sm:inline">{guide.next.text}</span>
            <span className="font-semibold">{guide.next.label}</span>
            <span aria-hidden>→</span>
          </Link>
        </li>
      </ol>
    </section>
  );
}
