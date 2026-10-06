"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mockupSvg } from "@/components/ProductMockup";
import type { ArtworkResult } from "@/lib/artwork";
import { PRINT_H, PRINT_W, composePrintFile, loadClubCrest, loadImage, svgToDataUrl } from "@/lib/compose";
import type { CatalogProduct, Club, Concept, ContentPack, Review, RuleCheck, Signal, SourceStatus } from "@/lib/types";

type ClubData = { club: Club; catalog: CatalogProduct[]; ai: { enabled: boolean } };
type Entry = {
  id: number;
  at: string;
  kind: "start" | "signal" | "idea" | "motif" | "skip" | "photo" | "publish" | "done" | "error";
  title: string;
  detail?: string;
  images?: string[];
  review?: Review;
  pass?: boolean;
  badge?: string;
};
type Photo = { id: string; label: string; url: string; review: Review | null; attempts: number; method?: string };

const CLUB_ID = "ifk-goteborg";
const MAX_MOTIFS = 2;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
  return json as T;
}
const upload = (dataUrl: string) => post<{ url: string }>("/api/v1/files", { dataUrl }).then((r) => r.url);
const font = () => getComputedStyle(document.documentElement).getPropertyValue("--font-brand").trim() || "sans-serif";

async function mockupPng(product: CatalogProduct, printUrl: string) {
  const img = await loadImage(svgToDataUrl(mockupSvg(product, printUrl, false)));
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1100;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#F5F5F7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

const SOURCES: { id?: string; name: string; what: string }[] = [
  { id: "news", name: "Google Nyheter", what: "Svensk press om klubben, senaste 14 dagarna" },
  { id: "club", name: "Klubbens nyheter", what: "ifkgoteborg.se – jubileum, biljettsläpp, evenemang" },
  { id: "match", name: "Allsvenskan", what: "Nästa match och färska segrar" },
  { id: "social", name: "Klubbens YouTube", what: "Det som engagerar supportrarna" },
  { id: "podcast", name: "Supporterpoddar", what: "Läktarens egna uttryck – underlag för satir" },
  { id: "search", name: "Google Trends", what: "Vad Sverige söker på just nu" },
  { id: "weather", name: "SMHI", what: "Hoodie när det är kallt, t-tröja i solen" },
  { name: "Svensk kalender", what: "Högtider, säsong och fotbollsåret" },
  { name: "Valfri nyhetslänk", what: "Klistra in en URL i manuellt läge" },
];

const NEXT_SOURCES = [
  { name: "Intersports försäljningsdata", what: "Agenten lär sig vad som faktiskt säljer" },
  { name: "Instagram, Facebook och TikTok", what: "Kräver att klubben ger åtkomst via Meta och TikTok" },
  { name: "Supporterforum", what: "T.ex. Svenska Fans – kräver avtal, blockerar i dag automatisk läsning" },
  { name: "Liveresultat i realtid", what: "API-Football eller Sportmonks för minut-för-minut-triggers" },
];

const ICON: Record<Entry["kind"], string> = {
  start: "●",
  signal: "◎",
  idea: "✎",
  motif: "▣",
  skip: "–",
  photo: "◐",
  publish: "↑",
  done: "✓",
  error: "!",
};

function Scores({ r, pass, min }: { r: Review; pass?: boolean; min: number }) {
  const ok = pass ?? r.verdict === "publicera";
  const cell = (label: string, v: number) => (
    <div className="flex flex-col items-center rounded-xl bg-white px-2 py-1.5">
      <span className={`font-display text-xl leading-none ${v >= min ? "text-[#1B7F3B]" : "text-[#B3261E]"}`}>{v}</span>
      <span className="mt-0.5 text-[10px] text-[#86868B]">{label}</span>
    </div>
  );
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1.5">
        {cell("Säljbarhet", r.sales)}
        {cell("Realism", r.realism)}
        {cell("Relevans", r.relevance)}
        {cell("Varumärke", r.brandFit)}
      </div>
      <p className="mt-1.5 text-xs text-[#3A3A3C]">
        <span className={`font-semibold ${ok ? "text-[#1B7F3B]" : "text-[#B3261E]"}`}>
          {pass === undefined ? (ok ? "Godkänd för publicering" : "Underkänd") : ok ? "Går vidare till fotografering" : "Underkänd"}
        </span>{" "}
        · {r.summary}
      </p>
    </div>
  );
}

export default function Autopilot() {
  const [data, setData] = useState<ClubData | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(false);
  const [published, setPublished] = useState(0);
  const [status, setStatus] = useState<SourceStatus[] | null>(null);
  const seq = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    fetch(`/api/v1/clubs/${CLUB_ID}`).then((r) => r.json()).then(setData);
  }, []);

  const add = (e: Omit<Entry, "id" | "at">) =>
    setLog((prev) => [...prev, { ...e, id: ++seq.current, at: new Date().toLocaleTimeString("sv-SE") }]);

  const run = async () => {
    if (runningRef.current || !data) return;
    runningRef.current = true;
    setRunning(true);
    const { club, catalog } = data;
    const product = (id: string) => catalog.find((p) => p.id === id)!;
    const primary = club.palette[0].hex;
    const started = Date.now();
    try {
      await loadClubCrest(club.id);
      add({ kind: "start", title: `${club.agent.name} startar`, detail: club.agent.mission });

      const s: { season: Signal; occasions: Signal[]; trends: Signal[]; matches: Signal[]; weather: Signal | null; sources: SourceStatus[] } =
        await fetch(`/api/v1/signals?clubId=${club.id}`).then((r) => r.json());
      setStatus(s.sources);
      const signals = [...s.matches, ...s.trends, ...(s.weather ? [s.weather] : []), ...s.occasions.filter((o) => (o.daysUntil ?? 99) <= 45), s.season];
      add({
        kind: "signal",
        title: `Hittade ${signals.length} signaler i ${s.sources.filter((x) => x.ok).length + 1} källor`,
        detail: signals.map((x) => x.title).join(" · "),
      });

      const { concepts } = await post<{ concepts: (Concept & { checks: RuleCheck[] })[] }>("/api/v1/concepts", { clubId: club.id, signals });
      const satire = concepts.filter((c) => c.mode === "satir").length;
      add({
        kind: "idea",
        title: `Tog fram ${concepts.length} motividéer${satire ? `, varav ${satire} satir` : ""}`,
        detail: concepts.map((c) => `"${c.slogan}"`).join(" · "),
      });

      const queue = concepts.filter((c) => c.checks.every((r) => r.ok));
      const drawn: { concept: Concept; artwork: ArtworkResult; preview: string; review: Review }[] = [];
      const worker = async () => {
        for (let c = queue.shift(); c; c = queue.shift()) {
          try {
            const { checks: _ch, ...original } = c;
            void _ch;
            const concept: Concept = original;
            let feedback: string | undefined;
            for (let round = 0; ; round++) {
              const artwork = await post<ArtworkResult>("/api/v1/artwork", { clubId: club.id, concept, feedback });
              if (!artwork.passed) {
                add({ kind: "skip", title: `Stoppat av ramarna: "${c.slogan}"`, detail: artwork.imageChecks.filter((x) => !x.ok).map((x) => x.rule).join(", ") });
                break;
              }
              const preview = await composePrintFile({ artworkUrl: artwork.url, slogan: c.slogan, footer: `${club.name} · ${club.arena}`, variant: "light", font: font(), primary, scale: 0.25 });
              const mock = await mockupPng(product("tee-white"), preview);
              const review = await post<Review>("/api/v1/review", { clubId: club.id, concept, imageUrl: await upload(mock), kind: "motiv" });
              add({
                kind: "motif",
                title: round === 0 ? `Motiv granskat: "${c.slogan}"` : `Reviderat motiv granskat: "${c.slogan}"`,
                badge: c.mode === "satir" ? "Satir" : round > 0 ? "Revidering" : undefined,
                detail: artwork.attempts > 1 ? `Regelmotorn ritade om ${artwork.attempts - 1} gång(er)` : undefined,
                images: [mock],
                review,
                pass: review.sales >= club.agent.review.minMotifSales && review.brandFit >= club.agent.review.minBrandFit,
              });
              if (review.sales >= club.agent.review.minMotifSales && review.brandFit >= club.agent.review.minBrandFit) {
                drawn.push({ concept, artwork, preview, review });
                break;
              }
              if (round >= club.agent.review.maxRetries || review.sales < 5) break;
              feedback = `${review.issues.join("; ")}. Make it bolder, more distinctive and more ${club.nicknames[0]}.`;
            }
          } catch (e) {
            add({ kind: "error", title: `Fel för "${c.slogan}"`, detail: e instanceof Error ? e.message : String(e) });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      const chosen = drawn
        .sort((a, b) => b.review.sales - a.review.sales)
        .slice(0, MAX_MOTIFS);
      if (chosen.length === 0) {
        add({ kind: "done", title: `Inget motiv nådde ${club.agent.review.minMotifSales}/10 i dag`, detail: "Agenten publicerar hellre ingenting än något halvbra. Nytt försök vid nästa körning." });
        return;
      }
      add({ kind: "signal", title: `${chosen.length} motiv går vidare till fotografering på modell`, detail: chosen.map((c) => `"${c.concept.slogan}" (${c.review.sales}/10)`).join(" · ") });

      let total = 0;
      for (const d of chosen) {
        const base = { artworkUrl: d.artwork.url, slogan: d.concept.slogan, footer: `${club.name} · ${club.arena}`, font: font(), primary };
        const [light, dark] = await Promise.all([composePrintFile({ ...base, variant: "light" }), composePrintFile({ ...base, variant: "dark" })]);
        const [lightUrl, darkUrl] = await Promise.all([upload(light), upload(dark)]);
        const darkPreview = await composePrintFile({ ...base, variant: "dark", scale: 0.25 });
        const mockups: Record<string, string> = {};
        for (const id of d.concept.products) {
          const p = product(id);
          if (!p || p.kind === "mug") continue;
          mockups[id] = await upload(await mockupPng(p, p.dark ? darkPreview : d.preview));
        }

        const [content, photoRes] = await Promise.all([
          post<{ results: { dropId: string; content: ContentPack; intersport: { products: { description: string }[] } }[] }>("/api/v1/content", {
            clubId: club.id,
            signals,
            items: [{ concept: d.concept, printFiles: { light: lightUrl, dark: darkUrl, vector: d.artwork.url } }],
            printPixels: { width: PRINT_W, height: PRINT_H },
          }),
          post<{ photos: Photo[] }>("/api/v1/photos", { clubId: club.id, concept: d.concept, printFiles: { light: lightUrl, dark: darkUrl } }),
        ]);
        for (const ph of photoRes.photos) {
          add({
            kind: "photo",
            title: `Foto på modell: ${ph.label.toLowerCase()}${ph.attempts > 1 ? ` (försök ${ph.attempts})` : ""}`,
            detail: ph.method === "exakt tryck" ? "Exakt tryckfil med officiell sköld lagd på fotot" : undefined,
            images: [ph.url],
            review: ph.review ?? undefined,
          });
        }

        const r = content.results[0];
        const pub = await post<{ published: number; reason?: string; shopUrl?: string }>("/api/v1/publish", {
          clubId: club.id,
          dropId: r.dropId,
          concept: d.concept,
          description: r.intersport.products[0]?.description ?? d.concept.story,
          printFiles: { light: lightUrl, dark: darkUrl },
          photos: photoRes.photos.map((p) => ({ url: p.url, label: p.label, review: p.review })),
          mockups,
        });
        total += pub.published;
        add({
          kind: pub.published ? "publish" : "skip",
          title: pub.published ? `Publicerade ${pub.published} produkter via Intersport-API` : `Publicerade inte "${d.concept.slogan}"`,
          detail: pub.published ? `"${d.concept.slogan}" ligger nu i ${club.name}s klubbshop` : pub.reason,
        });
      }
      setPublished((n) => n + total);
      add({
        kind: "done",
        title: `Klart på ${Math.round((Date.now() - started) / 1000)} sekunder`,
        detail: `${total} nya produkter i klubbshoppen – utan att någon på klubben behövde göra något.`,
      });
    } catch (e) {
      add({ kind: "error", title: "Körningen avbröts", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => void run(), 15 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, data]);

  const club = data?.club;

  return (
    <main className="min-h-screen bg-white">
      <header className="flex flex-wrap items-center justify-between px-4 pt-2 md:h-16 md:flex-nowrap md:px-8 md:pt-0">
        <Link href="/" className="inline-block py-3 text-[15px] font-semibold tracking-tight md:-my-3">
          Craft <span className="font-normal text-[#86868B]">Klubbmerch</span>
        </Link>
        <div className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center text-[13px] font-medium text-[#86868B] md:mx-0 md:w-auto md:gap-5 md:text-xs [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center [&>a]:whitespace-nowrap [&>a]:px-2 md:[&>a]:min-h-0 md:[&>a]:px-0">
          <Link href="/" className="hover:text-[#1D1D1F]">Manuellt läge</Link>
          <Link href="/match" className="hover:text-[#1D1D1F]">Matchcentral</Link>
          <Link href={`/intersport/${CLUB_ID}`} className="hover:text-[#1D1D1F]">Klubbshop hos Intersport</Link>
        </div>
      </header>

      {club && (
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-[4vh] sm:px-6 lg:grid-cols-[340px_1fr]">
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-3xl border border-[#E8E8ED] p-5 sm:p-6">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/brand/${club.id}/${club.brand.crest.farg}`} alt="" className="h-14 w-auto" />
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#86868B]">Klubbagent</p>
                  <h2 className="text-lg font-semibold">{club.agent.name}</h2>
                </div>
              </div>
              <ul className="mt-5 space-y-2 text-[13px] text-[#3A3A3C]">
                <li className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#234B9A]" />Bara {club.shortName}:s färger och symboler</li>
                {club.agent.satire.allowed && (
                  <li className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#FBC323]" />Satir tillåten vid derbyn – aldrig rivalens sköld</li>
                )}
                <li className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B7F3B]" />
                  Publicerar bara det som får minst {club.agent.review.minSales}/10
                </li>
              </ul>
              <details className="group mt-4">
                <summary className="-my-3.5 cursor-pointer list-none py-3.5 text-xs font-medium text-[#234B9A]">
                  <span className="group-open:hidden">Visa alla riktlinjer</span>
                  <span className="hidden group-open:inline">Dölj riktlinjer</span>
                </summary>
                <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-[#6E6E73]">
                  {[...club.agent.guidelines, ...(club.agent.satire.allowed ? club.agent.satire.rules : [])].map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </details>
            </div>

            <div className="mt-4 rounded-3xl border border-[#E8E8ED] p-5 sm:p-6">
              <p className="text-xs uppercase tracking-wider text-[#86868B]">Källor</p>
              <ul className="mt-3 space-y-2.5">
                {SOURCES.map((s) => {
                  const live = s.id ? status?.find((x) => x.id === s.id) : undefined;
                  const down = live && !live.ok;
                  return (
                    <li key={s.name} className="flex items-start justify-between gap-3 text-[13px]">
                      <div>
                        <p className="font-medium text-[#1D1D1F]">{s.name}</p>
                        <p className="text-[12px] text-[#86868B]">{s.what}</p>
                      </div>
                      <span
                        title={live?.note}
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${down ? "bg-[#FDECEA] text-[#B3261E]" : "bg-[#E3F1E7] text-[#1B7F3B]"}`}
                      >
                        {!live ? "Aktiv" : down ? "Svarar inte" : `${live.count} nya`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <details className="group mt-5 border-t border-[#E8E8ED] pt-4">
                <summary className="-my-3.5 cursor-pointer list-none py-3.5 text-xs font-medium text-[#234B9A]">
                  <span className="group-open:hidden">Kan läggas till ({NEXT_SOURCES.length})</span>
                  <span className="hidden group-open:inline">Dölj</span>
                </summary>
                <ul className="mt-3 space-y-2.5">
                  {NEXT_SOURCES.map((s) => (
                    <li key={s.name} className="text-[13px]">
                      <p className="font-medium text-[#1D1D1F]">{s.name}</p>
                      <p className="text-[12px] text-[#86868B]">{s.what}</p>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </aside>

          <section className="order-first min-w-0 lg:order-none">
            <h1 className="text-4xl font-semibold tracking-tight">Autopilot.</h1>
            <p className="mt-3 max-w-xl text-[17px] text-[#86868B]">Klubben gör ingenting. Agenten sköter resten.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void run()}
                disabled={running}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1D1D1F] px-8 text-[15px] font-medium text-white hover:bg-black disabled:bg-[#D2D2D7]"
              >
                {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {running ? "Agenten arbetar…" : "Starta autopilot"}
              </button>
              <label className="flex min-h-11 items-center gap-2 text-sm text-[#3A3A3C] lg:min-h-0">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#234B9A]" />
                Kör automatiskt var 15:e minut
              </label>
              {published > 0 && (
                <Link href={`/intersport/${CLUB_ID}`} className="text-sm font-medium text-[#234B9A] underline">
                  {published} nya produkter i klubbshoppen →
                </Link>
              )}
            </div>

            <ol className="mt-10 space-y-3">
              {log.map((e) => (
                <li key={e.id} className="ifk-line flex gap-3 sm:gap-4">
                  <span
                    className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                      e.kind === "error" || e.kind === "skip" ? "bg-[#FDECEA] text-[#B3261E]" : e.kind === "done" || e.kind === "publish" ? "bg-[#E3F1E7] text-[#1B7F3B]" : "bg-[#EEF2FA] text-[#234B9A]"
                    }`}
                  >
                    {ICON[e.kind]}
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl bg-[#F5F5F7] px-4 py-3.5 sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
                        {e.title}
                        {e.badge && <span className="ml-2 rounded-full bg-[#FBC323] px-2 py-0.5 text-[10px] font-semibold uppercase">{e.badge}</span>}
                      </p>
                      <span className="shrink-0 text-[11px] text-[#86868B]">{e.at}</span>
                    </div>
                    {e.detail && <p className="mt-1 text-[13px] leading-snug text-[#6E6E73]">{e.detail}</p>}
                    {(e.images || e.review) && (
                      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
                        {e.images?.map((src) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={src} src={src} alt="" className="h-40 w-auto max-w-full self-start rounded-xl bg-white object-contain" />
                        ))}
                        {e.review && (
                          <div className="min-w-0 flex-1">
                            <Scores r={e.review} pass={e.pass} min={e.pass === undefined ? club.agent.review.minSales : club.agent.review.minMotifSales} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}
