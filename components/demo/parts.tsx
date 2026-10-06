"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { BOOTH_ASPECT, type Crop, MAX_QTY } from "@/lib/demoCatalog";

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** Background style that shows one area of the booth photo in a tile with the given width/height ratio. */
export function cropStyle(url: string, crop: Crop, aspect: number): CSSProperties {
  const v = Math.min(100, (crop.w * BOOTH_ASPECT) / aspect);
  const x = crop.w >= 100 ? 50 : clamp(((crop.cx - crop.w / 2) / (100 - crop.w)) * 100);
  const y = v >= 100 ? 50 : clamp(((crop.cy - v / 2) / (100 - v)) * 100);
  return { backgroundImage: `url(${url})`, backgroundSize: `${(100 / crop.w) * 100}% auto`, backgroundPosition: `${x}% ${y}%`, backgroundRepeat: "no-repeat" };
}

export function CropThumb({ url, crop, aspect = 4 / 3, className = "" }: { url: string; crop: Crop; aspect?: number; className?: string }) {
  return <div className={`bg-[#F5F5F7] ${className}`} style={{ ...cropStyle(url, crop, aspect), aspectRatio: String(aspect) }} />;
}

const icon = "h-5 w-5";
export const Icons = {
  search: (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h2l2.2 11h11l2-8H6.2" />
      <circle cx="9" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 10H4M9 5l-5 5 5 5" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2.2 2.3 2.2 12.7 0 15M10 2.5c-2.2 2.3-2.2 12.7 0 15" />
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M13.5 3.5l3 3L7 16H4v-3z" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5a7.5 7.5 0 100 15c1 0 1.5-.7 1.5-1.4 0-1.2-1-1.4-1-2.4 0-.8.6-1.2 1.4-1.2h1.8a3.8 3.8 0 003.8-3.8C17.5 5.3 14.2 2.5 10 2.5z" />
      <circle cx="6.5" cy="9" r="1" fill="currentColor" />
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="13" cy="6.5" r="1" fill="currentColor" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7z" />
      <circle cx="6.5" cy="17.5" r="1.8" fill="white" />
      <circle cx="17" cy="17.5" r="1.8" fill="white" />
    </svg>
  ),
  brush: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M19.5 3.5l-9 9 1.5 1.5 9-9zM10 13.5c-2 0-3.5 1.5-3.5 3.5 0 1.2-.8 2-2 2.5 3 1 7 .5 7-3z" />
    </svg>
  ),
  headset: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4.5 14v-2a7.5 7.5 0 0115 0v2" />
      <rect x="3.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="16.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M18.5 19c0 1.5-2 2.5-5 2.5" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 15.5h6" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M3 5.5l7 5.5 7-5.5" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v10M6 9l4 4 4-4M4 16.5h12" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5L10 5M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1" />
    </svg>
  ),
  bulb: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7.5 14.5h5M8 17h4M10 2.5a5 5 0 00-3 9c.6.5 1 1.2 1 2v1h4v-1c0-.8.4-1.5 1-2a5 5 0 00-3-9z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3.5 17a6.5 6.5 0 0113 0" />
    </svg>
  ),
};

const TRUST: [ReactNode, string][] = [
  [Icons.check, "Korrektur innan tryck"],
  [Icons.calendar, "Fast leveransdatum"],
  [Icons.pencil, "Ändra fritt fram till korrektur"],
];

export function TrustLine({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[#424245] ${className}`}>
      {TRUST.map(([icon, label]) => (
        <li key={label} className="flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-[#1E8E3E]">
          {icon}
          {label}
        </li>
      ))}
    </ul>
  );
}

export type Step = 1 | 2 | 3;
export const STEP_LABELS: Record<Step, string> = { 1: "Varumärke", 2: "Produkter", 3: "Offert" };

export function Header(props: { logo: string | null; name: string; step: Step | null; reachable: Step; onStep: (s: Step) => void; onHome: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/85 backdrop-blur-xl print:hidden">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-5 sm:px-8">
        <button type="button" onClick={props.onHome} className="flex h-10 min-w-0 items-center" aria-label="Till början">
          {props.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logo} alt={props.name} className="max-h-7 max-w-[140px] object-contain" />
          ) : (
            <span className="text-[15px] font-semibold tracking-[0.16em]">DIN LOGO</span>
          )}
        </button>
        {props.step && <Steps step={props.step} reachable={props.reachable} onStep={props.onStep} />}
      </div>
    </header>
  );
}

function Steps({ step, reachable, onStep }: { step: Step; reachable: Step; onStep: (s: Step) => void }) {
  return (
    <nav aria-label="Steg">
      <p className="text-[13px] text-[#6E6E73] sm:hidden">
        Steg {step} av 3 · <span className="font-medium text-[#1D1D1F]">{STEP_LABELS[step]}</span>
      </p>
      <ol className="hidden items-center gap-1 sm:flex">
        {([1, 2, 3] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            {s > 1 && <span className={`mx-1 h-px w-5 ${s <= step ? "bg-[#1D1D1F]" : "bg-[#D2D2D7]"}`} />}
            <button
              type="button"
              disabled={s > reachable || s === step}
              onClick={() => onStep(s)}
              aria-current={s === step ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full px-2 py-1 text-[13px] transition enabled:hover:bg-black/[0.04] ${s === step ? "font-semibold text-[#1D1D1F]" : s <= reachable ? "text-[#424245]" : "text-[#AEAEB2]"}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${s === step ? "bg-[#1D1D1F] text-white" : s < step ? "bg-[#E8E8ED] text-[#1D1D1F]" : "border border-[#D2D2D7]"}`}>
                {s < step ? Icons.check : s}
              </span>
              {STEP_LABELS[s]}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Quiet secondary action: underlined text, never competes with the primary button. */
export function TextLink(props: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={props.onClick} className={`text-[15px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 transition hover:decoration-black/60 ${props.className ?? ""}`}>
      {props.children}
    </button>
  );
}

export function Primary(props: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; className?: string; type?: "button" | "submit"; form?: string }) {
  return (
    <button
      type={props.type ?? "button"}
      form={props.form}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#1D1D1F] px-6 text-[15px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#C7C7CC] ${props.className ?? ""}`}
    >
      {props.loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {props.children}
    </button>
  );
}

export function Secondary(props: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-6 text-[15px] font-medium text-[#1D1D1F] transition hover:bg-[#F5F5F7] disabled:opacity-50 ${props.className ?? ""}`}
    >
      {props.children}
    </button>
  );
}

export function Stepper({ value, step, onChange, min = 1, size = "md" }: { value: number; step: number; onChange: (v: number) => void; min?: number; size?: "sm" | "md" }) {
  const [draft, setDraft] = useState<string | null>(null);
  const h = size === "sm" ? "h-8" : "h-11";
  const w = size === "sm" ? "w-8" : "w-11";
  const clampQty = (n: number) => Math.max(min, Math.min(MAX_QTY, n));
  return (
    <div className={`inline-flex ${h} items-center overflow-hidden rounded-full border border-black/10 bg-white`}>
      <button type="button" aria-label="Minska" onClick={() => onChange(clampQty(value - step))} className={`${w} h-full text-[17px] text-[#6E6E73] hover:text-[#1D1D1F] disabled:opacity-30`} disabled={value <= min}>
        −
      </button>
      <input
        aria-label="Antal"
        inputMode="numeric"
        value={draft ?? String(value)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, String(MAX_QTY).length);
          setDraft(digits);
          const n = Number.parseInt(digits, 10);
          if (n >= min) onChange(clampQty(n));
        }}
        onBlur={() => {
          const n = Number.parseInt(draft ?? "", 10);
          if (draft !== null && !(n >= min)) onChange(min);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${size === "sm" ? "w-12 text-[13px]" : "w-16 text-[15px]"} h-full border-x border-black/10 text-center font-medium tabular-nums outline-none`}
      />
      <button type="button" aria-label="Öka" onClick={() => onChange(clampQty(value + step))} className={`${w} h-full text-[17px] text-[#6E6E73] hover:text-[#1D1D1F] disabled:opacity-30`} disabled={value >= MAX_QTY}>
        +
      </button>
    </div>
  );
}

export function BrandMark({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-[13px] font-semibold tracking-wide">{name}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/demo/brands/${id}.png`} alt={name} onError={() => setFailed(true)} className="max-h-9 max-w-[76%] object-contain" />;
}

export function PlusBadge({ on }: { on: boolean }) {
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition ${on ? "bg-[#1D1D1F] text-white" : "border border-black/10 bg-white text-[#1D1D1F]"}`}>
      {on ? Icons.check : Icons.plus}
    </span>
  );
}
