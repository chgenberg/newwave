"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Icons } from "./parts";

export type Hotspot = { id: string; x: number; y: number; label: string; added: boolean };

export type Phase = "logo" | "site" | "booth";
type Loading = { phase: Phase; name: string; industry?: string };

const SITE_LINES = ["Hittar produkter och tjänster…", "Tittar på bilder och produkter…", "Läser in varumärkets ton…", "Väljer profilprodukter som passar…"];
/** One booth request renders, reviews and possibly retakes; the server doesn't stream, so the stages follow typical timings. */
const BOOTH_STAGES: [number, string][] = [
  [0, "Bygger montern…"],
  [4, "Trycker mässväggen…"],
  [8, "Ställer fram era produkter…"],
  [12, "Klär personalen i profilkläder…"],
  [16, "Kvalitetsgranskar bilden…"],
  [23, "Gör om en detalj…"],
  [38, "Kvalitetsgranskar igen…"],
  [45, "Gör om en detalj…"],
  [60, "Sista detaljerna…"],
];

/** Progress bands: logo 0-15 %, site reading 15-45 %, booth image 45-95 %. */
function BuildingOverlay({ phase, name, industry }: Loading) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 400);
    return () => clearInterval(t);
  }, [phase]);
  const ease = (tau: number) => 1 - Math.exp(-elapsed / tau);
  const progress = phase === "logo" ? 0.02 + 0.13 * ease(10) : phase === "site" ? 0.15 + 0.3 * ease(22) : 0.45 + 0.5 * ease(25);
  const boothLine = industry && elapsed < 4 ? `Anpassar montern för ${industry.toLowerCase()}…` : [...BOOTH_STAGES].reverse().find(([t]) => elapsed >= t)![1];
  const line =
    phase === "logo" ? "Läser webbplatsen…" : phase === "site" ? SITE_LINES[Math.min(SITE_LINES.length - 1, Math.floor(elapsed / 9))] : boothLine;
  const sub =
    phase === "logo"
      ? "Vi letar upp logga och färger på webbplatsen."
      : phase === "site"
        ? `Vi läser ${name}s webbplats för att förstå vad ni erbjuder.`
        : `Vi bygger en unik monter för ${name}. Vi granskar varje bild innan du får se den.`;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-[6px]" role="status" aria-live="polite">
      <div className="w-[min(380px,86%)] rounded-3xl bg-white/95 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-[3px] border-[#2563EB] border-t-transparent" />
        <p key={line} className="ifk-line mt-4 text-[16px] font-semibold">
          {line}
        </p>
        <p className="mt-1 text-[13px] text-[#6E6E73]">{sub}</p>
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
  loading?: Loading | null;
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
            className="group absolute z-[5] hidden -translate-x-1/2 -translate-y-1/2 sm:block"
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
      {props.loading && <BuildingOverlay {...props.loading} />}
    </div>
  );
}
