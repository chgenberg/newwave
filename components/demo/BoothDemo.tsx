"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoothItem, BoothResult } from "@/lib/demoBooth";
import { ALL_PRODUCTS, BOOTH_PRODUCTS, BRANDS, CONSUMABLES, DEFAULT_PROMOS, EVENTS, type EventId, PLACEHOLDER_BOOTH, lineTotal, MAX_QTY, PROMO_PRODUCTS, type Product, VISITORS, type VisitorsId, sek, sumSek } from "@/lib/demoCatalog";
import { PACKAGES, type PackageId, type PackLine, buildPackage, delivery, deliveryText, fitBudget, fmtDay, packageSummary, packageTotal, roundQty } from "@/lib/demoPackages";
import type { SiteAnalysis } from "@/lib/demoSiteCache";
import type { LogoResult } from "@/lib/logo";
import { OWNED_KEY } from "./ApprovalView";
import { BoothStage, type Hotspot, type Phase } from "./BoothStage";
import { EventPlan, type PackageCard, PackageCards } from "./BuyPanel";
import { type Line, ProductDrawer, ProductVisual } from "./ProductDrawer";
import { type OfferLine, PrintOffer } from "./PrintOffer";
import { Header, Icons, PlusBadge, Primary, Secondary, type Step, Stepper, TextLink, TrustLine } from "./parts";
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
const productOf = (id: string) => ALL_PRODUCTS.find((p) => p.id === id)!;

/** Package quantities on top of whatever model and colour the customer already picked for a product. */
const fromPack = (pack: PackLine[], prev: Record<string, Line> = {}): Record<string, Line> =>
  Object.fromEntries(pack.map((l) => [l.id, { ...(prev[l.id] ?? newLine(productOf(l.id))), qty: l.qty }]));
const toPack = (ls: Record<string, Line>): PackLine[] => Object.entries(ls).map(([id, l]) => ({ id, qty: l.qty, model: l.model }));
const initialLines = () => fromPack(buildPackage("standard", DEFAULT_PROMOS));

/** Steps 1–3 keep the running total and the one next action in view, on every screen size. */
function BottomBar({ count, total, label, children }: { count: number; total: number; label?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/90 backdrop-blur-xl print:hidden">
      <div className={`${WRAP} flex items-center justify-between gap-4 py-3`}>
        <p className="min-w-0 text-[13px] leading-tight text-[#6E6E73] sm:text-[15px]">
          {label ?? `${count} ${count === 1 ? "produkt" : "produkter"}`}
          <span className="block font-semibold tabular-nums text-[#1D1D1F] sm:inline">
            <span className="hidden sm:inline"> · </span>
            {label ? "ca " : "Totalt "}
            {sek(total)}
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
  /** The customer's selection before any budget; what is ordered is this, fitted to the budget when one is set. */
  const [base, setBase] = useState<Record<string, Line>>(initialLines);
  const [pkg, setPkg] = useState<PackageId | "custom">("standard");
  const [eventDate, setEventDate] = useState("");
  const [visitors, setVisitors] = useState<VisitorsId | "">("");
  const [budget, setBudget] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact>({ name: "", email: "", company: "" });
  const [quote, setQuote] = useState<{ reference: string; date: Date; emailed: boolean; pdf: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shared, setShared] = useState<{ key: string; path: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const run = useRef(0);
  const mockups = useMockups(logo);

  const lines = useMemo(() => (budget === null ? base : fromPack(fitBudget(toPack(base), budget).lines, base)), [base, budget]);
  const brandColor = booth?.color ?? logo?.color ?? "#1D1D1F";
  const name = brandName || "ditt varumärke";
  const boothItems = BOOTH_PRODUCTS.filter((p) => lines[p.id]).map((p) => p.booth!);
  const boothFor = useCallback((p: Product) => (booth && p.booth && booth.items.includes(p.booth) ? booth.url : PLACEHOLDER_BOOTH), [booth]);
  const boothUrl = booth?.url ?? PLACEHOLDER_BOOTH;
  const stale = Boolean(booth) && (booth!.items.length !== boothItems.length || boothItems.some((i) => !booth!.items.includes(i)));
  const recIds = useMemo(() => (analysis ? analysis.merch.map((m) => m.id) : DEFAULT_PROMOS), [analysis]);
  const recommended = useMemo(() => new Set(recIds), [recIds]);
  const notOrdered = booth ? BOOTH_PRODUCTS.filter((p) => booth.items.includes(p.booth!) && !lines[p.id]) : [];
  const notShown = booth ? BOOTH_PRODUCTS.filter((p) => lines[p.id] && !booth.items.includes(p.booth!)) : [];
  const names = (ps: Product[]) => ps.map((p) => p.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " och $1");
  const staleText = notOrdered.length ? `Bilden visar även ${names(notOrdered)}, som inte ingår i beställningen.` : notShown.length ? `${names(notShown).replace(/^./, (c) => c.toUpperCase())} ingår men syns inte i bilden.` : "";

  const cards: PackageCard[] = useMemo(
    () =>
      PACKAGES.map((p) => {
        const pack = buildPackage(p.id, recIds, visitors || null);
        const fitted = budget === null ? pack : fitBudget(pack, budget).lines;
        return { ...p, total: packageTotal(fitted), summary: packageSummary(fitted) };
      }),
    [recIds, visitors, budget],
  );

  const choosePackage = (id: PackageId) => {
    setPkg(id);
    setBase((b) => fromPack(buildPackage(id, recIds, visitors || null), b));
  };

  const chooseVisitors = (v: VisitorsId | "") => {
    setVisitors(v);
    if (pkg !== "custom") return setBase((b) => fromPack(buildPackage(pkg, recIds, v || null), b));
    const f = VISITORS.find((x) => x.id === v)?.factor ?? 1;
    setBase((b) => Object.fromEntries(Object.entries(b).map(([id, l]) => [id, CONSUMABLES.includes(id) ? { ...l, qty: roundQty(productOf(id), productOf(id).defaultQty * f) } : l])));
  };

  /** A hand-made change replaces the package, and the budget no longer silently overrides it. */
  const edit = (fn: (ls: Record<string, Line>) => Record<string, Line>) => {
    setBase(fn(lines));
    setBudget(null);
    setPkg("custom");
  };

  /** Each step is a history entry, so the browser back button moves between steps instead of leaving the demo. */
  const go = (s: Stage, replace = false) => {
    setToast(null);
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
    setPkg("standard");
    setBudget(null);
    setBase(fromPack(buildPackage("standard", a ? a.merch.map((m) => m.id) : DEFAULT_PROMOS, visitors || null)));
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
    setBase(initialLines());
    setPkg("standard");
    setBudget(null);
    setEventDate("");
    setVisitors("");
    setShared(null);
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
    edit((ls) => {
      const next = { ...ls };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = newLine(p);
      return next;
    });

  const setQty = (id: string, qty: number) =>
    edit((ls) => (ls[id] ? { ...ls, [id]: { ...ls[id], qty: Math.min(MAX_QTY, Math.max(1, Math.round(qty) || 1)) } } : ls));

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
      const r = await post<{ reference: string; createdAt: string; emailed: boolean; pdf: string }>("/api/v1/demo/quote", {
        brand: { name: brandName || "Okänt varumärke", site: logo?.site ?? "" },
        event: EVENTS.find((x) => x.id === event)!.label,
        boothUrl: booth?.url,
        totalSek: total,
        lines: offer.map((l) => ({ id: l.id, model: l.model, qty: l.qty })),
        eventDate,
        visitors,
        package: pkg === "custom" ? "" : pkg,
        contact: { name: contact.name.trim(), email: contact.email.trim(), company: contact.company.trim() },
      });
      setQuote({ reference: r.reference, date: new Date(r.createdAt), emailed: r.emailed, pdf: r.pdf });
      go("thanks");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Kunde inte skicka förfrågan");
    } finally {
      setSending(false);
    }
  };

  /** One link per offer version; the colleague's page shows exactly what was shared, priced on the server. */
  const shareForApproval = async () => {
    const body = {
      brand: { name: brandName || "Okänt varumärke", site: logo?.site ?? "" },
      boothUrl: booth?.url,
      lines: offer.map((l) => ({ id: l.id, model: l.model, qty: l.qty })),
      eventDate,
      visitors,
      reference: quote?.reference ?? "",
    };
    const key = JSON.stringify(body);
    setSharing(true);
    let link: string;
    try {
      let path = shared?.key === key ? shared.path : null;
      if (!path) {
        const r = await post<{ id: string; path: string }>("/api/v1/demo/share", body);
        path = r.path;
        setShared({ key, path });
        try {
          const owned = JSON.parse(localStorage.getItem(OWNED_KEY) ?? "[]");
          localStorage.setItem(OWNED_KEY, JSON.stringify([r.id, ...(Array.isArray(owned) ? owned : [])].slice(0, 50)));
        } catch {}
      }
      link = `${window.location.origin}${path}`;
    } catch (err) {
      setSharing(false);
      return setToast(err instanceof Error ? err.message : "Kunde inte skapa länken");
    }
    setSharing(false);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Offert för ${name}`, text: "Kan du godkänna offerten för mässmontern?", url: link });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setToast("Länken är kopierad – skicka den till din kollega");
    } catch {
      setToast("Kopiera länken nedan och skicka den till din kollega");
    }
  };

  /** The server PDF is the real document; if it cannot be made, the browser's print view is the fallback. */
  const downloadPdf = async () => {
    if (!quote) return;
    setDownloading(true);
    try {
      const res = await fetch(quote.pdf);
      if (!res.ok) throw new Error(String(res.status));
      const href = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href, download: `Offert-${quote.reference}.pdf` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      setPrinting(true);
      setTimeout(() => window.print(), 700);
    } finally {
      setDownloading(false);
    }
  };

  /** History entries can point at steps whose data is gone (e.g. after a reload); fall back to the start. */
  const shown: Stage = (!logo && (stage === "products" || stage === "offer")) || (stage === "thanks" && !quote) ? "start" : stage;
  const drawerProduct = ALL_PRODUCTS.find((p) => p.id === drawer);
  const loading = phase ? { phase, name, industry: analysis?.industry ?? "" } : null;
  const eventLabel = EVENTS.find((e) => e.id === event)!.label;
  const ready = Boolean(logo) && !phase;
  const industry = analysis?.industry?.toLowerCase();
  const del = delivery(eventDate, offer.map((l) => l.id));
  const deliveryNote = del ? { text: deliveryText(del), late: del.late } : null;
  const pkgName = PACKAGES.find((p) => p.id === pkg)?.name;
  const orderLabel = !stale ? "Beställ montern som den ser ut" : pkgName ? `Beställ paket ${pkgName}` : "Granska offert";
  const shareLink = shared && (
    <p className="mt-3 break-all text-[13px] text-[#6E6E73]">
      Länk för godkännande:{" "}
      <a href={shared.path} target="_blank" rel="noreferrer" className="font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4">
        {typeof window === "undefined" ? shared.path : `${window.location.host}${shared.path}`}
      </a>{" "}
      – öppna den för att se om den är godkänd.
    </p>
  );
  const staleNote = staleText && phase !== "booth" && (
    <p className="mt-3 text-[13px] text-[#6E6E73]">
      {staleText}{" "}
      <TextLink onClick={rebuild} className="text-[13px]">
        Uppdatera montern
      </TextLink>
    </p>
  );

  return (
    <>
      <div className={`min-h-screen bg-white text-[#1D1D1F] print:hidden ${shown === "products" || shown === "offer" || (shown === "start" && ready) ? "pb-28" : ""}`}>
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
                <TextLink onClick={reset} className="shrink-0 text-[13px]">
                  Prova en annan webbadress
                </TextLink>
              </div>
            )}
            <BoothStage
              src={boothUrl}
              alt={booth ? `Mässmonter för ${name}` : "Mässmonter med plats för din logga"}
              loading={loading}
              className={`aspect-[3/2] w-full rounded-2xl ${phase ? "mt-4" : "mt-6"}`}
            />
            {ready && (
              <>
                {staleNote}
                <section className="mt-10">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-[17px] font-semibold">Välj paket</h2>
                    <TextLink onClick={() => go("products")} className="text-[13px]">
                      Anpassa produkter
                    </TextLink>
                  </div>
                  <p className="mt-1 text-[13px] text-[#6E6E73]">{pkg === "custom" ? "Du har gjort egna val – välj ett paket för att börja om." : "Allt trycks med er logga. Priserna är exkl. moms."}</p>
                  <div className="mt-4">
                    <PackageCards cards={cards} selected={pkg} onSelect={choosePackage} />
                  </div>
                </section>
                <section className="mt-6">
                  <EventPlan
                    eventDate={eventDate}
                    onDate={setEventDate}
                    visitors={visitors}
                    onVisitors={chooseVisitors}
                    budget={budget}
                    onBudget={setBudget}
                    delivery={deliveryNote}
                    fittedTotal={budget === null ? null : total}
                  />
                </section>
                {analysis && (
                  <div className="mt-6">
                    <TailorCard analysis={analysis} />
                  </div>
                )}
                <BottomBar count={count} total={total} label={pkgName ? `Paket ${pkgName}` : `${count} produkter`}>
                  <Primary className="shrink-0 px-5 sm:px-6" disabled={!count} onClick={() => go("offer")}>
                    <span className="sm:hidden">{!stale ? "Beställ montern" : pkgName ? `Beställ ${pkgName}` : "Till offert"}</span>
                    <span className="hidden sm:inline">{orderLabel}</span> {Icons.arrow}
                  </Primary>
                </BottomBar>
              </>
            )}
          </main>
        )}

        {shown === "products" && (
          <main className={`${WRAP} py-8 sm:py-10`}>
            <h1 className={H1}>Välj produkter</h1>
            <p className={`mt-2 ${BODY}`}>Allt trycks med er logga. Vi har valt det som passar {name} – tryck på en produkt för att ändra modell, färg eller antal.</p>
            <div className="mx-auto mt-6 max-w-[860px]">
              <BoothStage src={boothUrl} alt={`Mässmonter för ${name}`} spots={spots} onSpot={setDrawer} loading={phase === "booth" ? loading : null} className="aspect-[3/2] w-full rounded-2xl" />
              {staleNote}
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

            {(eventDate || deliveryNote) && (
              <p className={`flex items-center gap-1.5 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5 ${deliveryNote?.late ? "text-[#B54708]" : "text-[#424245]"}`}>
                {Icons.calendar} {eventDate && `Mässan ${fmtDay(eventDate)}. `}
                {deliveryNote?.text}
              </p>
            )}

            <form id="demo-quote" onSubmit={requestQuote} className="mt-6">
              <h2 className="text-[17px] font-semibold">Vart ska vi skicka offerten?</h2>
              <label className="mt-3 block">
                <span className="text-[13px] font-medium">E-post</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={120}
                  value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                  placeholder="namn@foretag.se"
                  className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white px-4 text-[15px] outline-none transition placeholder:text-[#AEAEB2] focus:border-[#1D1D1F]"
                />
              </label>
              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-[#1D1D1F] [&::-webkit-details-marker]:hidden">
                  <span className="transition group-open:rotate-45">{Icons.plus}</span> Lägg till namn och företag
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["name", "Namn", "name"],
                      ["company", "Företag", "organization"],
                    ] as const
                  ).map(([key, label, auto]) => (
                    <label key={key}>
                      <span className="text-[13px] font-medium">{label}</span>
                      <input
                        autoComplete={auto}
                        maxLength={80}
                        value={contact[key]}
                        onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                        className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white px-4 text-[15px] outline-none transition focus:border-[#1D1D1F]"
                      />
                    </label>
                  ))}
                </div>
              </details>
            </form>
            <TrustLine className="mt-6" />
            <div className="mt-8 border-t border-black/[0.06] pt-6">
              <p className="text-[13px] text-[#6E6E73]">Behöver någon annan säga ja först?</p>
              <Secondary className="mt-2 h-11" onClick={shareForApproval} disabled={sharing || !count}>
                {Icons.link} Skicka till kollega för godkännande
              </Secondary>
              {shareLink}
            </div>
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
            <p className={`mt-3 ${BODY}`}>
              {quote.emailed ? (
                <>
                  Vi har skickat offerten som PDF till <span className="font-medium text-[#1D1D1F]">{contact.email.trim()}</span>. Er säljare återkommer inom en arbetsdag med korrektur och leveransdatum.
                </>
              ) : (
                <>
                  Vi har tagit emot förfrågan och hör av oss till <span className="font-medium text-[#1D1D1F]">{contact.email.trim()}</span> inom en arbetsdag. Ingen kopia har skickats via e-post – ladda ner offerten som PDF här.
                </>
              )}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={boothUrl} alt={`Mässmonter för ${name}`} className="mt-8 aspect-[3/2] w-full rounded-2xl object-cover" />
            <dl className="mt-6 divide-y divide-black/[0.06] border-y border-black/[0.06] text-left text-[15px]">
              {[
                ["Referens", `#${quote.reference}`],
                ["Produkter", String(count)],
                ...(eventDate ? [["Mässan", fmtDay(eventDate)]] : []),
                ...(deliveryNote ? [["Leverans", deliveryNote.late ? "Kort om tid – vi hör av oss om express" : "I tid till mässan"]] : []),
                ["Totalt exkl. moms", sek(total)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-[#6E6E73]">{k}</dt>
                  <dd className="text-right font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {quote.emailed ? (
                <>
                  <Primary onClick={shareForApproval} loading={sharing}>
                    {Icons.link} Skicka till kollega för godkännande
                  </Primary>
                  <Secondary onClick={downloadPdf} disabled={downloading}>
                    {Icons.download} Ladda ner PDF
                  </Secondary>
                </>
              ) : (
                <>
                  <Primary onClick={downloadPdf} loading={downloading}>
                    {Icons.download} Ladda ner PDF
                  </Primary>
                  <Secondary onClick={shareForApproval} disabled={sharing}>
                    {Icons.link} Skicka till kollega för godkännande
                  </Secondary>
                </>
              )}
            </div>
            {shareLink}
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
            edit((ls) => ({ ...ls, [drawerProduct.id]: line }));
            setDrawer(null);
            if (shown === "products") setToast(`${drawerProduct.name} är vald`);
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
          eventDate={eventDate}
          visitors={visitors}
          delivery={deliveryNote?.text ?? ""}
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
