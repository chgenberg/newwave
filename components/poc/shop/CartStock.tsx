"use client";

import { useEffect, useState } from "react";
import { setQty, useClubCart } from "@/components/newwave/clubshop/cart";
import { type CartStockProblem, cartStock } from "./actions";

type Line = { key: string; clubProductId: string; size?: string; qty: number };

/**
 * Kassans besked om lagret: prövar korgens varor från Craft mot lagret i New Waves hubb medan kunden fyller i, och
 * visar det som är slut, har för få kvar eller inte säljs längre – med en knapp som ändrar antalet eller tar bort varan.
 * Prövas igen när korgen ändras. Ordern prövas ändå när den läggs.
 */
export function CartStock({ clubId }: { clubId: string }) {
  const [cart, update] = useClubCart(clubId);
  const sig = JSON.stringify(cart.lines.filter((l) => l.clubProductId).map((l): Line => ({ key: l.key, clubProductId: l.clubProductId!, size: l.size, qty: l.qty })));
  const [checked, setChecked] = useState<{ sig: string; problems: CartStockProblem[] } | null>(null);

  useEffect(() => {
    const lines = JSON.parse(sig) as Line[];
    if (!lines.length) return;
    let live = true;
    const t = setTimeout(() => {
      cartStock({ clubId, lines })
        .then((r) => live && setChecked({ sig, problems: r.problems }))
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [clubId, sig]);

  const problems = checked?.sig === sig ? checked.problems : [];
  if (!problems.length) return null;
  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-8 sm:px-6">
      <div role="alert" className="rounded-2xl bg-[#FDECEA] p-4 text-[14.5px] text-[#7A1A12] sm:p-5">
        <p className="text-[16px] font-bold text-[#B42318]">{problems.length > 1 ? "Några varor går inte att beställa just nu" : "En vara går inte att beställa just nu"}</p>
        <ul className="mt-2 grid gap-2">
          {problems.map((p) => (
            <li key={p.keys.join("\n")} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <span className="min-w-0">{p.message}</span>
              {p.fix ? (
                <button type="button" onClick={() => update((c) => setQty(c, p.fix!.key, p.fix!.qty))} className="h-9 shrink-0 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#111] ring-1 ring-[#E8C4BF] hover:ring-[#B42318]">
                  Ändra till {p.fix.qty}
                </button>
              ) : p.reason !== "få kvar" ? (
                <button type="button" onClick={() => update((c) => p.keys.reduce((cart, key) => setQty(cart, key, 0), c))} className="h-9 shrink-0 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#111] ring-1 ring-[#E8C4BF] hover:ring-[#B42318]">
                  Ta bort
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px]">Ändra antalet eller ta bort varan för att kunna lägga beställningen.</p>
      </div>
    </div>
  );
}
