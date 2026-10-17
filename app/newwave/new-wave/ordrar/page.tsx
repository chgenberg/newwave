import type { Metadata } from "next";
import Link from "next/link";
import { OrderStep } from "@/components/newwave/shop/QuoteActions";
import { LineMock } from "@/components/newwave/shop/ProductMock";
import { nwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import { METHOD_INFO, placementRows } from "@/lib/newwave/marking";
import { hubLive } from "@/lib/newwave/nwHub";
import { fmtDay, sek, type QuoteStatus } from "@/lib/newwave/reseller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ordrar · New Waves dashboard" };

const COLUMNS: { status: QuoteStatus; title: string; text: string; action?: { action: "produce" | "deliver"; label: string } }[] = [
  { status: "godkänd", title: "Att starta", text: "Godkända av kunden", action: { action: "produce", label: "Starta produktion" } },
  { status: "produktion", title: "I produktion", text: "Tryck och packning", action: { action: "deliver", label: "Markera levererad" } },
  { status: "levererad", title: "Levererat", text: "Klart att fakturera" },
];

export default async function NwOrdrar() {
  const live = await hubLive();
  const clubUnits = live.clubs.reduce((s, r) => s + r.stats.sold, 0);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Ordrar</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Allt som ska tryckas, från återförsäljarnas webbshoppar och klubbarnas butiker. Tryckfiler och storlekar följer med varje order.</p>

      <Link href="/newwave/new-wave/klubbar" className="mt-6 flex items-center gap-4 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 transition-colors hover:bg-[var(--nw-soft-2)] sm:p-5">
        <span className="nw-club-heading grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--club)] text-[14px] text-white">K</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-[var(--nw-ink)]">Klubbmerch via Intersport</p>
          <p className="text-[13px] text-[var(--nw-muted)]">Trycks styckvis när någon köper. {clubUnits} sålda plagg från {live.stats.clubsLive} klubbutiker hittills.</p>
        </div>
        <span className="shrink-0 text-[var(--nw-muted)]">→</span>
      </Link>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const orders = live.orders.filter((q) => q.status === col.status);
          return (
            <section key={col.status} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-3">
              <div className="flex items-baseline justify-between px-1.5 pb-3 pt-1">
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">{col.title}</h2>
                  <p className="text-[12px] text-[var(--nw-muted)]">{col.text}</p>
                </div>
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--nw-soft)] px-2 text-[12px] font-semibold">{orders.length}</span>
              </div>
              <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
                {orders.map((q) => (
                  <li key={q.id} className="rounded-2xl bg-[var(--nw-soft)] p-3">
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={q.lines[0]?.logo} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[var(--nw-ink)]">{q.company.name}</p>
                        <p className="truncate text-[12px] text-[var(--nw-muted)]">
                          {q.id} · via {q.reseller}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      {q.lines.slice(0, 4).map((l, i) => (
                        <LineMock key={i} line={l} className="h-14 w-14 rounded-lg" />
                      ))}
                    </div>
                    <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">
                      {q.lines.reduce((s, l) => s + l.qty, 0)} st ·{" "}
                      {[...new Set(q.lines.flatMap((l) => [l.design, ...(l.design.extra ?? [])].map((d) => METHOD_INFO[d.method].label)))].join(", ")}
                    </p>
                    <details className="group mt-2">
                      <summary className="nw-hit cursor-pointer list-none text-[12.5px] font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 [&::-webkit-details-marker]:hidden">Tryckunderlag</summary>
                      <ul className="mt-2 flex flex-col gap-3">
                        {q.lines.map((l, i) => {
                          const p = nwProduct(l.productId);
                          if (!p) return null;
                          return (
                            <li key={i} className="rounded-xl bg-white p-2.5 text-[12px]">
                              <p className="font-semibold text-[var(--nw-ink)]">
                                {l.name} · {colorName(l.color)} · {l.qty} st
                              </p>
                              <ul className="mt-1 text-[var(--nw-muted)]">
                                {placementRows(p, l.design).map((r) => (
                                  <li key={r.label}>
                                    {r.label}: {r.zone}, {r.method.toLowerCase()}, {r.colors}, {r.size}
                                  </li>
                                ))}
                              </ul>
                              {l.proofs?.length ? (
                                <div className="mt-2 flex gap-1.5">
                                  {l.proofs.map((pr) => (
                                    <a key={pr.image} href={pr.image} target="_blank" rel="noreferrer" title={pr.label}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={pr.image} alt={pr.label} className="h-12 w-12 rounded-md bg-[var(--nw-soft)] object-cover" />
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="text-[12.5px]">
                        <p className="whitespace-nowrap font-semibold text-[var(--nw-ink)]">{sek(q.costSek)}</p>
                        {q.needBy ? <p className="whitespace-nowrap text-[var(--nw-muted)]">{col.status === "levererad" ? "önskat" : "leverans"} {fmtDay(q.needBy)}</p> : null}
                      </div>
                      {col.action ? <OrderStep id={q.id} action={col.action.action} label={col.action.label} dark={col.status === "godkänd"} /> : null}
                    </div>
                  </li>
                ))}
                {!orders.length ? <li className="rounded-2xl border border-dashed border-[var(--nw-line)] p-5 text-center md:col-span-2 lg:col-span-1 text-[13px] text-[var(--nw-muted)]">Inget här</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
