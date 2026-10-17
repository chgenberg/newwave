"use client";

import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Video = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/** Filmen överst på förstasidan i full storlek: spelar tyst i loop och kan ses i helskärm med ljud. `next` är dit pilen ner leder. */
export function HeroFilm({ src, poster, title, next }: { src: string; poster: string; title: string; next: string }) {
  const video = useRef<Video>(null);
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const progress = useMotionValue(0);
  const userPaused = useRef(false);

  const width = useTransform(progress, (p) => `${p * 100}%`);

  useEffect(() => {
    const el = video.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? !userPaused.current && el.play().catch(() => {}) : el.pause()), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    userPaused.current = !el.paused;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted && el.paused) el.play().catch(() => {});
  };

  const watch = () => {
    const el = video.current;
    if (!el) return;
    userPaused.current = false;
    el.currentTime = 0;
    el.muted = false;
    setMuted(false);
    el.play().catch(() => {});
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitEnterFullscreen?.();
  };

  return (
    <section aria-label="Filmen om Next Wave" className="relative h-[100svh] min-h-[520px] w-full overflow-hidden bg-[#141416] text-white">
        <video
          ref={video}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={title}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onTimeUpdate={(e) => progress.set(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/45 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6 lg:p-8">
          <div className="flex items-center gap-2">
            <FilmButton onClick={toggle} label={playing ? "Pausa filmen" : "Spela filmen"}>
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2.5 1.5h2.2v9H2.5zM7.3 1.5h2.2v9H7.3z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M3 1.4v9.2L10.4 6 3 1.4Z" fill="currentColor" />
                </svg>
              )}
            </FilmButton>
            <FilmButton onClick={toggleSound} label={muted ? "Slå på ljudet" : "Stäng av ljudet"} wide>
              <span className="nw-mono text-[12px] uppercase tracking-[0.06em]">{muted ? "Ljud av" : "Ljud på"}</span>
            </FilmButton>
          </div>
          <div className="flex items-center gap-2">
            <a href={next} className="group inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-black/30 px-4 text-[14px] font-medium text-white backdrop-blur-md transition-colors hover:bg-black/50">
              Till studion
              <span aria-hidden className="inline-block transition-transform duration-500 group-hover:translate-y-0.5">↓</span>
            </a>
            <button type="button" onClick={watch} className="group inline-flex h-11 items-center gap-3 rounded-full bg-white pl-5 pr-1.5 text-[14px] font-medium text-[#141416] transition-transform duration-300 active:scale-[0.97]">
            Se hela filmen
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#141416] text-white transition-transform duration-500 group-hover:rotate-90">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </button>
          </div>
        </div>

        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-white/15">
          <motion.div className="h-full bg-white" style={{ width }} />
        </div>
    </section>
  );
}

function FilmButton({ onClick, label, wide, children }: { onClick: () => void; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-11 place-items-center rounded-full border border-white/25 bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50 ${wide ? "px-4" : "w-11"}`}
    >
      {children}
    </button>
  );
}
