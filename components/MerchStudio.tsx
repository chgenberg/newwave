"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IFKLoader, useLoader } from "@/components/IFKLoader";
import { type CollagePhoto, type CollageTile, MerchCollage } from "@/components/MerchCollage";
import { ProductMockup, mockupSvg } from "@/components/ProductMockup";
import type { ArtworkResult } from "@/lib/artwork";
import { PRINT_H, PRINT_W, composeBackPrint, composeCampaignImage, composePrintFile, loadClubCrest, qrDataUrl } from "@/lib/compose";
import type { BrandCopy, CatalogProduct, Club, Concept, ContentPack, RuleCheck, Signal, SourceStatus } from "@/lib/types";
import { MERCH, type ProductLibrary } from "@/lib/merch";
import { composeMerch } from "@/lib/merchCompose";
import { renderReel } from "@/lib/video";
import { type PackItem, buildCampaignZip, downloadBlob } from "@/lib/zip";

type Step = "club" | "signals" | "prints" | "collage" | "content";
type ClubListItem = { id: string; name: string; city: string; nicknames: string[] };
type ClubData = { club: Club; catalog: CatalogProduct[]; ai: { enabled: boolean } };
type Suggestion = Concept & {
  checks: RuleCheck[];
  artwork?: ArtworkResult;
  preview?: string;
  status: "waiting" | "drawing" | "done" | "error" | "blocked";
  error?: string;
};
type SignalsResponse = {
  season: Signal;
  occasions: Signal[];
  trends: Signal[];
  matches: Signal[];
  weather: Signal | null;
  sources: SourceStatus[];
  trendError: string | null;
};

const SIGNAL_LABEL: Partial<Record<Signal["kind"], string>> = {
  offer: "Erbjudande",
  trend: "Nyheter",
  news: "Nyhet",
  club: "Klubben",
  social: "YouTube",
  podcast: "Podd",
  search: "Sökning",
  weather: "Väder",
  match: "Match",
  season: "Säsong",
  custom: "Eget",
};
const signalLabel = (s: Signal, brand: boolean) =>
  s.kind === "club" && brand
    ? "Pressrum"
    : s.kind === "match" && s.daysUntil !== undefined
      ? `Match om ${s.daysUntil} d`
      : (SIGNAL_LABEL[s.kind] ?? `Om ${s.daysUntil} dagar`);
type ContentResult = {
  conceptId: string;
  shopUrl: string;
  links: Record<string, string>;
  content: ContentPack;
  intersport: unknown;
};
type Prints = { light: string; dark: string; lightUrl: string; darkUrl: string };
type Collage = { suggestion: Suggestion; prints: Prints; preview: string; tiles: CollageTile[]; photos: CollagePhoto[] | null };

let libraryCache: Promise<ProductLibrary> | null = null;
const productLibrary = () => (libraryCache ??= fetch("/products/library.json").then((r) => r.json()));

type PendingDrop = {
  id: string;
  clubId: string;
  signal: Signal;
  suggestions: (Concept & { checks: RuleCheck[]; artwork: ArtworkResult | null; error?: string })[];
};

const STEPS: Step[] = ["club", "signals", "prints", "collage", "content"];
const MAX_SIGNALS = 3;
const PRINTS = 3;
const PREVIEW_SCALE = 0.25;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
  return json as T;
}

const upload = (dataUrl: string) => post<{ url: string }>("/api/v1/files", { dataUrl }).then((r) => r.url);

const displayFont = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--font-brand").trim() || "Impact, sans-serif";

const conceptOnly = (s: Suggestion): Concept => ({
  id: s.id,
  signal: s.signal,
  mode: s.mode ?? "standard",
  title: s.title,
  slogan: s.slogan,
  story: s.story,
  style: s.style,
  artDirection: s.artDirection,
  palette: s.palette,
  products: s.products,
});

function Lock() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v5A1.5 1.5 0 0 1 12 15H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 7h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  );
}

function PrimaryButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#1D1D1F] px-8 text-[15px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#D2D2D7]"
    >
      {props.loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {props.children}
    </button>
  );
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${on ? "border-[var(--brand,#234B9A)] bg-[var(--brand,#234B9A)] text-white" : "border-[#C7C7CC] bg-white"}`}
    >
      {on && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
    </span>
  );
}

const BRAND_BLANKS = new Set(["hoodie", "keps"]);

export function MerchStudio({ copy, kind, defaultClubId }: { copy: BrandCopy; kind?: "brand"; defaultClubId: string }) {
  const isBrand = kind === "brand";
  const [step, setStep] = useState<Step>("club");
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [query, setQuery] = useState("");
  const [clubId, setClubId] = useState<string | null>(null);
  const [data, setData] = useState<ClubData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [trendNote, setTrendNote] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [newsUrl, setNewsUrl] = useState("");
  const [newsBusy, setNewsBusy] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [news, setNews] = useState<{ signal: Signal; article: { title: string; site: string; image: string | null; published: string } } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [collage, setCollage] = useState<Collage | null>(null);
  const [pack, setPack] = useState<PackItem[]>([]);
  const [fromMatch, setFromMatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const runId = useRef(0);
  const loader = useLoader();

  const club = data?.club;
  const product = (id: string) => data!.catalog.find((p) => p.id === id)!;

  const previewFor = useCallback(async (c: Club, s: { slogan: string }, artworkUrl: string) => {
    await loadClubCrest(c.id, c.kind === "brand");
    return composePrintFile({
      artworkUrl,
      slogan: s.slogan,
      footer: `${c.name} · ${c.arena}`,
      variant: "light",
      font: displayFont(),
      primary: c.palette[0].hex,
      scale: PREVIEW_SCALE,
    });
  }, []);

  useEffect(() => {
    fetch(isBrand ? "/api/v1/clubs?kind=brand" : "/api/v1/clubs").then((r) => r.json()).then((d) => setClubs(d.clubs));
    const dropId = new URLSearchParams(window.location.search).get("drop");
    if (!dropId) return;
    (async () => {
      const drop: PendingDrop = await fetch(`/api/v1/drops/${dropId}`).then((r) => r.json());
      if (!drop?.suggestions) return;
      const d: ClubData = await fetch(`/api/v1/clubs/${drop.clubId}`).then((r) => r.json());
      setClubId(drop.clubId);
      setData(d);
      setSignals([drop.signal]);
      setActive(new Set([drop.signal.id]));
      setFromMatch(drop.signal.detail);
      const list: Suggestion[] = await Promise.all(
        drop.suggestions.map(async (s) => {
          if (!s.artwork) return { ...s, artwork: undefined, status: "blocked" as const };
          const preview = await previewFor(d.club, s, s.artwork.url);
          return { ...s, artwork: s.artwork, preview, status: s.artwork.passed ? ("done" as const) : ("blocked" as const) };
        }),
      );
      setSuggestions(list);
      setStep("prints");
    })();
  }, [previewFor, isBrand]);

  const matches = query.trim()
    ? clubs.filter((c) => [c.name, c.city, ...c.nicknames].some((s) => s.toLowerCase().includes(query.trim().toLowerCase())))
    : clubs;

  const { start: loaderStart, done: loaderDone, fail: loaderFail } = loader;
  const guard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      loaderStart(label);
      try {
        await fn();
        loaderDone();
      } catch (e) {
        loaderFail();
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [loaderStart, loaderDone, loaderFail],
  );

  const goSignals = () =>
    guard(`Hämtar ${copy.org} grafiska profil`, async () => {
      const d: ClubData = await fetch(`/api/v1/clubs/${clubId}`).then((r) => r.json());
      setData(d);
      setStep("signals");
      loader.stage(`${copy.listening} ${d.club.name}`, 95, 14000);
      const s: SignalsResponse = await fetch(`/api/v1/signals?clubId=${clubId}`).then((r) => r.json());
      const list = [...s.matches, ...s.trends, ...(s.weather ? [s.weather] : []), ...s.occasions, s.season];
      setSignals(list);
      const soon = s.occasions.filter((o) => (o.daysUntil ?? 99) <= 45);
      setActive(new Set([...s.matches, ...s.trends, ...soon, s.season].slice(0, MAX_SIGNALS).map((x) => x.id)));
      const down = s.sources.filter((x) => !x.ok).map((x) => x.name);
      setTrendNote(s.trendError ? "Kunde inte hämta trender just nu – högtider och säsong används." : down.length ? `Svarade inte just nu: ${down.join(", ")}.` : null);
    });

  const toggleSignal = (id: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SIGNALS) next.add(id);
      return next;
    });
  const activate = (id: string) => setActive((prev) => new Set([...prev, id].slice(-MAX_SIGNALS)));

  const addCustom = () => {
    const title = custom.trim();
    if (title.length < 2) return;
    const s: Signal = { id: `custom-${Date.now()}`, kind: "custom", title, detail: title };
    setSignals((prev) => [s, ...prev]);
    activate(s.id);
    setCustom("");
  };

  const readNews = async () => {
    setNewsBusy(true);
    setNewsError(null);
    loader.start("Läser nyheten", 45, 2500);
    try {
      setTimeout(() => loader.stage("Bedömer om nyheten passar för merch", 95, 9000), 1500);
      const res = await post<NonNullable<typeof news>>("/api/v1/news", { clubId, url: newsUrl });
      loader.done();
      setNews(res);
      setSignals((prev) => [res.signal, ...prev.filter((x) => x.kind !== "news")]);
      activate(res.signal.id);
      setNewsUrl("");
    } catch (e) {
      loader.fail();
      setNewsError(e instanceof Error ? e.message : String(e));
    } finally {
      setNewsBusy(false);
    }
  };

  const goSuggestions = (only?: Signal[]) =>
    guard("Läser signalerna", async () => {
      ++runId.current;
      loader.stage(`Tar fram tre idéer inom ${copy.org} ramar`, 96, 18000);
      const chosen = only ?? signals.filter((s) => active.has(s.id));
      if (only) setActive(new Set(only.map((s) => s.id)));
      const res = await post<{ concepts: (Concept & { checks: RuleCheck[] })[] }>("/api/v1/concepts", {
        clubId,
        signals: chosen,
        count: PRINTS,
      });
      const list: Suggestion[] = res.concepts.map((c) => ({
        ...c,
        status: c.checks.every((r) => r.ok) ? "done" : "blocked",
      }));
      setSuggestions(list);
      setChosenId(null);
      setFromMatch(null);
      setStep("prints");
    });

  const goCollage = () =>
    guard("Förbereder trycket", async () => {
      const c = club!;
      const picked = suggestions.find((x) => x.id === chosenId && x.status === "done");
      if (!picked) return;
      const id = ++runId.current;
      const primary = c.palette[0].hex;
      const font = displayFont();
      await loadClubCrest(c.id, c.kind === "brand");

      let s = picked;
      if (!s.artwork) {
        loader.stage(`Ritar trycket och kontrollerar ${copy.org} ramar`, 60, 30000);
        const artwork = await post<ArtworkResult>("/api/v1/artwork", { clubId: c.id, concept: conceptOnly(s) });
        const preview = await previewFor(c, s, artwork.url);
        s = { ...s, artwork, preview, status: artwork.passed ? "done" : "blocked" };
        const updated = s;
        setSuggestions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        if (!artwork.passed) {
          const why = artwork.imageChecks.filter((x) => !x.ok).map((x) => x.rule).join(", ");
          throw new Error(`Trycket stoppades av ${copy.org} ramar (${why}). Välj ett annat eller be om nya tryck.`);
        }
      }

      loader.stage("Gör tryckfiler i 300 dpi", 72, 5000);
      const base = { artworkUrl: s.artwork!.url, slogan: s.slogan, footer: `${c.name} · ${c.arena}`, font, primary };
      const light = await composePrintFile({ ...base, variant: "light" });
      const dark = await composePrintFile({ ...base, variant: "dark" });
      const [lightUrl, darkUrl] = await Promise.all([upload(light), upload(dark)]);
      const prints: Prints = { light, dark, lightUrl, darkUrl };

      loader.stage(`Lägger trycket på ${MERCH.length} produkter`, 96, 5000);
      const [library, smallLight, smallDark] = await Promise.all([
        productLibrary(),
        composePrintFile({ ...base, variant: "light", scale: 0.4 }),
        composePrintFile({ ...base, variant: "dark", scale: 0.4 }),
      ]);
      const crest = `/api/v1/brand/${c.id}/${c.brand.crest.farg}`;
      const tiles = await Promise.all(
        MERCH.filter((m) => library[m.id]).map(async (m) => ({
          id: m.id,
          name: m.name,
          priceSek: m.priceSek,
          url: await composeMerch({
            product: m,
            entry: library[m.id],
            blankUrl: `/products/${isBrand && BRAND_BLANKS.has(m.id) ? "circle-k/" : ""}${m.id}.jpg`,
            artUrl: m.art === "crest" ? crest : m.variant === "dark" ? smallDark : smallLight,
          }),
        })),
      );
      setCollage({ suggestion: s, prints, preview: smallLight, tiles, photos: null });
      setStep("collage");

      post<{ photos: CollagePhoto[] }>("/api/v1/photos", {
        clubId: c.id,
        concept: conceptOnly(s),
        printFiles: { light: lightUrl, dark: darkUrl },
        scenes: ["livsstil", "filt"],
      })
        .then((r) => r.photos)
        .catch((): CollagePhoto[] => [])
        .then((photos) => runId.current === id && setCollage((prev) => (prev && prev.suggestion.id === s.id ? { ...prev, photos } : prev)));
    });

  const goContent = () =>
    guard("Förbereder innehållet", async () => {
      const c = club!;
      const primary = c.palette[0].hex;
      const font = displayFont();
      if (!collage) return;
      const chosen = [collage.suggestion];
      const prints = [collage.prints];
      await loadClubCrest(c.id, c.kind === "brand");
      setStep("content");
      setPack([]);

      loader.stage("Skriver texter till alla kanaler", 62, 30000);
      const [res, photoSets] = await Promise.all([
        post<{ results: ContentResult[] }>("/api/v1/content", {
          clubId: c.id,
          signals: signals.filter((s) => active.has(s.id)),
          items: chosen.map((s, i) => ({
            concept: conceptOnly(s),
            printFiles: { light: prints[i].lightUrl, dark: prints[i].darkUrl, vector: s.artwork!.url },
          })),
          printPixels: { width: PRINT_W, height: PRINT_H },
        }),
        Promise.resolve([(collage.photos ?? []) as PackItem["photos"]]),
      ]);

      loader.stage("Bygger bilder, QR-koder och baksidor", 76, 5000 * chosen.length);
      const items: PackItem[] = [];
      for (const [i, s] of chosen.entries()) {
        const r = res.results.find((x) => x.conceptId === s.id)!;
        const small = { light: await previewFor(c, s, s.artwork!.url) };
        const teeSvg = mockupSvg(product("tee-white"), small.light);
        const [qrTv, qrPoster] = await Promise.all([qrDataUrl(r.links.tv, primary), qrDataUrl(r.links.affisch, primary)]);
        const base = { mockupSvg: teeSvg, font, primary, cta: copy.shopName };
        const sub = r.content.banner.subline;
        const [feed, story, linkedin, banner, bannerMobile, tv, poster] = await Promise.all([
          composeCampaignImage({ ...base, headline: s.slogan, subline: sub, width: 1080, height: 1350 }),
          composeCampaignImage({ ...base, headline: s.slogan, subline: sub, width: 1080, height: 1920 }),
          composeCampaignImage({ ...base, headline: s.slogan, subline: sub, width: 1200, height: 627 }),
          composeCampaignImage({ ...base, headline: r.content.banner.headline, subline: sub, width: 1920, height: 600 }),
          composeCampaignImage({ ...base, headline: r.content.banner.headline, subline: sub, width: 1080, height: 1080 }),
          composeCampaignImage({ ...base, headline: r.content.tv.headline, subline: r.content.tv.subline, width: 1920, height: 1080, qr: { dataUrl: qrTv, caption: "Skanna och handla" } }),
          composeCampaignImage({ ...base, headline: s.slogan, subline: sub, width: 2480, height: 3508, qr: { dataUrl: qrPoster, caption: `Skanna – ${copy.shopName.charAt(0).toLowerCase()}${copy.shopName.slice(1)}` } }),
        ]);

        const family = /fars dag/i.test(s.signal)
          ? { title: "Pappa & Mini", names: ["PAPPA", "MINI"] }
          : /mors dag/i.test(s.signal)
            ? { title: "Mamma & Mini", names: ["MAMMA", "MINI"] }
            : null;
        const backNames = family ? family.names.map((n) => ({ name: n, number: "1" })) : [{ name: "ELLA", number: "7" }];
        const backPrints = isBrand ? [] : await Promise.all(
          backNames.map(async (b) => ({
            label: `${b.name} ${b.number}`,
            file: family ? `familjepaket-${b.name.toLowerCase()}-${b.number}.png` : `baksida-exempel-${b.name.toLowerCase()}-${b.number}.png`,
            dataUrl: await composeBackPrint({ ...b, variant: "light", font, primary, clubName: c.name }),
          })),
        );

        items.push({
          concept: s,
          prints: { light: prints[i].light, dark: prints[i].dark },
          vectorUrl: s.artwork!.url,
          images: { feed, story, linkedin, banner, bannerMobile, tv, poster },
          photos: photoSets[i],
          video: null,
          backPrints,
          familyPack: family?.title ?? null,
          content: r.content,
          intersport: r.intersport,
          shopUrl: r.shopUrl,
          links: r.links,
        });
      }

      loader.stage("Spelar in filmer till Reels och TikTok", 98, 11500);
      const videos = await Promise.all(
        items.map(async (it) => {
          const qr = await qrDataUrl(it.links.tiktok, primary);
          const lifestyle = it.photos.find((p) => p.id === "livsstil");
          const tee = mockupSvg(product("tee-white"), await previewFor(c, it.concept, it.vectorUrl));
          const hoodie = mockupSvg(
            isBrand ? { ...product("hoodie-navy"), garmentColor: "Grafitgrå", garmentHex: "#3A3A3C" } : product("hoodie-navy"),
            await composePrintFile({ artworkUrl: it.vectorUrl, slogan: it.concept.slogan, footer: `${c.name} · ${c.arena}`, variant: "dark", font, primary, scale: PREVIEW_SCALE }),
          );
          const { blob, ext } = await renderReel({
            headline: it.concept.slogan,
            subline: it.content.banner.subline,
            tagline: `Tryckt på beställning för ${c.nicknames[0]}`,
            photoUrl: lifestyle?.url,
            mockups: [tee, hoodie],
            qrDataUrl: qr,
            font,
            primary,
            shopName: copy.shopName,
            shopSupport: copy.shopSupport,
          });
          return { blob, ext, url: URL.createObjectURL(blob) };
        }),
      );
      setPack(items.map((it, i) => ({ ...it, video: videos[i] })));
    });

  const downloadZip = () =>
    guard("Samlar ihop allt material", async () => {
      loader.stage("Samlar ihop allt material", 25, 3000);
      const blob = await buildCampaignZip(club!, pack, (p) => loader.set(25 + p * 0.75, "Packar zip-filen"));
      downloadBlob(blob, `${club!.shortName}-innehall-${new Date().toISOString().slice(0, 10)}.zip`);
    });

  const stepIndex = STEPS.indexOf(step);
  const chosen = suggestions.find((s) => s.id === chosenId && s.status === "done");

  return (
    <main className={`flex min-h-screen flex-col bg-white ${isBrand ? "theme-circle-k" : ""}`}>
      <header className="flex h-16 items-center justify-between px-8">
        <button type="button" onClick={() => setStep("club")} className="w-64 text-left text-[15px] font-semibold tracking-tight">
          {copy.maker} <span className="font-normal text-[#86868B]">{copy.product}</span>
        </button>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full transition-all ${i <= stepIndex ? "w-6 bg-[#1D1D1F]" : "w-1.5 bg-[#D2D2D7]"}`} />
          ))}
        </div>
        <div className="flex w-64 items-center justify-end gap-3">
          {copy.navLinks && (
            <>
              <Link href="/autopilot" className="whitespace-nowrap text-xs font-medium text-[#86868B] hover:text-[#1D1D1F]">
                Autopilot
              </Link>
              <Link href="/match" className="whitespace-nowrap text-xs font-medium text-[#86868B] hover:text-[#1D1D1F]">
                Matchcentral
              </Link>
            </>
          )}
          {club && step !== "club" && (
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#F5F5F7] px-3 py-1.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#E8E8ED]"
            >
              <Lock /> Ramar
            </button>
          )}
        </div>
      </header>

      {error && <div className="mx-auto mt-2 max-w-xl rounded-2xl bg-[#FDECEA] px-5 py-3 text-sm text-[#B3261E]">{error}</div>}

      <div className="flex flex-1 flex-col items-center px-6 pb-24">
        {step === "club" && (
          <div className="mt-[18vh] w-full max-w-md text-center">
            <h1 className="text-5xl font-semibold tracking-tight">{copy.pickTitle}</h1>
            <p className="mt-3 text-[17px] text-[#86868B]">{copy.pickSubtitle}</p>
            <div className="mt-10 text-left">
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setClubId(null);
                }}
                placeholder={copy.pickPlaceholder}
                className="h-14 w-full rounded-2xl bg-[#F5F5F7] px-5 text-[17px] outline-none ring-[var(--brand,#234B9A)] placeholder:text-[#86868B] focus:ring-2"
              />
              <div className="mt-2 space-y-1">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClubId(c.id);
                      setQuery(c.name);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-left transition ${clubId === c.id ? "bg-[var(--brand,#234B9A)] text-white" : "hover:bg-[#F5F5F7]"}`}
                  >
                    <span>
                      <span className="block text-[15px] font-medium">{c.name}</span>
                      <span className={`text-xs ${clubId === c.id ? "text-white/75" : "text-[#86868B]"}`}>
                        {isBrand ? `${c.city}` : `${c.nicknames.join(" · ")} · ${c.city}`}
                      </span>
                    </span>
                    {clubId === c.id && <Checkbox on />}
                  </button>
                ))}
                {query.trim() && matches.length === 0 && (
                  <p className="px-5 py-3 text-sm text-[#86868B]">{copy.pickEmpty}</p>
                )}
              </div>
            </div>
            <div className="mt-10">
              <PrimaryButton onClick={goSignals} disabled={!clubId} loading={busy}>
                Nästa
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === "signals" && club && (
          <div className="mt-[8vh] w-full max-w-xl">
            <h1 className="text-center text-4xl font-semibold tracking-tight">Välj tre.</h1>
            <p className="mt-3 text-center text-[17px] text-[#86868B]">De tre starkaste är redan valda. Byt om du vill.</p>

            {busy && signals.length === 0 ? (
              <div className="mt-12 h-40" />
            ) : (
              <>
                <div className="mt-10">
                  <div className="flex gap-2">
                    <input
                      value={newsUrl}
                      onChange={(e) => setNewsUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && newsUrl.trim() && readNews()}
                      placeholder={copy.newsPlaceholder}
                      className="h-12 flex-1 rounded-full bg-[#F5F5F7] px-5 text-[15px] outline-none ring-[var(--brand,#234B9A)] placeholder:text-[#86868B] focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={readNews}
                      disabled={!newsUrl.trim() || newsBusy}
                      className="inline-flex h-12 items-center gap-2 rounded-full bg-[#F5F5F7] px-5 text-sm font-medium hover:bg-[#E8E8ED] disabled:opacity-50"
                    >
                      {newsBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1D1D1F] border-t-transparent" />}
                      {newsBusy ? "Läser…" : "Läs nyheten"}
                    </button>
                  </div>
                  {newsError && <p className="mt-2 px-5 text-sm text-[#B3261E]">{newsError}</p>}
                  {news && (
                    <div className="mt-3 flex items-center gap-4 rounded-3xl bg-[var(--brand-tint,#F4F8FD)] p-3 pr-4">
                      {news.article.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={news.article.image}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                          className="h-16 w-24 shrink-0 rounded-2xl object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#86868B]">
                          {news.article.site} · {news.article.published}
                        </p>
                        <p className="truncate text-sm font-medium">{news.article.title}</p>
                        <p className="text-xs text-[var(--brand,#234B9A)]">Signal: {news.signal.title}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => goSuggestions([news.signal])}
                        disabled={busy}
                        className="shrink-0 rounded-full bg-[var(--brand,#234B9A)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--brand-dark,#1A3770)] disabled:opacity-50"
                      >
                        Skapa från nyheten
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 divide-y divide-[#F0F0F2] rounded-3xl border border-[#E8E8ED]">
                  {signals.map((s) => {
                    const on = active.has(s.id);
                    const full = !on && active.size >= MAX_SIGNALS;
                    const label = signalLabel(s, isBrand);
                    return (
                      <div
                        key={s.id}
                        role="checkbox"
                        aria-checked={on}
                        tabIndex={0}
                        onClick={() => toggleSignal(s.id)}
                        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggleSignal(s.id))}
                        className={`flex w-full items-start gap-4 px-5 py-4 text-left outline-none transition focus-visible:bg-[#F5F5F7] ${full ? "cursor-default opacity-45" : "cursor-pointer"}`}
                      >
                        <Checkbox on={on} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={`text-[15px] font-medium ${on ? "" : "text-[#86868B]"}`}>{s.title}</span>
                            <span className={`shrink-0 text-xs ${s.kind === "occasion" || s.kind === "season" ? "text-[#86868B]" : "font-medium text-[var(--brand,#234B9A)]"}`}>{label}</span>
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-[#86868B]">
                            {s.detail}
                            {s.source && (
                              <>
                                {" "}
                                <a href={s.source.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[var(--brand,#234B9A)] hover:underline">
                                  {s.source.name}
                                </a>
                              </>
                            )}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                {trendNote && <p className="mt-3 text-center text-xs text-[#86868B]">{trendNote}</p>}
                <div className="mt-4 flex gap-2">
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustom()}
                    placeholder={copy.customPlaceholder}
                    className="h-11 flex-1 rounded-full bg-[#F5F5F7] px-5 text-sm outline-none ring-[var(--brand,#234B9A)] focus:ring-2"
                  />
                  <button type="button" onClick={addCustom} className="h-11 rounded-full bg-[#F5F5F7] px-5 text-sm font-medium hover:bg-[#E8E8ED]">
                    Lägg till
                  </button>
                </div>
                <div className="mt-10 text-center">
                  <PrimaryButton onClick={() => goSuggestions()} disabled={active.size === 0} loading={busy}>
                    Skapa tre tryck · {active.size}/{MAX_SIGNALS}
                  </PrimaryButton>
                </div>
              </>
            )}
          </div>
        )}

        {step === "prints" && club && (
          <div className="mt-[6vh] w-full max-w-5xl">
            <h1 className="text-center text-4xl font-semibold tracking-tight">{fromMatch ? "Efter slutsignalen." : "Tre idéer."}</h1>
            <p className="mt-3 text-center text-[17px] text-[#86868B]">
              {fromMatch ?? "Välj en idé – vi ritar trycket och lägger det på produkterna."}
            </p>
            <div className="mt-12 flex flex-wrap justify-center gap-6">
              {suggestions.map((s) => {
                const on = chosenId === s.id;
                const selectable = s.status === "done";
                const failed = [...s.checks, ...(s.artwork?.imageChecks ?? [])].filter((c) => !c.ok);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!selectable}
                    onClick={() => setChosenId(s.id)}
                    className="group flex w-[300px] flex-col justify-start text-left disabled:cursor-default"
                  >
                    <div
                      className={`relative aspect-square w-full overflow-hidden rounded-[28px] bg-[#F5F5F7] transition ${on ? "ring-2 ring-[var(--brand,#234B9A)] ring-offset-4" : "group-enabled:group-hover:bg-[#EFEFF2]"}`}
                    >
                      {s.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.preview}
                          alt={s.slogan}
                          className={`absolute inset-0 h-full w-full object-contain p-9 transition duration-500 group-enabled:group-hover:scale-[1.03] ${s.status === "blocked" ? "opacity-30" : ""}`}
                        />
                      ) : (
                        <div
                          className={`absolute inset-0 flex flex-col items-center justify-center px-8 text-center transition duration-500 group-enabled:group-hover:scale-[1.03] ${s.status === "blocked" ? "opacity-30" : ""}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/v1/brand/${club.id}/${club.brand.crest.farg}`} alt="" className="h-12 w-auto" />
                          <p className="mt-5 font-display text-[28px] uppercase leading-[1.02] text-[var(--brand,#234B9A)]">{s.slogan}</p>
                          <p className="mt-4 line-clamp-3 text-[13px] leading-snug text-[#6E6E73]">{s.story}</p>
                          {s.mode === "satir" && (
                            <span className="mt-3 rounded-full bg-[#FBC323] px-2 py-0.5 text-[10px] font-semibold uppercase">Satir</span>
                          )}
                        </div>
                      )}
                      {(s.status === "waiting" || s.status === "drawing") && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[#86868B]">
                          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#86868B] border-t-transparent" />
                          {s.status === "drawing" ? "Ritar och kontrollerar…" : "I kö"}
                        </div>
                      )}
                      {s.status === "blocked" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-xs text-[#B3261E]">
                          <Lock /> Stoppat av {copy.org} ramar
                          <span className="text-[#6E6E73]">{failed.map((c) => (c.note ? `${c.rule}: ${c.note}` : c.rule).replace("klubbens", copy.org)).join(" · ")}</span>
                        </div>
                      )}
                      {s.status === "error" && (
                        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-[#B3261E]">{s.error}</div>
                      )}
                      {selectable && (
                        <span className="absolute right-4 top-4">
                          <Checkbox on={on} />
                        </span>
                      )}
                    </div>
                    <p className="mt-4 px-1 text-xs text-[#86868B]">{s.signal}</p>
                    <p className="mt-0.5 px-1 text-[13px] text-[#3A3A3C]">{s.title}</p>
                  </button>
                );
              })}
            </div>
            <div className="sticky bottom-6 mx-auto mt-12 flex w-fit justify-center gap-3 rounded-full bg-white/85 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
              {!fromMatch && (
                <button
                  type="button"
                  onClick={() => goSuggestions()}
                  disabled={busy}
                  className="h-12 rounded-full bg-[#F5F5F7] px-6 text-[15px] font-medium hover:bg-[#E8E8ED] disabled:opacity-50"
                >
                  Nya idéer
                </button>
              )}
              <PrimaryButton onClick={goCollage} disabled={!chosen} loading={busy}>
                Generera
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === "collage" && club && collage && (
          <div className="mt-[5vh] w-full max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs text-[#86868B]">{collage.suggestion.signal}</p>
                <h1 className="font-display text-5xl uppercase leading-none text-[var(--brand,#234B9A)]">{collage.suggestion.slogan}</h1>
                <p className="mt-2 text-[15px] text-[#86868B]">
                  {collage.tiles.length} produkter med exakt tryck · {collage.photos === null ? "AI-foton tas just nu" : `${collage.photos.length} AI-foton`}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("prints")}
                  className="h-12 rounded-full bg-[#F5F5F7] px-6 text-[15px] font-medium hover:bg-[#E8E8ED]"
                >
                  Byt tryck
                </button>
                <PrimaryButton onClick={goContent} disabled={collage.photos === null} loading={busy}>
                  Skapa kanalinnehåll
                </PrimaryButton>
              </div>
            </div>
            <div className="mt-8">
              <MerchCollage
                slogan={collage.suggestion.slogan}
                signal={collage.suggestion.signal}
                story={collage.suggestion.story}
                printUrl={collage.preview}
                primary={club.palette[0].hex}
                tiles={collage.tiles}
                photos={collage.photos}
                blanketLabel={isBrand ? "Filten i bilen" : undefined}
              />
            </div>
          </div>
        )}

        {step === "content" && club && (
          <div className="mt-[6vh] w-full max-w-5xl">
            {pack.length === 0 ? (
              <div className="mt-[14vh] h-40" />
            ) : (
              <>
                <div className="text-center">
                  <h1 className="text-4xl font-semibold tracking-tight">Klart att publicera.</h1>
                  <p className="mt-3 text-[17px] text-[#86868B]">
                    Foton, film, bilder, texter, affisch, TV-skärm, tryckfiler och en guide – i en zip-fil.
                  </p>
                  <div className="mt-8">
                    <PrimaryButton onClick={downloadZip} loading={busy}>
                      Ladda ner allt (.zip)
                    </PrimaryButton>
                  </div>
                </div>
                <div className="mt-14 space-y-16">
                  {pack.map((it) => (
                    <PackPreview key={it.concept.id} item={it} club={club} personalize={!isBrand} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <IFKLoader
        state={loader.state}
        crestUrl={`/api/v1/brand/${clubId ?? defaultClubId}/skold-farg.png`}
        lines={copy.loaderLines}
        doneLine={copy.loaderDone}
        wide={isBrand}
      />

      {showRules && club && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setShowRules(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-7" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#86868B]">
              <Lock /> Låsta ramar
            </p>
            <div className="mt-3 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/brand/${club.id}/${club.brand.crest.farg}`} alt={`${club.name} ${copy.logoWord}`} className="h-16 w-auto" />
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{club.name}</h2>
                <p className="text-xs text-[#86868B]">
                  {club.tagline} · Typsnitt {club.brand.fonts.brand} / {club.brand.fonts.web}
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              {club.palette.map((c) => (
                <span key={c.hex} className="flex flex-col items-center gap-1 text-[11px] text-[#86868B]">
                  <span className="h-9 w-9 rounded-full border border-black/10" style={{ background: c.hex }} />
                  {c.name.split(" ")[0]}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm">
              <span className="font-medium">Spärrat:</span>{" "}
              <span className="text-[#6E6E73]">
                {club.forbiddenColors.map((f) => `${f.name.toLowerCase()} (${f.reason.replace("Förknippas med ", "")})`).join(", ")}
              </span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[#3A3A3C]">
              {club.rules.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#1D1D1F]" />
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-[#86868B]">
              Kontrolleras i fyra led: AI:n får reglerna, svaret kan bara innehålla tillåtna färgkoder, regelmotorn granskar
              texten och varje färdig bild analyseras pixel för pixel och av en AI-granskare. Underkända bilder ritas om
              automatiskt och vektoriseras sedan i enbart {copy.org} färger.
            </p>
            <div className="mt-6 text-right">
              <button type="button" onClick={() => setShowRules(false)} className="text-sm font-medium text-[var(--brand,#234B9A)]">
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function BackPrintTry({ club, item }: { club: Club; item: PackItem }) {
  const [name, setName] = useState("ELLA");
  const [number, setNumber] = useState("7");
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      type Validation = { ok: boolean; reason?: string; name?: string };
      const v = await post<Validation>("/api/v1/personalize", { clubId: club.id, name, number }).catch(
        (e: Error): Validation => ({ ok: false, reason: e.message }),
      );
      if (!v.ok) return setNote(v.reason ?? "Ogiltigt");
      setNote(null);
      setPreview(
        await composeBackPrint({ name: v.name!, number, variant: "light", font: displayFont(), primary: club.palette[0].hex, clubName: club.name, scale: 0.2 }),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [name, number, club]);

  return (
    <div className="rounded-3xl bg-[#F5F5F7] p-5">
      <p className="text-sm font-medium">Namn och nummer på ryggen</p>
      <p className="mt-0.5 text-xs text-[#86868B]">
        Låst mall i klubbens typsnitt. Namnen kontrolleras mot spärrlistan.
        {item.familyPack && ` Familjepaket: ${item.familyPack}.`}
      </p>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={10} className="h-10 w-32 rounded-full bg-white px-4 text-sm uppercase outline-none ring-[var(--brand,#234B9A)] focus:ring-2" />
        <input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={2} className="h-10 w-16 rounded-full bg-white px-4 text-sm outline-none ring-[var(--brand,#234B9A)] focus:ring-2" />
      </div>
      {note && <p className="mt-2 text-xs text-[#B3261E]">{note}</p>}
      <div className="mt-3 flex gap-3">
        <div className="aspect-[10/11] w-40 rounded-2xl bg-white p-2">
          {preview && <ProductMockup product={{ id: "back", name: "", kind: "tee", garmentColor: "", garmentHex: "#F7F7F5", dark: false, priceSek: 0, sizes: [], printArea: { widthCm: 30, heightCm: 40, method: "DTG" } }} printUrl={preview} />}
        </div>
        {item.backPrints.length > 1 &&
          item.backPrints.map((b) => (
            <div key={b.file} className="aspect-[10/11] w-40 rounded-2xl bg-white p-2">
              <ProductMockup product={{ id: b.file, name: "", kind: "tee", garmentColor: "", garmentHex: "#F7F7F5", dark: false, priceSek: 0, sizes: [], printArea: { widthCm: 30, heightCm: 40, method: "DTG" } }} printUrl={b.dataUrl} />
            </div>
          ))}
      </div>
    </div>
  );
}

function PackPreview({ item, club, personalize }: { item: PackItem; club: Club; personalize: boolean }) {
  const c = item.content;
  const texts: [string, string][] = [
    ["Instagram", `${c.instagram.caption}\n\n${c.instagram.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`],
    ["Facebook", c.facebook.post],
    ["LinkedIn", c.linkedin.post],
    ["TikTok / Reels", `${c.tiktok.hook}\n\n${c.tiktok.caption}`],
    ["Nyhetsbrev", `${c.newsletter.subject}\n\n${c.newsletter.body}`],
  ];
  const tile = "w-full rounded-2xl object-cover";
  return (
    <section>
      <p className="text-xs text-[#86868B]">{item.concept.signal}</p>
      <h2 className="font-display text-3xl uppercase text-[var(--brand,#234B9A)]">{item.concept.slogan}</h2>

      {/* eslint-disable @next/next/no-img-element */}
      <div className="mt-5 grid grid-cols-4 gap-3">
        {item.photos.map((p) => (
          <figure key={p.id} className="col-span-1">
            <img src={p.url} alt={p.label} className={`${tile} aspect-[2/3]`} />
            <figcaption className="mt-1.5 text-xs text-[#86868B]">Foto · {p.label}</figcaption>
          </figure>
        ))}
        {item.video && (
          <figure className="col-span-1">
            <video src={item.video.url} poster={item.images.story} controls muted loop playsInline className={`${tile} aspect-[9/16] bg-black`} />
            <figcaption className="mt-1.5 text-xs text-[#86868B]">Film 10 s · Reels / TikTok ({item.video.ext})</figcaption>
          </figure>
        )}
        <figure className="col-span-1">
          <img src={item.images.poster} alt="Affisch" className={`${tile} aspect-[2480/3508]`} />
          <figcaption className="mt-1.5 text-xs text-[#86868B]">Affisch A4 med QR</figcaption>
        </figure>
        <figure className="col-span-2">
          <img src={item.images.tv} alt="TV-skärm" className={tile} />
          <figcaption className="mt-1.5 text-xs text-[#86868B]">TV-skärm med QR</figcaption>
        </figure>
        <figure className="col-span-1">
          <img src={item.images.feed} alt="Instagram och Facebook" className={tile} />
          <figcaption className="mt-1.5 text-xs text-[#86868B]">Instagram / Facebook 4:5</figcaption>
        </figure>
        <figure className="col-span-1">
          <img src={item.images.linkedin} alt="LinkedIn" className={tile} />
          <figcaption className="mt-1.5 text-xs text-[#86868B]">LinkedIn</figcaption>
        </figure>
        <figure className="col-span-4">
          <img src={item.images.banner} alt="Hemsidebanner" className={tile} />
          <figcaption className="mt-1.5 text-xs text-[#86868B]">Hemsidebanner 1920×600</figcaption>
        </figure>
      </div>
      {/* eslint-enable @next/next/no-img-element */}

      <div className={`mt-5 grid gap-3 ${personalize ? "lg:grid-cols-[1fr_1fr]" : ""}`}>
        {personalize && <BackPrintTry club={club} item={item} />}
        <div className={`grid gap-3 ${personalize ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {texts.map(([title, text]) => (
            <details key={title} className="rounded-2xl bg-[#F5F5F7] px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium">{title}</summary>
              <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-[#3A3A3C] [overflow-wrap:anywhere]">{text}</p>
            </details>
          ))}
          <details className="rounded-2xl bg-[#F5F5F7] px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium">Publiceringsplan</summary>
            <ul className="mt-3 space-y-1.5 text-[13px] text-[#3A3A3C]">
              {c.plan.map((p, i) => (
                <li key={i}>
                  <span className="text-[#86868B]">{p.date}</span> · <span className="font-medium">{p.channel}</span> – {p.action}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </section>
  );
}
