import type { Metadata } from "next";
import Link from "next/link";
import { QuoteFlow, StatusPill } from "@/components/newwave/shop/QuoteParts";
import { fmtDay, isOrder, sek } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, quotesFor } from "@/lib/newwave/shopState";
import { CountUp } from "@/components/newwave/motion/Motion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ordrar · Återförsäljarens dashboard" };

export default async function Ordrar() {
  const orders = (await quotesFor(CURRENT_RESELLER)).filter(isOrder);
  const open = orders.filter((q) => q.status !== "levererad");
  const total = orders.reduce((s, q) => s + q.totalSek, 0);
  const margin = orders.reduce((s, q) => s + q.totalSek - q.costSek, 0);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Ordrar</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Beställningar i butiken och godkända offerter går direkt till New Wave. Här ser ni var varje order är – ni behöver inte göra något.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Pågående", value: String(open.length) },
          { label: "Ordervärde", value: sek(total) },
          { label: "Er marginal", value: sek(margin) },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[20px] leading-none text-[var(--club)] sm:text-[26px]"><CountUp value={s.value} /></p>
          </div>
        ))}
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {orders.map((q) => (
          <li key={q.id}>
            <Link href={`/newwave/shop/offerter/${q.id}`} className="block rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--nw-ink)] sm:p-5">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-[var(--nw-muted)]">
                    {[q.id, `${q.lines.reduce((s, l) => s + l.qty, 0)} st`, q.direct ? "beställd direkt i butiken" : "", q.needBy ? `leverans ${fmtDay(q.needBy)}` : ""].filter(Boolean).join(" · ")}
                  </p>
                  <p className="truncate text-[15px] font-semibold text-[var(--nw-ink)]">{q.company.name}</p>
                </div>
                <p className="hidden shrink-0 text-[14px] font-semibold text-[var(--nw-ink)] sm:block">{sek(q.totalSek)}</p>
                <StatusPill status={q.status} direct={q.direct} />
              </div>
              <div className="mt-4">
                <QuoteFlow status={q.status} direct={q.direct} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!orders.length ? <p className="mt-6 rounded-2xl border border-dashed border-[var(--nw-line)] p-8 text-center text-[14px] text-[var(--nw-muted)]">Inga ordrar än.</p> : null}
    </div>
  );
}
