"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoothItem, BoothResult } from "@/lib/demoBooth";
import {
  ALL_PRODUCTS,
  BOOTH_PRODUCTS,
  BRANDS,
  DEFAULT_PROMOS,
  EVENTS,
  type EventId,
  PLACEHOLDER_BOOTH,
  lineTotal,
  MAX_QTY,
  PROMO_PRODUCTS,
  type Product,
  sek,
  sumSek,
} from "@/lib/demoCatalog";
import type { SiteAnalysis } from "@/lib/demoSiteCache";
import type { LogoResult } from "@/lib/logo";
import { BoothStage, type Hotspot, type Phase } from "./BoothStage";
import { type Line, ProductDrawer, ProductVisual } from "./ProductDrawer";
import { type OfferLine, PrintOffer } from "./PrintOffer";
import { BrandMark, Header, Icons, PlusBadge, Primary, Secondary, StepDots, Stepper } from "./parts";
import { TailorCard } from "./TailorCard";
import { useMockups } from "./useMockups";

type Stage = "landing" | "brand" | "fill" | "view" | "summary" | "thanks";
type Booth = BoothResult & { items: BoothItem[] };

const TITLES: Record<EventId, string> = {
  massa: "Skapa din mässmonter",
  konferens: "Skapa din konferensmonter",
  kickoff: "Skapa din kick-off-monter",
  event: "Skapa din eventmonter",
};
const COLOR_NAMES: Record<string, string> = { "#1D1D1F": "Svart", "#FFFFFF": "Vit", "#9A9AA0": "Grå", "#1F3B73": "Marinblå" };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
  return json as T;
}

const SUFFIXES = new Set(["com", "net", "org", "co", "se", "nu", "io", "eu", "app", "ai", "biz", "info"]);
/** "open.spotify.com" → "spotify", "volvocars.co.uk" → "volvocars". */
const domainName = (site: string) => {
  const labels = site.toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].split(".").filter(Boolean);
  while (labels.length > 1 && (SUFFIXES.has(labels[labels.length - 1]) || labels[labels.length - 1].length <= 2)) labels.pop();
  return labels[labels.length - 1] ?? "";
};

const GENERIC =
  /^(home|hem|start|startsida|welcome|välkommen|official site|officiell webbplats|shop|store|butik|online|homepage|index|global|international|europe|españa|espana|spain|sverige|sweden|svenska|english|deutsch|deutschland|france|français|italia|nederland|norge|norway|danmark|denmark|suomi|finland|polska|united kingdom|uk|usa|us|404|not found|just a moment\.*|access denied)$/i;

/** Page titles are often generic or localised ("España"), so only trust them when they resemble the domain. */
const shortName = (raw: string, site: string) => {
  const host = domainName(site);
  const first = raw.replace(/["“”<>\r\n\t]/g, " ").split(/\s+[|–—:-]\s+|\s*\|\s*|\s{2,}/)[0].trim();
  const key = first.toLowerCase().replace(/[^a-z0-9]/g, "");
  const resembles = key.length >= 2 && (host.includes(key.slice(0, 4)) || key.includes(host.slice(0, 4)));
  const name = first.length > 1 && first.length <= 32 && !GENERIC.test(first) && resembles ? first : host;
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Ditt företag";
};

const tileName = (site: string) => BRANDS.find((b) => domainName(b.url) === domainName(site))?.name;

const newLine = (p: Product): Line => ({ qty: p.defaultQty, model: p.models[0].id, color: "", style: p.styles[0] });
const initialLines = (): Record<string, Line> =>
  Object.fromEntries([...BOOTH_PRODUCTS, ...PROMO_PRODUCTS.filter((p) => DEFAULT_PROMOS.includes(p.id))].map((p) => [p.id, newLine(p)]));

/** Keeps the booth choices and swaps the promo products for the ones recommended for this company. */
const withMerch = (ls: Record<string, Line>, ids: string[]) => {
  const next = Object.fromEntries(Object.entries(ls).filter(([id]) => BOOTH_PRODUCTS.some((p) => p.id === id)));
  for (const p of PROMO_PRODUCTS) if (ids.includes(p.id)) next[p.id] = newLine(p);
  return next;
};

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col px-6 py-8 sm:px-10 lg:py-12 ${className}`}>{children}</div>;
}

function StepTop({ step, label, onBack, onStep }: { step: 1 | 2 | 3; label: string; onBack: () => void; onStep: (s: 1 | 2 | 3) => void }) {
  return (
    <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-5 sm:px-8">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[14px] font-medium text-[#1D1D1F] hover:opacity-70">
        {Icons.back} Tillbaka
      </button>
      <div className="flex items-center gap-4">
        <p className="hidden text-[13px] text-[#6E6E73] sm:block">{label}</p>
        <StepDots step={step} onStep={onStep} />
      </div>
    </div>
  );
}

function ProductCard({ product, line, mockups, boothFor, onOpen, arrow }: { product: Product; line?: Line; mockups: Record<string, string>; boothFor: (p: Product) => string; onOpen: () => void; arrow?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative w-[168px] shrink-0 overflow-hidden rounded-2xl border bg-white text-left transition hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] lg:w-auto ${line && !arrow ? "border-[#2563EB]/60" : "border-black/[0.07]"}`}
    >
      <ProductVisual product={product} model={line?.model ?? product.models[0].id} mockups={mockups} boothFor={boothFor} className="transition duration-500 group-hover:scale-[1.03]" />
      <span className="absolute right-2.5 top-2.5">{arrow ? null : <PlusBadge on={Boolean(line)} />}</span>
      <span className="flex items-end justify-between gap-2 px-3 pb-3 pt-2">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{product.name}</span>
          <span className="block truncate text-[11px] text-[#6E6E73]">{product.blurb}</span>
        </span>
        {arrow && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10">{Icons.arrow}</span>}
      </span>
    </button>
  );
}

function ProductRow({ children }: { children: ReactNode }) {
  return <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-0">{children}</div>;
}

function InfoCards({ items }: { items: [ReactNode, string, string][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([icon, title, text]) => (
        <div key={title} className="flex items-start gap-4 rounded-2xl border border-black/[0.06] bg-white p-5">
          <span className="text-[#1D1D1F]">{icon}</span>
          <div>
            <p className="text-[14px] font-semibold">{title}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-[#6E6E73]">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoothDemo() {
  const [stage, setStage] = useState<Stage>("landing");
  const [event, setEvent] = useState<EventId>("massa");
  const [url, setUrl] = useState("");
  const [logo, setLogo] = useState<LogoResult | null>(null);
  const [brandName, setBrandName] = useState("");
  const [phase, setPhase] = useState<Phase | null>(null);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boothNote, setBoothNote] = useState<string | null>(null);
  const [booth, setBooth] = useState<Booth | null>(null);
  const [lines, setLines] = useState<Record<string, Line>>(initialLines);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [quote, setQuote] = useState<{ reference: string; date: Date } | null>(null);
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const run = useRef(0);
  const mockups = useMockups(logo);

  const brandColor = booth?.color ?? logo?.color ?? "#1D1D1F";
  const name = brandName || "ditt varumärke";
  const boothItems = BOOTH_PRODUCTS.filter((p) => lines[p.id]).map((p) => p.booth!);
  const boothFor = useCallback((p: Product) => (booth && p.booth && booth.items.includes(p.booth) ? booth.url : PLACEHOLDER_BOOTH), [booth]);
  const boothUrl = booth?.url ?? PLACEHOLDER_BOOTH;
  const stale = Boolean(booth) && (booth!.items.length !== boothItems.length || boothItems.some((i) => !booth!.items.includes(i)));

  /** Each step is a history entry, so the browser back button moves between steps instead of leaving the demo. */
  const go = (s: Stage, replace = false) => {
    setStage(s);
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, demoStage: s }, "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** A failed booth (no API key, rate limit, model error) never blocks the flow: the neutral booth stays usable. */
  const buildBooth = async (l: LogoResult, nm: string, items: BoothItem[], id: number, a: SiteAnalysis | null) => {
    setPhase("booth");
    setBoothNote(null);
    try {
      const b = await post<BoothResult>("/api/v1/demo/booth", {
        name: nm || l.site || "Ditt företag",
        site: l.site,
        color: l.color,
        light: l.light,
        products: items,
        ...(a && a.host === l.site ? { analysisId: a.id } : {}),
      });
      if (run.current === id) setBooth({ ...b, items });
    } catch (e) {
      if (run.current === id) setBoothNote(e instanceof Error ? e.message : String(e));
    } finally {
      if (run.current === id) setPhase(null);
    }
  };

  const start = async (raw: string, knownName?: string) => {
    const value = raw.trim();
    if (value.length < 3) return setError("Ange en webbadress, till exempel volvocars.com");
    const id = ++run.current;
    setUrl(value);
    setError(null);
    setBoothNote(null);
    setLogo(null);
    setBooth(null);
    setAnalysis(null);
    setBrandName(knownName ?? "");
    setPhase("logo");
    let l: LogoResult;
    try {
      l = await post<LogoResult>("/api/v1/logo", { url: value });
    } catch (e) {
      if (run.current !== id) return;
      setPhase(null);
      return setError(e instanceof Error ? e.message : String(e));
    }
    if (run.current !== id) return;
    const known = knownName ?? tileName(value) ?? tileName(l.site);
    setBrandName(known ?? shortName(l.name, l.site));

    /** The deep read is a bonus: if it fails the booth is still built from logo and colours alone. */
    let a: SiteAnalysis | null = null;
    if (l.site) {
      setPhase("site");
      a = await post<SiteAnalysis>("/api/v1/demo/analyze", { site: l.site, light: l.light }).catch(() => null);
      if (run.current !== id) return;
    }
    if (a?.logo.result) l = a.logo.result;
    const nm = known ?? (a?.brandName || shortName(l.name, l.site));
    setAnalysis(a);
    setLogo(l);
    setBrandName(nm);
    if (a) setLines((ls) => withMerch(ls, a.merch.map((m) => m.id)));
    await buildBooth(l, nm, boothItems, id, a);
  };

  const rebuild = () => {
    if (logo) buildBooth(logo, brandName, boothItems, ++run.current, analysis);
  };

  useEffect(() => {
    const onPop = (e: PopStateEvent) => setStage((e.state?.demoStage as Stage | undefined) ?? "landing");
    window.addEventListener("popstate", onPop);
    const q = new URLSearchParams(window.location.search);
    const site = q.get("site")?.slice(0, 200);
    const ev = q.get("event") as EventId | null;
    const t = setTimeout(() => {
      if (ev && EVENTS.some((e) => e.id === ev)) setEvent(ev);
      if (site) {
        go("brand", true);
        start(site, tileName(site));
      }
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("popstate", onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (p: Product) =>
    setLines((ls) => {
      const next = { ...ls };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = newLine(p);
      return next;
    });

  const setQty = (id: string, qty: number) =>
    setLines((ls) => (ls[id] ? { ...ls, [id]: { ...ls[id], qty: Math.min(MAX_QTY, Math.max(1, Math.round(qty) || 1)) } } : ls));

  const offer: OfferLine[] = useMemo(
    () =>
      ALL_PRODUCTS.filter((p) => lines[p.id]).map((p) => {
        const l = lines[p.id];
        const m = p.models.find((x) => x.id === l.model) ?? p.models[0];
        const color = !l.color || l.color.toLowerCase() === brandColor.toLowerCase() ? "varumärkesfärg" : (COLOR_NAMES[l.color] ?? l.color).toLowerCase();
        return {
          id: p.id,
          model: m.id,
          name: p.name,
          spec: m.id === p.models[0].id ? p.spec : m.name,
          variant: `${l.style}, ${color}`,
          qty: l.qty,
          unitSek: m.priceSek,
          totalSek: lineTotal(l.qty, m.priceSek),
          unit: p.unit,
          thumb: <ProductVisual product={p} model={l.model} mockups={mockups} boothFor={boothFor} aspect={1} />,
        };
      }),
    [lines, mockups, boothFor, brandColor],
  );
  const total = sumSek(offer.map((l) => l.totalSek));
  const count = offer.length;

  const spots: Hotspot[] = ALL_PRODUCTS.filter((p) => p.spot && (!p.booth || !booth || booth.items.includes(p.booth))).map((p) => ({
    id: p.id,
    x: p.spot!.x,
    y: p.spot!.y,
    label: p.name,
    added: Boolean(lines[p.id]),
  }));

  const requestQuote = async () => {
    setSending(true);
    try {
      const r = await post<{ reference: string; createdAt: string }>("/api/v1/demo/quote", {
        brand: { name: brandName || "Okänt varumärke", site: logo?.site ?? "" },
        event: EVENTS.find((e) => e.id === event)!.label,
        boothUrl: booth?.url,
        totalSek: total,
        lines: offer.map((l) => ({ id: l.id, model: l.model, qty: l.qty })),
      });
      setQuote({ reference: r.reference, date: new Date(r.createdAt) });
      go("thanks");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Kunde inte skicka förfrågan");
    } finally {
      setSending(false);
    }
  };

  const share = async () => {
    const link = `${window.location.origin}/demo?site=${encodeURIComponent(logo?.site || url)}&event=${event}`;
    try {
      await navigator.clipboard.writeText(link);
      setToast("Länken är kopierad");
    } catch {
      setToast(link);
    }
  };

  const openQuote = () => go(logo ? "summary" : "brand");
  const onStep = (s: 1 | 2 | 3) => go(s === 1 ? "brand" : s === 2 ? "fill" : "view");
  /** History entries can point at steps whose data is gone (e.g. after a reload); fall back to step 1. */
  const shown: Stage = (!logo && (stage === "fill" || stage === "view" || stage === "summary")) || (stage === "thanks" && !quote) ? "brand" : stage;
  const drawerProduct = ALL_PRODUCTS.find((p) => p.id === drawer);
  const loading = phase ? { phase, name, industry: analysis?.industry ?? "" } : null;
  const eventLabel = EVENTS.find((e) => e.id === event)!.label;

  return (
    <>
      <div className="min-h-screen bg-[#F5F5F7] print:hidden">
        <Header
          logo={logo?.light ?? null}
          name={name}
          event={event}
          cartCount={logo ? count : 0}
          onHome={() => go("landing")}
          onEvent={(e) => {
            setEvent(e);
            if (shown === "landing" || shown === "thanks") go("brand");
          }}
          onQuote={openQuote}
        />

        {shown === "landing" && (
          <section className="relative isolate overflow-hidden bg-[#111]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/hero.jpg" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.45)_40%,rgba(0,0,0,0.05)_75%),linear-gradient(0deg,rgba(0,0,0,0.6)_0%,transparent_40%)]" />
            <div className="mx-auto flex min-h-[calc(100svh-64px)] max-w-[1440px] flex-col justify-between px-5 pb-8 pt-16 sm:px-8 lg:pt-24">
              <div className="max-w-[560px] text-white">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/80">Profilprodukter och exponering</p>
                <h1 className="mt-4 text-[44px] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-[60px]">Gör ett varumärke synligt på riktigt</h1>
                <p className="mt-5 max-w-[480px] text-[17px] leading-relaxed text-white/85">
                  Vi hjälper dig att skapa minnesvärda upplevelser med skräddarsydda profilprodukter, mässmontrar och exponering som stärker ditt varumärke – både online och på plats.
                </p>
                <Primary className="mt-8 bg-white !text-[#1D1D1F] hover:!bg-white/90" onClick={() => go("brand")}>
                  Skapa din monter {Icons.arrow}
                </Primary>
              </div>
              <div className="mt-14 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {EVENTS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setEvent(e.id);
                      go("brand");
                    }}
                    className={`group relative aspect-[4/3] overflow-hidden rounded-2xl text-left transition sm:aspect-[16/10] ${e.id === "massa" ? "ring-2 ring-white" : "ring-1 ring-white/15"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 text-white sm:inset-x-4 sm:bottom-4">
                      <span className="min-w-0">
                        <span className="block text-[17px] font-semibold sm:text-[20px]">{e.label}</span>
                        <span className="mt-0.5 hidden text-[12px] leading-snug text-white/80 sm:block">{e.blurb}</span>
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#1D1D1F] transition group-hover:translate-x-0.5 sm:h-9 sm:w-9">{Icons.arrow}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {shown === "brand" && (
          <main className="mx-auto grid max-w-[1440px] bg-white lg:grid-cols-[400px_1fr]">
            <Panel>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E6E73]">Steg 1 av 3</p>
                <StepDots step={1} />
              </div>
              <h1 className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.025em]">{TITLES[event]}</h1>
              <p className="mt-4 text-[15px] leading-relaxed text-[#424245]">
                Ange din webbadress så hämtar vi din logga och färger och skapar en färdig, varumärkesanpassad mässmonter med passande produkter.
              </p>
              <form
                className="mt-8"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  start(url);
                }}
              >
                <label htmlFor="demo-url" className="text-[13px] font-semibold">
                  Din webbadress
                </label>
                <div className="mt-2 flex h-12 items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 focus-within:border-[#2563EB] focus-within:ring-4 focus-within:ring-[#2563EB]/10">
                  <span className="text-[#86868B]">{Icons.globe}</span>
                  <input
                    id="demo-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="www.dittforetag.se"
                    autoComplete="url"
                    className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#AEAEB2]"
                  />
                  {url && (
                    <button type="button" onClick={() => setUrl("")} aria-label="Rensa" className="text-[#86868B] hover:text-[#1D1D1F]">
                      {Icons.close}
                    </button>
                  )}
                </div>
                <Primary type="submit" className="mt-3 w-full" loading={phase !== null}>
                  {phase ? (phase === "logo" ? "Läser webbplatsen…" : phase === "site" ? "Hittar produkter och tjänster…" : "Bygger montern…") : "Skapa min monter"} {!phase && Icons.arrow}
                </Primary>
              </form>
              {error && <p className="mt-3 rounded-xl bg-[#FDECEC] px-4 py-3 text-[13px] text-[#B42318]">{error}</p>}

              {logo && !phase && (booth || boothNote) ? (
                <div className="ifk-pop mt-6 rounded-2xl border border-black/[0.06] bg-[#F5F5F7] p-5">
                  {booth && (
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1D8A4E] text-white">{Icons.check}</span>
                      <div>
                        <p className="text-[14px] font-semibold">Montern för {name} är klar</p>
                        <p className="text-[12px] text-[#6E6E73]">
                          {booth.cached ? "Hämtad från tidigare bygge" : analysis ? `Anpassad för ${analysis.industry.toLowerCase() || "er bransch"}` : "Logga och färger är applicerade"}
                        </p>
                      </div>
                    </div>
                  )}
                  {boothNote && (
                    <div className={booth ? "mt-4" : ""} role="status">
                      <p className="text-[14px] font-semibold">{booth ? "Kunde inte bygga om montern" : `Vi visar en neutral monter för ${name}`}</p>
                      <p className="mt-1 text-[12px] leading-snug text-[#6E6E73]">{boothNote}</p>
                      <Secondary className="mt-3 h-10 w-full" onClick={rebuild}>
                        Försök igen
                      </Secondary>
                    </div>
                  )}
                  {booth && stale && !boothNote && (
                    <Secondary className="mt-4 h-10 w-full" onClick={rebuild}>
                      Bygg om med valda monterprodukter
                    </Secondary>
                  )}
                  <Primary className="mt-3 w-full" onClick={() => go("fill")}>
                    Fyll montern med produkter {Icons.arrow}
                  </Primary>
                  {analysis && <TailorCard analysis={analysis} />}
                </div>
              ) : (
                <>
                  <div className="my-6 flex items-center gap-3 text-[12px] text-[#86868B]">
                    <span className="h-px flex-1 bg-black/10" /> eller <span className="h-px flex-1 bg-black/10" />
                  </div>
                  <p className="text-[13px] font-semibold">Testa med ett känt varumärke</p>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {BRANDS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        disabled={phase !== null}
                        onClick={() => start(b.url, b.name)}
                        className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-white transition hover:border-black/25 disabled:opacity-60 ${url === b.url ? "border-[#2563EB] ring-2 ring-[#2563EB]/15" : "border-black/10"}`}
                        title={b.url}
                      >
                        <BrandMark id={b.id} name={b.name} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Panel>

            <div className="min-w-0 border-l border-black/[0.06] bg-[#F5F5F7]">
              <BoothStage src={boothUrl} alt={booth ? `Mässmonter för ${name}` : "Mässmonter med plats för din logga"} loading={loading} className="aspect-[3/2] w-full" />
              <div className="px-5 py-6 sm:px-8">
                <h2 className="text-[17px] font-semibold">Välj produkter till din monter</h2>
                <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
                  {BOOTH_PRODUCTS.map((p) => {
                    const on = Boolean(lines[p.id]);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(p)}
                        aria-pressed={on}
                        className={`relative w-[150px] shrink-0 overflow-hidden rounded-2xl border-2 bg-white text-left transition lg:w-auto ${on ? "border-[#2563EB]" : "border-transparent ring-1 ring-black/[0.07] hover:ring-black/20"}`}
                      >
                        <ProductVisual product={p} model={p.models[0].id} mockups={mockups} boothFor={boothFor} className={on ? "" : "opacity-60 grayscale-[40%]"} />
                        <span className="absolute right-2.5 top-2.5">
                          <PlusBadge on={on} />
                        </span>
                        <span className="block px-3 py-2.5 text-center text-[13px] font-medium">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </main>
        )}

        {shown === "fill" && (
          <main className="mx-auto max-w-[1440px] bg-white">
            <div className="grid lg:grid-cols-[360px_1fr]">
              <Panel>
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E6E73]">Steg 2 av 3</p>
                  <StepDots step={2} onStep={onStep} />
                </div>
                <h1 className="mt-6 text-[38px] font-semibold leading-[1.04] tracking-[-0.025em]">Fyll montern med produkter</h1>
                <p className="mt-4 text-[15px] leading-relaxed text-[#424245]">
                  Välj produkter som visas i din monter. Klicka på produkterna i bilden eller välj i listan nedan. Allt brandas automatiskt med din logga och färger.
                </p>
                <div className="mt-6 flex gap-3 rounded-2xl bg-[#EEF4FF] p-4 text-[13px] leading-snug text-[#1E3A8A]">
                  <span className="mt-0.5">{Icons.bulb}</span>
                  Produkterna placeras automatiskt i montern och visas med din design.
                </div>
                <div className="mt-8 space-y-2 lg:mt-auto">
                  {!booth && boothNote && <p className="text-[12px] leading-snug text-[#6E6E73]">Montern visas utan din logga just nu. Produkterna är ändå brandade.</p>}
                  <Primary className="w-full" onClick={() => go("view")}>
                    Se din monter {Icons.arrow}
                  </Primary>
                  <Secondary className="w-full" onClick={() => go("brand")}>
                    Tillbaka
                  </Secondary>
                </div>
              </Panel>
              <BoothStage src={boothUrl} alt={`Mässmonter för ${name}`} spots={spots} onSpot={setDrawer} loading={loading} className="aspect-[3/2] w-full" />
            </div>
            <div className="border-t border-black/[0.06] bg-[#F5F5F7] px-5 py-7 sm:px-8">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold">{showAll ? "Alla produkter" : "Utvalda produkter"}</h2>
                <button type="button" onClick={() => setShowAll((s) => !s)} className="flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70">
                  {showAll ? "Visa utvalda" : "Visa alla produkter"} {Icons.arrow}
                </button>
              </div>
              <div className="mt-4">
                <ProductRow>
                  {(showAll ? ALL_PRODUCTS : PROMO_PRODUCTS).map((p) => (
                    <ProductCard key={p.id} product={p} line={lines[p.id]} mockups={mockups} boothFor={boothFor} onOpen={() => setDrawer(p.id)} />
                  ))}
                </ProductRow>
              </div>
            </div>
          </main>
        )}

        {shown === "view" && (
          <main className="bg-white">
            <StepTop step={3} label="Steg 3 av 3 – Färdig monter" onBack={() => go("fill")} onStep={onStep} />
            <div className="relative mx-auto max-w-[1440px]">
              <BoothStage src={boothUrl} alt={`Mässmonter för ${name}`} spots={spots.filter((s) => s.x > 36)} onSpot={setDrawer} className="aspect-[3/2] w-full">
                <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[46%] bg-[linear-gradient(90deg,rgba(0,0,0,0.62),rgba(0,0,0,0.25)_70%,transparent)] md:block" />
                <div className="absolute left-10 top-10 z-[6] hidden max-w-[360px] text-white md:block lg:top-16">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/80">Din mässmonter</p>
                  <h1 className="mt-3 text-[40px] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-[52px]">Så ser din monter ut</h1>
                  <p className="mt-4 text-[15px] leading-relaxed text-white/85">
                    Alla produkter är brandade med din logga och färger. Klicka på valfri produkt i montern för att se fler alternativ, färger och antal.
                  </p>
                  <div className="mt-6 flex flex-col gap-2 sm:w-[280px]">
                    <button type="button" onClick={() => go("fill")} className="flex h-11 items-center gap-2.5 rounded-xl bg-white px-4 text-[14px] font-medium text-[#1D1D1F] hover:bg-white/90">
                      {Icons.pencil} Ändra monterprodukter
                    </button>
                    <button type="button" onClick={() => go("brand")} className="flex h-11 items-center gap-2.5 rounded-xl bg-white/15 px-4 text-[14px] font-medium text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/25">
                      {Icons.palette} Ändra varumärke & färger
                    </button>
                  </div>
                </div>
              </BoothStage>
              <div className="px-5 pt-6 md:hidden">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6E6E73]">Din mässmonter</p>
                <h1 className="mt-2 text-[34px] font-semibold leading-[1.04] tracking-[-0.025em]">Så ser din monter ut</h1>
                <p className="mt-3 text-[15px] leading-relaxed text-[#424245]">Alla produkter är brandade med din logga och färger. Tryck på en produkt i montern för fler alternativ.</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Secondary className="h-11 px-3 text-[13px]" onClick={() => go("fill")}>
                    {Icons.pencil} Monterprodukter
                  </Secondary>
                  <Secondary className="h-11 px-3 text-[13px]" onClick={() => go("brand")}>
                    {Icons.palette} Varumärke
                  </Secondary>
                </div>
              </div>
              <div className="relative z-10 mx-4 mt-4 rounded-3xl md:-mt-28 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.12)] sm:mx-8 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[17px] font-semibold">Produkter i din monter</h2>
                  <Primary className="h-10" onClick={() => go("summary")}>
                    Se sammanställning {Icons.arrow}
                  </Primary>
                </div>
                <div className="mt-4">
                  <ProductRow>
                    {ALL_PRODUCTS.filter((p) => lines[p.id] && !p.booth).map((p) => (
                      <ProductCard key={p.id} product={p} line={lines[p.id]} mockups={mockups} boothFor={boothFor} onOpen={() => setDrawer(p.id)} arrow />
                    ))}
                  </ProductRow>
                </div>
              </div>
              <div className="h-10" />
            </div>
          </main>
        )}

        {shown === "summary" && (
          <main className="bg-white">
            <StepTop step={3} label="Steg 3 av 3 – Sammanställning" onBack={() => go("view")} onStep={onStep} />
            <div className="mx-auto grid max-w-[1440px] gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1fr_440px]">
              <div className="min-w-0 space-y-4">
                <BoothStage src={boothUrl} alt={`Mässmonter för ${name}`} className="aspect-[3/2] w-full rounded-3xl" />
                <InfoCards
                  items={[
                    [Icons.truck, "Helhetslösning", "Allt du behöver till din mässa på ett ställe."],
                    [Icons.brush, "Varumärkesanpassat", "Alla produkter för din logotyp och färger."],
                    [Icons.headset, "Snabb offert", "Skicka din förfrågan så återkommer vi med pris och leveranstid."],
                  ]}
                />
              </div>
              <aside className="flex min-w-0 flex-col rounded-3xl border border-black/[0.07] bg-white lg:sticky lg:top-20 lg:max-h-[calc(100svh-100px)]">
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div>
                    <h2 className="text-[19px] font-semibold tracking-tight">Din monter – Sammanställning</h2>
                    <p className="mt-0.5 text-[12px] text-[#6E6E73]">Alla produkter är brandade med din logotyp och färger.</p>
                  </div>
                  <button type="button" onClick={() => go("fill")} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/10 px-3 text-[13px] font-medium hover:bg-[#F5F5F7]">
                    {Icons.pencil} Redigera
                  </button>
                </div>
                <ul className="mt-3 flex-1 divide-y divide-black/[0.06] overflow-y-auto px-5">
                  {offer.map((l) => {
                    const p = ALL_PRODUCTS.find((x) => x.id === l.id)!;
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 sm:flex-nowrap">
                        <button type="button" onClick={() => setDrawer(l.id)} className="w-12 shrink-0 overflow-hidden rounded-lg border border-black/[0.06]" aria-label={`Ändra ${l.name}`}>
                          {l.thumb}
                        </button>
                        <div className="min-w-0 flex-1 basis-[calc(100%-60px)] sm:basis-0">
                          <p className="truncate text-[13px] font-semibold">{l.name}</p>
                          <p className="truncate text-[11px] text-[#6E6E73]">{l.spec}</p>
                        </div>
                        <span className="ml-[60px] sm:ml-0">
                          <Stepper size="sm" value={l.qty} step={p.step} onChange={(v) => setQty(l.id, v)} />
                        </span>
                        <div className="ml-auto min-w-[76px] shrink-0 text-right sm:ml-0">
                          <p className="text-[13px] font-semibold tabular-nums">{sek(l.totalSek)}</p>
                          {!p.booth && (
                            <p className="text-[10px] tabular-nums text-[#86868B]">
                              {sek(l.unitSek)}/{l.unit}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {offer.length === 0 && <li className="py-8 text-center text-[13px] text-[#6E6E73]">Inga produkter valda ännu.</li>}
                </ul>
                <div className="border-t border-black/[0.06] p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[14px] font-medium">
                      Totalt <span className="text-[12px] font-normal text-[#6E6E73]">(exkl. moms)</span>
                    </p>
                    <p className="text-[22px] font-semibold tabular-nums">{sek(total)}</p>
                  </div>
                  <Primary className="mt-4 w-full" onClick={requestQuote} loading={sending} disabled={offer.length === 0}>
                    {Icons.doc} Begär offert på hela lösningen {Icons.arrow}
                  </Primary>
                </div>
              </aside>
            </div>
          </main>
        )}

        {shown === "thanks" && quote && (
          <main className="bg-white">
            <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[400px_1fr]">
              <div>
                <span className="ifk-pop flex h-16 w-16 items-center justify-center rounded-full bg-[#E7F6EC] text-[#1D8A4E] [&_svg]:h-8 [&_svg]:w-8">{Icons.check}</span>
                <h1 className="mt-6 text-[44px] font-semibold leading-none tracking-[-0.025em]">Tack!</h1>
                <p className="mt-2 text-[22px] font-semibold tracking-tight">Din offertförfrågan är skickad.</p>
                <p className="mt-4 text-[15px] leading-relaxed text-[#424245]">
                  Vi har mottagit din förfrågan och återkommer inom 1 arbetsdag med en personlig offert med pris, leveranstid och förslag på lösningar.
                </p>
                <dl className="mt-6 space-y-2.5 rounded-2xl border border-black/[0.07] p-5 text-[13px]">
                  <p className="mb-3 text-[14px] font-semibold">Offertförfrågan</p>
                  {[
                    ["Datum", quote.date.toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })],
                    ["Typ av event", eventLabel],
                    ["Antal produkter", `${count} olika produkter`],
                    ["Beräknat totalpris", `${sek(total)} (exkl. moms)`],
                    ["Referens", `#${quote.reference}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-[#6E6E73]">{k}</dt>
                      <dd className="text-right font-medium tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 space-y-2">
                  <a
                    href={`mailto:salj@example.se?subject=${encodeURIComponent(`Offertförfrågan #${quote.reference}`)}`}
                    className="flex h-12 w-full items-center justify-between rounded-xl bg-[#1D1D1F] px-5 text-[15px] font-medium text-white hover:bg-black"
                  >
                    <span className="flex items-center gap-2.5">{Icons.mail} Kontakta säljare</span>
                    {Icons.arrow}
                  </a>
                  <Secondary
                    className="w-full justify-start"
                    onClick={() => {
                      setPrinting(true);
                      setTimeout(() => window.print(), 700);
                    }}
                  >
                    {Icons.download} Ladda ner sammanställning (PDF)
                  </Secondary>
                  <Secondary className="w-full justify-start" onClick={share}>
                    {Icons.link} Dela denna lösning
                  </Secondary>
                </div>
              </div>
              <div className="min-w-0 space-y-4">
                <BoothStage src={boothUrl} alt={`Mässmonter för ${name}`} className="aspect-[3/2] w-full rounded-3xl" />
                <InfoCards
                  items={[
                    [Icons.headset, "Personlig kontakt", "En av våra säljare går igenom din förfrågan och kontaktar dig inom 1 arbetsdag."],
                    [Icons.doc, "Skräddarsydd offert", "Du får en tydlig offert med pris, leveranstid och eventuella förslag på alternativ."],
                    [Icons.truck, "Hjälp hela vägen", "Vi hjälper dig med design, original, produktion och leverans – så att din monter blir precis som du vill."],
                  ]}
                />
              </div>
            </div>
          </main>
        )}
      </div>

      {drawerProduct && (
        <ProductDrawer
          key={drawerProduct.id}
          product={drawerProduct}
          line={lines[drawerProduct.id] ?? null}
          brandColor={brandColor}
          mockups={mockups}
          boothFor={boothFor}
          onClose={() => setDrawer(null)}
          onSave={(line) => {
            setLines((ls) => ({ ...ls, [drawerProduct.id]: line }));
            setDrawer(null);
            setToast(`${drawerProduct.name} finns nu i montern`);
          }}
          onRemove={() => {
            toggle(drawerProduct);
            setDrawer(null);
          }}
        />
      )}

      {printing && quote && (
        <PrintOffer
          brand={{ name: brandName || "Ditt företag", logo: logo?.light ?? null, site: logo?.site ?? "", tagline: analysis?.tagline ?? "", industry: analysis?.industry ?? "" }}
          event={eventLabel}
          date={quote.date}
          reference={quote.reference}
          booth={boothUrl}
          lines={offer}
          total={total}
          onClose={() => setPrinting(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-[#1D1D1F] px-5 py-3 text-[13px] font-medium text-white shadow-lg print:hidden" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
