"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LINES = [
  "Hela stadens lag",
  "Änglarna värmer upp…",
  "Kamraterna knyter skorna…",
  "Klacken stämmer upp på Gamla Ullevi…",
  "Blåvitt sedan 1904",
  "Kaffet är på i kansliet…",
  "Halsdukarna åker upp…",
  "Ränderna rättas till…",
];

type Stage = { from: number; to: number; start: number; ms: number };
type LoaderState = { open: boolean; value: number; label: string; closing: boolean };

export function useLoader() {
  const [state, setState] = useState<LoaderState>({ open: false, value: 0, label: "", closing: false });
  const value = useRef(0);
  const stageRef = useRef<Stage | null>(null);
  const raf = useRef<number | null>(null);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  useEffect(() => stop, []);

  const start = useCallback((label: string, to = 20, ms = 3000) => {
    stop();
    value.current = 0;
    stageRef.current = { from: 0, to, start: performance.now(), ms };
    setState({ open: true, value: 0, label, closing: false });
    const loop = () => {
      const s = stageRef.current;
      if (s) {
        const t = (performance.now() - s.start) / s.ms;
        const next = Math.min(s.to - 0.5, s.from + (s.to - s.from) * (1 - Math.exp(-2.6 * t)));
        if (next > value.current) {
          value.current = next;
          setState((prev) => ({ ...prev, value: next }));
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, []);

  const stage = useCallback((label: string, to: number, ms: number) => {
    stageRef.current = { from: value.current, to, start: performance.now(), ms };
    setState((prev) => ({ ...prev, label }));
  }, []);

  const set = useCallback((v: number, label?: string) => {
    stageRef.current = null;
    value.current = Math.max(value.current, Math.min(100, v));
    setState((prev) => ({ ...prev, value: value.current, label: label ?? prev.label }));
  }, []);

  const done = useCallback(() => {
    if (!raf.current && value.current >= 100) return;
    stop();
    stageRef.current = null;
    value.current = 100;
    setState((prev) => ({ ...prev, value: 100, label: "Klart!", closing: true }));
    setTimeout(() => setState((prev) => (prev.closing ? { ...prev, open: false } : prev)), 700);
  }, []);

  const fail = useCallback(() => {
    stop();
    stageRef.current = null;
    setState((prev) => ({ ...prev, open: false, closing: false }));
  }, []);

  return { state, start, stage, set, done, fail };
}

export function IFKLoader({
  state,
  crestUrl,
  lines = LINES,
  doneLine = "Heja Blåvitt!",
  wide = false,
}: {
  state: LoaderState;
  crestUrl: string;
  lines?: string[];
  doneLine?: string;
  wide?: boolean;
}) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (!state.open) return;
    const id = setInterval(() => setLine((l) => (l + 1) % lines.length), 2600);
    return () => clearInterval(id);
  }, [state.open, lines.length]);

  if (!state.open) return null;
  const pct = Math.round(state.value);

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-white/70 backdrop-blur-md transition-opacity duration-500 ${state.closing && pct === 100 ? "opacity-0 delay-300" : "opacity-100"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={state.label}
    >
      <div className="ifk-pop relative w-[380px] overflow-hidden rounded-[32px] bg-white px-8 pb-8 pt-9 text-center shadow-[0_30px_80px_rgba(26,55,112,0.25)]">
        <div className="ifk-stripes pointer-events-none absolute inset-x-0 top-0 h-2" />

        <div className={`relative mx-auto ${wide ? "my-6 h-28 w-[150px]" : "h-40 w-[105px]"}`}>
          {/* eslint-disable @next/next/no-img-element */}
          <img src={crestUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-[0.12] grayscale" />
          <img
            src={crestUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            style={{ clipPath: `inset(${100 - state.value}% 0 0 0)` }}
          />
          {/* eslint-enable @next/next/no-img-element */}
          {pct < 100 && (
            <span
              className="absolute left-[-14px] right-[-14px] h-[3px] rounded-full bg-[var(--accent,#FBC323)] shadow-[0_0_12px_var(--accent,#FBC323)]"
              style={{ top: `${100 - state.value}%` }}
            />
          )}
        </div>

        <p className="mt-6 font-display text-6xl leading-none tabular-nums text-[var(--brand,#234B9A)]">
          {pct}
          <span className="text-3xl align-top">%</span>
        </p>

        <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--bar-bg,#E9EEF7)]">
          <div className="ifk-bar h-full rounded-full" style={{ width: `${state.value}%` }} />
        </div>

        <p className="mt-5 min-h-[1.5rem] text-[15px] font-medium text-[#1D1D1F]">{state.label}</p>
        <p key={line} className="ifk-line mt-1 text-[13px] text-[#86868B]">
          {pct === 100 ? doneLine : lines[line % lines.length]}
        </p>
      </div>
    </div>
  );
}
