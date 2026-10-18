"use client";

import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { trackVisit } from "@/components/VisitTracker";

type Video = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/** Filmen på förstasidan, i hela bredden ovanför startknappen. Startar först när besökaren trycker på play, med ljud och från början. */
export function HeroFilm({ src, poster, title }: { src: string; poster: string; title: string }) {
  const video = useRef<Video>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const progress = useMotionValue(0);
  const reached = useRef(-1);

  const width = useTransform(progress, (p) => `${p * 100}%`);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => !e.isIntersecting && el.pause(), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const start = () => {
    const el = video.current;
    if (!el) return;
    if (el.ended) el.currentTime = 0;
    el.muted = false;
    setStarted(true);
    el.play().catch(() => {
      // Webbläsaren nekade ljud; spela tyst hellre än inte alls.
      el.muted = true;
      el.play().catch(() => {});
    });
  };

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted && el.paused) el.play().catch(() => {});
  };

  const fullscreen = () => {
    const el = video.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitEnterFullscreen?.();
  };

  return (
    <section aria-label="Filmen om Next Wave" className="relative min-h-[420px] w-full flex-1 overflow-hidden bg-[#141416] text-white">
      <video
        ref={video}
        className="absolute inset-0 h-full w-full object-cover"
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        aria-label={title}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setStarted(false)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onTimeUpdate={(e) => {
          const p = e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0;
          progress.set(p);
          const step = Math.min(100, Math.floor(p * 4 + 0.02) * 25);
          if (step > reached.current) {
            reached.current = step;
            trackVisit({ type: "film", pct: step });
          }
        }}
      />

      <AnimatePresence initial={false}>
        {started ? (
          <motion.div key="controls" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
              <FilmButton onClick={fullscreen} label="Visa i helskärm">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9" />
                </svg>
              </FilmButton>
            </div>
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-white/15">
              <motion.div className="h-full bg-white" style={{ width }} />
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="play"
            type="button"
            onClick={start}
            aria-label="Spela filmen med ljud"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="group absolute inset-0 grid place-items-center bg-black/25 transition-colors hover:bg-black/15"
          >
            <span className="flex flex-col items-center gap-4">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-white text-[#141416] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-active:scale-95 sm:h-24 sm:w-24">
                <svg width="26" height="26" viewBox="0 0 12 12" aria-hidden className="translate-x-[2px]">
                  <path d="M3 1.4v9.2L10.4 6 3 1.4Z" fill="currentColor" />
                </svg>
              </span>
              <span className="rounded-full bg-black/35 px-4 py-1.5 text-[14px] font-medium backdrop-blur-md">Spela filmen · med ljud</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
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
