"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { EASE } from "@/components/newwave/motion/Motion";
import type { Portal } from "@/lib/newwave/hub";

const shot = (id: string) => `/newwave/portals/${id}.jpg`;

/** De fyra ingångarna. På stora skärmar en lista där förhandsbilden följer raden man pekar på, annars kort. */
export function PortalIndex({ portals }: { portals: Portal[] }) {
  const [active, setActive] = useState(portals[0].id);
  const current = portals.find((p) => p.id === active) ?? portals[0];

  return (
    <>
      <div className="hidden gap-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ul className="border-t border-[var(--nw-line)]">
          {portals.map((p, i) => (
            <li key={p.id} className="border-b border-[var(--nw-line)]">
              <Link
                href={p.href}
                onMouseEnter={() => setActive(p.id)}
                onFocus={() => setActive(p.id)}
                data-active={p.id === active || undefined}
                className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-x-4 py-6 outline-none"
              >
                <span className="nw-mono text-[12px] text-[var(--nw-muted)]">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[clamp(40px,4.4vw,68px)] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--nw-faint)] transition-colors duration-500 group-focus-visible:text-[var(--nw-ink)] group-data-[active]:text-[var(--nw-ink)]">
                    {p.short}
                  </span>
                  <span className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[active]:grid-rows-[1fr]">
                    <span className="overflow-hidden">
                      <span className="block max-w-md pt-3 text-[14.5px] leading-relaxed text-[var(--nw-muted)]">
                        <span className="text-[var(--nw-ink)]">{p.title}.</span> {p.description}
                      </span>
                    </span>
                  </span>
                </span>
                <span aria-hidden className="grid h-11 w-11 -translate-x-2 place-items-center self-center rounded-full bg-[var(--nw-ink)] text-white opacity-0 transition-all duration-500 group-data-[active]:translate-x-0 group-data-[active]:opacity-100">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="sticky top-24 self-start">
          <div className="relative aspect-[16/11] overflow-hidden rounded-[var(--nw-radius)] bg-[var(--nw-soft)]">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={current.id}
                className="absolute inset-x-[6%] top-[8%] bottom-0 overflow-hidden rounded-t-[14px] shadow-[0_30px_60px_-30px_rgba(20,20,22,0.45)] ring-1 ring-black/5"
                initial={{ y: 40, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <Image src={shot(current.id)} alt={`Skärmbild av ${current.title.toLowerCase()}`} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-top" />
              </motion.div>
            </AnimatePresence>
            <span className="nw-mono absolute left-5 top-4 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-muted)]">{current.who}</span>
          </div>
        </div>
      </div>

      <ul className="grid gap-5 md:grid-cols-2 lg:hidden">
        {portals.map((p, i) => (
          <li key={p.id}>
            <Link href={p.href} className="group block overflow-hidden rounded-[var(--nw-radius)] bg-[var(--nw-soft)] active:scale-[0.99] [transition:transform_.3s]">
              <div className="relative aspect-[16/11] overflow-hidden">
                <div className="absolute inset-x-[6%] top-[9%] bottom-0 overflow-hidden rounded-t-[12px] shadow-[0_24px_48px_-28px_rgba(20,20,22,0.5)] ring-1 ring-black/5">
                  <Image src={shot(p.id)} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
                </div>
                <span className="nw-mono absolute left-4 top-3 text-[12px] text-[var(--nw-muted)]">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div className="flex items-end justify-between gap-4 bg-white p-5">
                <div>
                  <p className="nw-kicker">{p.who}</p>
                  <h3 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-[var(--nw-ink)]">{p.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--nw-muted)]">{p.description}</p>
                </div>
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--nw-line)] text-[var(--nw-ink)]">
                  →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
