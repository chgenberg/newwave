"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";

type Step = { title: string; detail: string; lines: string[]; target: string };

const STEPS: Step[] = [
  { title: "Fyra motiv", detail: "Ur kalendern, matcherna och klubbens nyheter", lines: ["Läser klubbens kalender", "Halloween om 19 dagar", "Öppen hall på fredag", "Fyra motiv klara"], target: "motiv" },
  { title: "Två granskare", detail: "Varumärke och sälj väljer det bästa", lines: ["Varumärket betygsätter", "Sälj betygsätter", "Det bästa motivet vann"], target: "motiv" },
  { title: "Komplett paket", detail: "Foton, inlägg, banner, affisch och produktbilder", lines: ["Tryckfilen ritas i 300 dpi", "Fotografen tar bilderna", "Inlägg, story och banner", "Produkterna fotograferas"], target: "paket" },
  { title: "Mejl till kansliet", detail: "Allt i en zip, måndag 07.00", lines: ["Packar zip-filen", "Skriver guiden", "Skickat till kansliet"], target: "mejl" },
  { title: "Godkänt", detail: "Tryckfiler till New Wave och ut i butiken", lines: ["Kansliet godkänner", "Tryckfiler till New Waves hub", "Ut i Intersport-butiken"], target: "tryck" },
];

const STEP_MS = 2800;
const KEY = "nw.klubb.visning";

export type ShowcaseSection = { id: string; /** Visas när så många steg är klara. */ after: number; node: ReactNode };

export function ClubShowcase({
  club,
  week,
  peeks,
  sections,
  dashboard,
}: {
  club: { name: string; founded: number; logo: string; agent: string };
  week: number;
  /** Vad varje steg gav, en kort rad per steg. */
  peeks: string[];
  sections: ShowcaseSection[];
  dashboard: string;
}) {
  /** Hur många steg som är klara; -1 innan start. */
  const [done, setDone] = useState(-1);
  const [line, setLine] = useState(0);
  const stepsRef = useRef<HTMLOListElement>(null);
  const running = done >= 0 && done < STEPS.length;
  const finished = done >= STEPS.length;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage går bara att läsa efter mount
    if (sessionStorage.getItem(KEY)) setDone(STEPS.length);
  }, []);

  useEffect(() => {
    if (!running) return;
    const lines = STEPS[done].lines.length;
    let k = 0;
    const id = window.setInterval(() => {
      k += 1;
      if (k < lines) return setLine(k);
      window.clearInterval(id);
      setLine(0);
      setDone(done + 1);
      if (done + 1 === STEPS.length) sessionStorage.setItem(KEY, "1");
    }, STEP_MS / lines);
    return () => window.clearInterval(id);
  }, [done, running]);

  const start = () => {
    setLine(0);
    setDone(0);
    stepsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-4 py-3 backdrop-blur-xl min-[900px]:gap-5 min-[900px]:px-6">
          <Link href="/newwave/start" className="flex min-h-9 min-w-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – till ingångarna">
            <LogoMark size={28} />
            <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
          </Link>
          <p className="flex min-w-0 items-center gap-1.5 text-[14px] text-[#6F6B63]">
            <span className="shrink-0">Klubb</span>
            <span aria-hidden className="text-[#C9C7C0]">
              /
            </span>
            <span className="truncate font-medium text-[#111]">{club.name}</span>
          </p>
          <Link href={dashboard} className="ml-auto inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[13.5px] font-medium text-[#55524B] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)] transition hover:text-[#111] hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.3)]">
            Dashboarden
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-12 sm:px-8 sm:pt-16">
          <section className="mx-auto max-w-[760px] text-center">
            <img src={club.logo} alt={club.name} className="mx-auto h-16 w-auto sm:h-20" />
            <p className="nw-kicker mt-5">
              {club.name} · sedan {club.founded}
            </p>
            <h1 className="nw-club-heading mt-3 text-[clamp(38px,7vw,72px)] leading-[0.95] text-[var(--club)]">
              Veckans material.
              <br />
              Klart på måndag.
            </h1>
            <p className="nw-lead mx-auto mt-5 max-w-[560px]">
              Varje söndag tar {club.agent} fram veckans motiv, foton, inlägg och merch. Kansliet godkänner – sedan trycks det och hamnar i klubbens butik hos Intersport.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              {finished ? (
                <button type="button" onClick={start} className="nw-btn nw-btn-ghost h-12 px-6 text-[15px]">
                  <Replay /> Spela upp igen
                </button>
              ) : (
                <button type="button" onClick={start} disabled={running} className="nw-btn nw-club-btn h-14 px-9 text-[17px] font-semibold disabled:opacity-100">
                  {running ? (
                    <>
                      <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" /> {club.agent} jobbar…
                    </>
                  ) : (
                    <>
                      <Play /> Starta
                    </>
                  )}
                </button>
              )}
              <p className="text-[13px] text-[var(--nw-muted)]" aria-live="polite">
                {finished ? "Klart – det som tar en natt visades på 15 sekunder. Klicka på ett steg eller scrolla ner." : running ? `Vecka ${week} · steg ${done + 1} av ${STEPS.length}` : `Vecka ${week} · tar 15 sekunder · inget publiceras`}
              </p>
            </div>
          </section>

          <ol ref={stepsRef} className="mt-12 grid scroll-mt-28 gap-2 sm:grid-cols-5">
            {STEPS.map((s, i) => {
              const state = i < done ? "done" : i === done && running ? "now" : "idle";
              const body = (
                <>
                  <div className="flex items-center gap-3 sm:block">
                    <span
                      aria-hidden
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors duration-300 ${state === "done" ? "bg-[var(--club)] text-white" : state === "now" ? "bg-[var(--club-accent)] text-[var(--club-on-accent)]" : "bg-white text-[var(--nw-faint)]"}`}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    <div className="min-w-0 flex-1 sm:mt-3">
                      <p className="text-[15px] font-semibold leading-tight text-[var(--nw-ink)]">{s.title}</p>
                      {state === "now" ? (
                        <p key={line} className="nw-fade mt-1 text-[12.5px] leading-snug text-[var(--nw-ink)]">
                          {s.lines[line]}…
                        </p>
                      ) : state === "done" ? (
                        <p className="nw-fade mt-1 text-[12.5px] font-medium leading-snug text-[var(--club)]">{peeks[i]}</p>
                      ) : (
                        <p className="mt-1 text-[12.5px] leading-snug text-[var(--nw-muted)]">{s.detail}</p>
                      )}
                    </div>
                  </div>
                  <span className="mt-3 block h-1 overflow-hidden sm:mt-auto rounded-full bg-black/[0.06]">
                    <span
                      className={`block h-full rounded-full bg-[var(--club)] ${state === "now" ? "nw-step-fill" : ""}`}
                      style={{ width: state === "done" ? "100%" : state === "now" ? undefined : "0%", animationDuration: `${STEP_MS}ms` }}
                    />
                  </span>
                </>
              );
              const cls = `flex flex-col rounded-[20px] p-3.5 sm:min-h-[150px] sm:p-4 sm:pb-3.5 text-left transition-[background-color,box-shadow] duration-300 ${state === "now" ? "bg-[var(--club-soft)] ring-1 ring-[var(--club-accent)]" : "bg-[var(--nw-soft)]"}`;
              return (
                <li key={s.title} className="min-w-0">
                  {state === "done" ? (
                    <a href={`#${s.target}`} className={`${cls} h-full hover:bg-[var(--nw-soft-2)]`}>
                      {body}
                    </a>
                  ) : (
                    <div className={`${cls} h-full`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>

          {sections.map((s) =>
            done >= s.after ? (
              <section key={s.id} id={s.id} className="nw-pop mt-16 scroll-mt-24 border-t border-[var(--nw-line)] pt-12 sm:mt-20">
                {s.node}
              </section>
            ) : null,
          )}

          <section className={`${finished ? "mt-20" : "mt-12"} overflow-hidden rounded-[28px] bg-[var(--club)] px-6 py-12 text-center text-white sm:px-10 sm:py-16`}>
            <p className="nw-kicker text-white/60">{finished ? `Det här var vecka ${week}` : "Hellre klicka själv?"}</p>
            <h2 className="nw-club-heading mx-auto mt-3 max-w-[620px] text-[30px] leading-[1.02] sm:text-[44px]">{finished ? "Nu är det er tur." : "Se hur det ser ut för kansliet."}</h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-relaxed text-white/75">Klicka runt i klubbens dashboard: godkänn veckans paket, skapa eget material, designa en tröja och se butiken.</p>
            <Link href={dashboard} className="nw-btn nw-club-btn mt-7 h-14 px-8 text-[16px] font-semibold">
              Testa dashboarden själv →
            </Link>
          </section>
        </main>
      </div>
      <HubFooterSlim />
    </div>
  );
}

function Play() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-current">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

function Replay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
