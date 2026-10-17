import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/newwave/shop/QuoteParts";
import { fmtDay, isOrder, sek, type Quote } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, quotesFor } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Offerter · Återförsäljarens dashboard" };

const VIEWS = [
  { id: "aktiva", label: "Att hantera", test: (q: Quote) => q.status === "ny" || q.status === "skickad" },
  { id: "nya", label: "Nya", test: (q: Quote) => q.status === "ny" },
  { id: "skickade", label: "Skickade", test: (q: Quote) => q.status === "skickad" },
  { id: "avslutade", label: "Avslutade", test: (q: Quote) => isOrder(q) || q.status === "nekad" },
] as const;

export default async function Offerter({ searchParams }: { searchParams: Promise<{ visa?: string }> }) {
  const { visa } = await searchParams;
  const view = VIEWS.find((v) => v.id === visa) ?? VIEWS[0];
  const all = await quotesFor(CURRENT_RESELLER);
  const list = all.filter(view.test);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Offerter</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Förfrågningar från er butik. Priserna är räknade på New Waves katalog med ert påslag – granska och skicka.</p>

      <nav className="nw-segment mt-6 max-w-full overflow-x-auto" aria-label="Filtrera offerter">
        {VIEWS.map((v) => {
          const n = all.filter(v.test).length;
          return (
            <Link key={v.id} href={`/newwave/shop/offerter?visa=${v.id}`} aria-current={v.id === view.id ? "page" : undefined} className={`whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${v.id === view.id ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}>
              {v.label} <span className="text-[var(--nw-faint)]">{n}</span>
            </Link>
          );
        })}
      </nav>

      {list.length ? (
        <ul className="mt-5 flex flex-col gap-2">
          {list.map((q) => (
            <li key={q.id}>
              <Link href={`/newwave/shop/offerter/${q.id}`} className="flex items-center gap-4 rounded-2xl bg-[var(--nw-soft)] p-3 pl-4 transition-colors hover:bg-[var(--nw-soft-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={q.lines[0]?.logo} alt="" className="hidden h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1.5 sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-[var(--nw-muted)]">
                    {q.id} · {fmtDay(q.createdAt)} · {q.lines.length} {q.lines.length === 1 ? "produkt" : "produkter"}, {q.lines.reduce((s, l) => s + l.qty, 0)} st
                  </p>
                  <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{q.company.name}</p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-[14px] font-semibold text-[var(--nw-ink)]">{sek(q.totalSek)}</p>
                  {q.needBy ? <p className="text-[12px] text-[var(--nw-muted)]">behövs {fmtDay(q.needBy)}</p> : null}
                </div>
                <StatusPill status={q.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--nw-line)] p-8 text-center text-[14px] text-[var(--nw-muted)]">Inget här just nu.</p>
      )}
    </div>
  );
}
