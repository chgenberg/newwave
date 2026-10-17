"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export function SearchBox({ value, onChange, placeholder, size = "lg" }: { value: string; onChange: (v: string) => void; placeholder: string; size?: "lg" | "md" }) {
  return (
    <div className="relative min-w-0 flex-1">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nw-faint)]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Sök"
        className={`${size === "lg" ? "h-11" : "h-10"} w-full rounded-full bg-[var(--nw-soft)] pl-10 pr-10 text-[16px] outline-none placeholder:text-[var(--nw-faint)] focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]`}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Rensa sökningen" className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[15px] text-[var(--nw-muted)] hover:bg-white">
          ×
        </button>
      ) : null}
    </div>
  );
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

/** Vyer är sparade sökningar, i webbläsaren. */
export function useSavedViews(key: string, builtIn: string[]) {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(key) ?? "[]", () => "[]");
  const saved = JSON.parse(raw) as string[];
  const write = (next: string[]) => {
    localStorage.setItem(key, JSON.stringify(next));
    listeners.forEach((fn) => fn());
  };
  return {
    all: [...builtIn, ...saved.filter((v) => !builtIn.includes(v))],
    saved,
    add: (v: string) => write([...new Set([...saved, v])].slice(-8)),
    remove: (v: string) => write(saved.filter((x) => x !== v)),
  };
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2600);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return createPortal(
    <div role="status" className="nw-fade fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--nw-ink)] px-4 py-2 text-[13px] font-medium text-white shadow-lg md:bottom-8">
      ✓ {message}
    </div>,
    document.querySelector(".nw-club") ?? document.body,
  );
}
