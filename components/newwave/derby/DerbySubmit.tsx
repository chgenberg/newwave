"use client";

import { useState } from "react";
import type { DerbyVerdict } from "@/app/api/v1/newwave/derby/route";
import { FLAGS } from "@/lib/newwave/derby";

/** semiMin: det lägsta betyget som tog sig till semifinalen; lika betyg delar plats, så platsen ensam säger inte det. */
type Props = { maxChars: number; semiMin: number; ideas: string[] };

const BY = { regler: "klubbens ordlista", moderering: "modereringen", agent: "agenten" } as const;
const ore = (n: number) => `${n.toLocaleString("sv-SE", { maximumFractionDigits: n < 1 ? 2 : 1 })} öre`;

/** Supporterns vy: ett fält och en knapp. Bidraget betygsätts direkt och placeras bland körningens bidrag. */
export function DerbySubmit({ maxChars, semiMin, ideas }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DerbyVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/newwave/derby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = (await res.json().catch(() => ({}))) as DerbyVerdict & { error?: string };
      if (!res.ok) throw new Error(data.error || "Juryn svarade inte. Försök igen.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Juryn svarade inte. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-[var(--nw-line)] bg-white p-5 shadow-[0_18px_50px_-30px_rgba(10,20,50,0.35)] sm:p-7">
      <form onSubmit={send}>
        <label htmlFor="derby-idea" className="text-[15px] font-semibold text-[var(--nw-ink)]">
          Din idé till derbyts motiv
        </label>
        <p className="mt-1 text-[13px] text-[var(--nw-muted)]">Vad ska synas på affischen och tröjan? Ingen inloggning, inga namn.</p>
        <textarea
          id="derby-idea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={maxChars}
          rows={4}
          placeholder="Till exempel: Gamla Ullevis strålkastare som blir två stora änglavingar"
          className="mt-3 w-full resize-none rounded-[14px] border border-[var(--nw-line)] bg-[var(--nw-soft)] px-4 py-3 text-[15px] leading-relaxed text-[var(--nw-ink)] outline-none transition focus:border-[#234B9A] focus:bg-white"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ideas.map((idea) => (
            <button key={idea} type="button" onClick={() => setText(idea)} className="rounded-full bg-[var(--nw-soft)] px-3 py-1 text-left text-[12px] text-[var(--nw-muted)] transition hover:bg-[var(--nw-soft-2)] hover:text-[var(--nw-ink)]">
              {idea}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] tabular-nums text-[var(--nw-muted)]">
            {text.length}/{maxChars}
          </span>
          <button type="submit" disabled={busy || text.trim().length < 3} className="rounded-full bg-[#234B9A] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1A3770] disabled:opacity-40">
            {busy ? "Juryn läser …" : "Skicka in"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-[12px] bg-[#FBEAEA] px-4 py-3 text-[13.5px] text-[#8A1C1C]">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite" className="mt-5 border-t border-[var(--nw-line)] pt-5">
          {result.flag === "ok" ? (
            <div className="flex items-start gap-4">
              <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[18px] bg-[#234B9A] text-white">
                <span className="text-[30px] font-bold tabular-nums leading-none">{result.score}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[var(--nw-ink)]">
                  Plats {result.place?.toLocaleString("sv-SE")} av {result.of.toLocaleString("sv-SE")}
                  {result.score > semiMin ? " – betyget räcker till semifinalen" : result.score === semiMin ? " – på gränsen till semifinalen" : ""}
                </p>
                <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">
                  {result.theme} · {result.why}
                </p>
                <p className="mt-2 text-[12px] text-[var(--nw-muted)]">Betyget kostade {ore(result.ore)}. Ditt bidrag sparas inte i demon.</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[15px] font-semibold text-[#8A1C1C]">Stoppat: {FLAGS[result.flag].toLowerCase()}</p>
              <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">
                Stoppades av {result.by ? BY[result.by] : "juryn"}
                {result.why ? ` · ${result.why}` : ""}. Det når aldrig finalen eller klubben.
              </p>
              {result.ore > 0 && <p className="mt-2 text-[12px] text-[var(--nw-muted)]">Granskningen kostade {ore(result.ore)}.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
