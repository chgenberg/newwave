"use client";

import { useState } from "react";
import { BUDGET_MAX, BUDGET_MIN, VISITORS, type VisitorsId, sek } from "@/lib/demoCatalog";
import type { PackageId } from "@/lib/demoPackages";
import { Icons } from "./parts";

export type PackageCard = { id: PackageId; name: string; blurb: string; total: number; summary: string[] };

const FIELD = "mt-1.5 h-11 w-full rounded-xl border border-black/15 bg-white px-3.5 text-[15px] outline-none transition focus:border-[#1D1D1F]";

export function PackageCards({ cards, selected, onSelect }: { cards: PackageCard[]; selected: PackageId | "custom"; onSelect: (id: PackageId) => void }) {
  return (
    <div role="radiogroup" aria-label="Paket" className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => {
        const on = selected === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(c.id)}
            className={`relative rounded-2xl p-4 text-left transition sm:p-5 ${on ? "ring-2 ring-[#1D1D1F]" : "ring-1 ring-black/[0.08] hover:ring-black/20"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold">{c.name}</span>
              {c.id === "standard" && <span className="rounded-full bg-[#1D1D1F] px-2 py-0.5 text-[11px] font-medium text-white">Populärast</span>}
              {on && c.id !== "standard" && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D1D1F] text-white">{Icons.check}</span>}
            </span>
            <span className="mt-1 block text-[13px] text-[#6E6E73]">{c.blurb}</span>
            <span className="mt-3 block text-[20px] font-semibold tabular-nums">{sek(c.total)}</span>
            <ul className="mt-2 space-y-1 text-[13px] text-[#424245]">
              {c.summary.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#AEAEB2]" />
                  {s}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

type PlanProps = {
  eventDate: string;
  onDate: (v: string) => void;
  visitors: VisitorsId | "";
  onVisitors: (v: VisitorsId | "") => void;
  budget: number | null;
  onBudget: (v: number | null) => void;
  delivery: { text: string; late: boolean } | null;
  fittedTotal: number | null;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Optional facts about the event; everything works without them. */
export function EventPlan(p: PlanProps) {
  const [min] = useState(today);
  return (
    <div className="rounded-2xl bg-[#F5F5F7] p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="text-[13px] font-medium">När är mässan?</span>
          <input type="date" min={min} value={p.eventDate} onChange={(e) => p.onDate(e.target.value)} className={FIELD} />
        </label>
        <label>
          <span className="text-[13px] font-medium">Ungefär hur många besökare?</span>
          <select value={p.visitors} onChange={(e) => p.onVisitors(e.target.value as VisitorsId | "")} className={FIELD}>
            <option value="">Vet inte</option>
            {VISITORS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium">Har ni en budget?</span>
            <input type="checkbox" checked={p.budget !== null} onChange={(e) => p.onBudget(e.target.checked ? 40_000 : null)} className="h-4 w-4 accent-[#1D1D1F]" />
          </label>
          {p.budget === null ? (
            <p className="mt-1.5 flex h-11 items-center text-[13px] text-[#6E6E73]">Valfritt – vi anpassar paketet efter beloppet.</p>
          ) : (
            <div className="mt-1.5">
              <input
                type="range"
                aria-label="Budget"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={5_000}
                value={p.budget}
                onChange={(e) => p.onBudget(Number(e.target.value))}
                className="h-5 w-full accent-[#1D1D1F]"
              />
              <p className="text-[13px] font-medium tabular-nums">{sek(p.budget)}</p>
            </div>
          )}
        </div>
      </div>
      {(p.delivery || p.fittedTotal !== null) && (
        <div className="mt-3 space-y-1 border-t border-black/[0.06] pt-3 text-[13px]">
          {p.fittedTotal !== null && <p className="font-medium">Anpassat efter er budget: {sek(p.fittedTotal)}</p>}
          {p.delivery && (
            <p className={`flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 ${p.delivery.late ? "text-[#B54708]" : "text-[#424245]"}`}>
              {Icons.calendar} {p.delivery.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
