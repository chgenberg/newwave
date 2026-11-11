"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IFKLoader, useLoader } from "@/components/IFKLoader";
import { Badge, FactoryDialog, LEVEL, Pictures, ScarfActions, type ScarfInfo } from "@/components/ScarfParts";
import { LogoMark } from "@/components/newwave/Logo";
import { copyFor } from "@/lib/copy";
import { SCARF } from "@/lib/scarf";
import type { ScarfReview } from "@/lib/scarfAgent";
import type { DemoScarf } from "@/lib/scarfDemo";
import type { ProductionReport } from "@/lib/scarfProduction";
import type { Level, ScarfIdea } from "@/lib/scarfRecipes";
import type { Club, Signal, SourceStatus } from "@/lib/types";

type ClubListItem = { id: string; name: string };
type IdeaView = ScarfIdea & { level: Level; recipeLabel: string };
type Profile = { id: string; name: string; kind: string; agent: string; crest: string; yarns: { hex: string; pantone: string; name: string }[]; rules: string[] };
type Knit = { palette: string[]; report: ProductionReport; images: { front: string; back: string }; text: { front: string; back: string }; consent: string | null; artFile: string | null; artNote: string | null };
type ItemState = "kö" | "stickar" | "granskas" | "görs om" | "klar" | "fel";
type Item = { key: string; idea: IdeaView; state: ItemState; knit?: Knit; review?: ScarfReview | null; first?: { title: string; review: ScarfReview }; error?: string };

const DEFAULT_CLUB = "ifk-goteborg";

const STEPS = [
  { n: 1, title: "Klubben", text: "Sköld, garnfärger och regelbok läses in." },
  { n: 2, title: "Signaler", text: "Kalender, matcher, väder och klubbens egna symboler." },
  { n: 3, title: "Idéer", text: "Agenten föreslår halsdukar och väljer recept, text och färger." },
  { n: 4, title: "Stickning", text: `Varje idé blir ${SCARF.needles} × ${SCARF.rows.toLocaleString("sv-SE")} maskor.` },
  { n: 5, title: "Maskinkontroll", text: `Garner, varv, textstorlek och lösa maskor för ${SCARF.machine}.` },
  { n: 6, title: "Granskare", text: "En andra agent sätter betyg. Underkänt görs om en gång." },
  { n: 7, title: "Stickfiler", text: `Mönster, stickorder och garnlista till ${SCARF.factory}.` },
];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
  return json as T;
}

const strip = (i: IdeaView): ScarfIdea => ({ id: i.id, title: i.title, why: i.why, signal: i.signal, recipe: i.recipe, front: i.front, back: i.back, font: i.font, colors: i.colors, icon: i.icon, art: i.art, number: i.number, roster: i.roster });

export function ScarfAgent({ demo }: { demo: { date: string; scarves: DemoScarf[] } }) {
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [clubId, setClubId] = useState(DEFAULT_CLUB);
  const [count, setCount] = useState(4);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [mode, setMode] = useState<"ai" | "demo" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [factory, setFactory] = useState(false);
  const loader = useLoader();
  const results = useRef<HTMLElement>(null);
  const live = useRef(0);

  // Klubbens profil styr laddningsrutans sköld, färger och rader.
  useEffect(() => {
    let on = true;
    fetch(`/api/v1/clubs/${clubId}`)
      .then((r) => r.json())
      .then((d: { club?: Club }) => on && setClub(d.club ?? null))
      .catch(() => on && setClub(null));
    return () => {
      on = false;
    };
  }, [clubId]);

  useEffect(() => {
    fetch("/api/v1/clubs?hub=1")
      .then((r) => r.json())
      .then((d: { clubs: ClubListItem[] }) => setClubs(d.clubs))
      .catch(() => setError("Kunde inte hämta klubbarna."));
  }, []);

  const patch = (key: string, next: Partial<Item>) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...next } : it)));

  const run = async () => {
    if (running) return;
    const id = ++live.current;
    const alive = () => live.current === id;
    setRunning(true);
    setError(null);
    setItems([]);
    setSignals([]);
    setProfile(null);
    setMode(null);
    setNote(null);
    setShowDemo(false);
    setStep(1);
    loader.start("Läser klubbens sköld, garner och regelbok", 6, 2500);
    try {
      const s: { ai: boolean; club: Profile; signals: Signal[]; sources: SourceStatus[] } = await fetch(`/api/v1/scarf/agent/signals?clubId=${clubId}`).then((r) => {
        if (!r.ok) throw new Error("Kunde inte läsa klubbens profil.");
        return r.json();
      });
      if (!alive()) return;
      setProfile(s.club);
      setStep(2);
      setSignals(s.signals);
      setSources(s.sources);

      setStep(3);
      loader.stage(`${s.signals.length} signaler hittade – agenten tar fram ${count} halsdukar`, 34, 40000);
      const { mode: m, ideas, note: why } = await post<{ mode: "ai" | "demo"; note: string | null; ideas: IdeaView[] }>("/api/v1/scarf/agent/ideas", { clubId, signals: s.signals, count });
      if (!alive()) return;
      setMode(m);
      setNote(why);
      setItems(ideas.map((idea) => ({ key: idea.id, idea, state: "kö" })));
      setStep(4);

      const queue = [...ideas];
      // Rutan fylls från 34 till 98 procent i takt med att halsdukarna blir klara.
      let finished = 0;
      const total = Math.max(1, ideas.length);
      const say = (label: string) => alive() && loader.stage(label, 34 + (64 * Math.min(total, finished + 1)) / total - 1, 25000);
      const worker = async () => {
        for (let first = queue.shift(); first; first = queue.shift()) {
          const key = first.id;
          try {
            let idea = first;
            patch(key, { state: "stickar" });
            say(idea.art ? `Bildmodellen ritar motivet till ”${idea.title}”` : `Stickar ”${idea.title}” – ${SCARF.needles} × ${SCARF.rows.toLocaleString("sv-SE")} maskor`);
            let knit = await post<Knit>("/api/v1/scarf/agent/knit", { clubId, idea: strip(idea) });
            if (!alive()) return;
            patch(key, { knit, state: m === "ai" ? "granskas" : "klar" });
            if (m !== "ai") continue;
            say(`Granskaren ser på ”${idea.title}”`);
            let { review } = await post<{ review: ScarfReview | null }>("/api/v1/scarf/agent/review", { clubId, idea: strip(idea), artFile: knit.artFile });
            if (!alive()) return;
            if (review?.verdict === "underkänd") {
              patch(key, { review, state: "görs om" });
              say(`Underkänd – agenten gör om ”${idea.title}”`);
              const { ideas: revised } = await post<{ ideas: IdeaView[] }>("/api/v1/scarf/agent/ideas", { clubId, revise: { idea: strip(idea), review: { summary: review.summary, issues: review.issues } } });
              if (revised[0]) {
                const earlier = { title: idea.title, review };
                idea = revised[0];
                patch(key, { idea, state: "stickar", first: earlier });
                knit = await post<Knit>("/api/v1/scarf/agent/knit", { clubId, idea: strip(idea) });
                if (!alive()) return;
                patch(key, { knit, state: "granskas" });
                say(`Granskaren ser på den nya ”${idea.title}”`);
                review = (await post<{ review: ScarfReview | null }>("/api/v1/scarf/agent/review", { clubId, idea: strip(idea), artFile: knit.artFile })).review;
              }
            }
            if (alive()) patch(key, { review, state: "klar" });
          } catch (e) {
            if (alive()) patch(key, { state: "fel", error: e instanceof Error ? e.message : "Något gick fel." });
          } finally {
            finished++;
            if (alive()) loader.set(34 + (64 * finished) / total);
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (alive()) {
        setStep(7);
        loader.done();
        setTimeout(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 750);
      }
    } catch (e) {
      if (alive()) {
        loader.fail();
        setError(e instanceof Error ? e.message : "Något gick fel.");
      }
    } finally {
      if (alive()) setRunning(false);
    }
  };

  const done = items.filter((i) => i.state === "klar");
  const stoppedBy = (i: Item) => (i.knit && !i.knit.report.ok) || i.review?.verdict === "underkänd";
  const approved = done.filter((i) => !stoppedBy(i));
  const current = step >= 4 && step < 7 ? (items.some((i) => i.state === "granskas" || i.state === "görs om") ? 6 : items.some((i) => i.knit) ? 5 : 4) : step;
  const usedSignals = signals.filter((s) => items.some((i) => i.idea.signal === s.title));
  const brand = club?.kind === "brand";
  const [c0, c1] = [club?.palette[0]?.hex ?? "#234B9A", club?.palette[1]?.hex ?? "#FFFFFF"];
  const second = c1.toUpperCase() === "#FFFFFF" ? (club?.palette[2]?.hex ?? c0) : c1;
  // Laddningsrutan i klubbens färger.
  const theme = { "--brand": c0, "--accent": second, "--stripe-a": c0, "--stripe-b": c1, "--bar-a": second, "--bar-b": c0, "--bar-bg": "#ECECEF" } as React.CSSProperties;

  return (
    <main className="flex min-h-screen flex-col bg-white" style={theme}>
      <header className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Link href="/newwave/start" className="flex min-h-9 items-center gap-2.5 text-[15px] font-semibold tracking-tight" aria-label="Next Wave – till ingångarna">
          <LogoMark size={28} />
          <span>
            <span className="hidden text-[13px] tracking-[0.18em] sm:inline">NEXT WAVE </span>
            <span className="font-normal text-[#86868B]">Halsduksagenten</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href={`/halsduk?club=${clubId}`} className="hidden h-10 items-center rounded-full px-3 text-[13px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60 sm:inline-flex">
            Rita själv i studion
          </Link>
          <Link href="/halsduk/inspiration" className="inline-flex h-10 items-center rounded-full bg-[#1D1D1F] px-4 text-[13px] font-medium text-white hover:bg-black">
            Inspirationsbank
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mt-8 text-center sm:mt-12">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#86868B]">
            Stickas av {SCARF.factory} på {SCARF.machine}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">Från signal till stickfil.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[17px] leading-relaxed text-[#6E6E73]">
            Agenten läser av vad som händer kring klubben, föreslår halsdukar, stickar dem maska för maska och lämnar färdiga filer till stickeriet. Klubben godkänner – resten sker av sig självt.
          </p>
        </div>

        <ol className="mt-9 flex flex-wrap items-center justify-center gap-1.5">
          {STEPS.map((s) => {
            const state = step === 7 || s.n < current ? "klar" : s.n === current && running ? "nu" : "väntar";
            return (
              <li key={s.n} title={s.text} className={`flex h-9 items-center gap-2 rounded-full pl-2 pr-3.5 text-[13px] font-medium transition ${state === "nu" ? "bg-[#1D1D1F] text-white" : "bg-[#F5F5F7] text-[#1D1D1F]"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${state === "klar" ? "bg-[#1E8E3E] text-white" : state === "nu" ? "bg-white text-[#1D1D1F]" : "bg-[#D2D2D7] text-white"}`}>{state === "klar" ? "✓" : s.n}</span>
                {s.title}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <select value={clubId} onChange={(e) => setClubId(e.target.value)} disabled={running} aria-label="Klubb" className="h-12 rounded-full bg-[#F5F5F7] px-5 text-[15px] font-medium outline-none disabled:opacity-50">
            {(clubs.length ? clubs : [{ id: DEFAULT_CLUB, name: "IFK Göteborg" }]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={running} aria-label="Antal halsdukar" className="h-12 rounded-full bg-[#F5F5F7] px-5 text-[15px] font-medium outline-none disabled:opacity-50">
            {[3, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} halsdukar
              </option>
            ))}
          </select>
          <button type="button" onClick={run} disabled={running} className="inline-flex h-12 items-center justify-center rounded-full bg-[#1D1D1F] px-7 text-[15px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]">
            {items.length && !running ? "Kör igen" : "Kör flödet"}
          </button>
        </div>
        {error && <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-[#FDECEA] px-5 py-3 text-center text-sm text-[#B3261E]">{error}</p>}

        {profile && (
          <section ref={results} className="mt-12 scroll-mt-6">
            {/* Överblick: klubben till vänster, körningens utfall till höger. */}
            <div className="grid gap-4 rounded-3xl bg-[#F5F5F7] p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.crest} alt="" className="h-14 w-auto shrink-0" />
                <div className="min-w-0">
                  <p className="text-[19px] font-semibold tracking-tight">{profile.name}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {profile.yarns.map((y) => (
                      <li key={y.hex} className="flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2.5 text-[11.5px]" title={y.name}>
                        <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: y.hex }} />
                        <span className="font-medium">{y.pantone.replace("PANTONE ", "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <dl className="grid grid-cols-4 gap-2 text-center">
                {(
                  [
                    ["Signaler", signals.length || "–"],
                    ["Idéer", items.length || "–"],
                    ["Godkända", items.length ? approved.length : "–"],
                    ["Omgjorda", items.length ? items.filter((i) => i.first).length : "–"],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white px-4 py-2.5">
                    <dd className="text-[24px] font-semibold leading-none tracking-tight">{value}</dd>
                    <dt className="mt-1 text-[11px] text-[#86868B]">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            {signals.length > 0 && (
              <details className="group mt-3 rounded-3xl border border-black/[0.08] px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13.5px] [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold">Signaler som blev halsdukar</span>
                  {usedSignals.length ? (
                    usedSignals.map((s) => (
                      <span key={s.id} className="rounded-full bg-[#1D1D1F] px-2.5 py-1 text-[11.5px] font-medium text-white">
                        {s.title}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#86868B]">väljs av agenten …</span>
                  )}
                  <span className="ml-auto text-[12.5px] text-[#86868B] underline decoration-black/20 underline-offset-4 group-open:hidden">Visa alla {signals.length}</span>
                  <span className="ml-auto hidden text-[12.5px] text-[#86868B] underline decoration-black/20 underline-offset-4 group-open:inline">Dölj</span>
                </summary>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {signals.map((s) => {
                    const used = usedSignals.includes(s);
                    return (
                      <li key={s.id} className={`rounded-2xl px-3.5 py-2.5 text-[13px] ${used ? "bg-[#F5F5F7] shadow-[inset_0_0_0_1.5px_#1D1D1F]" : "bg-[#F5F5F7]"}`}>
                        <span className="font-semibold">{s.title}</span>
                        {s.daysUntil !== undefined && <span className="text-[#86868B]"> · om {s.daysUntil} dagar</span>}
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6E6E73]">{s.detail}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[12px] text-[#86868B]">Källor: {sources.map((s) => `${s.name}${s.ok ? "" : " (svarade inte)"}`).join(", ")}.</p>
              </details>
            )}

            {step >= 3 && (
              <div className="mt-8">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{items.length ? (running ? `${done.length} av ${items.length} halsdukar klara` : `${approved.length} av ${items.length} halsdukar klara för stickeriet`) : "Agenten tar fram idéer …"}</h2>
                  {mode === "demo" && note && <p className="max-w-sm text-[12.5px] text-[#86868B]">{note}</p>}
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  {items.map((it) => (
                    <ScarfCard key={it.key} item={it} clubId={clubId} club={profile.name} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {step === 0 || showDemo ? (
          <Collection demo={demo} />
        ) : (
          !running && (
            <div className="mt-12 text-center">
              <button type="button" onClick={() => setShowDemo(true)} className="inline-flex h-11 items-center rounded-full bg-[#F5F5F7] px-5 text-[14px] font-medium text-[#1D1D1F] hover:bg-[#E8E8ED]">
                Visa demokollektionen ({demo.scarves.length} halsdukar)
              </button>
            </div>
          )
        )}

        <div className="mt-12 text-center">
          <button type="button" onClick={() => setFactory(true)} className="text-[13.5px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
            Vad får stickeriet?
          </button>
        </div>
      </div>
      {factory && <FactoryDialog onClose={() => setFactory(false)} />}

      <IFKLoader state={loader.state} crestUrl={`/api/v1/brand/${clubId}/${club?.brand.crest.farg ?? "skold-farg.png"}`} lines={copyFor(club).loaderLines} doneLine={copyFor(club).loaderDone} wide={brand} />
    </main>
  );
}

const machineLine = (r: { yarns: number; max: number; minText: number | null }) => `${r.yarns} garner, högst ${r.max} per varv${r.max <= 4 ? " – dubbelsystem möjligt" : ""}${r.minText !== null ? `, minsta text ${r.minText} mm` : ""}.`;

function ScarfCard({ item, clubId, club }: { item: Item; clubId: string; club: string }) {
  const { idea, knit, review } = item;
  const working = item.state === "stickar" || item.state === "granskas" || item.state === "görs om";
  const stopped = item.state === "klar" && ((knit && !knit.report.ok) || review?.verdict === "underkänd");
  const info: ScarfInfo | null = knit
    ? {
        eyebrow: `${club} · ${idea.recipeLabel} · ${LEVEL[idea.level].toLocaleLowerCase("sv-SE")}`,
        title: idea.title,
        why: idea.why,
        signal: idea.signal,
        images: knit.images,
        text: knit.text,
        yarns: knit.report.yarns.map((y) => ({ hex: y.hex, pantone: y.pantone, share: y.share })),
        machine: { ok: knit.report.ok, summary: machineLine({ yarns: knit.report.yarns.length, max: knit.report.maxColorsPerRow, minText: null }), checks: knit.report.checks },
        review: review ?? null,
        first: item.first,
        consent: knit.consent,
        note: knit.artNote,
      }
    : null;
  return (
    <article className="flex flex-col rounded-3xl border border-black/[0.08] p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge dark>{LEVEL[idea.level]}</Badge>
        <Badge>{idea.recipeLabel}</Badge>
        {knit?.artFile && <Badge>Ritat motiv</Badge>}
        {item.first && <Badge>Omgjord</Badge>}
        <span
          className={`ml-auto inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium ${
            item.state === "fel" || stopped ? "bg-[#FDECEA] text-[#B3261E]" : item.state === "klar" ? "bg-[#E6F4EA] text-[#1E8E3E]" : "bg-[#F5F5F7] text-[#424245]"
          }`}
        >
          {working && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1D1D1F]" />}
          {item.state === "kö" ? "Väntar" : item.state === "stickar" ? "Stickas" : item.state === "granskas" ? "Hos granskaren" : item.state === "görs om" ? "Görs om" : item.state === "fel" ? "Fel" : stopped ? "Stoppad" : "Klar för stickeriet"}
        </span>
      </div>
      <h3 className="mt-2.5 text-[19px] font-semibold tracking-tight">{idea.title}</h3>

      {item.error && <p className="mt-3 rounded-2xl bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#B3261E]">{item.error}</p>}
      {!knit && !item.error && <div className="mt-3 flex h-36 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[13px] text-[#86868B]">{item.state === "kö" ? "Väntar på sin tur" : "Maskorna läggs …"}</div>}

      {knit && info && (
        <>
          <div className="mt-3 rounded-2xl bg-[#F5F5F7] p-3">
            <Pictures front={knit.images.front} back={knit.images.back} text={knit.text} />
          </div>
          {stopped && <p className="mt-2.5 text-[12.5px] leading-snug text-[#B3261E]">Stoppad av {knit.report.ok ? "granskaren" : "maskinkontrollen"} – se Mer information.</p>}
          <div className="mt-auto pt-4">
            <ScarfActions info={info} download={{ clubId, idea: strip(idea), artFile: knit.artFile }} photo={{ club, headline: idea.front.main || idea.back.main, crestUrl: `/api/v1/brand/${clubId}/skold-farg.png` }} ready={item.state === "klar"} />
          </div>
        </>
      )}
    </article>
  );
}

function Collection({ demo }: { demo: { date: string; scarves: DemoScarf[] } }) {
  if (!demo.scarves.length) return null;
  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#86868B]">Exempel ur flödet</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{demo.scarves.length} halsdukar som agenten tagit fram.</h2>
        </div>
        <Link href="/halsduk/inspiration" className="text-[13.5px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
          Fler i inspirationsbanken
        </Link>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {demo.scarves.map((s) => {
          const info: ScarfInfo = {
            eyebrow: `${s.club} · ${s.recipeLabel} · ${LEVEL[s.level].toLocaleLowerCase("sv-SE")}`,
            title: s.idea.title,
            why: s.idea.why,
            signal: s.idea.signal,
            images: { front: `/halsduk/demo/${s.slug}-fram.jpg`, back: `/halsduk/demo/${s.slug}-bak.jpg` },
            text: s.text,
            yarns: s.yarns,
            machine: { ok: s.ok, summary: machineLine({ yarns: s.yarns.length, max: s.maxColorsPerRow, minText: s.minTextMm }) },
            review: s.review,
            first: s.firstReview ? { review: s.firstReview } : null,
            consent: s.consent,
          };
          return (
            <article key={s.slug} className="flex flex-col rounded-3xl border border-black/[0.08] p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge dark>{s.club}</Badge>
                <Badge>{s.recipeLabel}</Badge>
                {s.art && <Badge>Ritat motiv</Badge>}
              </div>
              <h3 className="mt-2.5 text-[19px] font-semibold tracking-tight">{s.idea.title}</h3>
              <div className="mt-3 rounded-2xl bg-[#F5F5F7] p-3">
                <Pictures front={info.images.front} back={info.images.back} text={s.text} />
              </div>
              <div className="mt-auto pt-4">
                <ScarfActions info={info} download={{ clubId: s.clubId, idea: s.idea, demo: s.slug }} photo={{ club: s.club, headline: s.idea.front.main || s.idea.back.main, crestUrl: `/api/v1/brand/${s.clubId}/skold-farg.png` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
