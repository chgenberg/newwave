"use client";

import { useEffect, useRef, useState } from "react";
import { BASE } from "@/lib/newwave/sportshop/data";
import { useLang } from "./Lang";

/** Fotbollsloopen; startar inte för den som valt mindre rörelse och kan pausas. */
export function HeroVideo() {
  const { t } = useLang();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) void ref.current?.play().catch(() => {});
  }, []);
  const toggle = () => {
    const v = ref.current;
    if (v?.paused) void v.play();
    else v?.pause();
  };
  return (
    <>
      <video ref={ref} className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" src={`${BASE}/hero.mp4`} poster={`${BASE}/hero.jpg`} muted loop playsInline preload="auto" aria-hidden onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button type="button" onClick={toggle} aria-label={playing ? t.pause : t.play} className="absolute bottom-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
        </svg>
      </button>
    </>
  );
}
