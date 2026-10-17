"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Color = { name: string; hex: string };

/** New Waves produktfärger – det sortimentet finns i. */
const PRODUCT_COLORS: Color[] = [
  { name: "Svart", hex: "#111111" },
  { name: "Vit", hex: "#FFFFFF" },
  { name: "Offwhite", hex: "#F4F3EF" },
  { name: "Marinblå", hex: "#14243B" },
  { name: "Skogsgrön", hex: "#2F5D46" },
  { name: "Gråmelerad", hex: "#9A9CA1" },
  { name: "Sand", hex: "#C8B08C" },
  { name: "Röd", hex: "#C8102E" },
  { name: "Kungsblå", hex: "#1D4FA3" },
  { name: "Guld", hex: "#FBC323" },
];

const normalise = (v: string) => {
  const s = v.trim().replace(/^#?/, "#").toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join("")}`;
  return /^#[0-9A-F]{6}$/.test(s) ? s : null;
};

function Swatch({ color, on, onPick }: { color: Color; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={`${color.name} ${color.hex}`}
      aria-label={`${color.name} ${color.hex}`}
      aria-pressed={on}
      className={`h-8 w-8 shrink-0 rounded-lg border border-black/10 transition-transform hover:scale-110 ${on ? "ring-2 ring-[var(--club)] ring-offset-2" : ""}`}
      style={{ background: color.hex }}
    />
  );
}

export function BrandColors({ clubId, original, saved }: { clubId: string; original: Color[]; saved?: Color[] }) {
  const router = useRouter();
  const [colors, setColors] = useState<Color[]>(saved ?? original);
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(colors) !== JSON.stringify(saved ?? original);
  const custom = Boolean(saved);
  const clubColors = original.filter((o) => !PRODUCT_COLORS.some((p) => p.hex === o.hex));

  const set = (i: number, patch: Partial<Color>) => setColors((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const pick = (i: number, c: Color) => {
    set(i, c);
    setDraft(c.hex);
  };
  const setHex = (i: number, hex: string) => {
    set(i, { hex });
    setDraft(hex);
  };
  const toggle = (i: number) => {
    setOpen(open === i ? null : i);
    setDraft(colors[i].hex);
  };

  const save = async (palette: Color[] | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/newwave/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "colors", clubId, palette }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Fel ${res.status}`);
      if (!palette) setColors(original);
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ul className="mt-3 flex flex-col gap-2">
        {colors.map((c, i) => {
          const isOpen = open === i;
          return (
            <li key={i} className={`rounded-2xl bg-[var(--nw-soft)] transition-shadow ${isOpen ? "ring-1 ring-[var(--nw-line)]" : ""}`}>
              <button type="button" onClick={() => toggle(i)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-2.5 pr-4 text-left">
                <span className="h-10 w-10 shrink-0 rounded-xl border border-black/10" style={{ background: c.hex }} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--nw-ink)]">{c.name}</span>
                <span className="shrink-0 font-mono text-[12.5px] text-[var(--nw-muted)]">{c.hex}</span>
                <span className={`shrink-0 text-[var(--nw-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-4 border-t border-[var(--nw-line)] p-4">
                  {clubColors.length ? (
                    <div>
                      <p className="text-[12px] text-[var(--nw-muted)]">Klubbens färger</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {clubColors.map((o) => (
                          <Swatch key={o.hex} color={o} on={c.hex === o.hex} onPick={() => pick(i, o)} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-[12px] text-[var(--nw-muted)]">New Waves produktfärger</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PRODUCT_COLORS.map((o) => (
                        <Swatch key={o.hex} color={o} on={c.hex === o.hex} onPick={() => pick(i, o)} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-black/10" style={{ background: c.hex }} title="Välj fritt">
                      <input type="color" value={c.hex} onChange={(e) => setHex(i, e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Välj färg fritt" />
                    </label>
                    <input
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        const hex = normalise(e.target.value);
                        if (hex) set(i, { hex });
                      }}
                      placeholder="#FDEF04"
                      aria-label="Hexkod"
                      spellCheck={false}
                      className={`h-10 w-[110px] rounded-full bg-white px-4 font-mono text-[16px] uppercase outline-none ring-1 focus:ring-2 focus:ring-[var(--club)] sm:text-[13px] ${normalise(draft) ? "ring-[var(--nw-line)]" : "ring-[#B42318]"}`}
                    />
                    <input
                      value={c.name}
                      onChange={(e) => set(i, { name: e.target.value })}
                      aria-label="Färgens namn"
                      maxLength={40}
                      className="h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-[16px] outline-none ring-1 ring-[var(--nw-line)] focus:ring-2 focus:ring-[var(--club)] sm:text-[13px]"
                    />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-3 text-[13px] text-[#B42318]">{error}</p> : null}
      {dirty || custom ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {dirty ? (
            <button type="button" className="nw-btn nw-club-btn" disabled={busy || colors.some((c) => !c.name.trim())} onClick={() => save(colors)}>
              {busy ? "Sparar…" : "Spara färger"}
            </button>
          ) : null}
          {dirty ? (
            <button type="button" className="nw-btn nw-btn-ghost" disabled={busy} onClick={() => setColors(saved ?? original)}>
              Ångra
            </button>
          ) : null}
          {custom && !dirty ? (
            <button type="button" className="text-[13px] text-[var(--nw-muted)] underline underline-offset-4" disabled={busy} onClick={() => save(null)}>
              Återställ klubbens färger
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-[var(--nw-faint)]">Klicka på en färg för att ändra den. Agenterna, tryckfilerna och dashboarden följer med.</p>
      )}
    </div>
  );
}
