"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OwnRule, RuleScope } from "@/lib/newwave/store";

const SCOPE: Record<RuleScope, { label: string; who: string }> = {
  allt: { label: "Allt", who: "Alla agenter" },
  motiv: { label: "Motiv och tryck", who: "Designagenten och granskaren" },
  texter: { label: "Texter", who: "Contentagenten" },
  bilder: { label: "Foton och bilder", who: "Fotografen och granskaren" },
};
const SCOPES = Object.keys(SCOPE) as RuleScope[];

const IDEAS = [
  "Skriv alltid Åsa IF, aldrig ÅIF",
  "Inga bilder med alkohol, snus eller vadslagning",
  "Pingisen och innebandyn ska synas lika mycket som fotbollen",
  "Nämn aldrig resultat mot andra klubbar",
];

type Draft = { text: string; scope: RuleScope }[];

async function call<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/v1/newwave/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Fel ${res.status}`);
  return json as T;
}

function ScopeSelect({ value, onChange }: { value: RuleScope; onChange: (s: RuleScope) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RuleScope)}
      aria-label="Gäller"
      className="h-8 shrink-0 rounded-full border border-[var(--nw-line)] bg-white px-3 text-[12.5px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]"
    >
      {SCOPES.map((s) => (
        <option key={s} value={s}>
          {SCOPE[s].label}
        </option>
      ))}
    </select>
  );
}

/** Klubbens regelbok: egna regler med kansliets ord, tolkade av regelagenten, plus grundregler och Crafts regler. */
export function ClubRules({ clubId, base, craft, initial }: { clubId: string; base: string[]; craft: string[]; initial: OwnRule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState("");
  const [busy, setBusy] = useState<null | "interpret" | "save">(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: OwnRule[]) => {
    setBusy("save");
    setError(null);
    try {
      await call({ action: "rules", clubId, rules: next });
      setRules(next);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const interpret = async () => {
    if (text.trim().length < 3) return;
    setBusy("interpret");
    setError(null);
    try {
      const out = await call<{ rules: Draft; conflict: string }>({ action: "interpret", clubId, text: text.trim() });
      setDraft(out.rules.length ? out.rules : [{ text: text.trim(), scope: "allt" }]);
      setConflict(out.conflict);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!draft) return;
    const now = new Date().toISOString();
    const added = draft
      .filter((d) => d.text.trim().length > 2)
      .map((d, i) => ({ id: `r-${Date.now().toString(36)}-${i}`, text: d.text.trim(), scope: d.scope, original: text.trim(), addedAt: now }));
    if (await save([...rules, ...added])) {
      setDraft(null);
      setText("");
      setConflict("");
    }
  };

  const total = base.length + rules.length + craft.length;

  return (
    <section className="mt-8 border-t border-[var(--nw-line)] pt-6">
      <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Regelbok</h2>
      <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">
        {total} regler som alla agenter följer och granskaren kontrollerar allt material mot{rules.length ? ` – ${rules.length} av dem är era egna` : ""}.
      </p>

      <div className="mt-4 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 sm:p-5">
        <label htmlFor="rule" className="text-[14px] font-medium text-[var(--nw-ink)]">
          Lägg till en egen regel
        </label>
        <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">Skriv med egna ord. Regelagenten gör om det till en tydlig regel som alla agenter förstår.</p>
        <textarea
          id="rule"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void interpret();
          }}
          rows={2}
          placeholder="T.ex. vi vill inte att det står ÅIF någonstans, det ska alltid vara Åsa IF"
          className="mt-3 w-full resize-none rounded-xl bg-[var(--nw-soft)] p-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]"
        />
        {!text ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button key={i} type="button" onClick={() => setText(i)} className="rounded-full border border-[var(--nw-line)] px-3 py-1.5 text-left text-[12.5px] text-[var(--nw-muted)] transition-colors hover:border-[var(--nw-ink)] hover:text-[var(--nw-ink)]">
                {i}
              </button>
            ))}
          </div>
        ) : null}

        {draft ? (
          <div className="mt-4 rounded-2xl bg-[var(--club-soft)] p-4">
            <p className="text-[13px] font-medium text-[var(--nw-ink)]">Så förstår agenten det</p>
            <ul className="mt-2.5 space-y-2.5">
              {draft.map((d, i) => (
                <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <input
                    value={d.text}
                    onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    aria-label={`Regel ${i + 1}`}
                    className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 text-[16px] text-[var(--nw-ink)] outline-none ring-1 ring-[var(--nw-line)] focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]"
                  />
                  <div className="flex items-center gap-2">
                    <ScopeSelect value={d.scope} onChange={(scope) => setDraft(draft.map((x, j) => (j === i ? { ...x, scope } : x)))} />
                    {draft.length > 1 ? (
                      <button type="button" aria-label="Ta bort" onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-full text-[var(--nw-muted)] hover:bg-white">
                        ×
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[12.5px] text-[var(--nw-muted)]">Följs av: {[...new Set(draft.map((d) => SCOPE[d.scope].who))].join(" · ")}</p>
            {conflict ? (
              <p className="mt-3 rounded-xl bg-[#FFF4E5] p-3 text-[13px] text-[#8A4B00]">
                <span className="font-medium">Krockar kanske:</span> {conflict}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="nw-btn nw-club-btn" disabled={busy !== null} onClick={add}>
                {busy === "save" ? "Sparar…" : "Lägg till i regelboken"}
              </button>
              <button type="button" className="nw-btn nw-btn-ghost" disabled={busy !== null} onClick={() => setDraft(null)}>
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <button type="button" className="nw-btn nw-club-btn" disabled={busy !== null || text.trim().length < 3} onClick={interpret}>
              {busy === "interpret" ? "Agenten tolkar…" : "Tolka regeln"}
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
      </div>

      {rules.length ? (
        <div className="mt-6">
          <p className="nw-kicker">Era egna regler</p>
          <ul className="mt-2 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 sm:flex-nowrap">
                <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                  <p className="text-[14px] text-[var(--nw-ink)] [overflow-wrap:anywhere]">{r.text}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--nw-faint)]">Följs av: {SCOPE[r.scope].who}</p>
                  {r.original && r.original !== r.text ? (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--nw-faint)]" title={r.original}>
                      Ni skrev: ”{r.original}”
                    </p>
                  ) : null}
                </div>
                <div className="flex-1 sm:flex-none">
                  <ScopeSelect value={r.scope} onChange={(scope) => save(rules.map((x) => (x.id === r.id ? { ...x, scope } : x)))} />
                </div>
                <button
                  type="button"
                  aria-label={`Ta bort regeln ${r.text}`}
                  disabled={busy !== null}
                  onClick={() => save(rules.filter((x) => x.id !== r.id))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] text-[var(--nw-muted)] transition-colors hover:bg-[var(--nw-soft)] hover:text-[var(--nw-ink)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="group mt-6">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="nw-kicker">Grundregler · {base.length}</span>
          <span className="text-[var(--nw-muted)] transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px] text-[var(--nw-ink)] marker:text-[var(--nw-faint)]">
          {base.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </details>

      {craft.length ? (
        <details className="group mt-4 border-b border-[var(--nw-line)] pb-5">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="nw-kicker">Från Craft · {craft.length}</span>
            <span className="text-[var(--nw-muted)] transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">Gäller alla klubbar i Crafts program och ändras av Craft.</p>
          <ul className="mt-2 space-y-2 text-[14px] text-[var(--nw-ink)]">
            {craft.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-[var(--nw-faint)]">–</span>
                {r}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
