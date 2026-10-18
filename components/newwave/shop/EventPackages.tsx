"use client";

import { useState } from "react";
import { budgetRange, type KitLine, kitForBudget, linesTotal, peopleForBudget, tierLines } from "@/lib/newwave/eventKit";
import { defaultDesign } from "@/lib/newwave/marking";
import type { Occasion } from "@/lib/newwave/occasions";
import { sek, splitSizes } from "@/lib/newwave/reseller";
import { type CustomerLogo, useCart } from "./cart";
import { ProductMock } from "./ProductMock";

const STEP = 10;

/** Färdiga paket i tre nivåer som räknas om efter antalet personer, och ett kit som fylls efter budgeten. */
export function EventPackages({ slug, o, markup, logo, onNeedLogo }: { slug: string; o: Occasion; markup: number; logo: CustomerLogo | null; onNeedLogo: () => void }) {
  const [, update] = useCart(slug);
  const [people, setPeople] = useState(o.defaultPeople);
  const [budget, setBudget] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [kitRaw, setKit] = useState<number | null>(null);
  const budgetSek = Number(budget.replace(/\D/g, "")) || 0;
  const n = Math.max(1, people);

  const tiers = o.tiers.map((t) => {
    const lines = tierLines(t, n, markup);
    const reach = budgetSek ? peopleForBudget((p) => linesTotal(tierLines(t, p, markup)), budgetSek) : 0;
    return { ...t, lines, total: linesTotal(lines), reach };
  });
  const range = budgetRange(o, n, markup);
  const kitBudget = Math.min(range.max, Math.max(range.min, kitRaw ?? Math.round((tiers[1]?.total ?? range.max / 2) / range.step) * range.step));
  const kit = kitForBudget(o, n, kitBudget, markup);
  const fill = ((kitBudget - range.min) / Math.max(1, range.max - range.min)) * 100;

  const add = (id: string, label: string, lines: KitLine[]) => {
    if (!logo) return onNeedLogo();
    const key = (pid: string) => `event-${o.id}-${pid}`;
    const keys = new Set(lines.map((l) => key(l.product.id)));
    const note = `${label} för ${o.name.toLowerCase()}, ${n} ${o.people}`;
    update((c) => ({
      ...c,
      lines: [
        ...c.lines.filter((l) => !keys.has(l.key)),
        ...lines.map((l) => ({ key: key(l.product.id), productId: l.product.id, sizes: splitSizes(l.product, l.qty), design: defaultDesign(l.product), color: l.product.garmentHex, logo: logo.light, logoDark: logo.dark, note })),
      ],
    }));
    setAdded(id);
    setTimeout(() => setAdded((a) => (a === id ? null : a)), 2200);
  };

  const field = "flex h-12 items-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--shop-line)] focus-within:shadow-[inset_0_0_0_2px_var(--shop)]";
  return (
    <section className="pt-14 @4xl:pt-20" aria-labelledby="pkgs-title">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 id="pkgs-title" className="text-[24px] font-bold tracking-[-0.02em] @2xl:text-[28px]">
            Färdiga paket
          </h2>
          <p className="mt-1 text-[14px] opacity-60">Allt som behövs, i rätt antal. Justera sedan fritt i varukorgen.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-[12.5px] font-semibold">
            <span className="pl-4 opacity-60">Budget (valfritt)</span>
            <span className={`${field} w-[170px] px-4`}>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="t.ex. 40 000 kr" inputMode="numeric" className="w-full bg-transparent text-[15px] font-medium outline-none focus-visible:outline-none!" />
            </span>
          </label>
          <label className="grid gap-1.5 text-[12.5px] font-semibold">
            <span className="pl-4 opacity-60">Antal {o.people}</span>
            <span className={`${field} px-1.5`}>
              <button type="button" onClick={() => setPeople((p) => Math.max(STEP, p - STEP))} aria-label={`Färre ${o.people}`} className="grid h-9 w-9 place-items-center rounded-full text-[18px] hover:bg-[#F4F4F2]">
                −
              </button>
              <input type="number" min={1} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} className="w-16 bg-transparent text-center text-[15px] font-semibold tabular-nums outline-none focus-visible:outline-none!" aria-label={`Antal ${o.people}`} />
              <button type="button" onClick={() => setPeople((p) => Math.min(5000, p + STEP))} aria-label={`Fler ${o.people}`} className="grid h-9 w-9 place-items-center rounded-full text-[18px] hover:bg-[#F4F4F2]">
                +
              </button>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-3 @3xl:grid-cols-3">
        {tiers.map((t) => (
          <article key={t.id} className={`flex flex-col rounded-[26px] p-5 @2xl:p-6 ${t.id === "plus" ? "bg-[var(--shop)] text-[var(--shop-on)]" : "bg-white shadow-[inset_0_0_0_1px_var(--shop-line)]"}`}>
            <div className="flex -space-x-3">
              {t.lines.slice(0, 4).map((l) => (
                <ProductMock key={l.product.id} product={l.product} logo={logo?.light} logoDark={logo?.dark} className="h-16 w-16 rounded-2xl ring-2 ring-white" />
              ))}
            </div>
            <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.12em] opacity-60">{t.name}</p>
            <h3 className="mt-1 text-[19px] font-bold leading-snug tracking-[-0.02em]">{t.pitch}</h3>
            <ul className="mt-3 grid gap-1 text-[13.5px]">
              {t.lines.map((l) => (
                <li key={l.product.id} className="flex gap-2">
                  <span className="w-12 shrink-0 tabular-nums opacity-60">{l.qty} ×</span>
                  <span className="min-w-0">{l.product.name}</span>
                </li>
              ))}
            </ul>
            {budgetSek ? (
              <p className={`mt-3 rounded-xl px-3 py-2 text-[12.5px] ${t.id === "plus" ? "bg-white/15" : "bg-[#F4F4F2]"}`}>
                {t.reach >= 10 ? (
                  <>
                    {sek(budgetSek)} räcker till <b>
                      {t.reach} {o.people}
                    </b>
                    {t.reach !== people ? (
                      <button type="button" onClick={() => setPeople(t.reach)} className="ml-2 font-semibold underline underline-offset-2">
                        Använd
                      </button>
                    ) : null}
                  </>
                ) : (
                  "Budgeten räcker inte till det här paketet"
                )}
              </p>
            ) : null}
            <div className="mt-auto flex items-end justify-between gap-3 pt-5">
              <div>
                <strong className="block text-[22px] font-bold tabular-nums tracking-[-0.02em]">{sek(t.total)}</strong>
                <small className="text-[12px] opacity-60">
                  {sek(Math.round(t.total / n))} per person · inkl. tryck
                </small>
              </div>
              <button
                type="button"
                onClick={() => add(t.id, `${t.name}-paketet`, t.lines)}
                className={`h-11 shrink-0 rounded-full px-5 text-[14px] font-semibold transition-transform hover:scale-[1.03] active:scale-[0.97] ${added === t.id ? "bg-[#1E8E3E] text-white" : t.id === "plus" ? "bg-[var(--shop-accent)] text-[var(--shop-on-accent)]" : "bg-[var(--shop)] text-[var(--shop-on)]"}`}
              >
                {added === t.id ? "Tillagt ✓" : "Lägg till paketet"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 rounded-[26px] bg-[var(--shop-bg)] p-5 @2xl:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] opacity-60">Bygg ert kit</p>
            <h3 className="mt-1 text-[19px] font-bold tracking-[-0.02em]">Dra i budgeten – vi sätter ihop det bästa som ryms</h3>
          </div>
          <div className="text-right">
            <strong className="block text-[24px] font-bold tabular-nums tracking-[-0.02em]">{sek(kitBudget)}</strong>
            <small className="text-[12px] opacity-60">{sek(Math.round(kitBudget / n))} per person</small>
          </div>
        </div>
        <input type="range" min={range.min} max={range.max} step={range.step} value={kitBudget} onChange={(e) => setKit(Number(e.target.value))} style={{ ["--fill" as string]: `${fill}%` }} aria-label="Budget för kitet" className="nw-range mt-5" />
        <ul className="mt-5 grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
          {kit.lines.map((l) => (
            <li key={l.product.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 pr-4">
              <ProductMock product={l.product} logo={logo?.light} logoDark={logo?.dark} className="h-14 w-14 shrink-0 rounded-xl" />
              <span className="min-w-0">
                <b className="block truncate text-[14px]">{l.product.name}</b>
                <small className="text-[12.5px] opacity-60">
                  {l.qty} st · {sek(l.total)}
                </small>
              </span>
            </li>
          ))}
          {kit.lines.length ? null : <li className="rounded-2xl bg-white p-4 text-[13.5px] opacity-60">Höj budgeten lite – då ryms den första produkten.</li>}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px]">
            Kitet kostar <b>{sek(kit.total)}</b> inkl. tryck · {sek(Math.max(0, kitBudget - kit.total))} kvar
          </span>
          <button type="button" disabled={!kit.lines.length} onClick={() => add("kit", "Kit", kit.lines)} className={`h-11 rounded-full px-5 text-[14px] font-semibold transition-transform enabled:hover:scale-[1.03] disabled:opacity-40 ${added === "kit" ? "bg-[#1E8E3E] text-white" : "bg-[var(--shop)] text-[var(--shop-on)]"}`}>
            {added === "kit" ? "Tillagt ✓" : "Lägg kitet i varukorgen"}
          </button>
        </div>
      </div>
    </section>
  );
}
