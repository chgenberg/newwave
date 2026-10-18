"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { nwProduct, type NwProduct } from "@/lib/newwave/catalog";
import type { Idea } from "@/lib/newwave/eventIdeas";
import { occasion as occasionOf, type OccasionId } from "@/lib/newwave/occasions";
import { fromPrice, priceLine, sek } from "@/lib/newwave/reseller";
import { AgentLoader } from "./AgentLoader";
import { fetchIdeas, genitive, renderScene, useBrandedScene } from "./brandAgent";
import { BrandIntake } from "./BrandIntake";
import { type CustomerLogo, PLACEHOLDER, useCart } from "./cart";
import { EventPackages } from "./EventPackages";
import { ProductMock } from "./ProductMock";
import { ShopGrid } from "./ShopClient";

type Run = { id: number; brand: string; done: number; total: number; complete: boolean };

const brandKey = (l: CustomerLogo) => `${l.light}|${l.color ?? ""}|${l.name}`;

/**
 * Ett tillfälle i butiken, som eventsidan i PACH: scenen med produkterna utmärkta, och när loggan finns ritar
 * scenagenten om miljön med kundens logga medan produktagenten väljer det som passar företaget. Under det paket,
 * kit och alla produkter för tillfället.
 */
export function EventShop({ slug, shopName, markup, occasionId, products }: { slug: string; shopName: string; markup: number; occasionId: OccasionId; products: string[] }) {
  const o = occasionOf(occasionId)!;
  const [cart] = useCart(slug);
  const logo = cart.logo;
  const branded = useBrandedScene(o.id, logo);
  const [run, setRun] = useState<Run | null>(null);
  const [ideas, setIdeas] = useState<{ for: string; list: Idea[] }>({ for: "", list: [] });
  const [sceneError, setSceneError] = useState<{ for: string; text: string } | null>(null);
  const [nudge, setNudge] = useState(false);
  const ran = useRef("");
  const top = useRef<HTMLElement>(null);

  const start = useCallback(
    async (l: CustomerLogo) => {
      const id = Date.now();
      const key = brandKey(l);
      const wantIdeas = Boolean(l.profile?.industry);
      let done = 0;
      const tick = () => {
        done += 1;
        const d = done;
        setRun((r) => (r?.id === id ? { ...r, done: d } : r));
      };
      setSceneError(null);
      setRun({ id, brand: l.name, done: 0, total: wantIdeas ? 2 : 1, complete: false });
      await Promise.all([
        renderScene(o.id, l)
          .then((img) => (img ? null : setSceneError({ for: key, text: "Scenen kunde inte ritas just nu." })))
          .catch((e: Error) => setSceneError({ for: key, text: e.message || "Scenen kunde inte ritas just nu." }))
          .finally(tick),
        wantIdeas
          ? fetchIdeas(slug, o.id, l)
              .then((list) => setIdeas({ for: key, list }))
              .catch(() => {})
              .finally(tick)
          : null,
      ]);
      setRun((r) => (r?.id === id ? { ...r, complete: true } : r));
      setTimeout(() => setRun((r) => (r?.id === id ? null : r)), 2600);
    },
    [o.id, slug],
  );

  useEffect(() => {
    if (!logo || ran.current === brandKey(logo)) return;
    ran.current = brandKey(logo);
    void start(logo);
  }, [logo, start]);

  const needLogo = () => {
    setNudge(true);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Er webbadress"]')?.focus({ preventScroll: true }), 500);
  };

  const key = logo ? brandKey(logo) : "";
  const picks = ideas.for === key ? ideas.list.flatMap((i) => (nwProduct(i.id) ? [{ ...i, product: nwProduct(i.id)! }] : [])) : [];
  const error = sceneError?.for === key ? sceneError.text : "";
  const art = logo ?? PLACEHOLDER;
  const inCart = new Set(cart.lines.map((l) => l.productId));
  const working = Boolean(run && !run.complete);

  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-28 @4xl:px-8">
      <nav aria-label="Brödsmulor" className="flex items-center gap-1.5 pt-5 text-[13px] opacity-60">
        <Link href={`/newwave/s/${slug}`} className="hover:underline">
          {shopName}
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/newwave/s/${slug}#event`} className="hover:underline">
          Event
        </Link>
        <span aria-hidden>/</span>
        <span>{o.name}</span>
      </nav>

      <section ref={top} className="grid scroll-mt-24 items-center gap-8 pt-6 @4xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] @4xl:gap-12 @4xl:pt-8">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">
            {products.length} produkter · {o.name}
          </p>
          <h1 className="mt-3 text-[36px] font-bold leading-[1.04] tracking-[-0.035em] @2xl:text-[48px] @6xl:text-[56px]">{logo ? `${o.name} för ${logo.name}` : o.name}</h1>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed opacity-65">
            {o.hint}. {logo ? `Agenterna lägger ${genitive(logo.name)} logga på hela miljön och på varje produkt.` : "Ange er webbadress så lägger agenterna er logga på hela miljön och på varje produkt."}
          </p>
          <BrandIntake slug={slug} variant="bar" cta={`Ser bra ut – visa ${o.title.toLowerCase()}`} onDone={() => setNudge(false)} />
          <AnimatePresence>
            {nudge && !logo ? (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 inline-flex rounded-full bg-[var(--shop-accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--shop-on-accent)]">
                Lägg till er logga först, så hamnar den på allt i paketet.
              </motion.p>
            ) : null}
          </AnimatePresence>
          {logo ? <p className="mt-3 text-[13px] opacity-60">Tryck ingår i alla priser · priser exkl. moms</p> : null}
        </div>

        <figure className="min-w-0">
          <div className="relative">
          <div className="relative aspect-[3/2] overflow-hidden rounded-[28px] bg-[#E9E5DD] shadow-[0_40px_80px_-48px_rgba(27,26,23,0.6)]">
            <img src={o.scene} alt={`${o.title} med plats för er logga`} className="absolute inset-0 h-full w-full object-cover" />
            <AnimatePresence>
              {branded ? <motion.img key={branded} src={branded} alt={`${o.title} med ${genitive(logo?.name ?? "er")} logga`} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0 h-full w-full object-cover" /> : null}
            </AnimatePresence>
            {working && !branded ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent [animation:nw-load_1.8s_ease-in-out_infinite]" />
                <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1D1D1F]/85 px-3.5 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur">Scenagenten bygger {o.title.toLowerCase()}…</span>
              </div>
            ) : null}
            {branded ? <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[12px] font-semibold backdrop-blur">Med {genitive(logo!.name)} logga</span> : null}
          </div>
          {o.spots.map((s, i) => {
            const p = nwProduct(s.id);
            if (!p) return null;
            return (
              <Link
                key={s.id}
                href={`/newwave/s/${slug}/p/${p.id}`}
                className="nw-spot"
                data-in={inCart.has(p.id) || undefined}
                data-high={s.y < 0.22 || undefined}
                data-side={s.x > 0.78 ? "right" : s.x < 0.22 ? "left" : undefined}
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, animationDelay: `${i * 0.25}s` }}
                aria-label={`${p.name}, från ${sek(fromPrice(p, markup))} – designa`}
              >
                <span className="nw-spot-label">
                  {p.name}
                  <small>från {sek(fromPrice(p, markup))}/st</small>
                </span>
              </Link>
            );
          })}
          </div>
          {error && logo && !working ? (
            <figcaption className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="opacity-70">{error}</span>
              <button type="button" onClick={() => void start(logo)} className="font-semibold underline underline-offset-4">
                Försök igen
              </button>
            </figcaption>
          ) : (
            <figcaption className="mt-3 text-[13px] opacity-55">Peka på en punkt för att se produkten. Klicka för att designa den i 3D.</figcaption>
          )}
        </figure>
      </section>

      {picks.length ? (
        <section className="pt-14 @4xl:pt-20" aria-labelledby="ideas-title">
          <h2 id="ideas-title" className="text-[24px] font-bold tracking-[-0.02em] @2xl:text-[28px]">
            Utvalt för {logo!.name}
          </h2>
          <p className="mt-1 text-[14px] opacity-60">Produktagenten har läst på om er verksamhet och valt det som passar er bäst.</p>
          <ul className="mt-5 grid grid-cols-2 gap-3 @5xl:grid-cols-4">
            {picks.map((i, n) => (
              <motion.li key={i.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <IdeaCard slug={slug} product={i.product} reason={i.reason} markup={markup} logo={art} added={inCart.has(i.id)} />
              </motion.li>
            ))}
          </ul>
        </section>
      ) : working && logo?.profile?.industry ? (
        <section className="pt-14 @4xl:pt-20" aria-busy>
          <p className="text-[24px] font-bold tracking-[-0.02em] opacity-40 @2xl:text-[28px]">Väljer produkter åt {logo.name}…</p>
          <ul className="mt-5 grid grid-cols-2 gap-3 @5xl:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <li key={n} className="h-[300px] animate-pulse rounded-[24px] bg-[#F4F4F2]" />
            ))}
          </ul>
        </section>
      ) : null}

      <EventPackages slug={slug} o={o} markup={markup} logo={logo} onNeedLogo={needLogo} />

      <section className="pt-14 @4xl:pt-20" aria-labelledby="all-title">
        <h2 id="all-title" className="text-[24px] font-bold tracking-[-0.02em] @2xl:text-[28px]">
          Alla produkter för {o.name.toLowerCase()}
        </h2>
        <p className="mb-5 mt-1 text-[14px] opacity-60">Priser exkl. moms, inklusive tryck. Klicka för att designa i 3D.</p>
        <ShopGrid slug={slug} productIds={products} markup={markup} />
      </section>

      <AnimatePresence>{run ? <AgentLoader key={run.id} title={`Klart – ${o.title.toLowerCase()} med ${genitive(run.brand)} logga`} stages={[...o.stages, `Väljer produkter åt ${run.brand}…`]} done={run.done} total={run.total} complete={run.complete} /> : null}</AnimatePresence>
      <CartBar slug={slug} markup={markup} hidden={working} />
    </div>
  );
}

function IdeaCard({ slug, product, reason, markup, logo, added }: { slug: string; product: NwProduct; reason: string; markup: number; logo: { light: string; dark: string }; added: boolean }) {
  return (
    <Link href={`/newwave/s/${slug}/p/${product.id}`} className="group flex h-full flex-col overflow-hidden rounded-[24px] bg-white shadow-[inset_0_0_0_1px_var(--shop-line)] transition duration-300 hover:-translate-y-[3px] hover:shadow-[0_22px_40px_-26px_rgba(17,17,17,0.45)]">
      <ProductMock product={product} logo={logo.light} logoDark={logo.dark} className="transition-transform duration-700 group-hover:scale-[1.03]" />
      <span className="flex flex-1 flex-col gap-1 p-4">
        <b className="text-[15px]">{product.name}</b>
        <small className="text-[13px] leading-snug opacity-65">{reason}</small>
        <em className="mt-auto pt-2 text-[12.5px] font-semibold not-italic text-[var(--shop)]">
          från {sek(fromPrice(product, markup))}/st · {added ? "I varukorgen ✓" : "Designa →"}
        </em>
      </span>
    </Link>
  );
}

/** Varukorgen i botten när den har något, med summan. */
function CartBar({ slug, markup, hidden }: { slug: string; markup: number; hidden: boolean }) {
  const [cart] = useCart(slug);
  const total = cart.lines.reduce((s, l) => s + (priceLine(l, markup)?.total ?? 0), 0);
  const n = cart.lines.length;
  return (
    <AnimatePresence>
      {n ? (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: hidden ? 0 : 1, y: hidden ? 24 : 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] right-3 z-30 @2xl:right-6" style={{ pointerEvents: hidden ? "none" : undefined }}>
          <Link href={`/newwave/s/${slug}/offert`} className="flex items-center gap-4 rounded-full bg-[#1D1D1F] py-2 pl-5 pr-2 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
            <span className="text-[13.5px]">
              <b>{n}</b> {n === 1 ? "produkt" : "produkter"} · <b className="tabular-nums">{sek(total)}</b>
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-[#1D1D1F]">Till varukorgen →</span>
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
