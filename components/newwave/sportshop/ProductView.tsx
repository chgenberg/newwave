"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { BASE, FLOCK_NAME_MAX, FLOCK_PRICE, ONE_SIZE, type ShopClub, type ShopProduct } from "@/lib/newwave/sportshop/data";
import { productName } from "@/lib/newwave/sportshop/i18n";
import { addLine, CART, type Flock, MAX_QTY, useSportCart } from "./cart";
import { useLang } from "./Lang";
import { Price, ProductImage, Stars } from "./ProductCard";

/** Tröjans rygg i klubbens färger med kundens namn och nummer; det finns inget foto bakifrån att trycka på. */
export function JerseyBack({ club, away, flock, className = "" }: { club: ShopClub; away: boolean; flock: Flock; className?: string }) {
  const body = away ? club.colors.second : club.colors.main;
  const ink = away ? club.colors.main : club.colors.second;
  const trim = away ? club.colors.main : club.colors.second;
  const name = flock.name.trim().toUpperCase();
  return (
    <svg viewBox="0 0 400 440" className={className} role="img" aria-label={[name, flock.number].filter(Boolean).join(" ")}>
      <rect width="400" height="440" fill="#FFFFFF" />
      <path d="M128 34l44-14q28 14 56 0l44 14 92 54-34 78-42-20v264H112V146l-42 20-34-78z" fill={body} stroke="rgba(0,0,0,0.12)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M172 20q28 14 56 0" fill="none" stroke={trim} strokeWidth="9" strokeLinecap="round" />
      <path d="M359.7 85.5l-34 78M40.3 85.5l34 78" stroke={trim} strokeWidth="9" />
      <path d="M112 146v264M288 146v264" stroke="rgba(0,0,0,0.08)" strokeWidth="2" />
      {name ? (
        <text x="200" y="120" textAnchor="middle" fill={ink} fontSize={name.length > 9 ? 26 : 32} fontWeight="800" letterSpacing="3" fontFamily="var(--font-nw), Arial, sans-serif">
          {name}
        </text>
      ) : null}
      {flock.number ? (
        <text x="200" y="300" textAnchor="middle" fill={ink} fontSize="150" fontWeight="900" fontFamily="var(--font-nw), Arial, sans-serif">
          {flock.number}
        </text>
      ) : null}
    </svg>
  );
}

type View = "front" | "back" | "crest";
const KIDS = /^\d+$/;

function SizePicker({ sizes, value, onChange, error }: { sizes: string[]; value: string | null; onChange: (s: string) => void; error: boolean }) {
  const { t } = useLang();
  const groups = sizes.some((s) => KIDS.test(s)) ? [{ label: t.product.kids, sizes: sizes.filter((s) => KIDS.test(s)) }, { label: t.product.adults, sizes: sizes.filter((s) => !KIDS.test(s)) }] : [{ label: "", sizes }];
  return (
    <fieldset>
      <legend className="text-[14px] font-semibold text-[#111]">{t.product.size}</legend>
      {groups.map((g) => (
        <div key={g.label} className="mt-2.5">
          {g.label ? <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8A8780]">{g.label}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {g.sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange(s)}
                aria-pressed={value === s}
                className={`h-11 min-w-[52px] rounded-[10px] px-3 text-[14px] font-semibold tabular-nums transition ${value === s ? "bg-[#0F2741] text-white" : `bg-white text-[#111] ring-1 hover:ring-[#0F2741] ${error ? "ring-[#D7262E]" : "ring-[#DADAD6]"}`}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-[#D7262E]">
          {t.product.chooseSize}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ProductView({ product, club }: { product: ShopProduct; club: ShopClub }) {
  const { lang, t, money } = useLang();
  const [, setCart] = useSportCart(CART);
  const oneSize = product.sizes.length === 1 && product.sizes[0] === ONE_SIZE;
  const [size, setSize] = useState<string | null>(oneSize ? ONE_SIZE : null);
  const [sizeError, setSizeError] = useState(false);
  const [flockOn, setFlockOn] = useState(false);
  const [flock, setFlock] = useState<Flock>({ name: "", number: "" });
  const [qty, setQty] = useState(1);
  const [view, setView] = useState(0);
  const [added, setAdded] = useState(0);
  const name = productName(product.kind, club, lang);
  const hasFlock = flockOn && Boolean(flock.name.trim() || flock.number);
  const views: View[] = product.flock ? ["front", "back", "crest"] : ["front", "crest"];
  const shown = views[Math.min(view, views.length - 1)];
  const backIndex = views.indexOf("back");

  const editFlock = (next: Flock) => {
    setFlock(next);
    if (backIndex > 0) setView(backIndex);
  };
  const add = () => {
    if (!size) {
      setSizeError(true);
      return;
    }
    setCart((c) => addLine(c, { productId: product.id, size, qty, flock: hasFlock ? { name: flock.name.trim().toUpperCase(), number: flock.number } : undefined }));
    setAdded((n) => n + 1);
  };

  const pic = (v: View, big: boolean) =>
    v === "front" ? (
      <ProductImage product={product} />
    ) : v === "back" ? (
      <JerseyBack club={club} away={product.kind === "away"} flock={flockOn ? flock : { name: "", number: "" }} className="aspect-square h-full w-full" />
    ) : (
      <div className="grid aspect-square place-items-center bg-white">
        <img src={club.crest} alt={big ? club.name : ""} className="h-3/5 w-3/5 object-contain" />
      </div>
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="overflow-hidden rounded-[20px] ring-1 ring-[#ECECE9]">{pic(shown, true)}</div>
        <div className="mt-3 flex gap-2">
          {views.map((v, i) => (
            <button key={v} type="button" onClick={() => setView(i)} aria-label={v === "back" ? t.product.back : v === "crest" ? club.name : name} aria-pressed={shown === v} className={`w-20 overflow-hidden rounded-[12px] transition ${shown === v ? "ring-2 ring-[#0F2741]" : "ring-1 ring-[#ECECE9] hover:ring-[#C9C7C0]"}`}>
              {pic(v, false)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Link href={`${BASE}/${club.id}?linie=${product.line}`} className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#55524B] hover:text-[#111]">
          <img src={club.crest} alt="" className="h-6 w-6 object-contain" />
          {club.name}
        </Link>
        <h1 className="mt-2 text-[28px] font-black leading-tight tracking-[-0.01em] text-[#111] sm:text-[34px]">{name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[#55524B]">
          <Stars rating={product.rating} />
          <span className="font-semibold text-[#111]">{product.rating.toLocaleString(t.locale)}</span>
          <span>· {t.reviews(product.reviews)}</span>
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${product.line === "teamwear" ? "bg-[#111] text-white" : "bg-[#F1F1EF] text-[#3A3833]"}`}>{t.line[product.line].tag}</span>
        </p>
        <div className="mt-5">
          <Price product={product} extra={hasFlock ? FLOCK_PRICE : 0} large />
        </div>

        <div className="mt-7 space-y-6">
          {oneSize ? (
            <p className="text-[14px] text-[#55524B]">
              <span className="font-semibold text-[#111]">{t.product.size}:</span> {t.product.oneSize}
            </p>
          ) : (
            <SizePicker
              sizes={product.sizes}
              value={size}
              onChange={(s) => {
                setSize(s);
                setSizeError(false);
              }}
              error={sizeError}
            />
          )}

          {product.flock ? (
            <fieldset className="rounded-[16px] bg-white p-4 ring-1 ring-[#ECECE9]">
              <legend className="sr-only">{t.product.flockTitle}</legend>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#111]">{t.product.flockTitle}</p>
                <span className="text-[13px] font-semibold text-[#0F2741]">+ {money(FLOCK_PRICE)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {[false, true].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    aria-pressed={flockOn === on}
                    onClick={() => {
                      setFlockOn(on);
                      if (on && backIndex > 0) setView(backIndex);
                    }}
                    className={`h-10 rounded-[10px] text-[13.5px] font-semibold transition ${flockOn === on ? "bg-[#0F2741] text-white" : "bg-[#F5F5F3] text-[#3A3833] hover:bg-[#ECECE9]"}`}
                  >
                    {on ? t.product.flockAdd : t.product.flockNone}
                  </button>
                ))}
              </div>
              {flockOn ? (
                <div className="mt-3 grid grid-cols-[1fr_96px] gap-2">
                  <label className="block">
                    <span className="text-[12px] font-medium text-[#6F6B63]">{t.product.flockName}</span>
                    <input
                      value={flock.name}
                      maxLength={FLOCK_NAME_MAX}
                      onChange={(e) => editFlock({ ...flock, name: e.target.value.replace(/[^\p{L} .'-]/gu, "") })}
                      placeholder="MÜLLER"
                      autoComplete="off"
                      className="mt-1 h-11 w-full rounded-[10px] bg-[#F5F5F3] px-3 text-[15px] font-semibold uppercase tracking-[0.06em] text-[#111] outline-none ring-[#0F2741] placeholder:text-[#B5B3AD] focus:bg-white focus:ring-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-medium text-[#6F6B63]">{t.product.flockNumber}</span>
                    <input
                      value={flock.number}
                      inputMode="numeric"
                      maxLength={2}
                      onChange={(e) => editFlock({ ...flock, number: e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "") })}
                      placeholder="10"
                      autoComplete="off"
                      className="mt-1 h-11 w-full rounded-[10px] bg-[#F5F5F3] px-3 text-center text-[15px] font-semibold tabular-nums text-[#111] outline-none ring-[#0F2741] placeholder:text-[#B5B3AD] focus:bg-white focus:ring-2"
                    />
                  </label>
                  <p className="col-span-2 text-[12.5px] text-[#6F6B63]">{t.product.flockHint}</p>
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <div className="flex gap-2">
            <div className="flex h-12 items-center rounded-full bg-white ring-1 ring-[#DADAD6]" role="group" aria-label={t.product.qty}>
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="−" className="grid h-12 w-11 place-items-center text-[20px] text-[#111] disabled:text-[#C9C7C0]">
                −
              </button>
              <span className="w-6 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} disabled={qty >= MAX_QTY} aria-label="+" className="grid h-12 w-11 place-items-center text-[20px] text-[#111] disabled:text-[#C9C7C0]">
                +
              </button>
            </div>
            <button type="button" onClick={add} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#FF6A13] px-6 text-[15.5px] font-bold text-white transition hover:bg-[#E85A06] active:scale-[0.99]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
              </svg>
              {t.product.add}
            </button>
          </div>
          {added ? (
            <div key={added} role="status" className="flex items-center justify-between gap-3 rounded-[14px] bg-[#E9F6EE] px-4 py-3 text-[14px] text-[#14532D]">
              <span className="flex items-center gap-2 font-semibold">
                <svg viewBox="0 0 20 20" className="h-5 w-5 fill-[#16A34A]" aria-hidden>
                  <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zm-1.2 12.1L5.2 10l1.2-1.2 2.4 2.4 4.8-4.8 1.2 1.2z" />
                </svg>
                {t.product.added}
              </span>
              <Link href={`${BASE}/warenkorb`} className="font-semibold underline underline-offset-2">
                {t.cartPage.title} →
              </Link>
            </div>
          ) : null}

          <ul className="space-y-2.5 rounded-[16px] bg-white p-4 text-[13.5px] text-[#3A3833] ring-1 ring-[#ECECE9]">
            <li className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#16A34A]" aria-hidden />
              <span>
                <span className="font-semibold text-[#14532D]">{product.line === "teamwear" ? t.product.stock : t.product.printed}</span> · {t.product.delivery(product.line === "fan" ? "3–5" : hasFlock ? "4–6" : "2–3")}
              </span>
            </li>
            {[t.product.freeShipping, t.product.returns, t.product.collect].map((x) => (
              <li key={x} className="flex items-center gap-2.5">
                <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-none stroke-[#0F2741]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                {x}
              </li>
            ))}
          </ul>

          <div>
            <h2 className="text-[15px] font-bold text-[#111]">{t.product.details}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[#55524B]">
              {(product.line === "teamwear" ? t.product.teamwearDetails : t.product.fanDetails).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
