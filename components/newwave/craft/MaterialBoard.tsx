"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { nwProduct } from "@/lib/newwave/catalog";
import type { CraftMaterial } from "@/lib/newwave/craft";
import { parseMaterialQuery } from "@/lib/newwave/craftQuery";
import { StudioButton } from "../studio/StudioButton";
import { Crest, MaterialThumb, materialImage, STATUS_PILL, fmtDate } from "./parts";
import { SearchBox, Toast } from "./SearchBox";

type BoardClub = { id: string; name: string; colors: [string, string]; logo?: string; logoDark?: string; region: string; sports: string[]; city: string };

const PERIODS = { "30": "30 dagar", "90": "90 dagar", alla: "All tid" } as const;
type Period = keyof typeof PERIODS;
type Tab = "alla" | "granskas" | "väntar" | "godkänd" | "ändring" | "stoppad";
const TABS: [Tab, string][] = [
  ["alla", "Alla"],
  ["granskas", "Hos Craft"],
  ["väntar", "Väntar"],
  ["godkänd", "Godkända"],
  ["ändring", "Ändras"],
  ["stoppad", "Stoppade"],
];
const DAY = 86_400_000;

const tabOf = (m: CraftMaterial): Tab => (m.gate === "släppt" ? m.status : m.gate);
const scoreCls = (s: number) => (s >= 8 ? "bg-[#E6F4EA] text-[#1E6B34]" : s >= 7 ? "bg-white text-[var(--nw-ink)]" : "bg-[#FFF4D6] text-[#7A5A00]");

function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <label className="relative min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 w-full appearance-none truncate rounded-full bg-[var(--nw-soft)] pl-4 pr-9 text-[13.5px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-[12.5px]">
      <div className="flex justify-between">
        <span className="text-[var(--nw-muted)]">{label}</span>
        <span className="font-semibold tabular-nums text-[var(--nw-ink)]">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[var(--nw-soft)]">
        <div className={`h-full rounded-full ${value >= 7 ? "bg-[var(--nw-ink)]" : "bg-[#E0A800]"}`} style={{ width: `${value * 10}%` }} />
      </div>
    </div>
  );
}

function Drawer({ m, club, onClose, onGate }: { m: CraftMaterial; club?: BoardClub; onClose: () => void; onGate: (gate: "släppt" | "stoppad") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Esc i designstudion stänger bara studion.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".cz-wrap") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const products = m.products.map(nwProduct).filter((p) => p !== undefined);

  async function gate(g: "släppt" | "stoppad") {
    setBusy(true);
    await onGate(g).finally(() => setBusy(false));
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={m.title}>
      <button type="button" aria-label="Stäng" onClick={onClose} className="nw-fade absolute inset-0 bg-black/30" />
      <div className="nw-fade relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] text-[var(--nw-muted)]">
              {m.kind} · {m.occasion} · {fmtDate(m.createdAt)}
            </p>
            <h2 className="nw-club-heading mt-1 text-[22px] leading-tight text-[var(--club)] [overflow-wrap:anywhere]">{m.title}</h2>
            {club ? (
              <p className="mt-2 flex items-center gap-2 text-[13px] text-[var(--nw-ink)]">
                <Crest name={club.name} logo={club.logo} colors={club.colors} size={22} />
                {club.name} · {m.from === "Craft" ? "från Craft" : "klubbens agent"}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--nw-soft)] text-[18px] text-[var(--nw-ink)]">
            ×
          </button>
        </div>

        <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--nw-soft)]">
          <MaterialThumb image={materialImage(m)} photo={m.photo} kind={m.kind} title={m.title} occasion={m.occasion} seed={m.id} club={club} />
        </div>

        <section className="mt-4 rounded-2xl border border-[var(--nw-line)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">Granskningsagenten</p>
            <span className={`rounded-full px-2.5 py-1 text-[15px] font-bold tabular-nums ${scoreCls(m.review.score)}`}>{m.review.score.toLocaleString("sv-SE")}</span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--nw-muted)]">{m.review.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Bar label="Tryck" value={m.review.parts.realism} />
            <Bar label="Träffsäkerhet" value={m.review.parts.relevance} />
            <Bar label="Varumärke" value={m.review.parts.brandFit} />
            <Bar label="Säljbarhet" value={m.review.parts.sales} />
          </div>
          {m.review.flags.length ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {m.review.flags.map((f) => (
                <li key={f} className="rounded-xl bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#7A5A00]">
                  {f}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <p className="mt-4 text-[12.5px] text-[var(--nw-muted)]">
          {m.gate === "granskas"
            ? "Betyget är under klubbens gräns, så klubben har inte sett materialet än."
            : m.gate === "stoppad"
              ? "Craft stoppade materialet. Klubben ser det inte."
              : m.auto
                ? "Godkänt av autopiloten."
                : `Hos klubben: ${STATUS_PILL[m.status].label.toLowerCase()}.`}
          {m.sold ? ` ${m.sold} sålda.` : ""}
        </p>

        {products.length ? (
          <>
            <p className="mt-4 text-[12.5px] text-[var(--nw-muted)]">Tryck på en produkt för att anpassa den i designstudion.</p>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.map((p) => {
                const saved = m.designs?.[p.id];
                return (
                  <li key={p.id} className="min-w-0">
                    <StudioButton
                      productId={p.id}
                      art={{ light: club?.logo ?? null, dark: club?.logoDark ?? club?.logo ?? null, label: "klubbens logga" }}
                      initial={saved?.design}
                      color={saved?.color}
                      brandColor={club?.colors[0]}
                      target={{ kind: "craft", materialId: m.id }}
                      className="group relative block w-full overflow-hidden rounded-xl bg-[var(--nw-soft)] text-left"
                    >
                      {saved ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={saved.mockupUrl} alt="" className="aspect-square w-full object-contain" />
                      ) : (
                        <div className="aspect-square w-full">
                          <MaterialThumb image={p.photo} kind={m.kind} title={m.title} club={club} />
                        </div>
                      )}
                    </StudioButton>
                    <p className="mt-1 truncate text-[11.5px] text-[var(--nw-muted)]">
                      {p.name}
                      {saved ? " · anpassad" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {m.gate === "granskas" ? (
            <>
              <button type="button" disabled={busy} onClick={() => gate("släppt")} className="nw-btn disabled:opacity-50">
                Släpp till klubben
              </button>
              <button type="button" disabled={busy} onClick={() => gate("stoppad")} className="nw-btn nw-btn-ghost disabled:opacity-50">
                Stoppa
              </button>
            </>
          ) : null}
          {m.gate === "stoppad" ? (
            <button type="button" disabled={busy} onClick={() => gate("släppt")} className="nw-btn nw-btn-ghost disabled:opacity-50">
              Släpp ändå
            </button>
          ) : null}
          {m.gate === "släppt" && m.products.length ? (
            <Link href={`/newwave/craft/skapa?fran=${m.id}`} className="nw-btn">
              Rulla ut till liknande klubbar
            </Link>
          ) : null}
        </div>
      </div>
    </div>,
    document.querySelector(".nw-club") ?? document.body,
  );
}

export function MaterialBoard({
  materials,
  clubs,
  occasions: allOccasions,
  now,
  initial,
}: {
  materials: CraftMaterial[];
  clubs: BoardClub[];
  occasions: string[];
  now: number;
  initial: { klubb?: string; kalla?: string; q?: string };
}) {
  const router = useRouter();
  const [club, setClub] = useState(clubs.some((c) => c.id === initial.klubb) ? initial.klubb! : "alla");
  const [tab, setTab] = useState<Tab>("alla");
  const [source, setSource] = useState<"alla" | "Craft" | "Klubbens agent">(initial.kalla === "Craft" ? "Craft" : "alla");
  const [period, setPeriod] = useState<Period>("90");
  const [q, setQ] = useState(initial.q ?? "");
  const [limit, setLimit] = useState(24);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const closeDrawer = useCallback(() => setOpen(null), []);

  const byId = useMemo(() => Object.fromEntries(clubs.map((c) => [c.id, c])), [clubs]);
  const meta = useMemo(
    () => ({ regions: [...new Set(clubs.map((c) => c.region))], sports: [...new Set(clubs.flatMap((c) => c.sports))], cities: [], clubs, occasions: allOccasions }),
    [clubs, allOccasions],
  );
  const query = parseMaterialQuery(q, meta);
  const effTab: Tab = query.gate ?? query.status ?? tab;

  const base = materials
    .filter((m) => club === "alla" || m.clubId === club)
    .filter((m) => !query.clubIds.length || query.clubIds.includes(m.clubId))
    .filter((m) => (query.from ?? source) === "alla" || m.from === (query.from ?? source))
    .filter((m) => period === "alla" || now - new Date(`${m.createdAt}T12:00:00Z`).getTime() <= Number(period) * DAY)
    .filter((m) => !query.occasions.length || query.occasions.includes(m.occasion))
    .filter((m) => !query.regions.length || query.regions.includes(byId[m.clubId]?.region))
    .filter((m) => !query.sports.length || query.sports.some((s) => byId[m.clubId]?.sports.includes(s)))
    .filter((m) => !query.lowScore || m.review.score < 7)
    .filter((m) => !query.flagged || m.review.flags.length > 0)
    .filter((m) => !query.text || `${m.title} ${m.occasion} ${byId[m.clubId]?.name}`.toLowerCase().includes(query.text));
  const shown = base.filter((m) => effTab === "alla" || tabOf(m) === effTab);
  const count = (t: Tab) => (t === "alla" ? base.length : base.filter((m) => tabOf(m) === t).length);
  const current = materials.find((m) => m.id === open);

  async function gate(id: string, g: "släppt" | "stoppad") {
    const res = await fetch("/api/v1/newwave/craft/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "gate", materialId: id, gate: g }) });
    setToast(res.ok ? (g === "släppt" ? "Släppt till klubben" : "Stoppat") : "Något gick fel");
    if (res.ok) {
      setOpen(null);
      router.refresh();
    }
  }

  return (
    <section>
      <SearchBox value={q} onChange={setQ} placeholder="Sök eller skriv t.ex. ”fars dag från Craft” eller ”låga betyg i Halland”" />
      {query.labels.length ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--nw-muted)]">
          Tolkat som
          {query.labels.map((l) => (
            <span key={l} className="rounded-full bg-[var(--nw-ink)] px-2.5 py-0.5 font-medium text-white">
              {l}
            </span>
          ))}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select label="Klubb" value={club} onChange={setClub} options={[["alla", "Alla klubbar"], ...clubs.map((c) => [c.id, c.name] as [string, string])]} />
        <Select label="Avsändare" value={source} onChange={setSource} options={[["alla", "Alla avsändare"], ["Craft", "Från Craft"], ["Klubbens agent", "Klubbens agent"]]} />
        <span className="col-span-2 sm:col-span-1">
          <Select label="Period" value={period} onChange={setPeriod} options={Object.entries(PERIODS) as [Period, string][]} />
        </span>
      </div>

      <div className="mt-3 flex max-w-full flex-wrap gap-1 rounded-[20px] bg-[var(--nw-soft)] p-1 sm:inline-flex sm:rounded-full" role="group" aria-label="Status">
        {TABS.map(([t, l]) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              if (query.gate || query.status) setQ("");
            }}
            aria-pressed={effTab === t}
            className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors ${effTab === t ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}
          >
            {l} <span className={t === "granskas" && count(t) ? "font-semibold text-[#7A5A00]" : "text-[var(--nw-faint)]"}>{count(t)}</span>
          </button>
        ))}
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.slice(0, limit).map((m) => {
          const c = byId[m.clubId];
          const t = tabOf(m);
          return (
            <li key={m.id} className="min-w-0">
              <button type="button" onClick={() => setOpen(m.id)} className={`nw-fade w-full rounded-[22px] border p-2 text-left transition-colors ${t === "granskas" ? "border-[#E0A800]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"}`}>
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--nw-soft)]">
                  <MaterialThumb image={materialImage(m)} photo={m.photo} kind={m.kind} title={m.title} occasion={m.occasion} seed={m.id} club={c} />
                  <span className={`absolute left-2 top-2 z-[1] rounded-full px-2 py-0.5 text-[11px] font-medium ${t === "granskas" ? "bg-[var(--nw-ink)] text-white" : t === "stoppad" ? "bg-[#E5E5E1] text-[var(--nw-muted)]" : STATUS_PILL[m.status].cls}`}>
                    {t === "granskas" ? "Hos Craft" : t === "stoppad" ? "Stoppad" : m.auto ? "Autopilot" : STATUS_PILL[m.status].label}
                  </span>
                  {m.from === "Craft" ? <span className="absolute right-2 top-2 z-[1] rounded-full bg-[var(--nw-ink)] px-2 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/60">Craft</span> : null}
                  <span className={`absolute bottom-2 right-2 z-[1] flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums shadow-sm ${scoreCls(m.review.score)}`}>
                    {m.review.flags.length ? <span aria-label="Varning">!</span> : null}
                    {m.review.score.toLocaleString("sv-SE")}
                  </span>
                </div>
                <p className="mt-2.5 truncate px-1 text-[14px] font-semibold text-[var(--nw-ink)]">{m.title}</p>
                <p className="truncate px-1 text-[12px] text-[var(--nw-muted)]">
                  {m.occasion} · {fmtDate(m.createdAt)}
                  {m.sold ? ` · ${m.sold} sålda` : ""}
                </p>
                {c ? (
                  <p className="mt-2 flex items-center gap-2 px-1 pb-1 text-[12.5px] text-[var(--nw-ink)]">
                    <Crest name={c.name} logo={c.logo} colors={c.colors} size={20} />
                    <span className="truncate">{c.name}</span>
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? <p className="mt-8 text-center text-[14px] text-[var(--nw-muted)]">Inget material matchar.</p> : null}
      {shown.length > limit ? (
        <div className="mt-6 text-center">
          <button type="button" className="nw-btn nw-btn-ghost" onClick={() => setLimit(limit + 24)}>
            Visa fler ({shown.length - limit} kvar)
          </button>
        </div>
      ) : null}

      {current ? <Drawer m={current} club={byId[current.clubId]} onClose={closeDrawer} onGate={(g) => gate(current.id, g)} /> : null}
      <Toast message={toast} onClose={closeToast} />
    </section>
  );
}
