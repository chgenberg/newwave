"use client";

import { type ClubFacts, isComplete, MAX_TEXT, MAX_VARIANTS, STANDARD_VARIANT, TEXT_SOURCE_LABEL, TEXT_SOURCES, type TextChoice, type VariantChoice, variantLabel, variantTexts } from "./variants";

/**
 * Varianterna av ordmallens texter: för varje variant var huvudraden och underraden hämtar sin text. Med `sample`
 * visas vad varianten blir för en klubb.
 */
export function VariantRows({ value, onChange, sample, max = MAX_VARIANTS }: { value: VariantChoice[]; onChange: (v: VariantChoice[]) => void; sample?: ClubFacts; max?: number }) {
  const set = (i: number, v: VariantChoice) => onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {value.map((v, i) => {
        const example = !isComplete(v) ? "egen text skrivs per klubb" : sample ? variantLabel(variantTexts(v, sample)) || "mallens texter" : "";
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl bg-white p-2 sm:flex-row sm:flex-wrap sm:items-center">
            {max > 1 ? <span className="w-[62px] shrink-0 px-1 text-[12px] font-medium text-[var(--nw-muted)]">Variant {i + 1}</span> : null}
            <TextPick label="Huvudrad" value={v.main} onChange={(main) => set(i, { ...v, main })} />
            <TextPick label="Underrad" value={v.sub} onChange={(sub) => set(i, { ...v, sub })} />
            <span className="min-w-0 flex-1 truncate px-1 text-[12px] text-[var(--nw-muted)]" title={example}>
              {sample && isComplete(v) ? `${sample.name}: ${example}` : example}
            </span>
            {value.length > 1 ? (
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Ta bort variant ${i + 1}`} className="grid h-7 w-7 shrink-0 place-items-center self-end rounded-full text-[var(--nw-muted)] hover:bg-[var(--nw-soft)] hover:text-[var(--nw-ink)] sm:self-auto">
                ×
              </button>
            ) : null}
          </div>
        );
      })}
      {value.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...value, { main: { ...(value.at(-1)?.main ?? STANDARD_VARIANT.main) }, sub: { from: "egen", text: "" } }])}
          className="nw-hit self-start text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4"
        >
          Lägg till variant
        </button>
      ) : null}
    </div>
  );
}

function TextPick({ label, value, onChange }: { label: string; value: TextChoice; onChange: (v: TextChoice) => void }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <label className="relative shrink-0">
        <span className="sr-only">{label}</span>
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--nw-muted)]">
          {label}
        </span>
        <select
          value={value.from}
          onChange={(e) => onChange({ from: e.target.value as TextChoice["from"], ...(e.target.value === "egen" ? { text: value.text ?? "" } : {}) })}
          className="h-8 appearance-none rounded-full bg-[var(--nw-soft)] pl-[74px] pr-8 text-[12.5px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]"
        >
          {TEXT_SOURCES.map((s) => (
            <option key={s} value={s}>
              {TEXT_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </label>
      {value.from === "egen" ? (
        <label className="min-w-0">
          <span className="sr-only">{label}, egen text</span>
          <input
            value={value.text ?? ""}
            onChange={(e) => onChange({ from: "egen", text: e.target.value })}
            maxLength={MAX_TEXT}
            placeholder="T.ex. Norra"
            className="h-8 w-[120px] rounded-full border border-[var(--nw-line)] bg-white px-3 text-[12.5px] text-[var(--nw-ink)] outline-none focus:border-[var(--nw-ink)]"
          />
        </label>
      ) : null}
    </span>
  );
}
