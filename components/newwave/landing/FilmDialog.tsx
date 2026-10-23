"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HeroFilm } from "./HeroFilm";

type Film = { src: string; poster: string; title: string };

function Dialog({ film, onClose }: { film: Film; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(17,17,17,0.7)] p-2 backdrop-blur-[3px] sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={film.title}
        className="relative aspect-[9/16] w-[min(calc(100vw-1rem),calc((100svh-2.5rem)*9/16),560px)] overflow-hidden rounded-[26px] bg-[#141416] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)]"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <HeroFilm src={film.src} poster={film.poster} title={film.title} className="h-full" />
        <button ref={close} type="button" onClick={onClose} aria-label="Stäng filmen" className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </motion.div>
    </motion.div>
  );
}

/** En knapp som öppnar en film i en dialog, med samma spelare som förstasidans film: inget autoplay, play startar med ljud. */
export function FilmDialogButton({ film, className = "", children }: { film: Film; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  /** Portalen läggs först när filmen öppnats, så att servern och första renderingen är lika. */
  const [used, setUsed] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const show = () => {
    setUsed(true);
    setOpen(true);
  };
  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" className={className}>
        {children}
      </button>
      {used ? createPortal(<AnimatePresence>{open ? <Dialog film={film} onClose={close} /> : null}</AnimatePresence>, document.body) : null}
    </>
  );
}
