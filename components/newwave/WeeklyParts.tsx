import type { ApprovalStatus, WeeklyRun } from "@/lib/newwave/store";

const STEPS = [
  { when: "Söndag", title: "Fyra motiv", detail: "Ur klubbens nyheter, kalendern, matcher och väder" },
  { when: "Söndag", title: "Två granskare", detail: "Varumärke och sälj måste båda godkänna" },
  { when: "Söndag natt", title: "Komplett paket", detail: "Foton, inlägg, banner och nyhetsbrev" },
  { when: "Måndag 07.00", title: "Mejl till kansliet", detail: "Zip med alla bilder, texter och en guide" },
  { when: "Ni väljer", title: "Godkänn eller neka", detail: "Godkänn lägger produkterna i butiken, neka ger näst bästa motivet" },
];

/** Veckoflödet; `done` är hur många steg som är klara för veckans paket. */
export function WeekFlow({ status }: { status: ApprovalStatus | null }) {
  const done = status === "godkänd" ? 5 : status ? 4 : 0;
  return (
    <ol className="grid gap-1 rounded-2xl bg-[var(--nw-soft)] p-1.5 sm:grid-cols-5 sm:gap-2 sm:bg-transparent sm:p-0">
      {STEPS.map((s, i) => {
        const state = i < done ? "done" : i === done ? "now" : "next";
        return (
          <li
            key={s.title}
            className={`flex min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 sm:flex-col sm:items-start sm:gap-2 sm:rounded-2xl sm:p-3 ${state === "now" ? "bg-[var(--club-soft)] ring-1 ring-[var(--club-accent)]" : "sm:bg-[var(--nw-soft)]"}`}
          >
            <span
              aria-hidden
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold ${state === "done" ? "bg-[var(--club)] text-white" : state === "now" ? "bg-[var(--club-accent)] text-[var(--club-on-accent)]" : "bg-white text-[var(--nw-faint)]"}`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] leading-tight text-[var(--nw-ink)] sm:font-medium">
                <span className="text-[var(--nw-faint)] sm:block sm:text-[11.5px] sm:font-normal">
                  {s.when}
                  <span className="sm:hidden"> · </span>
                </span>
                {s.title}
              </p>
              <p className={`mt-0.5 text-[12px] leading-snug text-[var(--nw-muted)] ${state === "now" ? "" : "hidden sm:block"}`}>{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Motiven agenten valde mellan, med båda granskarnas betyg. */
export function WeeklyPick({ run }: { run: WeeklyRun }) {
  const win = run.candidates[run.picked];
  return (
    <details className="group mt-5 rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[var(--nw-ink)]">Så valdes motivet</p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--nw-muted)]">
            Bäst av {run.candidates.length} · Varumärke {win.brand}/10 · Sälj {win.sales}/10
          </p>
        </div>
        <span className="text-[var(--nw-muted)] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul className="grid gap-2 border-t border-[var(--nw-line)] p-3 sm:grid-cols-2">
        {run.candidates.map((c, i) => {
          const picked = i === run.picked;
          return (
            <li key={`${c.concept.slogan}-${i}`} className={`min-w-0 rounded-2xl p-3.5 ${picked ? "bg-[var(--club-soft)] ring-1 ring-[var(--club-accent)]" : "bg-[var(--nw-soft)]"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="nw-club-heading min-w-0 text-[16px] leading-tight text-[var(--club)] [overflow-wrap:anywhere]">{c.concept.slogan}</p>
                {picked ? <span className="shrink-0 rounded-full bg-[var(--club)] px-2 py-0.5 text-[11px] font-medium text-white">Valt</span> : null}
              </div>
              <p className="mt-1 truncate text-[12px] text-[var(--nw-faint)]">{c.concept.signal}</p>
              <p className="mt-2 flex gap-3 text-[12.5px] text-[var(--nw-ink)]">
                <span>Varumärke {c.brand}/10</span>
                <span>Sälj {c.sales}/10</span>
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--nw-muted)]">{c.note}</p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
