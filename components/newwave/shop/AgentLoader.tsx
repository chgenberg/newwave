"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Det lilla kortet nere i hörnet medan agenterna arbetar. Servern streamar inte, så stegen följer typiska tider och
 * andelen klara delar – och når 100 % först när allt är klart. Sidan går att använda under tiden.
 */
export function AgentLoader({ title, stages, done, total, complete }: { title: string; stages: string[]; done: number; total: number; complete: boolean }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);

  useEffect(() => {
    if (complete) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [complete]);

  const byTime = 0.92 * (1 - Math.exp(-(now - start) / 1000 / 35));
  const progress = complete ? 1 : Math.max(byTime, total ? (done / total) * 0.96 : 0);
  const line = complete ? title : stages[Math.min(stages.length - 1, Math.floor(progress * stages.length))];

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
      className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-3 z-40 flex w-[min(360px,calc(100vw-24px))] items-start gap-3 rounded-[22px] bg-[#1D1D1F] p-4 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] sm:left-6"
    >
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${complete ? "bg-[#34C759]" : ""}`}>
        {complete ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12 5 5 9-10" />
          </svg>
        ) : (
          <span className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-white/25 border-t-white" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={line} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-[14.5px] font-semibold leading-snug">
            {line}
          </motion.p>
        </AnimatePresence>
        <p className="mt-0.5 text-[12px] text-white/60">{complete ? "Allt nedan är på riktigt och kan beställas direkt." : `${done} av ${total} klart · du kan bläddra under tiden`}</p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
        </div>
      </div>
    </motion.div>
  );
}
