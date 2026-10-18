"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { nwProduct, type NwProduct } from "@/lib/newwave/catalog";
import { type OccasionId, occasion } from "@/lib/newwave/occasions";
import { fromPrice, sek } from "@/lib/newwave/reseller";

type Hit = { key: string; name: string; sub: string; img: string; cover: boolean; href: string };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Butikens sök: event och produkter i samma lista. Tom ruta visar "Jag letar efter …" med förslag som byts, och
 * fokus visar eventen direkt.
 */
export function StoreSearch({ slug, products, occasions, markup, variant }: { slug: string; products: string[]; occasions: OccasionId[]; markup: number; variant: "hero" | "header" }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const base = `/newwave/s/${slug}`;

  const items = useMemo(() => products.map(nwProduct).filter((p): p is NwProduct => Boolean(p && p.kind !== "booth")), [products]);
  const events = useMemo(() => occasions.map((o) => occasion(o)!), [occasions]);
  const chips = useMemo(() => events.flatMap((e, i) => [e.name, items[i * 2]?.name].filter((x): x is string => Boolean(x))), [events, items]);

  useEffect(() => {
    if (q || focused || chips.length < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [q, focused, chips.length]);

  const eventHit = (e: (typeof events)[number]): Hit => ({ key: `e-${e.id}`, name: e.name, sub: e.hint, img: e.scene, cover: true, href: `${base}/event/${e.id}` });
  const productHit = (p: NwProduct): Hit => ({ key: `p-${p.id}`, name: p.name, sub: `${p.category} · från ${sek(fromPrice(p, markup))}/st`, img: p.photo, cover: false, href: `${base}/p/${p.id}` });

  const words = fold(q).split(/\s+/).filter(Boolean);
  const hits: { title: string; list: Hit[] }[] = words.length
    ? [
        { title: "Event", list: events.filter((e) => words.every((w) => fold(`${e.name} ${e.hint} ${e.title}`).includes(w))).map(eventHit) },
        { title: "Produkter", list: items.filter((p) => words.every((w) => fold(`${p.name} ${p.category} ${p.use}`).includes(w))).slice(0, 6).map(productHit) },
      ].filter((g) => g.list.length)
    : [
        { title: "Vilket event planerar ni?", list: events.map(eventHit) },
        { title: "Populärt", list: items.slice(0, 3).map(productHit) },
      ];
  const flat = hits.flatMap((g) => g.list);
  const open = focused && (flat.length > 0 || words.length > 0);

  const go = (h: Hit) => {
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(h.href);
  };

  const hero = variant === "hero";
  return (
    <div
      className={`relative ${hero ? "mt-7" : ""}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (flat[active]) go(flat[active]);
        }}
        className={`relative flex items-center rounded-full transition ${hero ? "h-[64px] bg-[#F4F4F2] pl-6 pr-2 focus-within:bg-white focus-within:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35),inset_0_0_0_2px_var(--shop)]" : "h-11 bg-[#F2F1EC] pl-4 pr-1.5 focus-within:bg-white focus-within:shadow-[inset_0_0_0_1.5px_var(--shop)]"}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 fill-none stroke-current opacity-55 ${hero ? "h-5 w-5" : "h-4 w-4"}`} strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, Math.min(flat.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
            }
            if (e.key === "Escape") {
              setFocused(false);
              e.currentTarget.blur();
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && flat[active] ? `${id}-${flat[active].key}` : undefined}
          aria-label="Sök event och produkter"
          className={`h-full min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none! ${hero ? "pl-3 text-[17px]" : "pl-2.5 text-[14px]"}`}
        />
        {!q ? (
          <span aria-hidden className={`pointer-events-none absolute flex items-center gap-2 overflow-hidden ${hero ? "left-[54px] text-[17px]" : "left-[42px] text-[14px]"} text-[#8E8A80]`}>
            Jag letar efter
            {chips.length ? (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={tick} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className={`rounded-full bg-white font-semibold text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${hero ? "px-3 py-1 text-[15px]" : "px-2.5 py-0.5 text-[13px]"}`}>
                  {chips[tick % chips.length]}
                </motion.span>
              </AnimatePresence>
            ) : null}
          </span>
        ) : null}
        {hero ? (
          <button type="submit" className="h-12 shrink-0 rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition-transform hover:scale-[1.02]">
            Sök
          </button>
        ) : null}
      </form>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={`${id}-list`}
            role="listbox"
            aria-label="Sökresultat"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={`absolute left-0 right-0 top-full z-40 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-[24px] bg-white p-2 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.05)] ${hero ? "" : "min-w-[360px]"}`}
          >
            {flat.length ? (
              hits.map((g) => (
                <div key={g.title} className="py-1">
                  <p className="px-3 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] opacity-45">{g.title}</p>
                  {g.list.map((h) => {
                    const i = flat.indexOf(h);
                    return (
                      <button
                        key={h.key}
                        id={`${id}-${h.key}`}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${i === active ? "bg-[var(--shop-bg)]" : ""}`}
                      >
                        <span className={`h-12 shrink-0 overflow-hidden rounded-xl bg-[#F4F4F2] ${h.cover ? "w-[72px]" : "w-12"}`}>
                          <img src={h.img} alt="" className={`h-full w-full ${h.cover ? "object-cover" : "object-contain"}`} loading="lazy" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-semibold">{h.name}</span>
                          <span className="block truncate text-[12.5px] opacity-60">{h.sub}</span>
                        </span>
                        <span aria-hidden className="pr-2 opacity-40">
                          →
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-[14px] opacity-60">Inget som matchar ”{q}”. Prova mässa, hoodie eller mugg.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
