"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoothItem, BoothResult } from "@/lib/demoBooth";
import { ALL_PRODUCTS, type BoothFormat, BRANDS, lineTotal, MAX_QTY, type Product, type VisitorsId, sek, sumSek } from "@/lib/demoCatalog";
import { EVENT_LIST, EVENTS, type EventId, isEventId, qtyOf, spotOf } from "@/lib/demoEvents";
import { type PackageId, type PackLine, buildPackage, delivery, deliveryText, fitBudget, fmtDay, packageSummary, packagesFor, packageTotal, scaledQty } from "@/lib/demoPackages";
import type { SiteAnalysis } from "@/lib/demoSiteCache";
import type { LogoResult } from "@/lib/logo";
import { OWNED_KEY } from "./ApprovalView";
import { BoothStage, type Hotspot, type Phase } from "./BoothStage";
import { EventPlan, type PackageCard, PackageCards } from "./BuyPanel";
import { type BoothView, type Line, ProductDrawer, ProductVisual } from "./ProductDrawer";
import { type OfferLine, PrintOffer } from "./PrintOffer";
import { BackLink, Header, Icons, PlusBadge, Primary, Secondary, type Step, StepHeader, STEP_LABELS, Stepper, TextLink, TrustLine } from "./parts";
import { TailorCard } from "./TailorCard";
import { useMockups } from "./useMockups";

type Stage = "type" | "start" | "products" | "offer" | "thanks";
type Booth = BoothResult & { items: BoothItem[]; event: EventId };
type Contact = { name: string; email: string; company: string };

const STEP_OF: Record<Stage, Step | null> = { type: 1, start: 2, products: 3, offer: 4, thanks: null };
const STAGE_OF: Record<Step, Stage> = { 1: "type", 2: "start", 3: "products", 4: "offer" };
const COLOR_NAMES: Record<string, string> = { "#1D1D1F": "Svart", "#FFFFFF": "Vit", "#9A9AA0": "Grå", "#1F3B73": "Marinblå" };

/** Phones get a 4:3 booth; the choice is made once per run so a resize never swaps the image. */
const PHONE = "(max-width: 767px)";
/** A 3:2 booth on a phone is shown 4:3 with object-cover; hotspots are hidden there, so they never point at cropped areas. */
const frame = (f: BoothFormat) => (f === "4:3" ? "aspect-[4/3]" : "aspect-[4/3] sm:aspect-[3/2]");

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

const newLine = (p: Product, ev: EventId): Line => ({ qty: qtyOf(p, ev), model: p.models[0].id, color: "", style: p.styles[0] });
const productOf = (id: string) => ALL_PRODUCTS.find((p) => p.id === id)!;

/** Package quantities on top of whatever model and colour the customer already picked for a product. */
const fromPack = (pack: PackLine[], prev: Record<string, Line> = {}): Record<string, Line> =>
  Object.fromEntries(pack.map((l) => [l.id, { ...(prev[l.id] ?? newLine(productOf(l.id), "massa")), qty: l.qty }]));
const toPack = (ls: Record<string, Line>): PackLine[] => Object.entries(ls).map(([id, l]) => ({ id, qty: l.qty, model: l.model }));
/** The site analysis picks merch per kind of occasion; without it the occasion's defaults are used. */
const recOf = (a: SiteAnalysis | null, ev: EventId) => (!a ? EVENTS[ev].defaults : ev === "massa" ? a.merch.map((m) => m.id) : (a.events?.[ev]?.merch ?? EVENTS[ev].defaults));
const initialLines = (ev: EventId = "massa", a: SiteAnalysis | null = null, visitors: VisitorsId | "" = "") => fromPack(buildPackage("standard", recOf(a, ev), visitors || null, ev));

/** Steps 1–3 keep the running total and the one next action in view, on every screen size. */
function BottomBar({ count, total, label, children }: { count: number; total: number; label?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/90 backdrop-blur-xl print:hidden">
      <div className={`${WRAP} flex items-center justify-between gap-4 py-3`}>
        <p className="min-w-0 text-[13px] leading-tight text-[#6E6E73] sm:text-[15px]">
          {label ?? `${count} ${count === 1 ? "produkt" : "produkter"}`}
          <span className="block whitespace-nowrap font-semibold tabular-nums text-[#1D1D1F] sm:inline">
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

function ProductTile({ product, line, recommended, mockups, boothFor, onOpen, onToggle }: { product: Product; line?: Line; recommended: boolean; mockups: Record<string, string>; boothFor: (p: Product) => BoothView; onOpen: () => void; onToggle: () => void }) {
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
  const [stage, setStage] = useState<Stage>("type");
  const [event, setEvent] = useState<EventId>("massa");
  /** The card picked on the first step; it becomes the event only on "Nästa". */
  const [pick, setPick] = useState<EventId | null>(null);
  const [url, setUrl] = useState("");
  const [logo, setLogo] = useState<LogoResult | null>(null);
  const [brandName, setBrandName] = useState("");
  const [phase, setPhase] = useState<Phase | null>(null);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boothNote, setBoothNote] = useState<string | null>(null);
  const [booth, setBooth] = useState<Booth | null>(null);
  const [format, setFormat] = useState<BoothFormat>("3:2");
  /** The customer's selection before any budget; what is ordered is this, fitted to the budget when one is set. */
  const [base, setBase] = useState<Record<string, Line>>(() => initialLines());
  const [pkg, setPkg] = useState<PackageId | "custom">("standard");
  /** The last hand-made selection, kept as its own card so trying a package never throws it away. */
  const [customBase, setCustomBase] = useState<Record<string, Line> | null>(null);
  /** Where the current history entry was entered from, so "Tillbaka" and the browser back button agree. */
  const [from, setFrom] = useState<Stage | null>(null);
  /** A booth file that failed to load (e.g. lost on redeploy); the neutral booth is shown until it is rebuilt. */
  const [brokenBooth, setBrokenBooth] = useState<string | null>(null);
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
  const ev = EVENTS[event];
  const setProducts = useMemo(() => EVENTS[event].set.map(productOf), [event]);
  const merchProducts = useMemo(() => EVENTS[event].merch.map(productOf), [event]);
  const mockups = useMockups(logo, merchProducts);

  const liveBooth = booth && booth.url !== brokenBooth ? booth : null;
  const lines = useMemo(() => (budget === null ? base : fromPack(fitBudget(toPack(base), budget, event).lines, base)), [base, budget, event]);
  const brandColor = booth?.color ?? logo?.color ?? "#1D1D1F";
  const name = brandName || "ditt varumärke";
  const boothItems = setProducts.filter((p) => lines[p.id]).map((p) => p.booth!);
  const fmt = booth?.format ?? format;
  const placeholder = ev.placeholders[fmt];
  const boothFor = useCallback(
    (p: Product): BoothView =>
      liveBooth && p.booth && liveBooth.items.includes(p.booth) ? { url: liveBooth.url, format: liveBooth.format, event: liveBooth.event } : { url: EVENTS[event].placeholders[fmt], format: fmt, event },
    [liveBooth, fmt, event],
  );
  const boothUrl = liveBooth?.url ?? placeholder;
  const stale = Boolean(booth) && (booth!.items.length !== boothItems.length || boothItems.some((i) => !booth!.items.includes(i)));
  const recIds = useMemo(() => recOf(analysis, event), [analysis, event]);
  const recommended = useMemo(() => new Set(recIds), [recIds]);
  const notOrdered = booth ? setProducts.filter((p) => booth.items.includes(p.booth!) && !lines[p.id]) : [];
  const notShown = booth ? setProducts.filter((p) => lines[p.id] && !booth.items.includes(p.booth!)) : [];
  const names = (ps: Product[]) => ps.map((p) => p.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " och $1");
  const staleText = notOrdered.length ? `Bilden visar även ${names(notOrdered)}, som inte ingår i beställningen.` : notShown.length ? `${names(notShown).replace(/^./, (c) => c.toUpperCase())} ingår men syns inte i bilden.` : "";

  const cards: PackageCard[] = useMemo(
    () =>
      packagesFor(event)
        .map((p) => {
          const pack = buildPackage(p.id, recIds, visitors || null, event);
          const fitted = budget === null ? pack : fitBudget(pack, budget, event).lines;
          return { ...p, total: packageTotal(fitted), summary: packageSummary(fitted, event) } as PackageCard;
        })
        .concat(
          customBase
            ? (() => {
                const own = toPack(customBase);
                const fitted = budget === null ? own : fitBudget(own, budget, event).lines;
                return [{ id: "custom" as const, name: "Eget urval", blurb: "Dina egna val från produktsidan", total: packageTotal(fitted), summary: packageSummary(fitted, event) }];
              })()
            : [],
        ),
    [recIds, visitors, budget, customBase, event],
  );

  const choosePackage = (id: PackageId | "custom") => {
    setPkg(id);
    if (id === "custom") return customBase && setBase(customBase);
    setBase((b) => fromPack(buildPackage(id, recIds, visitors || null, event), b));
  };

  const chooseVisitors = (v: VisitorsId | "") => {
    setVisitors(v);
    if (pkg !== "custom") return setBase((b) => fromPack(buildPackage(pkg, recIds, v || null, event), b));
    const scale = (b: Record<string, Line>) => Object.fromEntries(Object.entries(b).map(([id, l]) => [id, ev.scales.includes(id) ? { ...l, qty: scaledQty(productOf(id), event, v) } : l]));
    setBase(scale);
    setCustomBase((c) => c && scale(c));
  };

  /** A hand-made change replaces the package, and the budget no longer silently overrides it. */
  const edit = (fn: (ls: Record<string, Line>) => Record<string, Line>) => {
    const next = fn(lines);
    setBase(next);
    setCustomBase(next);
    setBudget(null);
    setPkg("custom");
  };

  /** Each step is a history entry, so the browser back button moves between steps instead of leaving the demo. */
  const go = (s: Stage, replace = false) => {
    const prev = replace ? ((window.history.state?.demoFrom as Stage | undefined) ?? null) : stage;
    setToast(null);
    setStage(s);
    setFrom(prev);
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, demoStage: s, demoFrom: prev }, "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Steps back through history when that is where the user came from, so the browser's own back button stays in step. */
  const back = (target: Stage) => {
    if (window.history.state?.demoFrom === target) window.history.back();
    else go(target);
  };

  /** A failed booth (no API key, rate limit, model error) never blocks the flow: the neutral booth stays usable. */
  const buildBooth = async (l: LogoResult, nm: string, items: BoothItem[], id: number, a: SiteAnalysis | null, f: BoothFormat, kind: EventId) => {
    setPhase("booth");
    setBoothNote(null);
    try {
      const b = await post<BoothResult>("/api/v1/demo/booth", {
        name: nm || l.site || "Ditt företag",
        site: l.site,
        color: l.color,
        light: l.light,
        products: items,
        format: f,
        event: kind,
        ...(a && a.host === l.site ? { analysisId: a.id } : {}),
      });
      if (run.current === id) setBooth({ ...b, items, event: kind });
    } catch (e) {
      if (run.current === id) setBoothNote(e instanceof Error ? e.message : String(e));
    } finally {
      if (run.current === id) setPhase(null);
    }
  };

  /** The occasion is passed in because a new choice is not yet in state when the run starts. */
  const start = async (raw: string, knownName?: string, keepSelection = false, kind: EventId = event) => {
    const value = raw.trim();
    if (value.length < 3) return setError("Ange en webbadress, till exempel volvocars.com");
    const id = ++run.current;
    const f: BoothFormat = window.matchMedia(PHONE).matches ? "4:3" : "3:2";
    setFormat(f);
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
      a = await post<SiteAnalysis>("/api/v1/demo/analyze", { site: l.site, light: l.light, event: kind }).catch(() => null);
      if (run.current !== id) return;
    }
    if (a?.logo.result) l = a.logo.result;
    const nm = known ?? (a?.brandName || shortName(l.name, l.site));
    setAnalysis(a);
    setLogo(l);
    setBrandName(nm);
    setContact((c) => (c.company ? c : { ...c, company: nm }));
    if (!keepSelection) {
      setPkg("standard");
      setBudget(null);
      setCustomBase(null);
      setBase(initialLines(kind, a, visitors));
    }
    await buildBooth(l, nm, keepSelection ? boothItems : [...EVENTS[kind].set], id, a, f, kind);
  };

  const reset = (to: Stage = "start") => {
    run.current++;
    setPhase(null);
    setLogo(null);
    setBooth(null);
    setAnalysis(null);
    setBoothNote(null);
    setError(null);
    setBrandName("");
    setUrl("");
    setBase(initialLines(event));
    setPkg("standard");
    setCustomBase(null);
    setBudget(null);
    setEventDate("");
    setVisitors("");
    setShared(null);
    setContact({ name: "", email: "", company: "" });
    go(to);
  };

  const rebuild = () => {
    if (logo) buildBooth(logo, brandName, boothItems, ++run.current, analysis, format, event);
  };

  /** A new occasion means a new picture and new products, so a brand already read is rebuilt for it. */
  const chooseEvent = (kind: EventId) => {
    setPick(kind);
    if (kind === event && (logo || phase)) return go("start");
    setEvent(kind);
    setPkg("standard");
    setBudget(null);
    setCustomBase(null);
    setShared(null);
    setBase(initialLines(kind, analysis, visitors));
    go("start");
    const site = logo?.site || (phase ? url : "");
    if (site) start(site, brandName || undefined, false, kind);
  };

  /** A lost booth file usually means the logo and site images are gone too, so the whole read runs again, keeping the choices. */
  const remake = () => start(logo?.site || url, brandName || undefined, true);

  useEffect(() => {
    if (!booth) return;
    const img = new Image();
    img.onerror = () => setBrokenBooth(booth.url);
    img.src = booth.url;
    return () => {
      img.onerror = null;
    };
  }, [booth]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      setToast(null);
      setStage((e.state?.demoStage as Stage | undefined) ?? "type");
      setFrom((e.state?.demoFrom as Stage | undefined) ?? null);
    };
    window.addEventListener("popstate", onPop);
    const q = new URLSearchParams(window.location.search);
    const site = q.get("site")?.slice(0, 200);
    const raw = q.get("event");
    const kind = isEventId(raw) ? raw : null;
    const t = setTimeout(() => {
      if (kind) {
        setEvent(kind);
        setPick(kind);
        setBase(initialLines(kind));
      }
      if (!kind && !site) return;
      window.history.replaceState({ ...window.history.state, demoStage: "type", demoFrom: null }, "");
      go("start");
      if (site) start(site, tileName(site), false, kind ?? "massa");
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
      else next[p.id] = newLine(p, event);
      return next;
    });

  const setQty = (id: string, qty: number) =>
    edit((ls) => (ls[id] ? { ...ls, [id]: { ...ls[id], qty: Math.min(MAX_QTY, Math.max(1, Math.round(qty) || 1)) } } : ls));

  const offer: OfferLine[] = useMemo(
    () =>
      [...setProducts, ...merchProducts].filter((p) => lines[p.id]).map((p) => {
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
    [lines, mockups, boothFor, brandColor, setProducts, merchProducts],
  );
  const total = sumSek(offer.map((l) => l.totalSek));
  const count = offer.length;

  const spots: Hotspot[] = [...setProducts, ...merchProducts].filter((p) => spotOf(p, fmt, event) && (!p.booth || !booth || booth.items.includes(p.booth))).map((p) => ({
    id: p.id,
    x: spotOf(p, fmt, event)!.x,
    y: spotOf(p, fmt, event)!.y,
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
        event,
        boothUrl: booth?.url,
        format: fmt,
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
      format: fmt,
      event,
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
        await navigator.share({ title: `Offert för ${name}`, text: ev.shareText, url: link });
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
  const loading = phase ? { phase, name, industry: analysis?.industry ?? "", copy: ev.loading } : null;
  const ready = Boolean(logo) && !phase;
  const industry = analysis?.industry?.toLowerCase();
  const del = delivery(eventDate, offer.map((l) => l.id), undefined, event);
  const deliveryNote = del ? { text: deliveryText(del), late: del.late } : null;
  const pkgName = packagesFor(event).find((p) => p.id === pkg)?.name;
  const orderLabel = !stale ? ev.orderAll : pkgName ? `Beställ paket ${pkgName}` : "Granska offert";
  const neutral = event === "massa" ? "en neutral monter" : "en neutral bild";
  const updateLabel = event === "massa" ? "Uppdatera montern" : "Uppdatera bilden";
  const pictureAlt = liveBooth ? `${ev.title} för ${name}` : `${ev.title} med plats för din logga`;
  const shareLink = shared && (
    <p className="mt-3 break-all text-[13px] text-[#6E6E73]">
      Länk för godkännande:{" "}
      <a href={shared.path} target="_blank" rel="noreferrer" className="font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4">
        {typeof window === "undefined" ? shared.path : `${window.location.host}${shared.path}`}
      </a>{" "}
      – öppna den för att se om den är godkänd.
    </p>
  );
  const kicker = (st: Step) => `Steg ${st} av 4 · ${STEP_LABELS[st]}`;
  const lostNote = booth && !liveBooth && !phase && (
    <p className="mt-3 text-center text-[13px] text-[#6E6E73]">
      Bilden behöver skapas om.{" "}
      <TextLink onClick={remake} className="text-[13px]">
        Skapa om
      </TextLink>
    </p>
  );
  const offerBack = from === "products" ? "products" : "start";
  const staleNote = liveBooth && staleText && phase !== "booth" && (
    <p className="mt-3 text-[13px] text-[#6E6E73]">
      {staleText}{" "}
      <TextLink onClick={rebuild} className="text-[13px]">
        {updateLabel}
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
          reachable={ready ? 4 : 2}
          onStep={(s) => back(STAGE_OF[s])}
          onHome={() => (ready ? go("start") : reset("type"))}
        />

        {shown === "type" && (
          <main className={`${WRAP} py-8 sm:py-12`}>
            <StepHeader kicker={kicker(1)} title="Vad ska ni planera?" sub="Välj typ av tillfälle så anpassar vi bilden, produkterna och offerten efter det." />
            <div role="radiogroup" aria-label="Typ" className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
              {EVENT_LIST.map((e) => {
                const on = pick === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPick(e.id)}
                    onDoubleClick={() => chooseEvent(e.id)}
                    onKeyDown={(k) => {
                      if (k.key !== "Enter") return;
                      k.preventDefault();
                      chooseEvent(e.id);
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left transition ${on ? "ring-2 ring-[#1D1D1F]" : "ring-1 ring-black/[0.08] hover:ring-black/25"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.image} alt="" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                    <span className="block px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4">
                      <span className="block text-[15px] font-semibold sm:text-[17px]">{e.label}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-[#6E6E73]">{e.blurb}</span>
                    </span>
                    <span className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full transition ${on ? "bg-[#1D1D1F] text-white" : "bg-white/90 text-transparent ring-1 ring-black/10"}`}>{Icons.check}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end sm:mt-8">
              <Primary className="w-full sm:w-auto" disabled={!pick} onClick={() => pick && chooseEvent(pick)}>
                Nästa {Icons.arrow}
              </Primary>
            </div>
          </main>
        )}

        {shown === "start" && !phase && !logo && (
          <main className={`${WRAP} grid items-center gap-10 py-12 lg:min-h-[calc(100svh-56px)] lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-16`}>
            <div className="max-w-[480px]">
              <BackLink onClick={() => back("type")} className="mb-3">
                Byt typ
              </BackLink>
              <StepHeader align="left" kicker={kicker(2)} title={ev.startTitle} sub={ev.startSub} />
              <form
                className="mt-6 flex flex-col gap-2.5 sm:flex-row"
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
                <Primary type="submit">{ev.cta}</Primary>
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
            <picture>
              <source media={PHONE} srcSet={ev.placeholders["4:3"]} />
              <img src={ev.placeholders["3:2"]} alt={`Exempel: ${ev.title.toLowerCase()}`} className="aspect-[4/3] w-full rounded-2xl object-cover md:aspect-[3/2]" />
            </picture>
          </main>
        )}

        {shown === "start" && (phase || logo) && (
          <main className={`${WRAP} py-8 sm:py-10`}>
            {phase ? (
              <StepHeader kicker={kicker(2)} title={`${ev.creating} ${brandName || url}`} sub="Det tar ungefär en minut. Du kan följa stegen i bilden.">
                <TextLink onClick={() => reset()} className="text-[13px] text-[#6E6E73]">
                  Avbryt
                </TextLink>
              </StepHeader>
            ) : (
              <StepHeader
                kicker={kicker(2)}
                title={ev.ready(name)}
                sub={
                  liveBooth
                    ? industry
                      ? `Anpassad för ${industry} utifrån er webbplats.`
                      : "Med er logga och era färger."
                    : booth
                      ? `Vi visar ${neutral} tills bilden är skapad igen.`
                      : (boothNote ?? `Vi visar ${neutral}.`)
                }
              >
                {!booth && boothNote && (
                  <TextLink onClick={rebuild} className="text-[13px]">
                    Försök igen
                  </TextLink>
                )}
                {booth && !liveBooth && (
                  <TextLink onClick={remake} className="text-[13px]">
                    Bilden behöver skapas om – Skapa om
                  </TextLink>
                )}
                <TextLink onClick={() => reset()} className="text-[13px]">
                  Prova en annan webbadress
                </TextLink>
                <TextLink onClick={() => back("type")} className="text-[13px]">
                  Byt typ
                </TextLink>
              </StepHeader>
            )}
            <BoothStage
              src={boothUrl}
              alt={pictureAlt}
              loading={loading}
              className={`${frame(fmt)} mt-6 w-full rounded-2xl`}
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
                  <p className="mt-1 text-[13px] text-[#6E6E73]">{pkg === "custom" ? "Eget urval är valt. Välj ett paket för att ersätta det." : "Allt trycks med er logga. Priserna är exkl. moms."}</p>
                  <div className="mt-4">
                    <PackageCards cards={cards} selected={pkg} onSelect={choosePackage} />
                  </div>
                </section>
                <section className="mt-6">
                  <EventPlan
                    event={ev}
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
                    <TailorCard analysis={analysis} event={ev} />
                  </div>
                )}
                <BottomBar count={count} total={total} label={pkgName ? `Paket ${pkgName}` : "Eget urval"}>
                  <Primary className="shrink-0 px-5 sm:px-6" disabled={!count} onClick={() => go("offer")}>
                    <span className="sm:hidden">{!stale ? ev.orderShort : pkgName ? `Beställ ${pkgName}` : "Till offert"}</span>
                    <span className="hidden sm:inline">{orderLabel}</span> {Icons.arrow}
                  </Primary>
                </BottomBar>
              </>
            )}
          </main>
        )}

        {shown === "products" && (
          <main className={`${WRAP} py-6 sm:py-8`}>
            <BackLink onClick={() => back("start")} className="mb-3">
              Tillbaka till paketen
            </BackLink>
            <StepHeader kicker={kicker(3)} title="Välj produkter" sub={`Allt trycks med er logga. Vi har valt det som passar ${name} – tryck på en produkt för att ändra modell, färg eller antal.`} />
            <div className="mx-auto mt-6 max-w-[860px]">
              <BoothStage src={boothUrl} alt={pictureAlt} spots={spots} onSpot={setDrawer} loading={phase === "booth" ? loading : null} className={`${frame(fmt)} w-full rounded-2xl`} />
              {lostNote}
              {staleNote}
            </div>
            {(
              [
                [ev.setTitle, setProducts, setProducts.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5"],
                ["Profilprodukter", merchProducts, "lg:grid-cols-4"],
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
              <div className="flex shrink-0 items-center gap-2">
                <Secondary className="h-12 w-12 px-0! sm:w-auto sm:px-5!" onClick={() => back("start")}>
                  {Icons.back}
                  <span className="sr-only sm:not-sr-only">Tillbaka till paketen</span>
                </Secondary>
                <Primary className="shrink-0 px-4 sm:px-6" disabled={!count} onClick={() => go("offer")}>
                  <span className="sm:hidden">Granska offert</span>
                  <span className="hidden sm:inline">Nästa: granska offert</span> {Icons.arrow}
                </Primary>
              </div>
            </BottomBar>
          </main>
        )}

        {shown === "offer" && (
          <main className="mx-auto w-full max-w-[720px] px-5 py-6 sm:px-8 sm:py-8">
            <BackLink onClick={() => back(offerBack)} className="mb-3">
              {offerBack === "products" ? "Tillbaka till produkterna" : "Tillbaka till paketen"}
            </BackLink>
            <StepHeader kicker={kicker(4)} title="Granska offert" sub="Vi återkommer inom en arbetsdag med pris och leveranstid. Förfrågan är inte bindande." />

            <div className="mt-8 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={boothUrl} alt={pictureAlt} className={`${frame(fmt)} w-32 shrink-0 rounded-xl object-cover sm:w-40`} />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">
                  {ev.title} för {name}
                </p>
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
                {Icons.calendar} {eventDate && `${ev.dateLabel} ${fmtDay(eventDate)}. `}
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
            <StepHeader
              title={
                <>
                  <span className="ifk-pop mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#1D1D1F] text-white [&_svg]:h-5 [&_svg]:w-5">{Icons.check}</span>
                  Tack!
                </>
              }
              sub={
                quote.emailed ? (
                  <>
                    Vi har skickat offerten som PDF till <span className="font-medium text-[#1D1D1F]">{contact.email.trim()}</span>. Er säljare återkommer inom en arbetsdag med korrektur och leveransdatum.
                  </>
                ) : (
                  <>
                    Vi har tagit emot förfrågan och hör av oss till <span className="font-medium text-[#1D1D1F]">{contact.email.trim()}</span> inom en arbetsdag. Ingen kopia har skickats via e-post – ladda ner offerten som PDF här.
                  </>
                )
              }
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={boothUrl} alt={pictureAlt} className={`mt-8 ${frame(fmt)} w-full rounded-2xl object-cover`} />
            <dl className="mt-6 divide-y divide-black/[0.06] border-y border-black/[0.06] text-left text-[15px]">
              {[
                ["Referens", `#${quote.reference}`],
                ["Produkter", String(count)],
                ...(eventDate ? [[ev.dateLabel, fmtDay(eventDate)]] : []),
                ...(deliveryNote ? [["Leverans", deliveryNote.late ? "Kort om tid – vi hör av oss om express" : `I tid till ${ev.dateLabel.toLowerCase()}`]] : []),
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
            <TextLink onClick={() => reset("type")} className="mt-8 text-[13px]">
              Skapa {ev.again}
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
          event={ev}
          date={quote.date}
          reference={quote.reference}
          booth={boothUrl}
          format={fmt}
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
