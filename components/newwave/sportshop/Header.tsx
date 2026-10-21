"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { BASE, CLUBS, PRODUCTS, SHOP, shopClub } from "@/lib/newwave/sportshop/data";
import { matchesQuery, productName } from "@/lib/newwave/sportshop/i18n";
import { CART, totals, useSportCart } from "./cart";
import { LangToggle, useLang } from "./Lang";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#FF6A13" />
        <path d="M9 7h4.4v14.2H22V25H9z" fill="#fff" />
        <path d="M17 7h8l-3.2 5.6h-8z" fill="#0F2741" />
      </svg>
      <span className="leading-none">
        <span className={`block text-[17px] font-black uppercase tracking-[0.06em] ${light ? "text-white" : "text-[#0F2741]"}`}>{SHOP.name}</span>
        <span className={`mt-0.5 block text-[10px] font-medium uppercase tracking-[0.16em] ${light ? "text-white/60" : "text-[#8A8780]"}`}>Bielefeld · {SHOP.since}</span>
      </span>
    </span>
  );
}

function Search() {
  const { lang, t, money } = useLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const id = useId();
  const hits = useMemo(() => (q.trim() ? PRODUCTS.filter((p) => matchesQuery(p, q, lang)).slice(0, 6) : []), [q, lang]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    router.push(`${BASE}/suche?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <label htmlFor={id} className="sr-only">
        {t.searchLabel}
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={t.search}
        autoComplete="off"
        className="h-11 w-full rounded-full border border-transparent bg-[#F1F1EF] pl-11 pr-4 text-[14.5px] text-[#111] outline-none transition placeholder:text-[#8A8780] focus:border-[#0F2741] focus:bg-white"
      />
      <button type="submit" aria-label={t.searchLabel} className="absolute left-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-[#6F6B63] hover:text-[#111]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </button>
      {open && q.trim() ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(15,39,65,0.35)] ring-1 ring-[#ECECE9]">
          {hits.length ? (
            hits.map((p) => {
              const club = shopClub(p.clubId)!;
              return (
                <Link key={p.id} href={`${BASE}/p/${p.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-[#F5F5F3]">
                  <img src={club.crest} alt="" className="h-8 w-8 shrink-0 object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[#111]">{productName(p.kind, club, lang)}</span>
                    <span className="block truncate text-[12px] text-[#8A8780]">{club.name}</span>
                  </span>
                  <span className="text-[13.5px] font-semibold">{money(p.price)}</span>
                </Link>
              );
            })
          ) : (
            <p className="px-3 py-3 text-[14px] text-[#6F6B63]">{t.noHits}</p>
          )}
        </div>
      ) : null}
    </form>
  );
}

function CartButton() {
  const { t, money } = useLang();
  const [cart] = useSportCart(CART);
  const sum = totals(cart.lines);
  return (
    <Link href={`${BASE}/warenkorb`} className="relative flex h-11 items-center gap-2 rounded-full px-3 text-[#111] transition hover:bg-[#F1F1EF]" aria-label={`${t.cart}: ${sum.count}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
        <circle cx="10" cy="20.5" r="1.3" />
        <circle cx="17.5" cy="20.5" r="1.3" />
      </svg>
      {sum.count ? <span className="absolute left-6 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#FF6A13] px-1 text-[10.5px] font-bold text-white tabular-nums">{sum.count}</span> : null}
      <span className="hidden text-[13.5px] font-semibold lg:inline">{sum.count ? money(sum.subtotal) : t.cart}</span>
    </Link>
  );
}

export function Header() {
  const { t } = useLang();
  const path = usePathname();
  const nav = [
    { href: `${BASE}/suche?kat=teamwear`, label: t.nav.teamwear },
    { href: `${BASE}/suche?kat=fan`, label: t.nav.fan },
    { href: `${BASE}/suche?kat=bestseller`, label: t.nav.bestseller },
    { href: `${BASE}/suche?kat=sale`, label: t.nav.sale, sale: true },
  ];
  return (
    <header className="relative z-40 bg-white">
      <div className="bg-[#0F2741] text-white">
        <div className="mx-auto flex h-9 max-w-[1320px] items-center gap-6 px-4 text-[12px] sm:px-6">
          <ul className="flex min-w-0 flex-1 items-center gap-6">
            {t.topbar.map((x, i) => (
              <li key={x} className={`flex shrink-0 items-center gap-1.5 ${i ? "hidden md:flex" : ""} ${i > 2 ? "md:hidden lg:flex" : ""}`}>
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-[#FF6A13]" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                {x}
              </li>
            ))}
          </ul>
          <Link href="/newwave/merch" className="shrink-0 text-white/70 underline-offset-2 transition hover:text-white hover:underline">
            {t.backToNw}
          </Link>
        </div>
      </div>
      <div className="border-b border-[#ECECE9]">
        <div className="mx-auto grid max-w-[1320px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 md:grid-cols-[auto_1fr_auto] md:gap-x-8">
          <Link href={BASE} aria-label={`${SHOP.name} – ${t.nav.clubs}`} className="justify-self-start">
            <Logo />
          </Link>
          <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">
            <Search />
          </div>
          <div className="flex items-center gap-1.5">
            <LangToggle />
            <CartButton />
          </div>
        </div>
      </div>
      <nav aria-label={t.nav.clubs} className="border-b border-[#ECECE9]">
        <div className="mx-auto flex max-w-[1320px] items-center gap-1 overflow-x-auto px-3 sm:px-5 [scrollbar-width:none]">
          {CLUBS.map((c) => {
            const active = path.startsWith(`${BASE}/${c.id}`);
            return (
              <Link key={c.id} href={`${BASE}/${c.id}`} aria-current={active ? "page" : undefined} className={`flex h-12 shrink-0 items-center gap-2 border-b-2 px-2.5 text-[13.5px] font-semibold transition ${active ? "border-[#0F2741] text-[#0F2741]" : "border-transparent text-[#3A3833] hover:text-[#0F2741]"}`}>
                <img src={c.crest} alt="" className="h-6 w-6 object-contain" />
                {c.short}
              </Link>
            );
          })}
          <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-[#E2E2DF]" />
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`flex h-12 shrink-0 items-center px-2.5 text-[13.5px] font-semibold transition ${n.sale ? "text-[#D7262E] hover:text-[#A81B22]" : "text-[#3A3833] hover:text-[#0F2741]"}`}>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
