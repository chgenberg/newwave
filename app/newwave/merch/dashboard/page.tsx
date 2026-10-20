/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Sparkline, fmtN } from "@/components/newwave/craft/parts";
import { MerchHeader } from "@/components/newwave/merch/MerchShop";
import { MERCH_PERIOD_DAYS, change, merchStats, type MerchDay } from "@/lib/newwave/merchStats";
import { sek } from "@/lib/newwave/reseller";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Merch · Dashboard · Next Wave" };

const fmtDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));
const pct = (n: number, of: number) => `${(Math.round((n / Math.max(1, of)) * 1000) / 10).toLocaleString("sv-SE")} %`;

function Change({ cur, before }: { cur: number; before: number }) {
  const c = change(cur, before);
  return <span className={`shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums ${c >= 0 ? "text-[#1E7B3A]" : "text-[#B42318]"}`}>{`${c >= 0 ? "+" : "−"}${Math.abs(c)} %`}</span>;
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-[24px] border border-[rgba(17,17,17,0.08)] p-5 sm:p-6 ${className}`}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {sub ? <p className="mt-0.5 text-[13px] text-[#6F6B63]">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Bars({ days, pick, format }: { days: MerchDay[]; pick: (d: MerchDay) => number; format: (n: number) => string }) {
  const max = Math.max(1, ...days.map(pick));
  return (
    <>
      <div className="flex h-[150px] items-end gap-[3px]">
        {days.map((d) => (
          <span key={d.date} className="min-w-0 flex-1 rounded-t-[4px] bg-[#111] transition-opacity hover:opacity-70" style={{ height: `${Math.max(3, (pick(d) / max) * 100)}%` }} title={`${fmtDay(d.date)}: ${format(pick(d))}`} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-[#8E8A82]">
        <span>{fmtDay(days[0].date)}</span>
        <span>{fmtDay(days[days.length - 1].date)}</span>
      </div>
    </>
  );
}

export default function MerchDashboard() {
  const { days, total, prev, clubs, sources } = merchStats(new Date().getTime());
  const kpis = [
    { label: "Besök", value: fmtN(total.visits), cur: total.visits, before: prev.visits, note: `${fmtN(total.views)} produktvisningar` },
    { label: "Klick till Intersport", value: fmtN(total.clicks), cur: total.clicks, before: prev.clicks, note: `${pct(total.clicks, total.visits)} av besöken` },
    { label: "Ordrar", value: fmtN(total.orders), cur: total.orders, before: prev.orders, note: `${pct(total.orders, total.clicks)} av klicken` },
    { label: "Försäljning", value: sek(total.sales), cur: total.sales, before: prev.sales, note: `${sek(total.sales / Math.max(1, total.orders))} per order` },
  ];
  const topShare = Math.max(...sources.map((s) => s.share));

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <MerchHeader dashboard />
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.02] tracking-[-0.045em]">Trafik och försäljning</h1>
            <p className="mt-1.5 text-[14.5px] text-[#6F6B63]">
              Merch-sidan de senaste {MERCH_PERIOD_DAYS} dagarna, totalt och per klubb. Jämfört med {MERCH_PERIOD_DAYS} dagar innan.
            </p>
          </div>
          <p className="nw-mono rounded-xl bg-[#F2F2EF] px-3 py-1.5 text-[11.5px] uppercase tracking-[0.06em] text-[#6F6B63]">Exempeldata · i produktion från sidan och Intersport</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-0 rounded-[22px] bg-[#F5F5F2] px-4 py-4 sm:px-5">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] text-[#6F6B63]">{k.label}</span>
                <Change cur={k.cur} before={k.before} />
              </p>
              <p className="mt-1.5 truncate text-[clamp(22px,2.4vw,30px)] font-semibold leading-none tracking-[-0.03em] tabular-nums">{k.value}</p>
              <p className="mt-2 truncate text-[12px] text-[#8E8A82]">{k.note}</p>
            </div>
          ))}
        </div>

        <section className="mt-4 grid gap-5 overflow-hidden rounded-[24px] bg-[#111] p-6 text-white sm:p-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center">
          <div>
            <p className="nw-mono text-[11.5px] uppercase tracking-[0.08em] text-white/55">Om ni vill</p>
            <h2 className="mt-2 text-[clamp(22px,2.6vw,30px)] font-semibold leading-[1.08] tracking-[-0.035em]">Vi skapar content och driver trafik hit.</h2>
            <p className="mt-2.5 max-w-[520px] text-[14.5px] leading-relaxed text-white/70">
              Vill klubben ha mer trafik tar vi fram inlägg, nyhetsbrev och kampanjer i klubbens stil med agenterna i hubben. Klubben godkänner, och länkarna i materialet leder hit och vidare till klubbens butik hos Intersport.
            </p>
            <Link href="/newwave/craft/material" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#111] transition hover:bg-white/90">
              Se exempel på content
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          <ol className="grid gap-2">
            {[
              ["Content", "Inlägg, nyhetsbrev och kampanjer per klubb och tillfälle"],
              ["Kanaler", "Klubbens Instagram, Facebook, nyhetsbrev och annonser"],
              ["Merch-sidan", "Besökaren hittar klubbens produkter här"],
              ["Intersport", "Köpet sker i klubbens butik; i produktion hämtar vi försäljningen därifrån"],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-4 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[12px] font-semibold text-[#111]">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{t}</span>
                  <span className="block text-[12.5px] text-white/60">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Panel title="Besök per dag" sub={`${fmtN(total.visits)} besök totalt`}>
            <Bars days={days} pick={(d) => d.visits} format={(n) => `${fmtN(n)} besök`} />
          </Panel>
          <Panel title="Försäljning per dag" sub={`${sek(total.sales)} via klubbarnas butiker hos Intersport`}>
            <Bars days={days} pick={(d) => d.sales} format={sek} />
          </Panel>
          <Panel title="Varifrån trafiken kommer" sub="Andel av besöken" className="md:col-span-2 xl:col-span-1">
            <ul className="grid gap-3">
              {sources.map((s) => (
                <li key={s.label} className="text-[13px]">
                  <div className="flex justify-between gap-3">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-[#6F6B63]">{Math.round(s.share * 100)} %</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#F2F2EF]">
                    <div className="h-full rounded-full bg-[#111]" style={{ width: `${(s.share / topShare) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel title="Per klubb" sub="Sorterat på försäljning" className="mt-4">
          <table className="w-full table-fixed text-[13px] sm:table-auto">
            <thead>
              <tr className="text-left text-[12px] text-[#8E8A82]">
                <th className="w-[46%] pb-2 font-normal sm:w-auto">Klubb</th>
                <th className="pb-2 text-right font-normal">Besök</th>
                <th className="hidden pb-2 font-normal sm:table-cell" aria-label="Besök per dag" />
                <th className="hidden pb-2 text-right font-normal sm:table-cell">Klick</th>
                <th className="hidden pb-2 text-right font-normal sm:table-cell">Ordrar</th>
                <th className="pb-2 text-right font-normal">Försäljning</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((c) => (
                <tr key={c.club.id} className="border-t border-[rgba(17,17,17,0.06)]">
                  <td className="py-2.5 pr-3">
                    <Link href={`/newwave/merch/${c.club.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <img src={c.club.crest} alt="" className="h-6 w-6 shrink-0 object-contain" />
                      <span className="truncate font-medium">{c.club.name}</span>
                    </Link>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {fmtN(c.visits)}
                    <span className="ml-1.5 hidden md:inline">
                      <Change cur={c.visits} before={c.prev.visits} />
                    </span>
                  </td>
                  <td className="hidden py-2.5 pl-3 text-[#111] sm:table-cell">
                    <Sparkline values={c.visitsPerDay} className="h-6 w-20" />
                  </td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{fmtN(c.clicks)}</td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{fmtN(c.orders)}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums">{sek(c.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </main>
    </div>
  );
}
