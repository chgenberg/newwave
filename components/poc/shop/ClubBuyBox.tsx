"use client";

import Link from "next/link";
import { useState } from "react";
import { addLine, useClubCart } from "@/components/newwave/clubshop/cart";
import { kr, MAX_QTY } from "@/components/newwave/clubshop/pricing";
import type { BuyItem } from "@/components/newwave/clubshop/ShopParts";
import { track } from "@/components/newwave/clubshop/track";
import { incomingText, type SizeStock } from "@/lib/poc/hub/stock-rules";

const KIDS = /^\d/;

/** Vad det finns kvar av storleken, i kundens ord; inget när det finns gott om den. */
function sizeNote(s: SizeStock | undefined, oneSize: boolean) {
  if (!s || s.state === "obegränsat" || s.state === "i lager") return null;
  const where = oneSize ? "" : ` i storlek ${s.size}`;
  if (s.state === "slut") return `Slut${where} just nu.${incomingText(s) ? ` ${incomingText(s)}` : ""}`;
  return `Bara ${s.available} kvar${where}.`;
}

/**
 * Köprutan för Crafts klubbprodukter: storlek och antal efter lagret i New Waves hubb. En storlek som är slut syns men
 * går inte att välja; "få kvar" när det är lite; "tillfälligt slut" när allt är slut. En produkt som inte säljs längre
 * går inte att lägga i korgen. Kassan prövar lagret igen när ordern läggs.
 */
export function ClubBuyBox({ clubId, item, sizes, sellable, checkout }: { clubId: string; item: BuyItem; sizes: SizeStock[]; sellable: boolean; checkout: string }) {
  const [cart, update] = useClubCart(clubId);
  const oneSize = sizes.length <= 1;
  const open = sizes.filter((s) => s.state !== "slut");
  const [size, setSize] = useState(oneSize && open.length ? sizes[0].size : "");
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const chosen = sizes.find((s) => s.size === size);
  const inCart = cart.lines.filter((l) => l.item === item.id && l.size === size).reduce((n, l) => n + l.qty, 0);
  const max = Math.max(0, Math.min(MAX_QTY, chosen?.available ?? MAX_QTY) - inCart);
  const soldOut = sizes.length > 0 && !open.length;
  const soonest = soldOut ? sizes.filter((s) => s.incoming && s.eta).sort((a, b) => (a.eta! < b.eta! ? -1 : 1))[0] ?? sizes.find((s) => s.incoming) : undefined;
  const groups = [
    { label: "Barn", list: sizes.filter((s) => KIDS.test(s.size)) },
    { label: sizes.some((s) => KIDS.test(s.size)) ? "Vuxen" : "", list: sizes.filter((s) => !KIDS.test(s.size)) },
  ].filter((g) => g.list.length);

  if (!sellable) {
    return (
      <div className="mt-6 rounded-2xl bg-[#F3F2EF] p-4 text-[14.5px]">
        <p className="font-semibold">Säljs inte längre</p>
        <p className="mt-1 text-[#4A4740]">Den här produkten finns inte kvar i sortimentet. Titta gärna på resten av klubbens kollektion.</p>
      </div>
    );
  }

  const add = () => {
    if (!size) return setError("Välj en storlek.");
    if (chosen?.state === "slut") return setError("Storleken är slut. Välj en annan.");
    if (max <= 0) return setError(inCart ? "Du har redan alla som finns kvar i varukorgen." : "Storleken är slut. Välj en annan.");
    const n = Math.min(qty, max);
    setError("");
    update((c) => addLine(c, { item: item.id, name: item.name, image: item.image, href: item.href, priceSek: item.priceSek, size, qty: n, clubProductId: item.clubProductId }));
    setQty(1);
    setAdded(true);
    track(clubId, { type: "cart", item: item.id });
  };

  const note = sizeNote(chosen, oneSize);
  return (
    <div className="mt-6">
      {!oneSize ? (
        <fieldset>
          <legend className="text-[14px] font-semibold">Storlek</legend>
          {groups.map((g) => (
            <div key={g.label || "alla"} className="mt-2">
              {g.label ? <p className="mb-1.5 text-[12.5px] text-[#6F6B63]">{g.label}</p> : null}
              <div className="flex flex-wrap gap-2">
                {g.list.map((s) => {
                  const out = s.state === "slut";
                  const few = s.state === "få kvar";
                  return (
                    <button
                      key={s.size}
                      type="button"
                      disabled={out}
                      aria-pressed={size === s.size}
                      aria-label={out ? `${s.size}, slut` : few ? `${s.size}, få kvar` : s.size}
                      title={out ? "Slut just nu" : few ? `Bara ${s.available} kvar` : undefined}
                      onClick={() => {
                        setSize(s.size);
                        setQty(1);
                        setAdded(false);
                        setError("");
                      }}
                      className={`relative h-11 min-w-12 rounded-xl border px-3 text-[14px] font-medium transition ${
                        out ? "cursor-not-allowed border-dashed border-[#DCDAD4] text-[#B5B1A8] line-through" : size === s.size ? "border-[var(--shop)] bg-[var(--shop)] text-[var(--shop-on)]" : "border-[#DCDAD4] hover:border-[#111]"
                      }`}
                    >
                      {s.size}
                      {few ? <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#E08A00]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {sizes.some((s) => s.state === "få kvar") && !soldOut ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#6F6B63]">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[#E08A00]" /> Få kvar
            </p>
          ) : null}
        </fieldset>
      ) : (
        <p className="text-[14px] text-[#6F6B63]">One size – passar de flesta.</p>
      )}

      {soldOut ? (
        <div role="status" className="mt-5 rounded-2xl bg-[#F3F2EF] p-4 text-[14.5px]">
          <p className="font-semibold">Tillfälligt slut</p>
          <p className="mt-0.5 text-[#4A4740]">{(soonest && incomingText(soonest)) || "Vi fyller på så snart vi kan."}</p>
        </div>
      ) : (
        <>
          {note ? <p className={`mt-3 text-[13.5px] font-medium ${chosen?.state === "slut" ? "text-[#B42318]" : "text-[#8A4B00]"}`}>{note}</p> : null}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-12 items-center rounded-full border border-[#DCDAD4]">
              <button type="button" aria-label="Färre" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-12 w-11 text-[18px]">
                −
              </button>
              <span aria-live="polite" className="w-6 text-center text-[15px] font-semibold">
                {qty}
              </span>
              <button type="button" aria-label="Fler" disabled={size !== "" && qty >= max} onClick={() => setQty((q) => Math.min(size ? Math.max(1, max) : MAX_QTY, q + 1))} className="h-12 w-11 text-[18px] disabled:text-[#C9C6BF]">
                +
              </button>
            </div>
            <button type="button" onClick={add} className="h-12 flex-1 whitespace-nowrap rounded-full bg-[var(--shop)] px-5 text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
              <span className="sm:hidden">Lägg i korgen</span>
              <span className="hidden sm:inline">Lägg i varukorgen</span> · {kr(item.priceSek * qty)}
            </button>
          </div>
        </>
      )}
      {error ? <p className="mt-2 text-[13.5px] text-[#B42318]">{error}</p> : null}
      {added ? (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--shop-bg)] px-4 py-3 text-[14px]">
          <span className="font-medium">Ligger i varukorgen.</span>
          <Link href={checkout} className="font-semibold underline underline-offset-4">
            Till kassan →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
