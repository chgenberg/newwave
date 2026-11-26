"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Klubbfiltret i Crafts ordervy: byter `?klubb=` och behåller statusfiltret. */
export function ClubFilter({ clubs, value, status }: { clubs: { id: string; name: string }[]; value: string; status?: string }) {
  const router = useRouter();
  return (
    <label className="relative shrink-0">
      <span className="sr-only">Klubb</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams({ ...(status ? { status } : {}), ...(e.target.value ? { klubb: e.target.value } : {}) });
          router.push(`/newwave/craft/ordrar${next.size ? `?${next}` : ""}`);
        }}
        className="h-9 w-full appearance-none rounded-full bg-[var(--nw-soft)] pl-4 pr-9 text-[13.5px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)] sm:w-auto"
      >
        <option value="">Alla klubbar</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

/** Hämtar sidan på nytt med jämna mellanrum medan den syns, så att status från producenterna dyker upp av sig själv. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
