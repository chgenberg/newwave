"use client";

import { ClubLogo, num, useRegistryClubs } from "./WordmarkClubs";
import type { LabClub } from "./WordmarkLab";

type Props = { selected: LabClub[]; all: boolean; onChange: (clubs: LabClub[]) => void; onAll: (all: boolean) => void; max: number };

/** En sökbar lista att bläddra i: en klubb, flera eller alla klubbar i registret. */
export function ClubPicker({ selected, all, onChange, onAll, max }: Props) {
  const { text, setText, page, more } = useRegistryClubs();
  const on = (id: string) => selected.some((c) => c.id === id);
  const toggle = (c: LabClub) => onChange(on(c.id) ? selected.filter((x) => x.id !== c.id) : [...selected, c].slice(0, max));
  const shown = page?.items ?? [];
  const extra = selected.filter((c) => !shown.some((x) => x.id === c.id));
  const row = (c: LabClub & { at?: string; onDark?: boolean }) => (
    <li key={c.id}>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-[var(--nw-soft)]">
        <input type="checkbox" checked={on(c.id)} onChange={() => toggle({ id: c.id, name: c.name })} className="h-4 w-4 shrink-0 accent-[var(--nw-ink)]" />
        <ClubLogo club={c} className="h-8 w-8 shrink-0 rounded-[7px] p-1" />
        <span className="min-w-0 truncate text-[13px] text-[var(--nw-ink)]">{c.name}</span>
      </label>
    </li>
  );

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white">
      <div className="flex flex-col gap-2 border-b border-[var(--nw-line)] p-3">
        <label className="relative">
          <span className="sr-only">Sök klubb</span>
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={all} placeholder="Sök klubb eller ort" className="h-10 w-full rounded-full border border-[var(--nw-line)] bg-[var(--nw-soft)] px-4 text-[14px] outline-none focus:border-[var(--nw-ink)] disabled:opacity-50" />
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 px-2 text-[13.5px] font-semibold text-[var(--nw-ink)]">
          <input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--nw-ink)]" />
          Alla klubbar{page && !text ? ` · ${num.format(page.total)}` : ""}
        </label>
      </div>
      <ul inert={all} className={`h-[340px] overflow-y-auto p-1.5 [scrollbar-width:thin] ${all ? "opacity-40" : ""}`} aria-label="Klubbar">
        {extra.map(row)}
        {shown.map(row)}
        {page && shown.length < page.total ? (
          <li>
            <button type="button" onClick={more} className="mt-1 h-9 w-full rounded-[10px] text-[12.5px] text-[var(--nw-muted)] hover:bg-[var(--nw-soft)] hover:text-[var(--nw-ink)]">
              Visa fler
            </button>
          </li>
        ) : null}
        {!page ? <li className="px-2 py-4 text-[13px] text-[var(--nw-muted)]">Hämtar klubbar…</li> : null}
        {page && page.total === 0 ? <li className="px-2 py-4 text-[13px] text-[var(--nw-muted)]">Ingen klubb med klubbmärke matchar sökningen.</li> : null}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--nw-line)] px-3 py-2 text-[12.5px] text-[var(--nw-muted)]">
        <span>{all ? "Alla klubbar är valda" : selected.length ? `${selected.length} ${selected.length === 1 ? "klubb vald" : "klubbar valda"}${selected.length >= max ? ` · högst ${max}` : ""}` : "Ingen klubb vald"}</span>
        {all ? null : (
          <span className="flex gap-3">
            {shown.length ? (
              <button type="button" onClick={() => onChange([...selected, ...shown.filter((c) => !on(c.id)).map((c) => ({ id: c.id, name: c.name }))].slice(0, max))} className="font-medium text-[var(--nw-ink)] underline underline-offset-4">
                Välj alla som visas
              </button>
            ) : null}
            {selected.length ? (
              <button type="button" onClick={() => onChange([])} className="underline underline-offset-4 hover:text-[var(--nw-ink)]">
                Rensa
              </button>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}
