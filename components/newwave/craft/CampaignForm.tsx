"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, NW_CATALOG } from "@/lib/newwave/catalog";
import { AgentStrip } from "./AgentStrip";
import { Crest } from "./parts";
import type { Suggestion } from "@/lib/newwave/craftAgent";

export type PickClub = { id: string; name: string; city: string; region: string; sports: string[]; colors: [string, string]; logo?: string; live: boolean };
export type CalendarMonth = { label: string; items: { occasion: string; date: string; planned?: { title: string; scheduled: boolean; clubs: number } }[] };
export type Draft = { title?: string; occasion?: string; date?: string; brief?: string; products?: string[]; clubIds?: string[]; note?: string; sourceId?: string };
type Template = { occasion: string; title: string; brief: string; products: string[] };

const SEASON_OF = (m: number) => (m === 12 || m <= 2 ? "vinter" : m <= 5 ? "vår" : m <= 8 ? "sommar" : "höst");
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

function Step({ n, title, sub, children, aside }: { n: number; title: string; sub?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">
            {n}. {title}
          </h2>
          {sub ? <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">{sub}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const chip = (on: boolean) => `nw-chip h-8 px-3 ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "hover:border-[var(--nw-ink)]"}`;

export function CampaignForm({
  clubs,
  allowed,
  templates,
  calendar,
  today,
  initial = {},
  autoBrief,
  suggestions = [],
}: {
  clubs: PickClub[];
  allowed: string[];
  templates: Template[];
  calendar: CalendarMonth[];
  today: string;
  initial?: Draft;
  autoBrief?: string;
  suggestions?: Suggestion[];
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [occasion, setOccasion] = useState(initial.occasion ?? "");
  const [date, setDate] = useState(initial.date ?? "");
  const [brief, setBrief] = useState(initial.brief ?? "");
  const [products, setProducts] = useState<string[]>(initial.products ?? []);
  const [picked, setPicked] = useState<string[]>(initial.clubIds ?? []);
  const [region, setRegion] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [cat, setCat] = useState("Förslag");
  const [when, setWhen] = useState<"nu" | "senare">("nu");
  const [sendAt, setSendAt] = useState(addDays(today, 7));
  const [deadline, setDeadline] = useState("");
  const [remind, setRemind] = useState(true);
  const [ask, setAsk] = useState(autoBrief ?? "");
  const [thinking, setThinking] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ title: string; clubs: PickClub[]; sendAt?: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const catalog = useMemo(() => NW_CATALOG.filter((p) => allowed.includes(p.id)), [allowed]);
  const regions = useMemo(() => [...new Set(clubs.map((c) => c.region))].sort(), [clubs]);
  const sports = useMemo(() => [...new Set(clubs.flatMap((c) => c.sports))].sort(), [clubs]);
  const visible = clubs.filter((c) => (!region || c.region === region) && (!sport || c.sports.includes(sport)));
  const allVisible = visible.length > 0 && visible.every((c) => picked.includes(c.id));
  const season = date ? SEASON_OF(Number(date.slice(5, 7))) : null;
  const suggested = [...new Set([...products, ...catalog.filter((p) => p.seasons.includes((season ?? SEASON_OF(new Date(`${today}T12:00:00Z`).getUTCMonth() + 1)) as never) && p.seasons.length < 4).map((p) => p.id)])].slice(0, Math.max(12, products.length));
  const shownProducts = cat === "Förslag" ? catalog.filter((p) => suggested.includes(p.id)) : catalog.filter((p) => cat === "Alla" || p.category === cat);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function apply(d: Draft) {
    if (d.title !== undefined) setTitle(d.title);
    if (d.occasion !== undefined) setOccasion(d.occasion);
    if (d.date !== undefined) setDate(d.date);
    if (d.brief !== undefined) setBrief(d.brief);
    if (d.products) setProducts(d.products.filter((id) => allowed.includes(id)));
    if (d.clubIds) setPicked(d.clubIds);
  }

  function fromCalendar(o: string, d: string) {
    const t = templates.find((x) => x.occasion === o);
    const m = Number(d.slice(5, 7));
    apply({
      occasion: o,
      date: d,
      title: t?.title ?? o,
      brief: t?.brief ?? `Material till ${o.toLowerCase()} i varje klubbs färger och ton.`,
      products: t?.products ?? catalog.filter((p) => p.seasons.includes(SEASON_OF(m) as never) && p.seasons.length < 4).slice(0, 3).map((p) => p.id),
    });
    setDeadline(addDays(d, -10) > today ? addDays(d, -10) : "");
    const send = addDays(d, -21);
    if (send > today) {
      setWhen("senare");
      setSendAt(send);
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function fill(text = ask) {
    if (text.trim().length < 4) return;
    setThinking(true);
    setReasoning(null);
    setError(null);
    try {
      const res = await fetch("/api/v1/newwave/craft/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Agenten svarade inte");
      apply(json.draft);
      setReasoning(json.draft.reasoning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agenten svarade inte");
    } finally {
      setThinking(false);
    }
  }

  const ran = useRef(false);
  useEffect(() => {
    if (autoBrief && !ran.current) {
      ran.current = true;
      void fill(autoBrief);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBrief]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/newwave/craft/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          occasion,
          date: date || undefined,
          brief,
          products,
          clubIds: picked,
          sendAt: when === "senare" ? sendAt : undefined,
          deadline: deadline || undefined,
          remind: Boolean(deadline) && remind,
          sourceId: initial.sourceId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Något gick fel");
      setSent({ title, clubs: clubs.filter((c) => picked.includes(c.id)), sendAt: json.campaign.sendAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="nw-fade rounded-[28px] bg-[var(--nw-soft)] p-6 sm:p-8">
        <p className="text-[12.5px] font-medium uppercase tracking-[0.1em] text-[var(--nw-muted)]">{sent.sendAt ? "Schemalagd" : "Skickad"}</p>
        <h2 className="nw-club-heading mt-2 text-[24px] leading-tight text-[var(--club)] sm:text-[28px]">
          ”{sent.title}” {sent.sendAt ? `når ${sent.clubs.length} klubbar ${fmt(sent.sendAt)}` : `ligger hos ${sent.clubs.length} klubbar`}
        </h2>
        <p className="mt-2 max-w-[560px] text-[14.5px] text-[var(--nw-muted)]">
          Varje klubbs agent anpassar motivet till klubbens färger och ton. Granskningsagenten betygsätter resultatet, och det som klarar klubbens gräns går vidare till godkännande.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {sent.clubs.slice(0, 12).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-[13px] text-[var(--nw-ink)]">
              <Crest name={c.name} logo={c.logo} colors={c.colors} size={24} />
              {c.name}
            </span>
          ))}
          {sent.clubs.length > 12 ? <span className="self-center text-[13px] text-[var(--nw-muted)]">+{sent.clubs.length - 12}</span> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={sent.sendAt ? "/newwave/craft/insikter" : "/newwave/craft/material?kalla=Craft"} className="nw-btn">
            {sent.sendAt ? "Se kampanjerna" : "Se kampanjmaterialet"}
          </Link>
          <Link href="/newwave/craft/skapa" className="nw-btn nw-btn-ghost">
            Ny kampanj
          </Link>
        </div>
      </div>
    );

  const ready = title.trim().length >= 2 && occasion.trim().length >= 2 && brief.trim().length >= 10 && products.length > 0 && picked.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <AgentStrip suggestions={suggestions}>
        <p className="mt-3 text-[13px] font-medium text-[var(--nw-ink)]">Beskriv kampanjen i en mening</p>
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void fill();
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={400}
            placeholder="T.ex. ”Vintermerch till innebandyklubbarna inför jul”"
            aria-label="Beskriv kampanjen"
            className="nw-input h-12 min-w-0 rounded-full border-white px-5 sm:flex-1"
          />
          <button type="submit" disabled={thinking || ask.trim().length < 4} className="nw-btn h-12 justify-center px-6 disabled:opacity-40">
            {thinking ? "Agenten tänker…" : "Fyll i åt mig"}
          </button>
        </form>
        {thinking ? <div className="mt-3 h-1 overflow-hidden rounded-full bg-white"><div className="h-full w-1/3 animate-[nw-load_1.2s_ease-in-out_infinite] rounded-full bg-[var(--nw-ink)]" /></div> : null}
        {reasoning ? (
          <p className="nw-fade mt-3 rounded-2xl bg-white px-4 py-3 text-[13.5px] text-[var(--nw-ink)]">
            <span className="font-semibold">Agenten:</span> {reasoning} Justera gärna nedan.
          </p>
        ) : null}
      </AgentStrip>

      {initial.note ? <p className="-mt-4 rounded-2xl border border-[var(--nw-line)] px-4 py-3 text-[13.5px] text-[var(--nw-ink)]">{initial.note}</p> : null}

      <section aria-label="Kampanjkalender">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Kampanjkalender</h2>
            <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Klicka på ett tillfälle utan kampanj för att planera det.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {calendar.map((m) => (
            <div key={m.label} className="min-w-0 rounded-2xl border border-[var(--nw-line)] p-2.5">
              <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--nw-muted)]">{m.label}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {m.items.length === 0 ? <li className="px-1 text-[12px] text-[var(--nw-faint)]">Inget</li> : null}
                {m.items.map((it) =>
                  it.planned ? (
                    <li key={`${it.occasion}${it.date}`} title={`${it.planned.title} · ${it.planned.clubs} klubbar`} className="rounded-xl bg-[var(--nw-ink)] px-2 py-1.5 text-white">
                      <span className="block truncate text-[12px] font-medium">{it.occasion}</span>
                      <span className="block truncate text-[11px] text-white/60">
                        {it.planned.scheduled ? "Schemalagd" : "Skickad"} · {it.planned.clubs} kl.
                      </span>
                    </li>
                  ) : (
                    <li key={`${it.occasion}${it.date}`}>
                      <button
                        type="button"
                        onClick={() => fromCalendar(it.occasion, it.date)}
                        aria-pressed={occasion === it.occasion && date === it.date}
                        className={`w-full rounded-xl border border-dashed px-2 py-1.5 text-left transition-colors ${occasion === it.occasion && date === it.date ? "border-[var(--nw-ink)] bg-[var(--nw-soft)]" : "border-[#cfcfca] hover:border-[var(--nw-ink)]"}`}
                      >
                        <span className="block truncate text-[12px] font-medium text-[var(--nw-ink)]">+ {it.occasion}</span>
                        <span className="block text-[11px] text-[var(--nw-muted)]">{fmt(it.date)}</span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div ref={formRef} className="flex scroll-mt-6 flex-col gap-8">
        <Step n={1} title="Kampanjen">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_170px]">
            <label className="min-w-0">
              <span className="text-[12.5px] text-[var(--nw-muted)]">Titel</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Pappa på läktaren" className="nw-input mt-1" />
            </label>
            <label className="min-w-0">
              <span className="text-[12.5px] text-[var(--nw-muted)]">Tillfälle</span>
              <input value={occasion} onChange={(e) => setOccasion(e.target.value)} maxLength={60} placeholder="Fars dag" className="nw-input mt-1" />
            </label>
            <label className="min-w-0">
              <span className="text-[12.5px] text-[var(--nw-muted)]">Datum</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="nw-input mt-1" />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="text-[12.5px] text-[var(--nw-muted)]">Brief till klubbarnas agenter</span>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={1200} rows={3} placeholder="Vad ska kampanjen säga och till vem?" className="nw-input mt-1 h-auto resize-y py-3" />
          </label>
        </Step>

        <Step
          n={2}
          title="Produkter"
          sub={`${products.length ? `${products.length} valda` : "Välj det som ska tryckas"}${season ? ` · säsong: ${season}` : ""}`}
          aside={
            season ? (
              <button type="button" className="text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4" onClick={() => setProducts(catalog.filter((p) => p.seasons.includes(season as never) && p.seasons.length < 4).slice(0, 4).map((p) => p.id))}>
                Föreslå för {season}en
              </button>
            ) : null
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {["Förslag", "Alla", ...CATEGORIES.filter((c) => catalog.some((p) => p.category === c))].map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className={chip(cat === c)}>
                {c}
              </button>
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {shownProducts.map((p) => {
              const on = products.includes(p.id);
              const off = season && !p.seasons.includes(season as never);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setProducts(toggle(products, p.id))}
                    aria-pressed={on}
                    className={`relative w-full rounded-2xl border p-1.5 text-left transition-all ${on ? "border-[var(--nw-ink)] ring-1 ring-[var(--nw-ink)]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"} ${off && !on ? "opacity-45" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo} alt="" loading="lazy" className="aspect-square w-full rounded-xl bg-[var(--nw-soft)] object-contain" />
                    <span className="mt-1.5 block truncate px-1 text-[12.5px] font-medium text-[var(--nw-ink)]">{p.name}</span>
                    <span className="block truncate px-1 pb-0.5 text-[11.5px] text-[var(--nw-muted)]">{p.priceSek} kr</span>
                    {on ? (
                      <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--nw-ink)] text-white" aria-hidden>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Step>

        <Step
          n={3}
          title="Klubbar"
          sub={picked.length ? `${picked.length} av ${clubs.length} valda` : "Välj vilka klubbar som får kampanjen"}
          aside={
            <button
              type="button"
              className="nw-hit text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4"
              onClick={() => setPicked(allVisible ? picked.filter((id) => !visible.some((c) => c.id === id)) : [...new Set([...picked, ...visible.map((c) => c.id)])])}
            >
              {allVisible ? "Avmarkera" : "Välj"} {region || sport ? "filtrerade" : "alla"}
            </button>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {regions.map((r) => (
              <button key={r} type="button" onClick={() => setRegion(region === r ? null : r)} aria-pressed={region === r} className={chip(region === r)}>
                {r}
              </button>
            ))}
            <span className="mx-1 hidden h-8 w-px bg-[var(--nw-line)] sm:block" aria-hidden />
            {sports.map((s) => (
              <button key={s} type="button" onClick={() => setSport(sport === s ? null : s)} aria-pressed={sport === s} className={chip(sport === s)}>
                {s}
              </button>
            ))}
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {visible.map((c) => {
              const on = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(toggle(picked, c.id))}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${on ? "border-[var(--nw-ink)] bg-[var(--nw-soft)]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"}`}
                  >
                    <Crest name={c.name} logo={c.logo} colors={c.colors} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[var(--nw-ink)]">{c.name}</span>
                      <span className="block truncate text-[12px] text-[var(--nw-muted)]">
                        {c.city} · {c.sports.join(", ")}
                      </span>
                    </span>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "border-[#c9c9c4]"}`} aria-hidden>
                      {on ? (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Step>

        <Step n={4} title="Utskick" sub="Skicka direkt eller låt kampanjen gå ut ett visst datum.">
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--nw-line)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-full bg-[var(--nw-soft)] p-1" role="group" aria-label="När">
                {(
                  [
                    ["nu", "Skicka nu"],
                    ["senare", "Schemalägg"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setWhen(k)} aria-pressed={when === k} className={`h-8 rounded-full px-4 text-[13px] font-medium ${when === k ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)]"}`}>
                    {l}
                  </button>
                ))}
              </div>
              {when === "senare" ? (
                <label className="flex items-center gap-2 text-[13px] text-[var(--nw-muted)]">
                  Skickas
                  <input type="date" min={addDays(today, 1)} value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="nw-input h-9 w-auto" />
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] text-[var(--nw-muted)]">
                Sista dag att godkänna
                <input type="date" min={when === "senare" ? sendAt : today} value={deadline} onChange={(e) => setDeadline(e.target.value)} className="nw-input h-9 w-auto" />
              </label>
              {deadline ? (
                <label className="flex items-center gap-2 text-[13px] text-[var(--nw-ink)]">
                  <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="h-4 w-4 accent-[var(--nw-ink)]" />
                  Påminn automatiskt tre dagar innan
                </label>
              ) : null}
            </div>
          </div>
        </Step>
      </div>

      <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-[24px] border border-[var(--nw-line)] bg-white/90 p-2 pl-4 shadow-[var(--nw-shadow)] backdrop-blur sm:p-3 sm:pl-5 md:bottom-4">
        <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--nw-muted)] sm:text-[13.5px]">
          {error ? (
            <span className="text-[#9B1C1C]">{error}</span>
          ) : ready ? (
            `${products.length} produkter till ${picked.length} klubbar${when === "senare" ? ` · ${fmt(sendAt)}` : ""}`
          ) : (
            "Fyll i kampanj, produkter och klubbar"
          )}
        </p>
        <button type="button" disabled={!ready || busy} onClick={send} className="nw-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Skickar…" : when === "senare" ? "Schemalägg" : picked.length === 1 ? "Skicka till 1 klubb" : picked.length ? `Skicka till ${picked.length} klubbar` : "Skicka"}
        </button>
      </div>
    </div>
  );
}
