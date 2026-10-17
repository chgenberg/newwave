"use client";

import Link from "next/link";
import { useRef, useState, ViewTransition } from "react";
import type { Proof } from "@/components/newwave/studio/DesignStudio";
import { type Saved, StudioButton } from "@/components/newwave/studio/StudioButton";
import { nwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import type { LogoResult } from "@/lib/logo";
import { defaultDesign, type Design, designSummary } from "@/lib/newwave/marking";
import { MIN_QTY, priceLine, sek } from "@/lib/newwave/reseller";
import { call, readDataUrl } from "./api";
import { PLACEHOLDER, useCart, type CustomerLogo } from "./cart";
import { LineMock } from "./ProductMock";

const TIERS = [50, 100, 250];

/** Kundens logga: ladda upp eller hämta från webbplatsen. Sparas för hela butiken. */
export function LogoPicker({ slug, compact }: { slug: string; compact?: boolean }) {
  const [cart, update] = useCart(slug);
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const choose = (l: LogoResult) => update((c) => ({ ...c, logo: { light: l.light, dark: l.dark, name: l.name } satisfies CustomerLogo }));

  const run = async (body: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      choose(await call<LogoResult>("/api/v1/logo", body));
      setFetching(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta loggan");
    } finally {
      setBusy(false);
    }
  };

  if (cart.logo && !fetching) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--shop-line)] bg-white p-3">
        <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl bg-[#F4F4F2] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cart.logo.light} alt="Er logga" className="max-h-full max-w-full object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{cart.logo.name || "Er logga"}</p>
          <p className="text-[12.5px] opacity-60">Används på alla produkter</p>
        </div>
        <button type="button" onClick={() => setFetching(true)} className="shrink-0 text-[13px] font-medium underline underline-offset-4">
          Byt
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "rounded-2xl bg-[var(--shop-bg)] p-4"}>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-label="Välj loggfil" onChange={async (e) => e.target.files?.[0] && run({ dataUrl: await readDataUrl(e.target.files[0]), name: e.target.files[0].name.replace(/\.[^.]+$/, "") })} />
      <button
        type="button"
        disabled={busy}
        onClick={() => file.current?.click()}
        className="flex h-12 w-full items-center justify-center rounded-full bg-[var(--shop)] text-[14.5px] font-semibold text-[var(--shop-on)] transition-transform hover:scale-[1.01] disabled:opacity-50"
      >
        {busy ? "Hämtar loggan…" : "Ladda upp er logga"}
      </button>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (site.trim().length > 3) run({ url: site.trim() });
        }}
      >
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="eller hämta från foretaget.se" aria-label="Er webbplats" className="h-11 min-w-0 flex-1 rounded-full border border-[var(--shop-line)] bg-white px-4 text-[14px] outline-none focus:border-[var(--shop)]" />
        <button type="submit" disabled={busy || site.trim().length < 4} className="h-11 shrink-0 rounded-full border border-[var(--shop)] px-4 text-[13.5px] font-semibold disabled:opacity-40">
          Hämta
        </button>
      </form>
      {cart.logo ? (
        <button type="button" onClick={() => setFetching(false)} className="mt-2 text-[12.5px] underline underline-offset-4 opacity-70">
          Behåll nuvarande logga
        </button>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}

export function ProductDesigner({ slug, productId, markup, shopName }: { slug: string; productId: string; markup: number; shopName: string }) {
  const p = nwProduct(productId)!;
  const [cart, update] = useCart(slug);
  const [design, setDesign] = useState<Design>(() => defaultDesign(p));
  const [color, setColor] = useState(p.garmentHex);
  const [preview, setPreview] = useState<string>();
  const [proofs, setProofs] = useState<Proof[]>();
  const [sizes, setSizes] = useState<Record<string, number>>(() => (p.sizes.length === 1 ? { [p.sizes[0]]: 50 } : {}));
  const [added, setAdded] = useState(false);

  const logo = cart.logo ?? PLACEHOLDER;
  const hasLogo = Boolean(cart.logo || design.logo);
  const lineOf = (d: Design, sz: Record<string, number>) => priceLine({ productId: p.id, sizes: sz, design: d, color, logo: logo.light, logoDark: logo.dark }, markup);
  const line = lineOf(design, sizes);
  const qty = line?.qty ?? 0;
  const next = TIERS.find((t) => t > qty);
  const atNext = next ? lineOf(design, { [p.sizes[0]]: next }) : null;
  const kids = p.sizes.filter((s) => s.includes("/"));
  const adults = p.sizes.filter((s) => !s.includes("/"));

  const studioPrice = (d: Design, units: number): [string, string][] => {
    const l = lineOf(d, qty ? sizes : { [p.sizes[0]]: Math.max(units, MIN_QTY) });
    if (!l) return [];
    return [
      [`${l.qty} st`, `${sek(l.unit)}/st`],
      ...(l.setup ? [["Tryckstart", sek(l.setup)] as [string, string]] : []),
      ["Totalt exkl. moms", sek(l.total)],
    ];
  };

  const saved = (s: Saved) => {
    setDesign(s.design);
    setColor(s.color);
    setPreview(s.mockupUrl);
    setProofs(s.proofs);
    setAdded(false);
  };

  const add = () => {
    if (!hasLogo || !line) return;
    const light = cart.logo?.light ?? design.logo!;
    const dark = cart.logo ? cart.logo.dark : design.logoDark;
    update((c) => ({ ...c, lines: [...c.lines, { key: `${p.id}-${Date.now()}`, productId: p.id, sizes: line.sizes, design, color, logo: light, logoDark: dark, preview, proofs }] }));
    setAdded(true);
  };

  const sizeInput = (s: string) => (
    <label key={s} className="block min-w-0">
      <span className="block text-center text-[12px] font-medium opacity-70">{s === "One size" ? "Antal" : s}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={9999}
        value={sizes[s] || ""}
        placeholder="0"
        onChange={(e) => {
          setAdded(false);
          setSizes((cur) => ({ ...cur, [s]: Math.max(0, Math.min(9999, Math.round(Number(e.target.value) || 0))) }));
        }}
        className="mt-1 h-11 w-full rounded-xl border border-[var(--shop-line)] bg-white text-center text-[15px] font-semibold outline-none focus:border-[var(--shop)]"
      />
    </label>
  );

  return (
    <div className={`mx-auto max-w-[1180px] px-5 pt-8 sm:px-8 sm:pt-12 md:pb-12 ${line && qty > 0 ? "pb-28" : "pb-8 sm:pb-12"}`}>
      <p className="text-[13px] opacity-60">
        <Link href={`/newwave/s/${slug}#produkter`} className="hover:opacity-100">
          ← Alla produkter
        </Link>
      </p>
      <div className="mt-4 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 md:sticky md:top-24 md:self-start">
          <StudioButton productId={p.id} art={{ light: logo.light, dark: logo.dark, label: cart.logo ? "er logga" : "exempelloggan" }} initial={design} color={color} qty={qty || undefined} price={studioPrice} onSaved={saved} saveLabel="Använd designen" label="Designa i 3D" className="group relative block w-full overflow-hidden rounded-[28px] bg-[#F4F4F2] text-left focus-visible:outline-2 focus-visible:outline-[var(--shop)]">
            <ViewTransition name={`nw-product-${p.id}`} share="nw-morph">
              <LineMock line={{ productId: p.id, design, logo: logo.light, logoDark: logo.dark, preview }} />
            </ViewTransition>
            {!hasLogo ? <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[12px] font-medium shadow-sm">Ladda upp er logga för att se den här</span> : null}
          </StudioButton>
          {proofs?.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {proofs.map((pr) => (
                <figure key={pr.image} className="w-20 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pr.image} alt={pr.label} className="aspect-square w-full rounded-xl bg-[#F4F4F2] object-cover" />
                  <figcaption className="mt-1 truncate text-[11px] opacity-60">{pr.label}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--shop)] opacity-80">{p.category}</p>
          <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">{p.name}</h1>
          <p className="mt-1 text-[14.5px] opacity-65">
            {p.garmentColor} · passar till {p.use}
          </p>

          <Step n={1} title="Er logga" id="er-logga">
            <LogoPicker slug={slug} />
          </Step>

          <Step n={2} title="Design">
            <div className="rounded-2xl border border-[var(--shop-line)] bg-white p-4">
              <p className="text-[14px] font-semibold">
                {colorName(color)} · {designSummary(p, design)}
              </p>
              <p className="mt-1 text-[13px] leading-snug opacity-65">Välj tryckmetod, placering, storlek och färg i designstudion och se resultatet i 3D. Ni kan lägga till fler tryck och namn per plagg.</p>
              <StudioButton productId={p.id} art={{ light: logo.light, dark: logo.dark, label: cart.logo ? "er logga" : "exempelloggan" }} initial={design} color={color} qty={qty || undefined} price={studioPrice} onSaved={saved} saveLabel="Använd designen" label="Öppna designstudion" className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--shop)] px-5 text-[14px] font-semibold transition-colors hover:bg-[var(--shop)] hover:text-[var(--shop-on)]" />
            </div>
          </Step>

          <Step n={3} title={p.sizes.length > 1 ? "Storlekar och antal" : "Antal"}>
            {kids.length ? (
              <>
                <p className="mb-1.5 text-[12.5px] font-medium opacity-60">Barn</p>
                <div className="mb-3 grid grid-cols-4 gap-2">{kids.map(sizeInput)}</div>
                <p className="mb-1.5 text-[12.5px] font-medium opacity-60">Vuxen</p>
              </>
            ) : null}
            <div className={`grid gap-2 ${adults.length > 1 ? "grid-cols-3 sm:grid-cols-6" : "max-w-[140px] grid-cols-1"}`}>{adults.map(sizeInput)}</div>
          </Step>

          <div className="mt-8 rounded-[24px] bg-[var(--shop-bg)] p-5">
            {line && qty > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[14px] opacity-70">
                    {qty} st × {sek(line.unit)}
                    {line.setup ? ` + tryckstart ${sek(line.setup)}` : ""}
                  </p>
                  <p className="text-[26px] font-bold tracking-tight">{sek(line.total)}</p>
                </div>
                <p className="mt-0.5 text-right text-[12px] opacity-55">exkl. moms, inkl. tryck</p>
                {atNext && next ? (
                  <p className="mt-2 text-[13px] text-[var(--shop)]">
                    Från {next} st blir det {sek(atNext.unit)}/st.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-[14px] opacity-70">Välj antal så räknar vi fram priset direkt.</p>
            )}
            {added ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/newwave/s/${slug}/offert`} className="inline-flex h-12 items-center rounded-full bg-[var(--shop-accent)] px-6 text-[15px] font-semibold text-[var(--shop-on-accent)]">
                  Till varukorgen ({cart.lines.length})
                </Link>
                <Link href={`/newwave/s/${slug}#produkter`} className="inline-flex h-12 items-center rounded-full border border-[var(--shop-line)] bg-white px-5 text-[14px] font-medium">
                  Fortsätt handla
                </Link>
              </div>
            ) : (
              <button
                type="button"
                disabled={!hasLogo || !qty}
                onClick={add}
                className="mt-4 h-12 w-full rounded-full bg-[var(--shop-accent)] text-[15px] font-semibold text-[var(--shop-on-accent)] transition-transform hover:scale-[1.01] disabled:opacity-40"
              >
                {!hasLogo ? "Ladda upp loggan först" : !qty ? "Välj antal" : "Lägg i varukorgen"}
              </button>
            )}
            <p className="mt-3 text-[12px] opacity-55">Beställ direkt i varukorgen, eller be {shopName} om en offert.</p>
          </div>
        </div>
      </div>
      {line && qty > 0 ? (
        <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-full border border-[var(--shop-line)] bg-white/95 p-1.5 pl-5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold leading-tight tracking-tight">{sek(line.total)}</p>
            <p className="truncate text-[11.5px] opacity-60">
              {qty} st · exkl. moms
            </p>
          </div>
          {added ? (
            <Link href={`/newwave/s/${slug}/offert`} className="inline-flex h-11 shrink-0 items-center rounded-full bg-[var(--shop-accent)] px-5 text-[14px] font-semibold text-[var(--shop-on-accent)]">
              Till korgen ({cart.lines.length})
            </Link>
          ) : (
            <button type="button" onClick={hasLogo ? add : () => document.getElementById("er-logga")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="h-11 shrink-0 rounded-full bg-[var(--shop-accent)] px-5 text-[14px] font-semibold text-[var(--shop-on-accent)]">
              {hasLogo ? "Lägg i korgen" : "Ladda upp loggan"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Step({ n, title, id, children }: { n: number; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-7 scroll-mt-24">
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--shop)] text-[12px] font-bold text-[var(--shop-on)]">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
