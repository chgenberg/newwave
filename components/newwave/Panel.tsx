/** Hopfällbar rad med rubrik och sammanfattning, för dashboardens översikter. */
export function Panel({ title, summary, badge, open, children }: { title: string; summary: string; badge?: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="group border-b border-[var(--nw-line)]" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-4 py-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="nw-club-heading flex items-center gap-2.5 text-[18px] text-[var(--club)]">
            {title}
            {badge ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--club-accent)] px-1.5 font-sans text-[11px] font-semibold text-[var(--club-on-accent)]">
                {badge}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[13.5px] text-[var(--nw-muted)]">{summary}</p>
        </div>
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--nw-line)] text-[var(--nw-muted)] transition-transform duration-300 group-open:rotate-180"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}
