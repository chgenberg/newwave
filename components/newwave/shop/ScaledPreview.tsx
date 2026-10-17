"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const WIDTH = { dator: 1200, mobil: 390 } as const;

/** En sida i skala i ett webbläsarfönster, med val mellan dator och mobil. `focus` skrollar till elementet med samma `data-preview`. */
export function ScaledPreview({ url, label = "Förhandsvisning", tools, height = "h-[min(70vh,640px)]", focus, children }: { url: string; label?: string; tools?: React.ReactNode; height?: string; focus?: string; children: React.ReactNode }) {
  const [chosen, setMode] = useState<keyof typeof WIDTH | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(800);
  const [scale, setScale] = useState(0.5);
  const [innerHeight, setInnerHeight] = useState(800);
  /** På smala skärmar blir datorvyn oläslig, så mobilvyn visas tills man väljer själv. */
  const mode = chosen ?? (boxWidth < 560 ? "mobil" : "dator");

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      setBoxWidth(box.current.clientWidth);
      setScale(Math.min(1, box.current.clientWidth / WIDTH[mode]));
      setInnerHeight(inner.current.scrollHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    const el = focus ? inner.current?.querySelector<HTMLElement>(`[data-preview="${focus}"]`) : null;
    if (!el || !box.current || !inner.current) return;
    box.current.scrollTo({ top: el.getBoundingClientRect().top - inner.current.getBoundingClientRect().top - 8, behavior: "smooth" });
  }, [focus, mode, scale]);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-[var(--nw-muted)]">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          {tools}
          <div className="nw-segment">
            {(Object.keys(WIDTH) as (keyof typeof WIDTH)[]).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === "dator" ? "Dator" : "Mobil"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-[var(--nw-soft)] shadow-[var(--nw-shadow)]">
        <div className="flex h-8 items-center gap-1.5 border-b border-[var(--nw-line)] bg-white px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-2 truncate text-[11px] text-[var(--nw-faint)]">{url}</span>
        </div>
        <div ref={box} className={`${height} overflow-y-auto overflow-x-hidden`}>
          <div className="mx-auto" style={{ width: WIDTH[mode] * scale, height: innerHeight * scale }}>
            <div ref={inner} style={{ width: WIDTH[mode], transform: `scale(${scale})`, transformOrigin: "top left" }} className="pointer-events-none select-none" aria-hidden>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
