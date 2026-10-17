"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CATEGORIES, NW_CATALOG } from "@/lib/newwave/catalog";
import type { CraftRules } from "@/lib/newwave/craftState";
import { Fold } from "./Fold";
import { Toast } from "./SearchBox";

const IDEAS = [
  "Inga politiska eller religiösa budskap.",
  "Barn visas aldrig med namn eller ansikte i närbild.",
  "Sponsorlogotyper bara där sponsoravtalet tillåter.",
  "Priser och erbjudanden ska alltid stämma med Intersports butik.",
];

export function RulesEditor({ initial, clubs }: { initial: CraftRules; clubs: number }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial.rules);
  const [products, setProducts] = useState(initial.products);
  const [minScore, setMinScore] = useState(initial.minScore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ideas, setIdeas] = useState(false);
  const closeToast = useCallback(() => setToast(null), []);

  const unused = IDEAS.filter((x) => !rules.includes(x));
  const catalog = NW_CATALOG.filter((p) => p.kind !== "booth");
  const dirty =
    JSON.stringify({ rules, products: [...products].sort(), minScore }) !==
    JSON.stringify({
      rules: initial.rules,
      products: [...initial.products].sort(),
      minScore: initial.minScore,
    });

  async function save(body: unknown, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/newwave/craft/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kunde inte spara");
      setRules(json.rules.rules);
      setProducts(json.rules.products);
      setMinScore(json.rules.minScore);
      setToast(msg);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Fold title="Regler för alla klubbagenter" summary={`${rules.filter((r) => r.trim()).length} regler`}>
        <p className="text-[13.5px] text-[var(--nw-muted)]">Skickas med till alla {clubs} klubbars agenter och till granskningsagenten, som flaggar material som bryter mot dem.</p>
        <ol className="mt-3 flex flex-col gap-2">
          {rules.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-3 w-5 shrink-0 text-right text-[12.5px] tabular-nums text-[var(--nw-faint)]">{i + 1}</span>
              <textarea
                value={r}
                rows={1}
                maxLength={240}
                onChange={(e) => setRules(rules.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Regel ${i + 1}`}
                className="nw-input h-auto min-h-[44px] flex-1 resize-none py-2.5 [field-sizing:content]"
              />
              <button
                type="button"
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
                aria-label={`Ta bort regel ${i + 1}`}
                className="mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[17px] text-[var(--nw-muted)] hover:bg-[var(--nw-soft)] hover:text-[var(--nw-ink)]"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-7">
          <button type="button" onClick={() => setRules([...rules, ""])} disabled={rules.length >= 20} className="nw-chip h-8 border-dashed px-3 hover:border-[var(--nw-ink)]">
            + Ny regel
          </button>
          {unused.length ? (
            <button
              type="button"
              aria-expanded={ideas}
              onClick={() => setIdeas((v) => !v)}
              className="h-8 px-2 text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]"
            >
              {ideas ? "Dölj förslag" : `Förslag (${unused.length})`}
            </button>
          ) : null}
        </div>
        {ideas && unused.length ? (
          <div className="nw-fade mt-2 flex flex-wrap gap-1.5 pl-7">
            {unused.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setRules([...rules, x])}
                className="nw-chip h-8 max-w-full px-3 text-[var(--nw-muted)] hover:border-[var(--nw-ink)] hover:text-[var(--nw-ink)]"
              >
                <span className="truncate">+ {x}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Fold>

      <Fold title="Sortiment" summary={`${products.length} av ${catalog.length} produkter`}>
        <p className="text-[13.5px] text-[var(--nw-muted)]">Agenterna väljer bara bland produkterna som är påslagna.</p>
        <div className="mt-3 flex flex-col gap-4">
          {CATEGORIES.filter((c) => catalog.some((p) => p.category === c)).map((c) => {
            const inCat = catalog.filter((p) => p.category === c);
            const all = inCat.every((p) => products.includes(p.id));
            return (
              <div key={c}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--nw-ink)]">{c}</p>
                  <button
                    type="button"
                    onClick={() => setProducts(all ? products.filter((id) => !inCat.some((p) => p.id === id)) : [...new Set([...products, ...inCat.map((p) => p.id)])])}
                    className="nw-hit text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]"
                  >
                    {all ? "Stäng av alla" : "Tillåt alla"}
                  </button>
                </div>
                <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                  {inCat.map((p) => {
                    const on = products.includes(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setProducts(on ? products.filter((x) => x !== p.id) : [...products, p.id])}
                          aria-pressed={on}
                          className={`w-full rounded-2xl border p-1.5 text-left transition-all ${on ? "border-[var(--nw-line)]" : "border-dashed border-[#cfcfca] opacity-45 grayscale"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.photo} alt="" loading="lazy" className="aspect-square w-full rounded-xl bg-[var(--nw-soft)] object-contain" />
                          <span className="mt-1 flex items-center justify-between gap-1 px-1 pb-0.5">
                            <span className="truncate text-[12px] font-medium text-[var(--nw-ink)]">{p.name}</span>
                            <span className={`h-3.5 w-6 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-[var(--nw-ink)]" : "bg-[#d6d6d1]"}`} aria-hidden>
                              <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${on ? "translate-x-2.5" : ""}`} />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Fold>

      <Fold title="Granskning" summary={`Lägsta betyg ${minScore}`}>
        <p className="text-[13.5px] text-[var(--nw-muted)]">
          Standardgräns för granskningsagentens betyg. Under gränsen hamnar materialet hos Craft innan klubben ser det. Klubbar kan ha en egen gräns.
        </p>
        <div className="mt-3 flex rounded-full bg-[var(--nw-soft)] p-1 sm:inline-flex" role="group" aria-label="Lägsta betyg">
          {[6, 7, 8, 9].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMinScore(t)}
              aria-pressed={minScore === t}
              className={`h-9 flex-1 rounded-full px-5 text-[13.5px] font-medium tabular-nums sm:flex-none ${minScore === t ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)]"}`}
            >
              Från {t}
            </button>
          ))}
        </div>
      </Fold>

      <button
        type="button"
        disabled={busy}
        onClick={() => save({ reset: true }, "Standardregler återställda")}
        className="nw-hit mt-2 self-start px-1 text-[12.5px] text-[var(--nw-faint)] underline underline-offset-4 hover:text-[var(--nw-ink)]"
      >
        Återställ standardreglerna
      </button>

      {dirty || error ? (
        <div className="nw-fade sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--nw-line)] bg-white/90 p-3 pl-5 shadow-[var(--nw-shadow)] backdrop-blur md:bottom-4">
          <p className="min-w-0 text-[13.5px] text-[var(--nw-muted)]">{error ? <span className="text-[#9B1C1C]">{error}</span> : "Osparade ändringar"}</p>
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setRules(initial.rules);
                  setProducts(initial.products);
                  setMinScore(initial.minScore);
                }}
                className="nw-btn nw-btn-ghost"
              >
                Ångra
              </button>
            ) : null}
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() =>
                save(
                  {
                    rules: rules.map((r) => r.trim()).filter(Boolean),
                    products,
                    minScore,
                  },
                  "Reglerna gäller nu alla klubbagenter",
                )
              }
              className="nw-btn disabled:opacity-40"
            >
              {busy ? "Sparar…" : "Spara regler"}
            </button>
          </div>
        </div>
      ) : null}
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
