"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Portal } from "@/lib/newwave/hub";

/** Ett av de fyra valen på startsidan: portalens film som knapp. Spelar tyst när kortet syns, annars visas affischbilden. */
export function PortalFilm({ portal: p, n }: { portal: Portal; n: number }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? el.play().catch(() => {}) : el.pause()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Link
      href={p.start}
      aria-label={`${p.short} – ${p.description}`}
      className="group relative block aspect-[16/10] overflow-hidden rounded-[22px] bg-[#141416] text-white shadow-[0_1px_2px_rgba(17,17,17,0.06)] outline-none ring-[#111] ring-offset-2 transition-shadow duration-500 hover:shadow-[0_30px_60px_-30px_rgba(17,17,17,0.6)] focus-visible:ring-2"
    >
      {p.film ? (
        <video ref={video} src={p.film} poster={p.poster} muted loop playsInline preload="metadata" aria-hidden className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]" />
      ) : (
        <Image src={p.poster} alt="" fill sizes="(min-width: 900px) 45vw, 100vw" className="object-cover object-top transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]" />
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 via-45% to-black/0 to-70%" />

      <span className="nw-mono absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1.5 text-[11px] uppercase tracking-[0.06em] text-white/85 backdrop-blur-md sm:left-5 sm:top-5">
        {String(n).padStart(2, "0")} · {p.who}
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-6">
        <span className="min-w-0">
          <span className="block text-[clamp(28px,3.6vw,48px)] font-semibold leading-[0.95] tracking-[-0.045em]">{p.short}</span>
          <span className="mt-2 hidden max-w-[46ch] text-[14px] leading-snug text-white/75 sm:block">{p.description}</span>
        </span>
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#111] transition-transform duration-500 group-hover:translate-x-1 sm:h-12 sm:w-12">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </span>
    </Link>
  );
}
