import Link from "next/link";

const TABS = [
  { id: "eget", href: "/newwave/klubb/material", label: "Skapa eget", hint: "När ni vill" },
  { id: "veckan", href: "/newwave/klubb/material/veckan", label: "Varje vecka", hint: "Automatiskt" },
] as const;

export function MaterialTabs({ active, pending }: { active: (typeof TABS)[number]["id"]; pending?: boolean }) {
  return (
    <nav aria-label="Material" className="grid grid-cols-2 gap-1 rounded-full bg-[var(--nw-soft)] p-1 sm:inline-grid">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium transition-colors ${on ? "bg-white text-[var(--nw-ink)] shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}
          >
            <span className="truncate">{t.label}</span>
            <span className="hidden text-[12px] font-normal text-[var(--nw-faint)] sm:inline">{t.hint}</span>
            {t.id === "veckan" && pending ? <span aria-label="Väntar på godkännande" className="h-2 w-2 shrink-0 rounded-full bg-[var(--club-accent)] ring-2 ring-[var(--club)]/15" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
