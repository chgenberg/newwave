"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { nwProduct, type NwProduct } from "@/lib/newwave/catalog";
import { type CustomerShop, fromPrice, type Reseller, sek } from "@/lib/newwave/reseller";
import { brandTheme, shopVars } from "@/lib/newwave/theme";
import { call } from "./api";
import { ProductMock } from "./ProductMock";

type Shop = Pick<CustomerShop, "company" | "logo" | "logoDark" | "color" | "products" | "markup" | "welcome">;
type Seller = Pick<Reseller, "name" | "slug" | "logo" | "texts">;
type Line = { productId: string; sizes: Record<string, number> };

const qtyOf = (l: Line) => Object.values(l.sizes).reduce((a, b) => a + b, 0);
const FIELD = "mt-1.5 h-11 w-full rounded-xl border border-[var(--shop-line)] bg-white px-3 text-[14.5px] outline-none focus:border-[var(--shop)]";
const BADGES = ["Avtalade priser", "Tryckstart ingår", "Leverans inom två veckor"];

/** Kundens egen butik: loggan ligger redan på allt, priset är avtalat och ordern går direkt till tryck. */
export function CustomerStore({ shop, seller, token, preview }: { shop: Shop; seller: Seller; token?: string; preview?: boolean }) {
  const products = shop.products.map(nwProduct).filter((p): p is NwProduct => Boolean(p));
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState<NwProduct | null>(null);
  const [by, setBy] = useState({ contact: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<{ id: string; token: string; totalSek: number } | null>(null);
  const unit = (p: NwProduct) => fromPrice(p, shop.markup);
  const total = lines.reduce((s, l) => {
    const p = nwProduct(l.productId);
    return s + (p ? unit(p) * qtyOf(l) : 0);
  }, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      setPlaced(await call<{ id: string; token: string; totalSek: number }>("/api/v1/newwave/customer-shops", { action: "order", token, ...by, message: by.message || undefined, lines }));
      setLines([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka beställningen");
    } finally {
      setBusy(false);
    }
  };

  const vars = shopVars(brandTheme(shop.color));

  return (
    <div data-studio-root style={vars} className="@container flex min-h-full flex-col bg-white text-[#1D1D1F]">
      <header className="border-b border-[var(--shop-line)] bg-white">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-4 px-5 @2xl:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.logo} alt={shop.company.name} className="h-9 w-auto max-w-[180px] object-contain object-left" />
          <span className="hidden text-[12.5px] opacity-55 @2xl:inline">Profilbutik</span>
          <a href="#bestallning" className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-[var(--shop)] px-4 text-[13.5px] font-semibold text-[var(--shop-on)]">
            Beställning
            {lines.length ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-[11px] text-[#1D1D1F]">{lines.length}</span> : null}
          </a>
        </div>
      </header>

      {placed ? (
        <section className="bg-[var(--shop-bg)]">
          <div className="mx-auto max-w-[1180px] px-5 py-12 @2xl:px-8">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--shop)]">Order {placed.id}</p>
            <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-tight @2xl:text-[44px]">Tack! Beställningen är skickad</h1>
            <p className="mt-3 max-w-[600px] text-[16px] leading-relaxed opacity-75">
              {sek(placed.totalSek)} exkl. moms. Ordern gick direkt till New Wave, som trycker och levererar. {seller.name} har fått en kopia och hör av sig om något behöver ändras.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/newwave/s/${seller.slug}/offert/${placed.token}`} className="inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)]">
                Följ ordern
              </Link>
              <button type="button" onClick={() => setPlaced(null)} className="inline-flex h-12 items-center rounded-full border border-[var(--shop-line)] bg-white px-5 text-[14px] font-medium">
                Beställ mer
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-[var(--shop-bg)]">
          <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-10 @2xl:px-8 @2xl:pb-16 @2xl:pt-16">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)]">Profilbutik för {shop.company.name}</p>
            <h1 className="mt-3 max-w-[760px] text-[34px] font-bold leading-[1.05] tracking-[-0.03em] @2xl:text-[54px]">Era kläder och profilprodukter, klara att beställa</h1>
            {shop.welcome ? <p className="mt-4 max-w-[600px] text-[16px] leading-relaxed opacity-75 @2xl:text-[18px]">{shop.welcome}</p> : null}
            <ul className="mt-6 flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <li key={b} className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--shop)]">
                  ✓ {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-[1180px] px-5 py-10 @2xl:px-8 @2xl:py-14">
        <h2 className="text-[24px] font-bold tracking-tight @2xl:text-[30px]">Sortiment</h2>
        <p className="mb-6 mt-1 text-[14px] opacity-60">Pris per styck exkl. moms, med er logga tryckt. Samma pris oavsett antal.</p>
        <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4 @5xl:grid-cols-4">
          {products.map((p) => {
            const inOrder = lines.find((l) => l.productId === p.id);
            return (
              <li key={p.id} className="min-w-0">
                <button type="button" onClick={() => setOpen(p)} disabled={preview} className="group block w-full text-left">
                  <span className="relative block overflow-hidden rounded-2xl">
                    <ProductMock product={p} logo={shop.logo} logoDark={shop.logoDark} className="rounded-2xl transition-transform duration-700 group-hover:scale-[1.03]" />
                    {inOrder ? <span className="absolute left-2.5 top-2.5 rounded-full bg-[var(--shop)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--shop-on)]">{qtyOf(inOrder)} st</span> : null}
                  </span>
                  <span className="mt-2.5 block truncate text-[14px] font-semibold">{p.name}</span>
                  <span className="block text-[12.5px] opacity-60">{sek(unit(p))}/st</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="bestallning" className="mx-auto w-full max-w-[1180px] scroll-mt-4 px-5 pb-14 @2xl:px-8">
        <div className="grid gap-6 rounded-[28px] bg-[var(--shop-bg)] p-5 @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @2xl:p-7">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold">Er beställning</h2>
            {lines.length ? (
              <ul className="mt-3 divide-y divide-[var(--shop-line)]">
                {lines.map((l) => {
                  const p = nwProduct(l.productId)!;
                  return (
                    <li key={l.productId} className="flex items-center gap-3 py-3">
                      <ProductMock product={p} logo={shop.logo} logoDark={shop.logoDark} className="h-14 w-14 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold">{p.name}</p>
                        <p className="truncate text-[12.5px] opacity-60">
                          {Object.entries(l.sizes)
                            .filter(([, n]) => n > 0)
                            .map(([s, n]) => (s === "One size" ? `${n} st` : `${s} ${n}`))
                            .join(", ")}
                        </p>
                      </div>
                      <p className="shrink-0 text-[14px] font-semibold">{sek(unit(p) * qtyOf(l))}</p>
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} className="nw-hit shrink-0 text-[12.5px] underline underline-offset-4 opacity-60">
                        Ta bort
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] opacity-65">Välj en produkt ovan, ange storlekar och antal.</p>
            )}
            {lines.length ? (
              <div className="mt-3 flex items-baseline justify-between border-t border-[var(--shop-line)] pt-3">
                <p className="text-[14px] opacity-65">Totalt exkl. moms</p>
                <p className="text-[24px] font-bold tracking-tight">{sek(total)}</p>
              </div>
            ) : null}
          </div>
          <form onSubmit={submit} className="min-w-0">
            <div className="grid gap-3">
              <label className="block text-[13px] font-medium">
                Ert namn
                <input required autoComplete="name" value={by.contact} maxLength={80} onChange={(e) => setBy((b) => ({ ...b, contact: e.target.value }))} className={FIELD} />
              </label>
              <label className="block text-[13px] font-medium">
                E-post
                <input required type="email" autoComplete="email" value={by.email} maxLength={120} onChange={(e) => setBy((b) => ({ ...b, email: e.target.value }))} className={FIELD} />
              </label>
              <label className="block text-[13px] font-medium">
                Leveransadress eller meddelande (valfritt)
                <textarea value={by.message} rows={2} maxLength={600} onChange={(e) => setBy((b) => ({ ...b, message: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-[var(--shop-line)] bg-white p-3 text-[14.5px] outline-none focus:border-[var(--shop)]" />
              </label>
            </div>
            {error ? <p className="mt-3 text-[13px] text-[#B42318]">{error}</p> : null}
            <button type="submit" disabled={busy || !lines.length || preview} className="mt-4 h-12 w-full rounded-full bg-[var(--shop)] text-[15px] font-semibold text-[var(--shop-on)] disabled:opacity-40">
              {busy ? "Skickar…" : lines.length ? `Beställ för ${sek(total)}` : "Välj produkter först"}
            </button>
            <p className="mt-2.5 text-[12px] opacity-55">Ingen offert behövs. Ordern går direkt till tryck.</p>
          </form>
        </div>
      </section>

      <footer className="mt-auto border-t border-[var(--shop-line)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-[13px] opacity-70 @2xl:px-8">
          <span>
            Butiken drivs av <strong>{seller.texts.shopName || seller.name}</strong>
          </span>
          {seller.texts.email ? <span>{seller.texts.email}</span> : null}
          {seller.texts.phone ? <span>{seller.texts.phone}</span> : null}
          <span className="ml-auto text-[12px]">Trycks och levereras av New Wave</span>
        </div>
      </footer>

      {open ? <SizeSheet product={open} unit={unit(open)} logo={shop.logo} logoDark={shop.logoDark} vars={vars} initial={lines.find((l) => l.productId === open.id)?.sizes} onClose={() => setOpen(null)} onAdd={(sizes) => setLines((ls) => [...ls.filter((l) => l.productId !== open.id), ...(Object.values(sizes).some((n) => n > 0) ? [{ productId: open.id, sizes }] : [])])} /> : null}
    </div>
  );
}

/** Ligger i sidans rot, eftersom butikens container annars blir referens för `fixed`; färgerna följer med i `vars`. */
function SizeSheet({ product: p, unit, logo, logoDark, initial, vars, onClose, onAdd }: { product: NwProduct; unit: number; logo: string; logoDark?: string; initial?: Record<string, number>; vars: React.CSSProperties; onClose: () => void; onAdd: (sizes: Record<string, number>) => void }) {
  const [sizes, setSizes] = useState<Record<string, number>>(initial ?? (p.sizes.length === 1 ? { [p.sizes[0]]: 25 } : {}));
  const qty = Object.values(sizes).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return createPortal(
    <div style={vars} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 text-[#1D1D1F] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={p.name} onClick={(e) => e.stopPropagation()} className="nw-fade w-full max-w-[560px] rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex gap-4">
          <ProductMock product={p} logo={logo} logoDark={logoDark} className="h-28 w-28 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold leading-tight">{p.name}</p>
            <p className="mt-0.5 text-[13.5px] opacity-60">
              {p.garmentColor} · {sek(unit)}/st
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--shop-line)] text-[15px]">
            ×
          </button>
        </div>
        <div className={`mt-5 grid gap-2 ${p.sizes.length > 1 ? "grid-cols-3 sm:grid-cols-6" : "max-w-[140px] grid-cols-1"}`}>
          {p.sizes.map((s) => (
            <label key={s} className="block min-w-0">
              <span className="block text-center text-[12px] font-medium opacity-70">{s === "One size" ? "Antal" : s}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={sizes[s] || ""}
                placeholder="0"
                onChange={(e) => setSizes((cur) => ({ ...cur, [s]: Math.max(0, Math.min(9999, Math.round(Number(e.target.value) || 0))) }))}
                className="mt-1 h-11 w-full rounded-xl border border-[var(--shop-line)] bg-white text-center text-[15px] font-semibold outline-none focus:border-[var(--shop)]"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onAdd(sizes);
            onClose();
          }}
          className="mt-5 h-12 w-full rounded-full bg-[var(--shop)] text-[15px] font-semibold text-[var(--shop-on)]"
        >
          {qty ? `Lägg till ${qty} st · ${sek(unit * qty)}` : initial ? "Ta bort ur beställningen" : "Välj antal"}
        </button>
      </div>
    </div>,
    document.querySelector(".nw") ?? document.body,
  );
}
