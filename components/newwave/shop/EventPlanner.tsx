"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Saved, StudioButton } from "@/components/newwave/studio/StudioButton";
import type { Brandbook } from "@/lib/newwave/brandKit";
import { type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { defaultDesign } from "@/lib/newwave/marking";
import { GROUP_SIZES, type Occasion, type OccasionId, occasion, occasionProducts } from "@/lib/newwave/occasions";
import { MIN_QTY, priceLine, sek, splitSizes } from "@/lib/newwave/reseller";
import { call, readDataUrl } from "./api";
import { type CartLine, type PlanItem, useCart, usePlan } from "./cart";
import { LogoPicker } from "./ProductDesigner";
import { LineMock } from "./ProductMock";

const EVENT_KEY = "event-";

/**
 * Företagskunden planerar ett tillfälle i återförsäljarens butik: väljer mässa, kick-off eller liknande, lägger till
 * loggan eller den grafiska profilen och får en brandad scen och en hel kollektion att designa och beställa.
 */
export function EventPlanner({ slug, markup, shopName, offered, initial }: { slug: string; markup: number; shopName: string; offered: OccasionId[]; initial?: OccasionId }) {
  const [cart, updateCart] = useCart(slug);
  const [plan, update] = usePlan(slug);
  const [added, setAdded] = useState(false);
  const o = plan.occasion && offered.includes(plan.occasion) ? occasion(plan.occasion)! : null;
  const logo = cart.logo;
  const color = plan.color || logo?.color || "";

  const fill = (id: OccasionId, people: number) => {
    setAdded(false);
    update((p) => ({
      ...p,
      occasion: id,
      people,
      items: occasionProducts(occasion(id)!, people).map(({ product, qty }) => {
        const before = p.items.find((i) => i.productId === product.id);
        return { productId: product.id, qty, design: before?.design, color: before?.color, preview: before?.preview, proofs: before?.proofs };
      }),
    }));
  };

  const preselect = useRef(initial);
  useEffect(() => {
    const id = preselect.current;
    preselect.current = undefined;
    if (id && offered.includes(id)) fill(id, plan.occasion === id ? plan.people : 50);
    // Bara när sidan öppnas från en länk till ett visst tillfälle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (productId: string, fn: (i: PlanItem) => PlanItem) => {
    setAdded(false);
    update((p) => ({ ...p, items: p.items.map((i) => (i.productId === productId ? fn(i) : i)) }));
  };

  const lines = logo
    ? plan.items.flatMap((i) => {
        const p = nwProduct(i.productId);
        if (!p || i.off) return [];
        const priced = priceLine({ productId: p.id, sizes: i.sizes ?? splitSizes(p, i.qty), design: i.design ?? defaultDesign(p), color: i.color ?? p.garmentHex, logo: logo.light, logoDark: logo.dark, preview: i.preview, proofs: i.proofs }, markup);
        return priced && priced.qty > 0 ? [priced] : [];
      })
    : [];
  const total = lines.reduce((s, l) => s + l.total, 0);

  const addAll = () => {
    if (!o || !lines.length) return;
    const note = `${o.name} för ${plan.people} ${o.people}`;
    updateCart((c) => ({
      ...c,
      lines: [
        ...c.lines.filter((l) => !l.key.startsWith(EVENT_KEY)),
        ...lines.map((l): CartLine => ({ key: `${EVENT_KEY}${o.id}-${l.productId}`, productId: l.productId, sizes: l.sizes, design: l.design, color: l.color, logo: l.logo, logoDark: l.logoDark, preview: l.preview, proofs: l.proofs, note })),
      ],
    }));
    setAdded(true);
  };

  return (
    <div className={`mx-auto max-w-[1180px] px-5 pt-8 sm:px-8 sm:pt-12 ${o && logo ? "pb-32" : "pb-16"}`}>
      <p className="text-[13px] opacity-60">
        <Link href={`/newwave/s/${slug}`} className="hover:opacity-100">
          ← {shopName}
        </Link>
      </p>
      <h1 className="mt-3 max-w-[760px] text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--shop)] sm:text-[52px]">Planera ert event</h1>
      <p className="mt-4 max-w-[600px] text-[16px] leading-relaxed opacity-70 sm:text-[17px]">Välj tillfälle och lägg till er logga. Vi bygger hela kollektionen med er logga på allt. Designa varje produkt i 3D och beställ direkt av {shopName}.</p>

      <Step n={1} title="Vad ska ni ha?">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {offered.map((id) => {
            const x = occasion(id)!;
            const on = o?.id === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => fill(id, plan.people)}
                className={`group overflow-hidden rounded-[22px] border-2 bg-white text-left transition-all ${on ? "border-[var(--shop)] shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)]" : "border-transparent hover:border-[var(--shop-line)]"}`}
              >
                <span className="block aspect-[3/2] overflow-hidden bg-[#F4F4F2]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.scene} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]" loading="lazy" />
                </span>
                <span className="block px-4 pb-4 pt-3">
                  <span className="block text-[15.5px] font-semibold">{x.name}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug opacity-60">{x.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {o ? (
          <div className="mt-5">
            <p className="text-[14px] font-semibold">Hur många {o.people}?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {GROUP_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={plan.people === n}
                  onClick={() => fill(o.id, n)}
                  className={`h-10 rounded-full border px-4 text-[14px] font-medium transition-colors ${plan.people === n ? "border-[var(--shop)] bg-[var(--shop)] text-[var(--shop-on)]" : "border-[var(--shop-line)] bg-white hover:border-[var(--shop)]"}`}
                >
                  {n === 500 ? "500+" : n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] opacity-55">Vi föreslår antal per produkt utifrån det. Ni kan ändra allt.</p>
          </div>
        ) : null}
      </Step>

      {o ? (
        <Step n={2} title="Er logga och färg" id="er-logga">
          <div className="grid gap-4 md:grid-cols-2">
            <LogoPicker slug={slug} />
            <BrandColors slug={slug} color={color} />
          </div>
        </Step>
      ) : null}

      {o && logo ? (
        <Step n={3} title={`${o.title} med ${logo.name || "er logga"}`}>
          <Scene slug={slug} o={o} logo={logo} color={color} />
          <div className="mt-8 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-[22px] font-bold tracking-tight">Kollektionen</h3>
              <p className="mt-0.5 text-[13.5px] opacity-60">
                {plan.items.filter((i) => !i.off).length} produkter för {plan.people} {o.people}. Tryck på en produkt för att designa den i 3D.
              </p>
            </div>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.items.map((i) => {
              const p = nwProduct(i.productId);
              return p ? <Item key={i.productId} p={p} item={i} logo={logo} color={color} markup={markup} onChange={(fn) => edit(p.id, fn)} /> : null;
            })}
          </ul>
        </Step>
      ) : null}

      <AnimatePresence>
        {o && logo ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
            className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[760px] items-center gap-3 rounded-full border border-[var(--shop-line)] bg-white/95 p-1.5 pl-5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)] backdrop-blur"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-tight tracking-tight">{sek(total)}</p>
              <p className="truncate text-[11.5px] opacity-60">
                {lines.length} produkter · {lines.reduce((s, l) => s + l.qty, 0)} st · exkl. moms, inkl. tryck
              </p>
            </div>
            {added ? (
              <Link href={`/newwave/s/${slug}/offert`} className="inline-flex h-11 shrink-0 items-center rounded-full bg-[var(--shop-accent)] px-5 text-[14px] font-semibold text-[var(--shop-on-accent)]">
                Till varukorgen ({cart.lines.length})
              </Link>
            ) : (
              <button type="button" disabled={!lines.length} onClick={addAll} className="h-11 shrink-0 rounded-full bg-[var(--shop-accent)] px-5 text-[14px] font-semibold text-[var(--shop-on-accent)] transition-transform hover:scale-[1.02] disabled:opacity-40">
                <span className="sm:hidden">Lägg i korgen</span>
                <span className="hidden sm:inline">Lägg kollektionen i varukorgen</span>
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Märkesfärgen: loggans egen, eller färgerna i den grafiska profilen som kunden laddar upp. */
function BrandColors({ slug, color }: { slug: string; color: string }) {
  const [cart] = useCart(slug);
  const [plan, update] = usePlan(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const swatches = [...new Map([...(cart.logo?.color ? [{ name: "Loggans färg", hex: cart.logo.color.toUpperCase() }] : []), ...(plan.brandbook?.colors ?? [])].map((c) => [c.hex, c])).values()];

  const read = async (f: File) => {
    setBusy(true);
    setError("");
    try {
      const b = await call<Brandbook>("/api/v1/newwave/brandbook", { dataUrl: await readDataUrl(f), name: f.name });
      update((p) => ({ ...p, brandbook: { name: b.name, colors: b.colors }, color: b.colors[0].hex, scene: undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa profilen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[var(--shop-bg)] p-4">
      <p className="text-[14px] font-semibold">Märkesfärg</p>
      <p className="mt-0.5 text-[12.5px] leading-snug opacity-60">{plan.brandbook ? `Från ${plan.brandbook.name || "er grafiska profil"}.` : "Ladda upp er grafiska profil så använder vi era färger."}</p>
      {swatches.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {swatches.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-pressed={color.toUpperCase() === c.hex}
              aria-label={`${c.name} ${c.hex}`}
              title={c.name}
              onClick={() => update((p) => ({ ...p, color: c.hex }))}
              className={`h-10 w-10 rounded-full border border-black/10 transition-transform hover:scale-110 ${color.toUpperCase() === c.hex ? "ring-2 ring-[var(--shop)] ring-offset-2" : ""}`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      ) : null}
      <input ref={file} type="file" accept="application/pdf" className="sr-only" aria-label="Välj grafisk profil (PDF)" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      <button type="button" disabled={busy} onClick={() => file.current?.click()} className="mt-3 inline-flex h-10 items-center rounded-full border border-[var(--shop)] bg-white px-4 text-[13.5px] font-semibold disabled:opacity-50">
        {busy ? "Läser profilen…" : plan.brandbook ? "Byt grafisk profil" : "Ladda upp grafisk profil (PDF)"}
      </button>
      {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}

/** Tillfällets scen. Med kundens logga ritas den om av AI; samma logga och tillfälle hämtas direkt ur cachen. */
function Scene({ slug, o, logo, color }: { slug: string; o: Occasion; logo: { light: string; name: string }; color: string }) {
  const [plan, update] = usePlan(slug);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const made = `${o.id}|${logo.light}|${color}`;
  const branded = plan.scene?.for === made ? plan.scene.url : null;
  const body = { occasion: o.id, logo: logo.light, name: logo.name, color };

  useEffect(() => {
    if (branded) return;
    let live = true;
    call<{ image: string | null }>("/api/v1/newwave/scene", { ...body, cachedOnly: true })
      .then(({ image }) => {
        if (live && image) update((p) => ({ ...p, scene: { for: made, url: image } }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // `made` täcker allt i `body`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made, branded, update]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, o.stages.length - 1)), 9000);
    return () => clearInterval(t);
  }, [busy, o.stages.length]);

  const render = async () => {
    setBusy(true);
    setStage(0);
    setError("");
    try {
      const { image } = await call<{ image: string | null }>("/api/v1/newwave/scene", body);
      if (image) update((p) => ({ ...p, scene: { for: made, url: image } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa bilden");
    } finally {
      setBusy(false);
    }
  };

  return (
    <figure className="relative overflow-hidden rounded-[28px] bg-[#F4F4F2]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img key={branded ?? o.scene} src={branded ?? o.scene} alt={branded ? `${o.title} med ${logo.name || "er logga"}` : o.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="block aspect-[3/2] w-full object-cover" />
      </AnimatePresence>
      {branded ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/60 via-black/10 to-transparent p-5 text-center text-white sm:p-8">
          {busy ? (
            <>
              <span className="h-1 w-40 overflow-hidden rounded-full bg-white/25">
                <motion.span className="block h-full w-1/3 rounded-full bg-white" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }} />
              </span>
              <AnimatePresence mode="wait">
                <motion.p key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3 text-[15px] font-semibold">
                  {o.stages[stage]}
                </motion.p>
              </AnimatePresence>
              <p className="mt-1 text-[12.5px] opacity-75">Det tar ungefär en minut.</p>
            </>
          ) : (
            <>
              <p className="max-w-[440px] text-[14px] leading-snug opacity-90">Så här kan det se ut. Vi sätter er logga och färg på allt i bilden.</p>
              <button type="button" onClick={render} className="mt-3 inline-flex h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#1D1D1F] transition-transform hover:scale-[1.03]">
                Visa med er logga
              </button>
              {error ? <p className="mt-2 rounded-full bg-black/50 px-3 py-1 text-[12.5px]">{error}</p> : null}
            </>
          )}
        </div>
      )}
    </figure>
  );
}

function Item({ p, item, logo, color, markup, onChange }: { p: NwProduct; item: PlanItem; logo: { light: string; dark: string; name: string }; color: string; markup: number; onChange: (fn: (i: PlanItem) => PlanItem) => void }) {
  const [sizing, setSizing] = useState(false);
  const sizes = item.sizes ?? splitSizes(p, item.qty);
  const design = item.design ?? defaultDesign(p);
  const garment = item.color ?? p.garmentHex;
  const line = priceLine({ productId: p.id, sizes, design, color: garment, logo: logo.light, logoDark: logo.dark }, markup);
  const multi = p.sizes.length > 1;
  const setQty = (qty: number) => onChange((i) => ({ ...i, qty: Math.max(0, Math.min(9999, Math.round(qty) || 0)), sizes: undefined }));

  const studioPrice = (d: typeof design, units: number): [string, string][] => {
    const l = priceLine({ productId: p.id, sizes: item.qty ? sizes : { [p.sizes[0]]: Math.max(units, MIN_QTY) }, design: d, color: garment, logo: logo.light, logoDark: logo.dark }, markup);
    return l ? [[`${l.qty} st`, `${sek(l.unit)}/st`], ["Totalt exkl. moms", sek(l.total)]] : [];
  };
  const saved = (s: Saved) => onChange((i) => ({ ...i, design: s.design, color: s.color, preview: s.mockupUrl, proofs: s.proofs, off: false }));

  return (
    <li className={`min-w-0 rounded-[24px] border border-[var(--shop-line)] bg-white p-2.5 transition-opacity ${item.off ? "opacity-45" : ""}`}>
      <StudioButton productId={p.id} art={{ light: logo.light, dark: logo.dark, label: "er logga" }} initial={design} color={garment} brandColor={color || undefined} qty={line?.qty || undefined} price={studioPrice} onSaved={saved} saveLabel="Använd designen" label="Designa i 3D" className="group relative block w-full overflow-hidden rounded-[18px] text-left focus-visible:outline-2 focus-visible:outline-[var(--shop)]">
        <LineMock line={{ productId: p.id, design, logo: logo.light, logoDark: logo.dark, preview: item.preview }} />
      </StudioButton>
      <div className="px-1.5 pb-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{p.name}</p>
            <p className="text-[12.5px] opacity-60">{line && line.qty ? `${sek(line.unit)}/st · ${sek(line.total)}` : "Välj antal"}</p>
          </div>
          <button type="button" onClick={() => onChange((i) => ({ ...i, off: !i.off }))} className="nw-hit shrink-0 text-[12.5px] font-medium underline underline-offset-4 opacity-70 hover:opacity-100">
            {item.off ? "Ta med" : "Ta bort"}
          </button>
        </div>
        {item.off ? null : (
          <>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-10 items-center rounded-full border border-[var(--shop-line)]">
                <button type="button" aria-label={`Färre ${p.name}`} onClick={() => setQty(item.qty - (item.qty > 50 ? 10 : 5))} className="grid h-10 w-10 place-items-center text-[18px] opacity-70 hover:opacity-100">
                  −
                </button>
                <input type="number" inputMode="numeric" min={0} max={9999} value={line?.qty ?? item.qty} aria-label={`Antal ${p.name}`} onChange={(e) => setQty(Number(e.target.value))} className="h-10 w-14 bg-transparent text-center text-[15px] font-semibold outline-none" />
                <button type="button" aria-label={`Fler ${p.name}`} onClick={() => setQty(item.qty + (item.qty >= 50 ? 10 : 5))} className="grid h-10 w-10 place-items-center text-[18px] opacity-70 hover:opacity-100">
                  +
                </button>
              </div>
              {multi ? (
                <button type="button" aria-expanded={sizing} onClick={() => setSizing((v) => !v)} className="nw-hit min-w-0 truncate text-left text-[12.5px] opacity-65 hover:opacity-100">
                  {Object.entries(sizes)
                    .map(([s, n]) => `${s} ${n}`)
                    .join(" · ")}
                </button>
              ) : null}
            </div>
            {multi && sizing ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {p.sizes.map((s) => (
                  <label key={s} className="block min-w-0">
                    <span className="block text-center text-[11px] font-medium opacity-60">{s}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={9999}
                      value={sizes[s] || ""}
                      placeholder="0"
                      onChange={(e) =>
                        onChange((i) => {
                          const next = { ...(i.sizes ?? splitSizes(p, i.qty)), [s]: Math.max(0, Math.min(9999, Math.round(Number(e.target.value) || 0))) };
                          return { ...i, sizes: next, qty: Object.values(next).reduce((a, b) => a + b, 0) };
                        })
                      }
                      className="mt-0.5 h-9 w-full rounded-lg border border-[var(--shop-line)] text-center text-[13.5px] font-semibold outline-none focus:border-[var(--shop)]"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

function Step({ n, title, id, children }: { n: number; title: string; id?: string; children: React.ReactNode }) {
  return (
    <motion.section id={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mt-10 scroll-mt-24">
      <h2 className="mb-4 flex items-center gap-2.5 text-[17px] font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--shop)] text-[12.5px] font-bold text-[var(--shop-on)]">{n}</span>
        {title}
      </h2>
      {children}
    </motion.section>
  );
}
