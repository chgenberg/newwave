import { nwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import { designSummary } from "@/lib/newwave/marking";
import { QUOTE_FLOW, STATUS_LABEL, fmtWhen, sek, type Quote, type QuoteStatus } from "@/lib/newwave/reseller";
import { LineStudio } from "./QuoteActions";
import { LineMock } from "./ProductMock";

const PILL: Record<QuoteStatus, string> = {
  ny: "bg-[#FFF1CC] text-[#7A4F00]",
  skickad: "bg-[#E4EEFF] text-[#0B4FB3]",
  godkänd: "bg-[#DFF5E7] text-[#17703A]",
  produktion: "bg-[#ECE6FF] text-[#5232B8]",
  levererad: "bg-[#1D1D1F] text-white",
  nekad: "bg-[#EFEFEF] text-[#6E6E73]",
};

export function StatusPill({ status }: { status: QuoteStatus }) {
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium ${PILL[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** Var offerten är på väg: kund, återförsäljare och New Wave. */
export function QuoteFlow({ status }: { status: QuoteStatus }) {
  const at = status === "nekad" ? 1 : QUOTE_FLOW.findIndex((s) => s.id === status);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Offertens steg">
      {QUOTE_FLOW.map((s, i) => (
        <li key={s.id} className="min-w-0" aria-current={i === at ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= at ? (status === "nekad" && i === at ? "bg-[#C9C9CE]" : "bg-[#1D1D1F]") : "bg-[#E5E5EA]"}`} />
          <span className={`mt-1.5 block truncate text-[11.5px] ${i <= at ? "font-semibold text-[#1D1D1F]" : "text-[#8E8E93]"}`}>{s.label}</span>
          <span className="block truncate text-[10.5px] text-[#8E8E93]">{s.who}</span>
        </li>
      ))}
    </ol>
  );
}

/** `edit` ger återförsäljaren en knapp per rad som öppnar designstudion. */
export function QuoteLines({ quote, cost, edit }: { quote: Pick<Quote, "lines" | "totalSek" | "costSek">; cost?: boolean; edit?: { quoteId: string; markup: number } }) {
  return (
    <div>
      <ul className="divide-y divide-[#E5E5EA]">
        {quote.lines.map((l, i) => {
          const p = nwProduct(l.productId);
          if (!p) return null;
          return (
            <li key={`${l.productId}-${i}`} className="flex gap-4 py-4">
              <LineMock line={l} className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-28" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{l.name}</p>
                    <p className="text-[12.5px] text-[#6E6E73]">
                      {colorName(l.color)} · {designSummary(p, l.design)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-semibold">{sek(l.total)}</p>
                </div>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(l.sizes).map(([s, n]) => (
                    <span key={s} className="rounded-md bg-[#F2F2F4] px-2 py-0.5 text-[12px]">
                      {s === "One size" ? `${n} st` : `${s}: ${n}`}
                    </span>
                  ))}
                </p>
                <p className="mt-2 text-[12.5px] text-[#6E6E73]">
                  {l.qty} st × {sek(l.unit)} ({sek(l.unitProduct)} produkt + {sek(l.unitPrint)} tryck){l.setup ? ` + tryckstart ${sek(l.setup)}` : ""}
                </p>
                {cost ? <p className="mt-0.5 text-[12.5px] text-[#17703A]">New Waves pris {sek(l.cost)} · marginal {sek(l.total - l.cost)}</p> : null}
                {l.proofs?.length ? (
                  <div className="mt-2 flex gap-1.5">
                    {l.proofs.map((pr) => (
                      <a key={pr.image} href={pr.image} target="_blank" rel="noreferrer" title={pr.label}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pr.image} alt={pr.label} className="h-12 w-12 rounded-lg bg-[#F4F4F2] object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
                {edit ? <LineStudio quoteId={edit.quoteId} index={i} line={l} markup={edit.markup} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 border-t border-[#1D1D1F] pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[14px] text-[#6E6E73]">Totalt exkl. moms</p>
          <p className="text-[22px] font-bold tracking-tight">{sek(quote.totalSek)}</p>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-4 text-[13px] text-[#6E6E73]">
          <p>Inkl. moms</p>
          <p>{sek(quote.totalSek * 1.25)}</p>
        </div>
        {cost ? (
          <div className="mt-3 flex items-baseline justify-between gap-4 rounded-xl bg-[#DFF5E7] px-3 py-2 text-[13.5px] text-[#17703A]">
            <p>Er marginal</p>
            <p className="font-semibold">
              {sek(quote.totalSek - quote.costSek)} ({Math.round(((quote.totalSek - quote.costSek) / Math.max(1, quote.totalSek)) * 100)} %)
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Timeline({ events }: { events: Quote["events"] }) {
  return (
    <ol className="relative ml-1.5 border-l border-[#E5E5EA]">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative pb-4 pl-5 last:pb-0">
          <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-[#1D1D1F]" : "bg-[#C7C7CC]"}`} />
          <p className="text-[13.5px]">
            <span className="font-semibold">{e.who}</span> · {e.text}
          </p>
          <p className="text-[12px] text-[#8E8E93]">{fmtWhen(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}
