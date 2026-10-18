"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MerchClub, MerchItem } from "@/lib/newwave/merch";
import { sek } from "@/lib/newwave/reseller";
import { LogoMark } from "../Logo";
import { EASE } from "../motion/Motion";
import { MerchDetail } from "./MerchDetail";
import { MerchImage } from "./MerchImage";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ARROW = <path d="M5 12h14M13 6l6 6-6 6" />;

export function MerchHeader({ club }: { club?: MerchClub }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(17,17,17,0.06)] bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-8">
        <Link href="/newwave/start" className="flex min-h-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – till ingångarna">
          <LogoMark size={28} />
          <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
        </Link>
        <span aria-hidden className="text-[#C9C7C0]">/</span>
        {club ? (
          <>
            <Link href="/newwave/merch" className="hidden text-[14px] text-[#6F6B63] transition hover:text-[#111] sm:inline">
              Merch
            </Link>
            <span aria-hidden className="hidden text-[#C9C7C0] sm:inline">/</span>
            <span className="truncate text-[14px] font-medium">{club.name}</span>
          </>
        ) : (
          <span className="text-[14px] font-medium">Merch</span>
        )}
        <Link href="/newwave/start" className="ml-auto inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13.5px] text-[#6F6B63] transition hover:bg-[#F2F2EF] hover:text-[#111]">
          Ingångar
        </Link>
      </div>
    </header>
  );
}

function Tile({ item, big, active, onOpen }: { item: MerchItem; big: boolean; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${item.name} – ${item.club}, ${item.motif}, ${sek(item.priceSek)}`}
      className={`group relative block h-full w-full overflow-hidden rounded-[24px] bg-[#F4F4F2] text-left outline-none ring-offset-2 transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[0_30px_50px_-30px_rgba(17,17,17,0.45)] focus-visible:ring-2 focus-visible:ring-[#111] ${active ? "ring-2 ring-[#111]" : ""}`}
    >
      <span className="absolute inset-0 transition-transform duration-[1.1s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]">
        <MerchImage item={item} />
      </span>
      <span className="absolute left-2.5 top-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full bg-white/85 py-1 pl-1 pr-2.5 shadow-[0_1px_2px_rgba(17,17,17,0.08)] backdrop-blur-md">
        <img src={item.crest} alt="" className="h-5 w-5 shrink-0 rounded-full bg-white object-contain p-[1px]" />
        <span className="truncate text-[11.5px] font-semibold text-[#111]">{item.club}</span>
      </span>
      <span aria-hidden className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-[#111] text-white opacity-0 transition-all duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {ARROW}
        </svg>
      </span>
      <span className={`absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 rounded-[16px] bg-white/90 backdrop-blur-md transition-transform duration-500 group-hover:-translate-y-0.5 ${big ? "px-4 py-3" : "px-3 py-2"}`}>
        <span className="min-w-0">
          <span className={`block truncate font-semibold tracking-[-0.01em] text-[#111] ${big ? "text-[17px]" : "text-[13.5px]"}`}>{item.name}</span>
          <span className={`block truncate text-[#6F6B63] ${big ? "text-[13px]" : "text-[11.5px]"}`}>{item.motif}</span>
        </span>
        <span className={`shrink-0 font-semibold text-[#111] ${big ? "text-[15px]" : "text-[12.5px]"}`}>{sek(item.priceSek)}</span>
      </span>
    </button>
  );
}

/** Klubbens ruta i rutnätet; leder till klubbens undersida. */
function Story({ club }: { club: MerchClub }) {
  return (
    <Link
      href={`/newwave/merch/${club.id}`}
      className="group relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[24px] p-5 text-left text-white outline-none ring-offset-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[#111] sm:p-6"
      style={{ background: club.color }}
    >
      <span aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 transition-transform duration-700 group-hover:scale-125" />
      <span className="relative flex items-center gap-3">
        <img src={club.crest} alt="" className="h-11 w-11 shrink-0 rounded-full bg-white object-contain p-1" />
        <span className="nw-mono min-w-0 truncate text-[11px] uppercase tracking-[0.08em] text-white/70">
          {club.sports.join(" · ")} · {club.city}
        </span>
      </span>
      <span className="relative flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[clamp(20px,2.2vw,28px)] font-semibold leading-none tracking-[-0.035em]">{club.name}</span>
          <span className="mt-1.5 block text-[13px] text-white/75">{club.count} produkter · klubbens sida</span>
        </span>
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#111] transition-transform duration-500 group-hover:translate-x-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {ARROW}
          </svg>
        </span>
      </span>
    </Link>
  );
}

type Cell = { kind: "item"; item: MerchItem } | { kind: "story"; club: MerchClub };
type Facet = "klubb" | "stad" | "land";
type Option = { value: string; label: string; note: string; crest?: string };

const FACETS: { id: Facet; label: string }[] = [
  { id: "klubb", label: "Klubb" },
  { id: "stad", label: "Stad" },
  { id: "land", label: "Land" },
];
const NONE: Record<Facet, string | null> = { klubb: null, stad: null, land: null };
const FIELD: Record<Facet, (c: MerchClub) => string> = { klubb: (c) => c.id, stad: (c) => c.city, land: (c) => c.country };
const clubsNote = (n: number) => `${n} ${n === 1 ? "klubb" : "klubbar"}`;

function tally(clubs: MerchClub[], key: (c: MerchClub) => string): Option[] {
  const n = new Map<string, number>();
  for (const c of clubs) n.set(key(c), (n.get(key(c)) ?? 0) + 1);
  return [...n].sort((a, b) => a[0].localeCompare(b[0], "sv")).map(([value, count]) => ({ value, label: value, note: clubsNote(count) }));
}

const chip = (on: boolean) => `inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition ${on ? "bg-[#111] text-white" : "bg-white text-[#111] shadow-[0_1px_2px_rgba(17,17,17,0.06)] hover:bg-[#ECEBE6]"}`;

/**
 * En sökruta överst, tre hopfällda filter under och produkterna i ett levande rutnät, med detaljerna i en panel till höger.
 * På en klubbs undersida (`club`) finns bara sökrutan.
 */
export function MerchBrowser({ items, clubs, club: fixed }: { items: MerchItem[]; clubs: MerchClub[]; club?: MerchClub }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(NONE);
  const [panel, setPanel] = useState<Facet | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const clubOf = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const options = useMemo<Record<Facet, Option[]>>(
    () => ({
      klubb: [...clubs].sort((a, b) => a.name.localeCompare(b.name, "sv")).map((c) => ({ value: c.id, label: c.name, note: c.city, crest: c.crest })),
      stad: tally(clubs, FIELD.stad),
      land: tally(clubs, FIELD.land),
    }),
    [clubs],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
      if (e.key !== "/" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const words = fold(q).split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => {
    const c = clubOf.get(i.clubId);
    if (!c || FACETS.some((f) => pick[f.id] && FIELD[f.id](c) !== pick[f.id])) return false;
    return words.every((w) => fold(`${c.name} ${c.city} ${c.region} ${c.country} ${c.sports.join(" ")} ${i.motif} ${i.name} ${i.category}`).includes(w));
  });

  const narrowed = Boolean(pick.klubb || pick.stad || pick.land);
  const cells: Cell[] = [];
  const told = new Set<string>();
  const featured = new Set(shown.filter((i) => i.featured).map((i) => i.clubId));
  for (const item of shown) {
    const c = clubOf.get(item.clubId);
    if (!fixed && c && !told.has(c.id) && (featured.has(c.id) || narrowed)) {
      told.add(c.id);
      cells.push({ kind: "story", club: c });
    }
    cells.push({ kind: "item", item });
  }

  const label = (f: Facet) => options[f].find((o) => o.value === pick[f])?.label;
  const choose = (f: Facet, value: string) => {
    setPick((p) => ({ ...p, [f]: p[f] === value ? null : value }));
    setPanel(null);
  };
  const filtered = Boolean(q || narrowed);
  const reset = () => {
    setQ("");
    setPick(NONE);
    setPanel(null);
  };
  const current = items.find((i) => i.id === open) ?? null;
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        <form role="search" className="relative mx-auto max-w-[640px]" onSubmit={(e) => e.preventDefault()}>
          <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 fill-none stroke-[#6F6B63]" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          <input
            ref={search}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={fixed ? `Sök i ${fixed.owner} merch` : "Skriv klubb, stad eller produkt"}
            aria-label="Sök merch"
            className={`h-14 w-full rounded-full border border-[rgba(17,17,17,0.1)] bg-white pl-13 ${q ? "pr-24" : "pr-5 sm:pr-14"} text-[16px] shadow-[0_18px_40px_-28px_rgba(17,17,17,0.45)] outline-none transition placeholder:text-[#9A968D] focus:border-[#111] [&::-webkit-search-cancel-button]:hidden`}
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 h-9 -translate-y-1/2 rounded-full bg-[#F2F2EF] px-3.5 text-[13px] font-medium text-[#111] transition hover:bg-[#E8E7E2]">
              Rensa
            </button>
          ) : (
            <kbd className="nw-mono pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 rounded-md border border-[rgba(17,17,17,0.12)] px-1.5 py-0.5 text-[11px] text-[#6F6B63] sm:block">/</kbd>
          )}
        </form>

        {fixed ? null : (
          <div className="mx-auto max-w-[760px]">
            <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Filtrera">
              {FACETS.map((f) => {
                const on = panel === f.id;
                const value = label(f.id);
                return (
                  <div key={f.id} className={`flex h-11 items-center rounded-full border transition ${value ? "border-[#111] bg-[#111] text-white" : on ? "border-[#111] bg-white" : "border-[rgba(17,17,17,0.12)] bg-white hover:border-[rgba(17,17,17,0.3)]"}`}>
                    <button type="button" aria-expanded={on} aria-controls="merch-filter" onClick={() => setPanel(on ? null : f.id)} className={`flex h-full items-center gap-2 text-[14px] font-medium ${value ? "pl-4 pr-1.5" : "px-4"}`}>
                      {f.label}
                      {value ? <span className="max-w-[150px] truncate font-normal text-white/75">{value}</span> : null}
                      <svg viewBox="0 0 24 24" aria-hidden className={`h-4 w-4 fill-none stroke-current transition-transform duration-300 ${on ? "rotate-180" : ""}`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {value ? (
                      <button type="button" aria-label={`Ta bort filtret ${f.label.toLowerCase()}`} onClick={() => setPick((p) => ({ ...p, [f.id]: null }))} className="mr-1 grid h-8 w-8 place-items-center rounded-full text-white/75 transition hover:bg-white/15 hover:text-white">
                        <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <AnimatePresence initial={false}>
              {panel ? (
                <motion.div key="panel" id="merch-filter" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                  <div className="mt-3 flex flex-wrap justify-center gap-2 rounded-[24px] bg-[#F4F4F1] p-3" role="group" aria-label={`Välj ${FACETS.find((f) => f.id === panel)?.label.toLowerCase()}`}>
                    {options[panel].map((o) => {
                      const on = pick[panel] === o.value;
                      return (
                        <button key={o.value} type="button" aria-pressed={on} onClick={() => choose(panel, o.value)} className={`${chip(on)} ${o.crest ? "pl-1.5" : ""}`}>
                          {o.crest ? <img src={o.crest} alt="" className="h-7 w-7 rounded-full bg-white object-contain p-0.5" /> : null}
                          {o.label}
                          <span className={`text-[12px] font-normal ${on ? "text-white/65" : "text-[#9A968D]"}`}>{o.note}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </div>

      <main className="mx-auto mt-6 max-w-[1440px] px-3 pb-24 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-3 px-1 text-[13px] text-[#6F6B63]">
          <p aria-live="polite">
            {shown.length} {shown.length === 1 ? "produkt" : "produkter"}
            {pick.klubb ? ` från ${label("klubb")}` : ""}
            {pick.stad ? ` i ${pick.stad}` : pick.land ? ` i ${pick.land}` : ""}
            {q ? ` för ”${q}”` : ""}
          </p>
          {filtered ? (
            <button type="button" onClick={reset} className="font-medium text-[#111] underline decoration-[#D9D6CE] underline-offset-4">
              Visa allt
            </button>
          ) : null}
        </div>

        {shown.length ? (
          <div className="@container">
            <div className="grid grid-cols-2 gap-[var(--gap)] [--cols:2] [--gap:10px] [grid-auto-flow:dense] [grid-auto-rows:calc((100cqw_-_(var(--cols)_-_1)_*_var(--gap))_/_var(--cols))] @[640px]:grid-cols-3 @[640px]:[--cols:3] @[640px]:[--gap:14px] @[980px]:grid-cols-4 @[980px]:[--cols:4] @[1280px]:grid-cols-5 @[1280px]:[--cols:5]">
              <AnimatePresence mode="popLayout" initial={false}>
                {cells.map((c) => {
                  const key = c.kind === "item" ? c.item.id : `story-${c.club.id}`;
                  const big = c.kind === "item" && Boolean(c.item.featured) && !q;
                  const span = c.kind === "story" ? "col-span-2" : big ? "col-span-2 row-span-2" : "";
                  return (
                    <motion.div key={key} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.4, ease: EASE }} className={`min-h-0 ${span}`}>
                      {c.kind === "item" ? <Tile item={c.item} big={big} active={open === c.item.id} onOpen={() => setOpen(c.item.id)} /> : <Story club={c.club} />}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] bg-[#F6F6F3] px-6 py-16 text-center">
            <p className="text-[18px] font-semibold">Inget matchar{q ? ` ”${q}”` : ""}.</p>
            <p className="mt-1 text-[14px] text-[#6F6B63]">Prova en annan klubb, stad eller ett annat ord, t.ex. keps eller hoodie.</p>
          </div>
        )}
      </main>

      <AnimatePresence>{current ? <MerchDetail key={current.id} item={current} club={clubOf.get(current.clubId)!} onClub={!fixed} onClose={close} /> : null}</AnimatePresence>
    </>
  );
}

/** Alla klubbars merch i en lista. Här säljs inget – produkterna länkar till klubbarnas butiker hos Intersport. */
export function MerchShop({ items, clubs }: { items: MerchItem[]; clubs: MerchClub[] }) {
  return (
    <div className="min-h-screen bg-white text-[#111]">
      <MerchHeader />
      <section className="mx-auto max-w-[980px] px-4 pb-4 pt-5 text-center sm:px-8 sm:pt-6">
        <h1 className="text-[20px] font-semibold tracking-[-0.03em] sm:text-[22px]">All klubbmerch. En lista.</h1>
        <p className="nw-mono mt-1 text-[11px] uppercase tracking-[0.08em] text-[#6F6B63]">
          {clubs.length} klubbar · {items.length} produkter · säljs hos Intersport
        </p>
      </section>
      <MerchBrowser items={items} clubs={clubs} />
    </div>
  );
}

/** En klubbs undersida: kort presentation, länken till butiken och all klubbens merch. */
export function MerchClubPage({ club, items, clubs }: { club: MerchClub; items: MerchItem[]; clubs: MerchClub[] }) {
  return (
    <div className="min-h-screen bg-white text-[#111]">
      <MerchHeader club={club} />
      <section className="mx-auto max-w-[1440px] px-3 pb-10 pt-6 sm:px-8 sm:pt-8">
        <div className="relative overflow-hidden rounded-[32px] px-6 py-9 text-white sm:px-12 sm:py-14" style={{ background: club.color }}>
          <span aria-hidden className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-white/[0.07]" />
          <span aria-hidden className="absolute -bottom-40 right-40 h-[300px] w-[300px] rounded-full bg-white/[0.05]" />
          <div className="relative grid items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
            <img src={club.crest} alt={`${club.owner} klubbmärke`} className="h-24 w-24 rounded-full bg-white object-contain p-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] sm:h-32 sm:w-32 sm:p-3" />
            <div className="min-w-0">
              <p className="nw-mono text-[12px] uppercase tracking-[0.08em] text-white/65">
                {club.city} · {club.region}
              </p>
              <h1 className="mt-2 text-[clamp(36px,5vw,64px)] font-semibold leading-[0.98] tracking-[-0.05em]">{club.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                {club.sports.map((s) => (
                  <span key={s} className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-medium">
                    {s}
                  </span>
                ))}
                <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-medium">{club.count} produkter</span>
              </div>
              <p className="mt-5 max-w-[62ch] text-[15.5px] leading-relaxed text-white/80">{club.about}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                <a href={club.shopUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[14.5px] font-semibold text-[#111] transition hover:opacity-90">
                  Klubbens butik hos Intersport
                  <span aria-hidden>↗</span>
                </a>
                {club.ownPage ? (
                  <Link href={club.ownPage} className="inline-flex h-12 items-center rounded-full border border-white/35 px-5 text-[14.5px] font-semibold transition hover:bg-white/10">
                    Klubbens egen sida
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
      <MerchBrowser items={items} clubs={clubs} club={club} />
    </div>
  );
}
