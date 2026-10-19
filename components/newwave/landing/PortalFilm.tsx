"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Portal } from "@/lib/newwave/hub";

/**
 * Ett av de fyra valen på startsidan: portalens film eller bild som knapp, i filmens format 16:9 så att hela syns. Filmen
 * loopar tyst när kortet syns. På bred skärm står bilden överst och texten under, så att korten i raden blir lika höga.
 */
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
      className="group relative block aspect-video overflow-hidden rounded-[22px] bg-[#141416] text-white shadow-[0_1px_2px_rgba(17,17,17,0.06)] outline-none ring-[#111] ring-offset-2 transition-shadow duration-500 hover:shadow-[0_30px_60px_-30px_rgba(17,17,17,0.6)] focus-visible:ring-2 xl:flex xl:aspect-auto xl:h-full xl:flex-col"
    >
      <span className="absolute inset-0 overflow-hidden xl:relative xl:inset-auto xl:block xl:aspect-video xl:shrink-0">
        {p.film ? (
          <video ref={video} src={p.film} poster={p.poster} muted loop playsInline preload="metadata" aria-hidden className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]" />
        ) : (
          <Image src={p.poster} alt="" fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 45vw, 100vw" className="object-cover object-top transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]" />
        )}
      </span>
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 via-45% to-black/0 to-70% xl:hidden" />

      <span className="nw-mono absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1.5 text-[11px] uppercase tracking-[0.06em] text-white/85 backdrop-blur-md sm:left-5 sm:top-5 xl:relative xl:left-0 xl:top-0 xl:mx-5 xl:mb-2 xl:mt-4 xl:self-start xl:bg-transparent xl:p-0 xl:text-[10px] xl:backdrop-blur-none">
        {String(n).padStart(2, "0")} · {p.who}
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-6 xl:contents">
        <span className="min-w-0 xl:relative xl:mx-5 xl:mb-5">
          <span className="block text-[clamp(28px,3.6vw,48px)] font-semibold leading-[0.95] tracking-[-0.045em] xl:text-[clamp(22px,1.8vw,32px)]">{p.short}</span>
          <span className="mt-2 hidden max-w-[46ch] text-[14px] leading-snug text-white/75 sm:block xl:text-[13px]">{p.description}</span>
        </span>
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#111] transition-transform duration-500 group-hover:translate-x-1 sm:h-12 sm:w-12 xl:absolute xl:right-3 xl:top-3 xl:h-10 xl:w-10">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </span>
    </Link>
  );
}
