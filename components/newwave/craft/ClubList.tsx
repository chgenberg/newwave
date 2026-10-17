"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ClubRow } from "@/lib/newwave/craft";
import { ONBOARD_STEPS, parseClubQuery } from "@/lib/newwave/craftQuery";
import { CLUB_PILL, Crest, MaterialThumb, materialImage, STATUS_PILL, Sparkline, fmtDate, fmtN } from "./parts";
import { SearchBox, Toast, useSavedViews } from "./SearchBox";

const SORTS = {
  aktiv: { label: "Senast aktiv", fn: (a: ClubRow, b: ClubRow) => (b.lastActive ?? "").localeCompare(a.lastActive ?? "") },
  material: { label: "Mest material", fn: (a: ClubRow, b: ClubRow) => b.stats.created30 - a.stats.created30 || b.stats.total - a.stats.total },
  salt: { label: "Mest sålt", fn: (a: ClubRow, b: ClubRow) => b.stats.sold - a.stats.sold },
  namn: { label: "Namn", fn: (a: ClubRow, b: ClubRow) => a.name.localeCompare(b.name, "sv") },
};
type Sort = keyof typeof SORTS;

const VIEWS = ["Aktiva", "Behöver en knuff", "Väntar på svar", "Uppstart pågår", "Autopilot av"];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/newwave/craft/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Något gick fel");
}

function Check({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} className="grid h-11 w-8 shrink-0 place-items-center">
      <span className={`grid h-[18px] w-[18px] place-items-center rounded-[6px] border transition-colors ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "border-[#c9c9c4] bg-white"}`}>
        {on ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

function ClubDetail({ r, onDone }: { r: ClubRow; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const missing = ONBOARD_STEPS.filter((_, i) => !r.onboarding.steps[i]);

  async function run(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await post(body);
      onDone(msg);
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nw-fade border-t border-[var(--nw-line)] bg-[var(--nw-soft)]/60 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Material totalt", fmtN(r.stats.total)],
          ["Väntar på svar", r.stats.pending ? `${r.stats.pending} · ${r.stats.oldestPending} d` : "0"],
          ["Snittbetyg", r.stats.avgScore.toLocaleString("sv-SE")],
          ["Till föreningen", `${fmtN(r.stats.revenue)} kr`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white px-4 py-3">
            <p className="truncate text-[12px] text-[var(--nw-muted)]">{l}</p>
            <p className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-[var(--nw-ink)]">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">Uppstart</p>
            <p className="text-[12.5px] tabular-nums text-[var(--nw-muted)]">
              {r.onboarding.done} av {ONBOARD_STEPS.length}
            </p>
          </div>
          <div className="mt-2.5 flex gap-1" aria-hidden>
            {r.onboarding.steps.map((ok, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${ok ? "bg-[var(--nw-ink)]" : "bg-[var(--nw-line)]"}`} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
            {ONBOARD_STEPS.map((s, i) => (
              <li key={s} className={r.onboarding.steps[i] ? "text-[var(--nw-ink)]" : "text-[var(--nw-faint)]"}>
                {r.onboarding.steps[i] ? "✓" : "○"} {s}
              </li>
            ))}
          </ul>
          {missing.length ? (
            r.onboarding.linkSent ? (
              <p className="mt-3 text-[12.5px] text-[var(--nw-muted)]">Uppstartslänk skickad – väntar på {missing.join(" och ").toLowerCase()}.</p>
            ) : (
              <button type="button" disabled={busy} onClick={() => run({ action: "onboard", clubIds: [r.id] }, "Uppstartslänk skickad")} className="nw-btn mt-3 h-9 px-4 text-[13px] disabled:opacity-50">
                Skicka uppstartslänk
              </button>
            )
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">Autopilot</p>
            <button
              type="button"
              role="switch"
              aria-checked={r.settings.autopilot}
              aria-label="Autopilot"
              disabled={busy}
              onClick={() => run({ action: "autopilot", clubIds: [r.id], on: !r.settings.autopilot }, r.settings.autopilot ? "Autopilot av" : "Autopilot på")}
              className={`relative h-6 w-10 rounded-full transition-colors ${r.settings.autopilot ? "bg-[var(--nw-ink)]" : "bg-[#d6d6d1]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.settings.autopilot ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--nw-muted)]">
            {r.settings.autopilot
              ? `Material med betyg ${r.settings.threshold} eller högre publiceras direkt. Lägre hamnar hos Craft.`
              : `Kansliet godkänner allt för hand. Under betyg ${r.settings.threshold} granskar Craft först.`}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-[var(--nw-muted)]">Gräns</span>
            <div className="flex rounded-full bg-[var(--nw-soft)] p-0.5" role="group" aria-label="Lägsta betyg">
              {[6, 7, 8, 9].map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={busy}
                  aria-pressed={r.settings.threshold === t}
                  onClick={() => run({ action: "threshold", clubId: r.id, threshold: t }, `Gräns ${t}`)}
                  className={`h-7 w-8 rounded-full text-[12.5px] font-medium tabular-nums ${r.settings.threshold === t ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)]"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {r.materials.length ? (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {r.materials.slice(0, 4).map((m) => (
            <li key={m.id} className="min-w-0 rounded-2xl bg-white p-2">
              <div className="aspect-square overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                <MaterialThumb image={materialImage(m)} kind={m.kind} title={m.title} club={r} />
              </div>
              <p className="mt-2 truncate px-1 text-[13px] font-medium text-[var(--nw-ink)]">{m.title}</p>
              <p className="flex items-center justify-between gap-2 px-1 pb-1 text-[11.5px] text-[var(--nw-muted)]">
                <span className="truncate">
                  {m.occasion} · {fmtDate(m.createdAt)}
                </span>
                {m.gate === "granskas" ? (
                  <span className="shrink-0 rounded-full bg-[var(--nw-ink)] px-2 py-0.5 text-[10.5px] font-medium text-white">Hos Craft</span>
                ) : (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_PILL[m.status].cls}`}>{STATUS_PILL[m.status].label}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-2xl bg-white p-4 text-[13.5px] text-[var(--nw-muted)]">Inget material än – skicka en kampanj för att komma igång.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/newwave/craft/skapa?klubb=${r.id}`} className="nw-btn">
          Skapa åt {r.name}
        </Link>
        <Link href={`/newwave/craft/material?klubb=${r.id}`} className="nw-btn nw-btn-ghost">
          Allt material
        </Link>
        {r.dashboard ? (
          <Link href={r.dashboard} className="nw-btn nw-btn-ghost">
            Klubbens dashboard
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function ClubList({ rows, initialQuery = "" }: { rows: ClubRow[]; initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState<Sort>("aktiv");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const views = useSavedViews("craft-club-views", VIEWS);
  const closeToast = useCallback(() => setToast(null), []);

  const meta = useMemo(
    () => ({ regions: [...new Set(rows.map((r) => r.region))], sports: [...new Set(rows.flatMap((r) => r.sports))], cities: [...new Set(rows.map((r) => r.city))], clubs: rows }),
    [rows],
  );
  const query = parseClubQuery(q, meta);

  const shown = rows
    .filter((r) => !query.statuses.length || query.statuses.includes(r.status))
    .filter((r) => !query.regions.length || query.regions.includes(r.region))
    .filter((r) => !query.cities.length || query.cities.includes(r.city))
    .filter((r) => !query.sports.length || query.sports.some((s) => r.sports.includes(s)))
    .filter((r) => !query.pending || r.stats.pending > 0)
    .filter((r) => !query.onboarding || r.onboarding.done < ONBOARD_STEPS.length)
    .filter((r) => !query.queue || r.stats.queue > 0)
    .filter((r) => query.autopilot === undefined || r.settings.autopilot === query.autopilot)
    .filter((r) => !query.text || `${r.name} ${r.city}`.toLowerCase().includes(query.text))
    .sort(SORTS[query.sort ?? sort].fn);

  const allPicked = shown.length > 0 && shown.every((r) => picked.includes(r.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function done(msg: string) {
    setToast(msg);
    router.refresh();
  }

  async function bulk(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await post({ ...body, clubIds: picked });
      setPicked([]);
      done(msg);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox value={q} onChange={setQ} placeholder="Sök, t.ex. ”inaktiva fotbollsklubbar i Halland”" />
        <label className="relative shrink-0">
          <span className="sr-only">Sortera</span>
          <select
            value={query.sort ?? sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            disabled={Boolean(query.sort)}
            className="h-11 w-full appearance-none rounded-full bg-[var(--nw-soft)] pl-4 pr-10 text-[14px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)] disabled:opacity-60 sm:w-auto"
          >
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
      </div>

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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {views.all.map((v) => (
          <span key={v} className="group relative">
            <button
              type="button"
              onClick={() => setQ(q.toLowerCase() === v.toLowerCase() ? "" : v)}
              aria-pressed={q.toLowerCase() === v.toLowerCase()}
              className={`nw-chip h-8 px-3 ${q.toLowerCase() === v.toLowerCase() ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "hover:border-[var(--nw-ink)]"} ${views.saved.includes(v) ? "pr-7" : ""}`}
            >
              {v}
            </button>
            {views.saved.includes(v) ? (
              <button type="button" onClick={() => views.remove(v)} aria-label={`Ta bort vyn ${v}`} className="absolute right-2 top-1/2 -translate-y-1/2 text-[13px] leading-none text-[var(--nw-faint)] hover:text-[var(--nw-ink)]">
                ×
              </button>
            ) : null}
          </span>
        ))}
        {q.trim() && !views.all.some((v) => v.toLowerCase() === q.trim().toLowerCase()) ? (
          <button type="button" onClick={() => views.add(q.trim())} className="nw-chip h-8 border-dashed px-3 text-[var(--nw-muted)] hover:border-[var(--nw-ink)] hover:text-[var(--nw-ink)]">
            + Spara vy
          </button>
        ) : null}
      </div>

      <div className="mt-5 hidden grid-cols-[32px_minmax(0,1fr)_96px_repeat(3,64px)_84px_20px] items-center gap-4 pl-2 pr-4 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[var(--nw-faint)] lg:grid">
        <Check on={allPicked} onClick={() => setPicked(allPicked ? [] : shown.map((r) => r.id))} label="Markera alla" />
        <span>Klubb</span>
        <span>12 veckor</span>
        <span className="text-right">30 d</span>
        <span className="text-right">I butik</span>
        <span className="text-right">Sålt</span>
        <span>Status</span>
        <span />
      </div>
      <button type="button" onClick={() => setPicked(allPicked ? [] : shown.map((r) => r.id))} className="nw-hit mt-4 text-[12.5px] font-medium text-[var(--nw-ink)] underline underline-offset-4 lg:hidden">
        {allPicked ? "Avmarkera alla" : `Markera alla ${shown.length}`}
      </button>

      <ul className="mt-2 flex flex-col gap-2">
        {shown.map((r) => {
          const isOpen = open === r.id;
          const on = picked.includes(r.id);
          const setup = r.onboarding.done < ONBOARD_STEPS.length;
          return (
            <li key={r.id} className={`overflow-hidden rounded-[22px] border transition-all ${isOpen ? "border-[var(--nw-ink)] shadow-[var(--nw-shadow)]" : on ? "border-[var(--nw-ink)]" : "border-[var(--nw-line)] hover:border-[#cfcfca]"}`}>
              <div className="flex items-start pl-1.5 lg:items-center">
                <span className="pt-1.5 lg:pt-0">
                  <Check on={on} onClick={() => toggle(r.id)} label={`Markera ${r.name}`} />
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  aria-expanded={isOpen}
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-3 pl-1 pr-4 text-left lg:grid-cols-[minmax(0,1fr)_96px_repeat(3,64px)_84px_20px]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Crest name={r.name} logo={r.logo} colors={r.colors} size={40} />
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 lg:flex-nowrap">
                        <span className="min-w-0 text-[15px] font-semibold text-[var(--nw-ink)] lg:truncate">{r.name}</span>
                        {r.settings.autopilot ? (
                          <span title="Autopilot på" className="shrink-0 rounded-full bg-[var(--nw-soft)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--nw-muted)]">
                            Autopilot
                          </span>
                        ) : null}
                        {setup ? (
                          <span title="Uppstart pågår" className="shrink-0 rounded-full bg-[#EAF1FE] px-1.5 py-0.5 text-[10.5px] font-medium text-[#1D4ED8]">
                            {r.onboarding.done}/{ONBOARD_STEPS.length}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--nw-muted)]">
                        {r.city} · {r.sports.join(", ")}
                      </span>
                    </span>
                  </span>
                  <span className="hidden text-[var(--nw-ink)] lg:block">
                    <Sparkline values={r.weekly} />
                  </span>
                  <span className="hidden text-right text-[15px] font-semibold tabular-nums text-[var(--nw-ink)] lg:block">{r.stats.created30}</span>
                  <span className="hidden text-right text-[15px] tabular-nums text-[var(--nw-ink)] lg:block">{r.stats.inShop}</span>
                  <span className="hidden text-right text-[15px] tabular-nums text-[var(--nw-ink)] lg:block">{fmtN(r.stats.sold)}</span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--nw-muted)]">
                    <span className={`h-2 w-2 rounded-full ${CLUB_PILL[r.status].dot}`} aria-hidden />
                    {CLUB_PILL[r.status].label}
                  </span>
                  <span className={`hidden text-[var(--nw-muted)] transition-transform lg:block ${isOpen ? "rotate-180" : ""}`} aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="col-span-2 grid grid-cols-3 gap-2 lg:hidden">
                    {[
                      ["30 dagar", r.stats.created30],
                      ["I butik", r.stats.inShop],
                      ["Sålt", fmtN(r.stats.sold)],
                    ].map(([l, v]) => (
                      <span key={l as string} className="rounded-xl bg-[var(--nw-soft)] px-3 py-2">
                        <span className="block text-[11px] text-[var(--nw-muted)]">{l}</span>
                        <span className="block text-[14px] font-semibold tabular-nums text-[var(--nw-ink)]">{v}</span>
                      </span>
                    ))}
                  </span>
                </button>
              </div>
              {isOpen ? <ClubDetail r={r} onDone={done} /> : null}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? <p className="mt-6 text-center text-[14px] text-[var(--nw-muted)]">Inga klubbar matchar.</p> : null}
      <p className="mt-4 text-[12.5px] text-[var(--nw-faint)]">
        Visar {shown.length} av {rows.length} klubbar
      </p>

      {picked.length ? (
        <div className="nw-fade sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap items-center gap-2 rounded-[22px] bg-[var(--nw-ink)] p-2 pl-4 text-white shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)] min-[900px]:bottom-4">
          <span className="mr-auto text-[13.5px] font-medium">{picked.length} valda</span>
          <Link href={`/newwave/craft/skapa?klubbar=${picked.join(",")}`} className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-[var(--nw-ink)]">
            Skicka kampanj
          </Link>
          <button type="button" disabled={busy} onClick={() => bulk({ action: "remind" }, `Påminde ${picked.length} klubbar`)} className="h-9 rounded-full px-3 text-[13px] font-medium hover:bg-white/10">
            Påminn
          </button>
          <button type="button" disabled={busy} onClick={() => bulk({ action: "autopilot", on: true }, "Autopilot på")} className="h-9 rounded-full px-3 text-[13px] font-medium hover:bg-white/10">
            Autopilot på
          </button>
          <button type="button" disabled={busy} onClick={() => bulk({ action: "autopilot", on: false }, "Autopilot av")} className="h-9 rounded-full px-3 text-[13px] font-medium hover:bg-white/10">
            Av
          </button>
          <button type="button" onClick={() => setPicked([])} aria-label="Avmarkera" className="grid h-9 w-9 place-items-center rounded-full text-[16px] hover:bg-white/10">
            ×
          </button>
        </div>
      ) : null}

      <Toast message={toast} onClose={closeToast} />
    </section>
  );
}
