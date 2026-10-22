"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { addLine, useClubCart } from "./cart";
import { FLOCK_NAME_MAX, FLOCK_PRICE, kr, MAX_QTY } from "./pricing";
import { track } from "./track";

const BAG = "M6 7h12l-1 13H7L6 7zm3 0a3 3 0 0 1 6 0";

/** Varukorgen i sidhuvudet, med antalet varor. */
export function CartLink({ clubId, href }: { clubId: string; href: string }) {
  const [cart] = useClubCart(clubId);
  const count = cart.lines.reduce((n, l) => n + l.qty, 0);
  return (
    <Link href={href} aria-label={`Varukorg, ${count} ${count === 1 ? "vara" : "varor"}`} className="relative inline-flex h-10 items-center gap-2 rounded-full bg-[var(--shop)] px-4 text-[14px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={BAG} />
      </svg>
      <span className="hidden sm:inline">Varukorg</span>
      {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--shop-accent)] px-1 text-[11.5px] text-[var(--shop-on-accent)]">{count}</span> : null}
    </Link>
  );
}

export type BuyItem = { id: string; name: string; priceSek: number; image: string; href: string };

const KIDS = /^\d/;

/** Storlek, antal och namn och nummer på ryggen; lägger varan i korgen. */
export function BuyBox({ clubId, item, sizes, flock, dark, garment, v, checkout }: { clubId: string; item: BuyItem; sizes: string[]; flock: boolean; dark: boolean; garment: string; v: string; checkout: string }) {
  const [, update] = useClubCart(clubId);
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0] : "");
  const [qty, setQty] = useState(1);
  const [back, setBack] = useState(false);
  const [player, setPlayer] = useState("");
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const preview = useBackPreview(clubId, dark, v, back ? player : null, number);
  const groups = [
    { label: "Barn", list: sizes.filter((s) => KIDS.test(s)) },
    { label: sizes.some((s) => KIDS.test(s)) ? "Vuxen" : "", list: sizes.filter((s) => !KIDS.test(s)) },
  ].filter((g) => g.list.length);

  const add = () => {
    if (!size) return setError("Välj en storlek.");
    if (back && !player.trim() && !number) return setError("Skriv ett namn eller ett nummer, eller ta bort trycket på ryggen.");
    setError("");
    update((c) => addLine(c, { item: item.id, name: item.name, image: item.image, href: item.href, priceSek: item.priceSek, size, qty, flock: back ? { name: player.trim().toUpperCase(), number } : undefined }));
    setAdded(true);
    track(clubId, { type: "cart", item: item.id });
  };

  return (
    <div className="mt-6">
      {sizes.length > 1 ? (
        <fieldset>
          <legend className="text-[14px] font-semibold">Storlek</legend>
          {groups.map((g) => (
            <div key={g.label || "alla"} className="mt-2">
              {g.label ? <p className="mb-1.5 text-[12.5px] text-[#6F6B63]">{g.label}</p> : null}
              <div className="flex flex-wrap gap-2">
                {g.list.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={size === s}
                    onClick={() => {
                      setSize(s);
                      setAdded(false);
                      setError("");
                    }}
                    className={`h-11 min-w-12 rounded-xl border px-3 text-[14px] font-medium transition ${size === s ? "border-[var(--shop)] bg-[var(--shop)] text-[var(--shop-on)]" : "border-[#DCDAD4] hover:border-[#111]"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="text-[14px] text-[#6F6B63]">One size – passar de flesta.</p>
      )}

      {flock ? (
        <div className="mt-5 rounded-2xl border border-[#E6E4DE] p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={back} onChange={(e) => (setBack(e.target.checked), setAdded(false))} className="h-5 w-5 accent-[var(--shop)]" />
            <span className="flex-1 text-[14.5px] font-semibold">Namn och nummer på ryggen</span>
            <span className="text-[14px] text-[#6F6B63]">+{kr(FLOCK_PRICE)}</span>
          </label>
          {back ? (
            <div className="mt-4 grid grid-cols-[1fr_112px] gap-4 sm:grid-cols-[1fr_150px]">
              <div className="grid content-start gap-3">
                <label className="grid gap-1 text-[12.5px] text-[#6F6B63]">
                  Namn (max {FLOCK_NAME_MAX} tecken)
                  <input value={player} maxLength={FLOCK_NAME_MAX} onChange={(e) => setPlayer(e.target.value.replace(/[^\p{L}\s.'-]/gu, ""))} placeholder="SVENSSON" className="h-11 rounded-xl border border-[#DCDAD4] px-3 text-[15px] uppercase text-[#111] outline-none focus:border-[#111]" />
                </label>
                <label className="grid gap-1 text-[12.5px] text-[#6F6B63]">
                  Nummer (0–99)
                  <input value={number} inputMode="numeric" maxLength={2} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} placeholder="10" className="h-11 w-24 rounded-xl border border-[#DCDAD4] px-3 text-[15px] text-[#111] outline-none focus:border-[#111]" />
                </label>
              </div>
              <figure className="grid aspect-square place-items-center overflow-hidden rounded-xl p-3" style={{ background: garment }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ritas medan man skriver */}
                {preview ? <img src={preview} alt="Ryggen med namn och nummer" className="max-h-full max-w-full object-contain" /> : null}
                <figcaption className="sr-only">Förhandsvisning av ryggen</figcaption>
              </figure>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <div className="flex h-12 items-center rounded-full border border-[#DCDAD4]">
          <button type="button" aria-label="Färre" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-12 w-11 text-[18px]">
            −
          </button>
          <span aria-live="polite" className="w-6 text-center text-[15px] font-semibold">
            {qty}
          </span>
          <button type="button" aria-label="Fler" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} className="h-12 w-11 text-[18px]">
            +
          </button>
        </div>
        <button type="button" onClick={add} className="h-12 flex-1 whitespace-nowrap rounded-full bg-[var(--shop)] px-5 text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
          <span className="sm:hidden">Lägg i korgen</span>
          <span className="hidden sm:inline">Lägg i varukorgen</span> · {kr((item.priceSek + (back ? FLOCK_PRICE : 0)) * qty)}
        </button>
      </div>
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

/** Ryggen ritas av ordmärkesmotorn en stund efter sista tangenttrycket, så att varje bokstav inte blir en bild. */
function useBackPreview(clubId: string, dark: boolean, v: string, player: string | null, number: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (player === null) return;
    const t = setTimeout(() => {
      const spec = { template: "spelarrygg", icon: true, ornament: true, player: player.trim().toUpperCase() || "NAMN", number: number || "10" };
      setUrl(`${wordmarkUrl(spec, clubId, dark ? "dark" : "light", 480)}&u=${encodeURIComponent(v)}`);
    }, 450);
    return () => clearTimeout(t);
  }, [clubId, dark, v, player, number]);
  return player === null ? "" : url;
}
