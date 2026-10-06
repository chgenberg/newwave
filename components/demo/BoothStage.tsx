"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Icons } from "./parts";

export type Hotspot = { id: string; x: number; y: number; label: string; added: boolean };

const LINES = [
  "Analyserar färger och form…",
  "Bygger montern…",
  "Trycker mässväggen…",
  "Trycker roll-up och beachflagga…",
  "Klär personalen i profilkläder…",
  "Ställer i ordning hyllorna…",
  "Riggar ljuset…",
  "Sista detaljerna…",
];

function BuildingOverlay({ phase, name }: { phase: "logo" | "booth"; name: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 400);
    return () => clearInterval(t);
  }, [phase]);
  const progress = phase === "logo" ? Math.min(0.12, 0.02 + elapsed / 120) : 0.12 + 0.83 * (1 - Math.exp(-elapsed / 38));
  const line = phase === "logo" ? "Hämtar logga…" : LINES[Math.min(LINES.length - 1, Math.floor(elapsed / 9))];
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-[6px]" role="status" aria-live="polite">
      <div className="w-[min(380px,86%)] rounded-3xl bg-white/95 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-[3px] border-[#2563EB] border-t-transparent" />
        <p key={line} className="ifk-line mt-4 text-[16px] font-semibold">
          {line}
        </p>
        <p className="mt-1 text-[13px] text-[#6E6E73]">
          {phase === "logo" ? "Vi letar upp logga och färger på webbplatsen." : `Vi bygger en unik monter för ${name}. Det tar ungefär en minut.`}
        </p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#E8E8ED]">
          <div className="h-full rounded-full bg-[#2563EB] transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-[11px] tabular-nums text-[#86868B]">{Math.round(progress * 100)} %</p>
      </div>
    </div>
  );
}

export function BoothStage(props: {
  src: string;
  alt: string;
  spots?: Hotspot[];
  onSpot?: (id: string) => void;
  loading?: { phase: "logo" | "booth"; name: string } | null;
  className?: string;
  children?: ReactNode;
  fit?: "cover" | "contain";
}) {
  return (
    <div className={`relative overflow-hidden bg-[#E8E8ED] ${props.className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={props.src} src={props.src} alt={props.alt} className={`ifk-line absolute inset-0 h-full w-full ${props.fit === "contain" ? "object-contain" : "object-cover"}`} />
      {!props.loading &&
        props.spots?.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => props.onSpot?.(s.id)}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
            className="group absolute z-[5] -translate-x-1/2 -translate-y-1/2"
            aria-label={`${s.label}${s.added ? " – i montern" : " – lägg till"}`}
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-[#2563EB]/40 [animation-duration:2.4s]" />
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#2563EB] text-white shadow-[0_4px_14px_rgba(37,99,235,0.45)] transition group-hover:scale-110">
              {s.added ? Icons.check : Icons.plus}
            </span>
            <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1D1D1F]/85 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
              {s.label}
            </span>
          </button>
        ))}
      {props.children}
      {props.loading && <BuildingOverlay phase={props.loading.phase} name={props.loading.name} />}
    </div>
  );
}
