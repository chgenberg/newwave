"use client";

import { useId, useState } from "react";

export function Chevron({ open, className = "h-3.5 w-3.5" }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`${className} shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** En rad med rubrik och sammanfattning som fälls ut under sig. */
export function Fold({ title, summary, children, defaultOpen = false }: { title: string; summary?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-3 rounded-[var(--nw-radius)] px-4 py-4 text-left transition-colors hover:bg-[var(--nw-soft)]/60 sm:px-5"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--nw-ink)]">{title}</span>
        {summary ? <span className="shrink-0 text-[13px] text-[var(--nw-muted)]">{summary}</span> : null}
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--nw-soft)] text-[var(--nw-muted)]">
          <Chevron open={open} />
        </span>
      </button>
      <div id={id} inert={!open} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--nw-line)] px-4 pb-5 pt-4 sm:px-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
