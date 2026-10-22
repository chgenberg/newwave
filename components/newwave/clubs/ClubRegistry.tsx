"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { registryAsset } from "@/lib/newwave/clubAssets";
import type { ClubDetail, ClubItem } from "@/lib/newwave/clubRegistry";

type Facet = { name: string; n: number };
type Stats = { clubs: number; counties: number; sports: number; builtAt: string };
type Page = { total: number; items: ClubItem[]; facets: { counties: Facet[]; sports: Facet[] }; stats: Stats };

const API = "/api/v1/newwave/registry";
const PAGE = 60;
const num = new Intl.NumberFormat("sv-SE");
const SORT = [
  { id: "name", label: "A–Ö" },
  { id: "recent", label: "Senast hämtade" },
  { id: "colors", label: "Efter färg" },
] as const;
const SOCIAL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", x: "X", linkedin: "LinkedIn" };

const asset = (c: ClubItem, file: "logo.png" | "bild.jpg") => registryAsset(c.id, c.at, file);

function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function mix(hex: string, to: number, t: number) {
  return `rgb(${rgb(hex)
    .map((v) => Math.round(v + (to - v) * t))
    .join(",")})`;
}
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Ljusa loggor på en mörk ton av klubbfärgen, övriga på en blek ton av den. */
function backdrop(c: ClubItem) {
  const primary = c.colors?.[0];
  if (c.onDark) return primary && luminance(primary) < 0.2 ? primary : "#1D1D1F";
  return primary ? mix(primary, 255, 0.9) : "#F2F1EE";
}

export function ClubRegistry() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [county, setCounty] = useState("");
  const [sport, setSport] = useState("");
  const [sort, setSort] = useState<(typeof SORT)[number]["id"]>("name");
  const [data, setData] = useState<Page | null>(null);
  const [items, setItems] = useState<ClubItem[]>([]);
  const [error, setError] = useState("");
  const [want, setWant] = useState({ params: "", offset: 0 });
  const [got, setGot] = useState("");
  const [open, setOpen] = useState<ClubItem | null>(null);
  const [wall, setWall] = useState<ClubItem[]>([]);
  const request = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ sort, limit: String(PAGE) });
    if (q) p.set("q", q);
    if (county) p.set("county", county);
    if (sport) p.set("sport", sport);
    return p.toString();
  }, [q, county, sport, sort]);

  /** Nya filter börjar om från första sidan; rullningen ber om nästa sida för samma filter. */
  const offset = want.params === params ? want.offset : 0;
  const key = `${params}|${offset}`;
  const loading = got !== key;

  useEffect(() => {
    const id = ++request.current;
    void (async () => {
      try {
        const res = await fetch(`${API}?${params}&offset=${offset}`, { cache: "no-store" });
        const body = await res.json();
        if (id !== request.current) return;
        if (!res.ok) throw new Error(body.error ?? "Kunde inte läsa registret.");
        setData(body);
        // Skrapningen lägger till klubbar under tiden, så nästa sida kan börja med några som redan visas.
        setItems((prev) => (offset === 0 ? body.items : [...prev, ...(body.items as ClubItem[]).filter((c) => !prev.some((p) => p.id === c.id))]));
        setError("");
      } catch (e) {
        if (id === request.current) setError(e instanceof Error ? e.message : "Kunde inte läsa registret.");
      } finally {
        if (id === request.current) setGot(`${params}|${offset}`);
      }
    })();
  }, [params, offset]);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const res = await fetch(`${API}?sort=recent&limit=48`, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? await res.json() : null;
      if (!live || !body) return;
      setWall(body.items);
      setData((d) => (d ? { ...d, stats: body.stats } : d));
    };
    void refresh();
    const t = setInterval(refresh, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const more = data ? items.length < data.total : false;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !loading && setWant({ params, offset: items.length }), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading, items.length, params]);

  const stats = data?.stats;
  const filtered = Boolean(q || county || sport);

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <section className="relative overflow-hidden rounded-[26px] bg-[#111] px-5 pb-6 pt-7 text-white min-[900px]:px-9 min-[900px]:pt-9">
        <LogoWall items={wall} onPick={setOpen} />
        <div className="relative">
          <p className="nw-mono text-[12px] uppercase tracking-[0.08em] text-white/55">Klubbregistret · Sveriges föreningar</p>
          <h1 className="mt-2 max-w-[760px] text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] min-[900px]:text-[46px]">Varje klubb, med klubbmärke, färger och kanaler.</h1>
          <p className="mt-3 max-w-[640px] text-[14.5px] leading-relaxed text-white/70">
            Vi har letat upp klubbens webbplats och hämtat klubbmärket, profilfärgerna, typsnitten, sociala kanaler och klubbshop. Här finns idrottsklubbarna med eget klubbmärke.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2.5 min-[700px]:grid-cols-4">
            <Stat label="Klubbar" value={stats?.clubs} />
            <Stat label="Län" value={stats?.counties} />
            <Stat label="Idrotter" value={stats?.sports} />
            <Stat label="Uppdaterat" value={stats ? new Date(stats.builtAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) : undefined} />
          </div>
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="hidden w-[250px] shrink-0 lg:sticky lg:top-[84px] lg:block">
          <FacetBars title="Län" facets={data?.facets.counties ?? []} value={county} onPick={setCounty} />
          <div className="mt-5">
            <p className="nw-mono mb-2 text-[11px] uppercase tracking-[0.08em] text-[#6F6B63]">Idrott</p>
            <div className="flex flex-wrap gap-1.5">
              {(data?.facets.sports ?? []).slice(0, 24).map((f) => (
                <button key={f.name} type="button" onClick={() => setSport(sport === f.name ? "" : f.name)} aria-pressed={sport === f.name} className={`rounded-full px-2.5 py-1 text-[12px] transition ${sport === f.name ? "bg-[#111] text-white" : "bg-[#F2F1EE] text-[#111] hover:bg-[#E6E4DF]"}`}>
                  {f.name} <span className="opacity-50">{num.format(f.n)}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-[60px] z-20 -mx-1 flex flex-col gap-2 bg-white/90 px-1 py-2 backdrop-blur-xl min-[900px]:top-[64px] min-[700px]:flex-row min-[700px]:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Sök förening</span>
              <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-[#6F6B63]" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Sök förening, ort eller idrott" className="h-11 w-full rounded-full bg-[#F2F1EE] pl-10 pr-4 text-[14.5px] outline-none ring-[#111] placeholder:text-[#8A867E] focus:ring-2" />
            </label>
            <div className="flex gap-2">
              <select value={county} onChange={(e) => setCounty(e.target.value)} aria-label="Län" className="h-11 min-w-0 flex-1 rounded-full bg-[#F2F1EE] px-3.5 text-[13.5px] lg:hidden">
                <option value="">Alla län</option>
                {(data?.facets.counties ?? []).map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({num.format(f.n)})
                  </option>
                ))}
              </select>
              <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Idrott" className="h-11 min-w-0 flex-1 rounded-full bg-[#F2F1EE] px-3.5 text-[13.5px] lg:hidden">
                <option value="">Alla idrotter</option>
                {(data?.facets.sports ?? []).map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({num.format(f.n)})
                  </option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sortering" className="h-11 min-w-0 flex-1 rounded-full bg-[#F2F1EE] px-3.5 text-[13.5px] min-[700px]:flex-none">
                {SORT.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5 pb-1">
            <span className="ml-auto shrink-0 pl-3 text-[13px] text-[#6F6B63]">{data ? `${num.format(data.total)} träffar` : ""}</span>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setCounty("");
                  setSport("");
                }}
                className="shrink-0 rounded-full px-3 text-[13px] text-[#6F6B63] underline-offset-2 hover:underline"
              >
                Rensa
              </button>
            )}
          </div>

          {error && <p className="mt-6 rounded-2xl bg-[#FDF2F2] p-4 text-[14px] text-[#9B1C1C]">{error}</p>}
          <ul className="mt-3 grid grid-cols-2 gap-2.5 min-[640px]:grid-cols-3 min-[1100px]:grid-cols-4 2xl:grid-cols-5">
            {items.map((c) => (
              <li key={c.id}>
                <Card club={c} onOpen={() => setOpen(c)} />
              </li>
            ))}
            {loading && items.length === 0 && Array.from({ length: 12 }, (_, i) => <li key={i} className="aspect-[4/4.2] animate-pulse rounded-[20px] bg-[#F2F1EE]" />)}
          </ul>
          {!loading && data && items.length === 0 && <p className="mt-10 text-center text-[14px] text-[#6F6B63]">Inga föreningar matchar filtret.</p>}
          <div ref={sentinel} className="h-10" />
        </div>
      </div>

      <AnimatePresence>{open && <Drawer key={open.id} club={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-2xl bg-[#1C1C1C] px-4 py-3 ring-1 ring-white/10">
      <p className="text-[12px] text-white/60">{label}</p>
      <p className="mt-0.5 text-[24px] font-semibold tabular-nums tracking-[-0.02em] min-[900px]:text-[30px]">{value === undefined ? "–" : typeof value === "number" ? num.format(value) : value}</p>
    </div>
  );
}

/** De senast hämtade klubbmärkena glider förbi bakom rubriken. */
function LogoWall({ items, onPick }: { items: ClubItem[]; onPick: (c: ClubItem) => void }) {
  if (items.length < 8) return null;
  const rows = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
  return (
    <div className="absolute right-0 top-7 hidden h-[220px] w-[50%] flex-col justify-center gap-3 opacity-90 [mask-image:linear-gradient(90deg,transparent,#000_35%)] min-[1100px]:flex" aria-hidden>
      {rows.map((row, r) => (
        <div key={r} className="flex w-max gap-3" style={{ animation: `nw-wall ${60 + r * 14}s linear infinite${r ? " reverse" : ""}` }}>
          {[...row, ...row].map((c, i) => (
            <button key={`${c.id}-${i}`} type="button" tabIndex={-1} onClick={() => onPick(c)} className="flex h-[104px] w-[132px] shrink-0 items-center justify-center rounded-2xl p-4 transition hover:scale-[1.04]" style={{ background: backdrop(c) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset(c, "logo.png")} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
            </button>
          ))}
        </div>
      ))}
      <style>{"@keyframes nw-wall{from{transform:translateX(0)}to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){[style*='nw-wall']{animation:none!important}}"}</style>
    </div>
  );
}

function FacetBars({ title, facets, value, onPick }: { title: string; facets: Facet[]; value: string; onPick: (v: string) => void }) {
  const max = Math.max(1, ...facets.map((f) => f.n));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="nw-mono text-[11px] uppercase tracking-[0.08em] text-[#6F6B63]">{title}</p>
        {value && (
          <button type="button" onClick={() => onPick("")} className="text-[12px] text-[#6F6B63] hover:text-[#111]">
            Alla
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {facets.map((f) => (
          <li key={f.name}>
            <button type="button" onClick={() => onPick(value === f.name ? "" : f.name)} aria-pressed={value === f.name} className={`group relative flex h-7 w-full items-center justify-between overflow-hidden rounded-lg px-2 text-left text-[12.5px] ${value && value !== f.name ? "opacity-45 hover:opacity-100" : ""}`}>
              <span className={`absolute inset-y-0 left-0 rounded-lg transition-[width] duration-500 ${value === f.name ? "bg-[#111]" : "bg-[#EDEBE6] group-hover:bg-[#E2DFD8]"}`} style={{ width: `${(f.n / max) * 100}%` }} />
              <span className={`relative truncate ${value === f.name ? "text-white" : ""}`}>{f.name}</span>
              <span className={`relative tabular-nums ${value === f.name ? "text-white" : "text-[#6F6B63]"}`}>{num.format(f.n)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ club: c, onOpen }: { club: ClubItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group block w-full overflow-hidden rounded-[20px] bg-white text-left shadow-[0_0_0_1px_rgba(17,17,17,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(17,17,17,0.1),0_18px_40px_-24px_rgba(17,17,17,0.45)]">
      <div className="relative aspect-[4/3]" style={{ background: backdrop(c) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset(c, "logo.png")} alt={`${c.name} – klubbmärke`} loading="lazy" className="absolute inset-0 m-auto max-h-[68%] max-w-[72%] object-contain transition duration-300 group-hover:scale-[1.05]" />
        {c.platform && <span className="nw-mono absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] text-[#111] backdrop-blur">{c.platform}</span>}
        {c.colors && c.colors.length > 0 && (
          <span className="absolute inset-x-0 bottom-0 flex h-1.5">
            {c.colors.map((hex) => (
              <span key={hex} className="flex-1" style={{ background: hex }} />
            ))}
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <p className="truncate text-[13.5px] font-semibold leading-tight">{c.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#6F6B63]">{[c.municipality, c.sport].filter(Boolean).join(" · ") || c.org}</p>
        <p className="nw-mono mt-1 h-[15px] truncate text-[10.5px] text-[#8A867E]">{c.host}</p>
      </div>
    </button>
  );
}

function Drawer({ club, onClose }: { club: ClubItem; onClose: () => void }) {
  const [d, setD] = useState<ClubDetail | null>(null);
  const [copied, setCopied] = useState("");
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    void fetch(`${API}/${club.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => live && setD(body));
    close.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      live = false;
      window.removeEventListener("keydown", key);
    };
  }, [club.id, onClose]);

  const c = d ?? club;
  const copy = (hex: string) => {
    void navigator.clipboard?.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied(""), 1400);
  };
  const facts: [string, string][] = d
    ? (
        [
          ["Län", d.county],
          ["Kommun", d.municipality],
          ["Idrott", d.sport],
          ["Organisation", d.org],
          ["Organisationsnummer", d.orgNr],
          ["Grundad", d.founded ?? ""],
        ] as [string, string][]
      ).filter(([, v]) => v)
    : [];

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={c.name}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-[26px] bg-white shadow-2xl min-[900px]:inset-y-3 min-[900px]:left-auto min-[900px]:right-3 min-[900px]:max-h-none min-[900px]:w-[460px] min-[900px]:rounded-[26px]"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
      >
        <div className="relative">
          {c.hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset(c, "bild.jpg")} alt="" className="h-[170px] w-full object-cover" />
          ) : (
            <div className="h-[110px] w-full" style={{ background: c.colors?.[0] ? `linear-gradient(120deg, ${c.colors[0]}, ${c.colors[1] ?? mix(c.colors[0], 0, 0.4)})` : "#F2F1EE" }} />
          )}
          <button ref={close} type="button" onClick={onClose} aria-label="Stäng" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[18px] shadow backdrop-blur">
            ×
          </button>
        </div>
        <div className="px-5 pb-8">
          <div className="relative -mt-12 flex gap-2.5">
            <LogoTile club={c} bg={c.onDark ? "#1D1D1F" : "#FFFFFF"} />
            {c.colors?.[0] && <LogoTile club={c} bg={c.colors[0]} />}
          </div>
          <h2 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.02em]">{c.name}</h2>
          <p className="mt-1 text-[13.5px] text-[#6F6B63]">{[c.municipality, c.county && `${c.county} län`, c.sport].filter(Boolean).join(" · ")}</p>

          {d?.url && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip href={d.url} strong>
                {d.host}
                {d.platform ? ` · ${d.platform}` : ""}
              </Chip>
              {d.shop && <Chip href={d.shop}>Klubbshop</Chip>}
              {Object.entries(d.socialLinks ?? {}).map(([k, href]) => (
                <Chip key={k} href={href}>
                  {SOCIAL[k] ?? k}
                </Chip>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/newwave/klubbar/${c.id}`} className="inline-flex h-9 items-center rounded-full bg-[#111] px-4 text-[13px] font-medium text-white transition hover:bg-[#333]">
              Ordmärken och förhandsvisning för klubben →
            </Link>
            <Link href={`/newwave/klubbar/${c.id}/butik`} className="inline-flex h-9 items-center rounded-full border border-[#111] px-4 text-[13px] font-medium transition hover:bg-[#111] hover:text-white">
              Klubbens butik →
            </Link>
          </div>

          {d?.description && <p className="mt-4 text-[13.5px] leading-relaxed text-[#4A4740]">{d.description}</p>}

          {d?.colorInfo && d.colorInfo.length > 0 && (
            <Section title="Färger">
              <div className="grid grid-cols-4 gap-2">
                {d.colorInfo.map((x) => (
                  <button key={x.hex} type="button" onClick={() => copy(x.hex)} className="group text-left" title="Kopiera färgkoden">
                    <span className="block aspect-square rounded-2xl shadow-[inset_0_0_0_1px_rgba(17,17,17,0.08)] transition group-hover:scale-[1.03]" style={{ background: x.hex }} />
                    <span className="nw-mono mt-1 block text-[11px]">{copied === x.hex ? "Kopierad" : x.hex}</span>
                    <span className="block text-[10.5px] text-[#8A867E]">{x.source}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {d?.fonts && (d.fonts.heading || d.fonts.body) && (
            <Section title="Typsnitt på webbplatsen">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Rubriker", d.fonts.heading],
                  ["Brödtext", d.fonts.body],
                ]
                  .filter(([, f]) => f)
                  .map(([k, f]) => (
                    <div key={k} className="rounded-2xl bg-[#F7F6F3] p-3">
                      <p className="text-[11px] text-[#8A867E]">{k}</p>
                      <p className="mt-0.5 truncate text-[14px] font-medium">{f}</p>
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {facts.length > 0 && (
            <Section title="Fakta">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                {facts.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11.5px] text-[#8A867E]">{k}</dt>
                    <dd className="truncate">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {d && (
            <p className="mt-6 text-[11.5px] leading-relaxed text-[#8A867E]">
              Klubbmärket hämtades från {d.logoInfo.source}
              {d.logoInfo.vector ? " (vektor)" : ""}. 
              Säkerhet att webbplatsen är föreningens: {d.confidence} %.{d.at ? ` Hämtad ${new Date(d.at).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}
            </p>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function LogoTile({ club, bg }: { club: ClubItem; bg: string }) {
  return (
    <div className="flex h-[104px] w-[132px] items-center justify-center rounded-2xl p-3.5 shadow-[0_0_0_1px_rgba(17,17,17,0.08),0_12px_30px_-18px_rgba(17,17,17,0.5)]" style={{ background: bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset(club, "logo.png")} alt={`${club.name} – klubbmärke`} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function Chip({ href, children, strong }: { href: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition ${strong ? "bg-[#111] text-white hover:bg-[#333]" : "shadow-[inset_0_0_0_1px_rgba(17,17,17,0.14)] hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.4)]"}`}>
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="nw-mono mb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#6F6B63]">{title}</h3>
      {children}
    </section>
  );
}
