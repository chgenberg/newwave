"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { BASE, FREE_SHIPPING_FROM, ONE_SIZE, shopClub, shopProduct } from "@/lib/newwave/sportshop/data";
import { productName } from "@/lib/newwave/sportshop/i18n";
import { CART, MAX_QTY, type SportLine, totals, unitPrice, useSportCart } from "./cart";
import { PayBadges } from "./Footer";
import { useLang } from "./Lang";
import { ProductImage } from "./ProductCard";

const noop = () => () => {};
/** Varukorgen finns bara i webbläsaren; tills den är läst visas inget, så att en full korg inte blinkar förbi som tom. */
export const useReady = () => useSyncExternalStore(noop, () => true, () => false);

export function LineRow({ line, compact = false }: { line: SportLine; compact?: boolean }) {
  const { lang, t, money } = useLang();
  const [, setCart] = useSportCart(CART);
  const p = shopProduct(line.productId);
  const club = p && shopClub(p.clubId);
  if (!p || !club) return null;
  const setQty = (qty: number) => setCart((c) => ({ ...c, lines: qty ? c.lines.map((l) => (l.key === line.key ? { ...l, qty } : l)) : c.lines.filter((l) => l.key !== line.key) }));
  return (
    <li className={`grid grid-cols-[auto_1fr_auto] gap-3 ${compact ? "py-3" : "py-5"}`}>
      <Link href={`${BASE}/p/${p.id}`} className={`overflow-hidden rounded-[12px] ring-1 ring-[#ECECE9] ${compact ? "w-16" : "w-24 sm:w-28"}`}>
        <ProductImage product={p} />
      </Link>
      <div className="min-w-0">
        <Link href={`${BASE}/p/${p.id}`} className={`block font-semibold leading-snug text-[#111] hover:underline ${compact ? "text-[14px]" : "text-[15.5px]"}`}>
          {productName(p.kind, club, lang)}
        </Link>
        <p className="mt-0.5 text-[13px] text-[#6F6B63]">
          {t.product.size}: {line.size === ONE_SIZE ? t.product.oneSize : line.size}
          {compact ? ` · ${t.product.qty}: ${line.qty}` : ""}
        </p>
        {line.flock ? (
          <p className="mt-0.5 text-[13px] text-[#6F6B63]">
            {t.product.flockTitle}: <span className="font-semibold uppercase text-[#111]">{[line.flock.name, line.flock.number].filter(Boolean).join(" · ")}</span>
          </p>
        ) : null}
        {compact ? null : (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-9 items-center rounded-full bg-white ring-1 ring-[#DADAD6]" role="group" aria-label={t.product.qty}>
              <button type="button" onClick={() => setQty(line.qty - 1)} aria-label="−" className="grid h-9 w-9 place-items-center text-[17px]">
                −
              </button>
              <span className="w-5 text-center text-[14px] font-semibold tabular-nums">{line.qty}</span>
              <button type="button" onClick={() => setQty(Math.min(MAX_QTY, line.qty + 1))} disabled={line.qty >= MAX_QTY} aria-label="+" className="grid h-9 w-9 place-items-center text-[17px] disabled:text-[#C9C7C0]">
                +
              </button>
            </div>
            <button type="button" onClick={() => setQty(0)} className="text-[13px] text-[#6F6B63] underline underline-offset-2 hover:text-[#D7262E]">
              {t.cartPage.remove}
            </button>
          </div>
        )}
      </div>
      <p className={`text-right font-semibold text-[#111] ${compact ? "text-[14px]" : "text-[15.5px]"}`}>
        {money(unitPrice(line) * line.qty)}
        {line.qty > 1 && !compact ? <span className="block text-[12px] font-normal text-[#8A8780]">{money(unitPrice(line))} / {t.cartPage.each}</span> : null}
      </p>
    </li>
  );
}

export function SummaryRows({ lines, sum }: { lines: SportLine[]; sum: ReturnType<typeof totals> }) {
  const { t, money } = useLang();
  return (
    <dl className="space-y-2 text-[14.5px]">
      <div className="flex justify-between">
        <dt className="text-[#55524B]">
          {t.cartPage.subtotal} ({lines.reduce((s, l) => s + l.qty, 0)} {t.checkout.items})
        </dt>
        <dd className="font-medium">{money(sum.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-[#55524B]">{t.cartPage.shipping}</dt>
        <dd className={`font-medium ${sum.shipping ? "" : "text-[#16A34A]"}`}>{sum.shipping ? money(sum.shipping) : t.cartPage.free}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-[#ECECE9] pt-3">
        <dt className="text-[16px] font-bold">{t.cartPage.total}</dt>
        <dd className="text-[20px] font-black">{money(sum.total)}</dd>
      </div>
      <p className="text-right text-[12px] text-[#8A8780]">{t.cartPage.vatIncluded(money(sum.vat))}</p>
    </dl>
  );
}

export function CartView() {
  const { t, money } = useLang();
  const [cart] = useSportCart(CART);
  const ready = useReady();
  const sum = totals(cart.lines);
  if (!ready) return <div className="h-64" />;
  if (!cart.lines.length)
    return (
      <div className="rounded-[20px] bg-white p-10 text-center ring-1 ring-[#ECECE9]">
        <p className="text-[17px] font-semibold text-[#111]">{t.cartPage.empty}</p>
        <Link href={BASE} className="mt-5 inline-flex h-11 items-center rounded-full bg-[#0F2741] px-6 text-[14.5px] font-semibold text-white">
          {t.cartPage.emptyCta}
        </Link>
      </div>
    );
  const left = Math.max(0, FREE_SHIPPING_FROM - sum.subtotal);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-10">
      <ul className="divide-y divide-[#ECECE9] rounded-[20px] bg-white px-4 ring-1 ring-[#ECECE9] sm:px-6">
        {cart.lines.map((l) => (
          <LineRow key={l.key} line={l} />
        ))}
      </ul>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-[20px] bg-white p-5 ring-1 ring-[#ECECE9] sm:p-6">
          <div className="mb-5 rounded-[12px] bg-[#F5F5F3] p-3">
            <p className="text-[13px] font-medium text-[#3A3833]">{left ? t.cartPage.toFree(money(left)) : t.cartPage.freeReached}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2E2DF]">
              <div className={`h-full rounded-full ${left ? "bg-[#FF6A13]" : "bg-[#16A34A]"}`} style={{ width: `${Math.min(100, (sum.subtotal / FREE_SHIPPING_FROM) * 100)}%` }} />
            </div>
          </div>
          <SummaryRows lines={cart.lines} sum={sum} />
          <Link href={`${BASE}/kasse`} className="mt-5 flex h-12 items-center justify-center rounded-full bg-[#FF6A13] text-[15.5px] font-bold text-white transition hover:bg-[#E85A06]">
            {t.cartPage.checkout}
          </Link>
          <Link href={BASE} className="mt-2 flex h-11 items-center justify-center rounded-full text-[14px] font-semibold text-[#0F2741] hover:bg-[#F5F5F3]">
            {t.cartPage.continue}
          </Link>
          <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8A8780]">{t.cartPage.secure}</p>
          <PayBadges className="mt-2" />
        </div>
      </aside>
    </div>
  );
}
