"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoothItem, BoothResult } from "@/lib/demoBooth";
import { ALL_PRODUCTS, BOOTH_PRODUCTS, BRANDS, DEFAULT_PROMOS, EVENTS, type EventId, PLACEHOLDER_BOOTH, lineTotal, MAX_QTY, PROMO_PRODUCTS, type Product, sek, sumSek } from "@/lib/demoCatalog";
import type { SiteAnalysis } from "@/lib/demoSiteCache";
import type { LogoResult } from "@/lib/logo";
import { BoothStage, type Hotspot, type Phase } from "./BoothStage";
import { type Line, ProductDrawer, ProductVisual } from "./ProductDrawer";
import { type OfferLine, PrintOffer } from "./PrintOffer";
import { Header, Icons, PlusBadge, Primary, Secondary, type Step, Stepper, TextLink } from "./parts";
import { TailorCard } from "./TailorCard";
import { useMockups } from "./useMockups";

type Stage = "start" | "products" | "offer" | "thanks";
type Booth = BoothResult & { items: BoothItem[] };
type Contact = { name: string; email: string; company: string };

const STEP_OF: Record<Stage, Step | null> = { start: 1, products: 2, offer: 3, thanks: null };
const COLOR_NAMES: Record<string, string> = { "#1D1D1F": "Svart", "#FFFFFF": "Vit", "#9A9AA0": "Grå", "#1F3B73": "Marinblå" };

const H1 = "text-[32px] font-semibold leading-[1.08] tracking-[-0.022em] sm:text-[44px]";
const BODY = "text-[15px] leading-relaxed text-[#6E6E73]";
const WRAP = "mx-auto w-full max-w-[1120px] px-5 sm:px-8";

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

/** Steps 2–3 keep the running total and the one next action in view, on every screen size. */
function BottomBar({ count, total, children }: { count: number; total: number; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/90 backdrop-blur-xl print:hidden">
      <div className={`${WRAP} flex items-center justify-between gap-4 py-3`}>
        <p className="min-w-0 text-[13px] leading-tight text-[#6E6E73] sm:text-[15px]">
          {count} {count === 1 ? "produkt" : "produkter"}
          <span className="block font-semibold tabular-nums text-[#1D1D1F] sm:inline">
            <span className="hidden sm:inline"> · </span>Totalt {sek(total)}
          </span>
        </p>
        {children}
      </div>
    </div>
  );
}

function ProductTile({ product, line, recommended, mockups, boothFor, onOpen, onToggle }: { product: Product; line?: Line; recommended: boolean; mockups: Record<string, string>; boothFor: (p: Product) => string; onOpen: () => void; onToggle: () => void }) {
  const on = Boolean(line);
  const from = product.models[0].priceSek;
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white transition ${on ? "ring-2 ring-[#1D1D1F]" : "ring-1 ring-black/[0.08] hover:ring-black/20"}`}>
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`${product.name} – välj modell, färg och antal`}>
        <ProductVisual product={product} model={line?.model ?? product.models[0].id} mockups={mockups} boothFor={boothFor} className="bg-[#F5F5F7]" />
        <span className="block px-3.5 pb-3.5 pt-3">
          <span className="block truncate text-[14px] font-semibold">{product.name}</span>
          <span className="block truncate text-[13px] tabular-nums text-[#6E6E73]">
            {on ? `${line!.qty} ${product.unit} · ${sek(lineTotal(line!.qty, (product.models.find((m) => m.id === line!.model) ?? product.models[0]).priceSek))}` : `Från ${sek(from)}${product.booth ? "" : `/${product.unit}`}`}
          </span>
        </span>
      </button>
      {recommended && <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-[#1D1D1F] shadow-sm">Rekommenderas</span>}
      <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? `Ta bort ${product.name}` : `Lägg till ${product.name}`} className="absolute right-2.5 top-2.5">
        <PlusBadge on={on} />
      </button>
    </div>
  );
}

export function BoothDemo() {
  const [stage, setStage] = useState<Stage>("start");
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
  const [contact, setContact] = useState<Contact>({ name: "", email: "", company: "" });
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
  const recommended = useMemo(() => new Set(analysis ? analysis.merch.map((m) => m.id) : DEFAULT_PROMOS), [analysis]);

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
    setContact((c) => (c.company ? c : { ...c, company: nm }));
    if (a) setLines((ls) => withMerch(ls, a.merch.map((m) => m.id)));
    await buildBooth(l, nm, boothItems, id, a);
  };

  const reset = () => {
    run.current++;
    setPhase(null);
    setLogo(null);
    setBooth(null);
    setAnalysis(null);
    setBoothNote(null);
    setError(null);
    setBrandName("");
    setUrl("");
    setLines(initialLines());
    setContact({ name: "", email: "", company: "" });
    go("start");
  };

  const rebuild = () => {
    if (logo) buildBooth(logo, brandName, boothItems, ++run.current, analysis);
  };

  useEffect(() => {
    const onPop = (e: PopStateEvent) => setStage((e.state?.demoStage as Stage | undefined) ?? "start");
    window.addEventListener("popstate", onPop);
    const q = new URLSearchParams(window.location.search);
    const site = q.get("site")?.slice(0, 200);
    const ev = q.get("event") as EventId | null;
    const t = setTimeout(() => {
      if (ev && EVENTS.some((e) => e.id === ev)) setEvent(ev);
      if (site) {
        go("start", true);
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

  const requestQuote = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!offer.length) return;
    setSending(true);
    try {
      const r = await post<{ reference: string; createdAt: string }>("/api/v1/demo/quote", {
        brand: { name: brandName || "Okänt varumärke", site: logo?.site ?? "" },
        event: EVENTS.find((x) => x.id === event)!.label,
        boothUrl: booth?.url,
        totalSek: total,
        lines: offer.map((l) => ({ id: l.id, model: l.model, qty: l.qty })),
        contact: { name: contact.name.trim(), email: contact.email.trim(), company: contact.company.trim() },
      });
      setQuote({ reference: r.reference, date: new Date(r.createdAt) });
      go("thanks");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Kunde inte skicka förfrågan");
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

  /** History entries can point at steps whose data is gone (e.g. after a reload); fall back to the start. */
  const shown: Stage = (!logo && (stage === "products" || stage === "offer")) || (stage === "thanks" && !quote) ? "start" : stage;
  const drawerProduct = ALL_PRODUCTS.find((p) => p.id === drawer);
  const loading = phase ? { phase, name, industry: analysis?.industry ?? "" } : null;
  const eventLabel = EVENTS.find((e) => e.id === event)!.label;
  const ready = Boolean(logo) && !phase;
  const industry = analysis?.industry?.toLowerCase();

  return (
    <>
      <div className={`min-h-screen bg-white text-[#1D1D1F] print:hidden ${shown === "products" || shown === "offer" ? "pb-28" : ""}`}>
        <Header
          logo={ready ? (logo?.light ?? null) : null}
          name={name}
          step={STEP_OF[shown]}
          reachable={ready ? 3 : 1}
          onStep={(s) => go(s === 1 ? "start" : s === 2 ? "products" : "offer")}
          onHome={() => (ready ? go("start") : reset())}
        />

        {shown === "start" && !phase && !logo && (
          <main className={`${WRAP} grid items-center gap-10 py-12 lg:min-h-[calc(100svh-56px)] lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-16`}>
            <div className="max-w-[460px]">
              <h1 className={H1}>Din mässmonter på en minut</h1>
              <p className={`mt-4 ${BODY}`}>Ange företagets webbadress så bygger vi en monter med er logga, era färger och produkter som passar er bransch.</p>
              <form
                className="mt-8 flex flex-col gap-2.5 sm:flex-row"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  start(url);
                }}
              >
                <label htmlFor="demo-url" className="sr-only">
                  Webbadress
                </label>
                <input
                  id="demo-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="dittforetag.se"
                  autoComplete="url"
                  inputMode="url"
                  className="h-12 w-full min-w-0 rounded-full border sm:flex-1 border-black/15 bg-white px-5 text-[15px] outline-none transition placeholder:text-[#AEAEB2] focus:border-[#1D1D1F]"
                />
                <Primary type="submit">Skapa min monter</Primary>
              </form>
              {error && <p className="mt-3 text-[13px] text-[#B42318]">{error}</p>}
              <p className="mt-5 text-[13px] text-[#6E6E73]">
                eller testa:{" "}
                {BRANDS.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && <span className="px-1.5 text-[#C7C7CC]">·</span>}
                    <button type="button" onClick={() => start(b.url, b.name)} className="font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
                      {b.name}
                    </button>
                  </span>
                ))}
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PLACEHOLDER_BOOTH} alt="Exempel på mässmonter" className="aspect-[3/2] w-full rounded-2xl object-cover" />
          </main>
        )}

        {shown === "start" && (phase || logo) && (
          <main className={`${WRAP} py-8 sm:py-10`}>
            {phase ? (
              <div className="flex items-baseline justify-between gap-4">
                <p className={BODY}>
                  Skapar monter för <span className="font-medium text-[#1D1D1F]">{brandName || url}</span>
                </p>
                <button type="button" onClick={reset} className="text-[13px] text-[#6E6E73] hover:text-[#1D1D1F]">
                  Avbryt
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className={H1}>Montern för {name} är klar</h1>
                  <p className={`mt-2 ${BODY}`}>
                    {booth ? (industry ? `Anpassad för ${industry} utifrån er webbplats.` : "Med er logga och era färger.") : (boothNote ?? "Vi visar en neutral monter.")}
                    {!booth && boothNote && (
                      <>
                        {" "}
                        <TextLink onClick={rebuild} className="text-[15px]">
                          Försök igen
                        </TextLink>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                  <Primary onClick={() => go("products")}>Nästa: välj produkter {Icons.arrow}</Primary>
                  <TextLink onClick={reset} className="text-[13px]">
                    Prova en annan webbadress
                  </TextLink>
                </div>
              </div>
            )}
            <BoothStage
              src={boothUrl}
              alt={booth ? `Mässmonter för ${name}` : "Mässmonter med plats för din logga"}
              loading={loading}
              className={`aspect-[3/2] w-full rounded-2xl ${phase ? "mt-4" : "mt-6"}`}
            />
            {ready && analysis && (
              <div className="mt-4">
                <TailorCard analysis={analysis} />
              </div>
            )}
          </main>
        )}

        {shown === "products" && (
          <main className={`${WRAP} py-8 sm:py-10`}>
            <h1 className={H1}>Välj produkter</h1>
            <p className={`mt-2 ${BODY}`}>Allt trycks med er logga. Vi har valt det som passar {name} – tryck på en produkt för att ändra modell, färg eller antal.</p>
            <div className="mx-auto mt-6 max-w-[860px]">
              <BoothStage src={boothUrl} alt={`Mässmonter för ${name}`} spots={spots} onSpot={setDrawer} loading={phase === "booth" ? loading : null} className="aspect-[3/2] w-full rounded-2xl" />
              {stale && phase !== "booth" && (
                <p className="mt-3 text-[13px] text-[#6E6E73]">
                  Bilden visar inte dina senaste monterval.{" "}
                  <TextLink onClick={rebuild} className="text-[13px]">
                    Uppdatera montern
                  </TextLink>
                </p>
              )}
            </div>
            {(
              [
                ["Montern", BOOTH_PRODUCTS, "lg:grid-cols-5"],
                ["Profilprodukter", PROMO_PRODUCTS, "lg:grid-cols-4"],
              ] as const
            ).map(([title, products, cols]) => (
              <section key={title} className="mt-10">
                <h2 className="text-[17px] font-semibold">{title}</h2>
                <div className={`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 ${cols}`}>
                  {products.map((p) => (
                    <ProductTile
                      key={p.id}
                      product={p}
                      line={lines[p.id]}
                      recommended={recommended.has(p.id)}
                      mockups={mockups}
                      boothFor={boothFor}
                      onOpen={() => setDrawer(p.id)}
                      onToggle={() => toggle(p)}
                    />
                  ))}
                </div>
              </section>
            ))}
            <BottomBar count={count} total={total}>
              <Primary className="shrink-0 px-5 sm:px-6" disabled={!count} onClick={() => go("offer")}>
                <span className="sm:hidden">Granska offert</span>
                <span className="hidden sm:inline">Nästa: granska offert</span> {Icons.arrow}
              </Primary>
            </BottomBar>
          </main>
        )}

        {shown === "offer" && (
          <main className="mx-auto w-full max-w-[720px] px-5 py-8 sm:px-8 sm:py-10">
            <h1 className={H1}>Granska offert</h1>
            <p className={`mt-2 ${BODY}`}>Vi återkommer inom en arbetsdag med pris och leveranstid. Förfrågan är inte bindande.</p>

            <div className="mt-8 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={boothUrl} alt={`Mässmonter för ${name}`} className="aspect-[3/2] w-32 shrink-0 rounded-xl object-cover sm:w-40" />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">Mässmonter för {name}</p>
                <TextLink onClick={() => go("products")} className="mt-1 text-[13px]">
                  Ändra produkter
                </TextLink>
              </div>
            </div>

            <ul className="mt-6 divide-y divide-black/[0.06] border-y border-black/[0.06]">
              {offer.map((l) => {
                const p = ALL_PRODUCTS.find((x) => x.id === l.id)!;
                return (
                  <li key={l.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[48px_1fr_auto_96px]">
                    <button type="button" onClick={() => setDrawer(l.id)} className="overflow-hidden rounded-lg bg-[#F5F5F7]" aria-label={`Ändra ${l.name}`}>
                      {l.thumb}
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{l.name}</p>
                      <p className="truncate text-[13px] text-[#6E6E73]">{l.spec}</p>
                    </div>
                    <p className="text-right text-[14px] font-semibold tabular-nums sm:order-last">{sek(l.totalSek)}</p>
                    <div className="col-start-2 flex items-center gap-3 sm:col-start-auto">
                      <Stepper size="sm" value={l.qty} step={p.step} onChange={(v) => setQty(l.id, v)} />
                      <button type="button" onClick={() => toggle(p)} className="text-[13px] text-[#6E6E73] hover:text-[#B42318]" aria-label={`Ta bort ${l.name}`}>
                        Ta bort
                      </button>
                    </div>
                  </li>
                );
              })}
              {offer.length === 0 && <li className="py-8 text-center text-[15px] text-[#6E6E73]">Inga produkter valda.</li>}
            </ul>
            <div className="flex items-baseline justify-between py-4">
              <p className="text-[15px] font-medium">
                Totalt <span className="text-[13px] font-normal text-[#6E6E73]">exkl. moms</span>
              </p>
              <p className="text-[22px] font-semibold tabular-nums">{sek(total)}</p>
            </div>

            <form id="demo-quote" onSubmit={requestQuote} className="mt-6">
              <h2 className="text-[17px] font-semibold">Dina uppgifter</h2>
              <p className="mt-1 text-[13px] text-[#6E6E73]">Valfritt – så vet vi vem vi ska kontakta.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["name", "Namn", "text", "name"],
                    ["email", "E-post", "email", "email"],
                    ["company", "Företag", "text", "organization"],
                  ] as const
                ).map(([key, label, type, auto]) => (
                  <label key={key} className={key === "company" ? "sm:col-span-2" : ""}>
                    <span className="text-[13px] font-medium">{label}</span>
                    <input
                      type={type}
                      autoComplete={auto}
                      maxLength={key === "email" ? 120 : 80}
                      value={contact[key]}
                      onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                      className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white px-4 text-[15px] outline-none transition focus:border-[#1D1D1F]"
                    />
                  </label>
                ))}
              </div>
            </form>
            <BottomBar count={count} total={total}>
              <Primary type="submit" form="demo-quote" className="shrink-0 px-5 sm:px-6" loading={sending} disabled={!count}>
                <span className="sm:hidden">Skicka</span>
                <span className="hidden sm:inline">Skicka offertförfrågan</span> {Icons.arrow}
              </Primary>
            </BottomBar>
          </main>
        )}

        {shown === "thanks" && quote && (
          <main className="mx-auto w-full max-w-[560px] px-5 py-12 text-center sm:py-16">
            <span className="ifk-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1D1D1F] text-white [&_svg]:h-6 [&_svg]:w-6">{Icons.check}</span>
            <h1 className={`mt-6 ${H1}`}>Tack!</h1>
            <p className={`mt-3 ${BODY}`}>Vi har tagit emot din förfrågan och återkommer inom en arbetsdag med pris och leveranstid.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={boothUrl} alt={`Mässmonter för ${name}`} className="mt-8 aspect-[3/2] w-full rounded-2xl object-cover" />
            <dl className="mt-6 divide-y divide-black/[0.06] border-y border-black/[0.06] text-left text-[15px]">
              {[
                ["Referens", `#${quote.reference}`],
                ["Produkter", String(count)],
                ["Totalt exkl. moms", sek(total)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-[#6E6E73]">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Primary
                onClick={() => {
                  setPrinting(true);
                  setTimeout(() => window.print(), 700);
                }}
              >
                {Icons.download} Ladda ner PDF
              </Primary>
              <Secondary onClick={share}>{Icons.link} Dela</Secondary>
            </div>
            <TextLink onClick={reset} className="mt-8 text-[13px]">
              Skapa en ny monter
            </TextLink>
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
            setToast(`${drawerProduct.name} är vald`);
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
        <div className="fixed bottom-24 left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-[#1D1D1F] px-5 py-3 text-[13px] font-medium text-white shadow-lg print:hidden" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
