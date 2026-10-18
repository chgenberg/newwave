"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";
import { nwProduct, type NwProduct } from "@/lib/newwave/catalog";
import { DEMO_CUSTOMERS, fromPrice, sek } from "@/lib/newwave/reseller";
import { ProductMock } from "./ProductMock";
import { PLACEHOLDER, startTest, useCart } from "./cart";

const TEST_CUSTOMER = DEMO_CUSTOMERS.find((c) => c.name === "Kaffebaren Lyktan") ?? DEMO_CUSTOMERS[0];

/** Öppnar butiken som en av återförsäljarens kunder, med kundens logga och uppgifter ifyllda. */
export function TestAsCustomer({ slug, className = "nw-btn nw-btn-ghost" }: { slug: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        startTest(slug, TEST_CUSTOMER);
        router.push(`/newwave/s/${slug}`);
      }}
      className={className}
    >
      Testa som kund
    </button>
  );
}

/** Syns medan återförsäljaren provar butiken som kund. På sidan med den skickade förfrågan eller ordern tar `quoteId` över. */
export function TesterBanner({ slug, quoteId, order }: { slug: string; quoteId?: string; order?: boolean }) {
  const [cart, update] = useCart(slug);
  const onQuote = /\/offert\/[^/]+$/.test(usePathname());
  if (!cart.tester || (onQuote && !quoteId)) return null;
  const stop = () => update((c) => ({ logo: null, lines: c.lines }));
  return (
    <div className="bg-[#1D1D1F] text-white">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 text-[13px] @2xl:px-8">
        <p className="min-w-0 flex-1">
          {quoteId ? (
            order ? (
              <>Klart! Ordern {quoteId} har gått till New Wave och syns under Ordrar i er dashboard, precis som när en riktig kund beställer.</>
            ) : (
              <>Klart! Förfrågan {quoteId} ligger nu under Offerter i er dashboard, precis som när en riktig kund skickar en.</>
            )
          ) : (
            <>
              Ni testar butiken som <strong>{cart.tester.name}</strong>. Designa en produkt och beställ eller begär offert, så hamnar det hos er.
            </>
          )}
        </p>
        <Link href={quoteId ? `/newwave/shop/offerter/${quoteId}` : "/newwave/shop/butiken"} onClick={quoteId ? stop : undefined} className="inline-flex h-9 items-center rounded-full bg-white px-4 font-semibold text-[#1D1D1F]">
          {quoteId ? (order ? "Öppna ordern" : "Öppna förfrågan") : "Till dashboarden"}
        </Link>
        {quoteId ? null : (
          <button type="button" onClick={stop} className="nw-hit text-white/70 underline underline-offset-4 hover:text-white">
            Sluta testa
          </button>
        )}
      </div>
    </div>
  );
}

export function CartLink({ slug, preview }: { slug: string; preview?: boolean }) {
  const [cart] = useCart(slug);
  const n = preview ? 0 : cart.lines.length;
  const cls = "inline-flex h-10 items-center gap-2 rounded-full bg-[var(--shop)] px-3.5 text-[13.5px] font-semibold text-[var(--shop-on)] @2xl:px-4";
  const body = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      <span className="sr-only @2xl:not-sr-only">Varukorg</span>
      {n ? (
        <motion.span key={n} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.55, duration: 0.5 }} className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--shop-accent)] px-1.5 text-[11px] text-[var(--shop-on-accent)]">
          {n}
        </motion.span>
      ) : null}
    </>
  );
  return preview ? (
    <span className={cls}>{body}</span>
  ) : (
    <Link href={`/newwave/s/${slug}/offert`} className={cls}>
      {body}
    </Link>
  );
}

type Art = { light: string; dark: string };

/** Sortimentets kategorirutor skickar kategorin hit, så att produktlistan visar den. */
export const CATEGORY_EVENT = "nw-category";

/** `sample` är loggan som förhandsvisningen visar produkterna med. */
export function ShopGrid({ slug, productIds, markup, preview, sample }: { slug: string; productIds: string[]; markup: number; preview?: boolean; sample?: Art }) {
  const [cart] = useCart(slug);
  const products = productIds.map(nwProduct).filter((p): p is NwProduct => Boolean(p));
  const categories = [...new Set(products.map((p) => p.category))];
  const [cat, setCat] = useState<string | null>(null);
  const logo = preview ? (sample ?? PLACEHOLDER) : (cart.logo ?? PLACEHOLDER);
  const shown = cat ? products.filter((p) => p.category === cat) : products;

  useEffect(() => {
    const pick = (e: Event) => setCat((e as CustomEvent<string>).detail);
    window.addEventListener(CATEGORY_EVENT, pick);
    return () => window.removeEventListener(CATEGORY_EVENT, pick);
  }, []);

  if (!products.length) return <p className="rounded-2xl border border-dashed border-[var(--shop-line)] p-8 text-center text-[14px] opacity-60">Inga produkter valda än.</p>;

  return (
    <div>
      {categories.length > 1 ? (
        <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "alla"}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`h-9 shrink-0 rounded-full border px-4 text-[13px] font-medium transition-colors ${cat === c ? "border-[var(--shop)] bg-[var(--shop)] text-[var(--shop-on)]" : "border-[var(--shop-line)] bg-white hover:border-[var(--shop)]"}`}
            >
              {c ?? "Alla"}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4 @5xl:grid-cols-4">
        {shown.map((p) => {
          const mock = <ProductMock product={p} logo={logo.light} logoDark={logo.dark} className="rounded-2xl transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]" />;
          const info = (
            <>
              <p className="mt-2.5 truncate text-[14px] font-semibold">{p.name}</p>
              <p className="text-[12.5px] opacity-60">från {sek(fromPrice(p, markup))}/st</p>
            </>
          );
          return (
            <li key={p.id} className="group min-w-0">
              {preview ? (
                <div>
                  {mock}
                  {info}
                </div>
              ) : (
                <Link href={`/newwave/s/${slug}/p/${p.id}`} className="block">
                  <span className="relative block overflow-hidden rounded-2xl">
                    <ViewTransition name={`nw-product-${p.id}`} share="nw-morph">
                      {mock}
                    </ViewTransition>
                    <span aria-hidden className="absolute bottom-2.5 right-2.5 translate-y-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold opacity-0 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.25)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">
                      Designa →
                    </span>
                  </span>
                  {info}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
