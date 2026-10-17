import type { Metadata } from "next";
import Link from "next/link";
import { ACTORS, LEGS, PAYLOADS } from "@/lib/newwave/hub";
import { hubLive } from "@/lib/newwave/nwHub";
import { fmtWhen, sek } from "@/lib/newwave/reseller";
import { CountUp } from "@/components/newwave/motion/Motion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New Waves dashboard" };

const SOURCE: Record<string, string> = {
  Återförsäljare: "bg-[#E4EEFF] text-[#0B4FB3]",
  Craft: "bg-[#1D1D1F] text-white",
  Klubb: "bg-[#FFF1CC] text-[#7A4F00]",
  "New Wave": "bg-[var(--club-soft)] text-[var(--club)]",
};

export default async function NewWaveHome() {
  const live = await hubLive();
  const maxPayload = Math.max(1, ...Object.values(live.payloads));

  const stats = [
    { label: "Att starta", value: String(live.stats.toStart), href: "/newwave/new-wave/ordrar" },
    { label: "I produktion", value: String(live.stats.inProd), href: "/newwave/new-wave/ordrar" },
    { label: "Levererat 30 dagar", value: String(live.stats.delivered30), href: "/newwave/new-wave/ordrar" },
    { label: "Orderintäkt 30 dagar", value: sek(live.stats.revenue30), href: "/newwave/new-wave/aterforsaljare" },
  ];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Navet just nu</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">
        {live.stats.toStart ? `${live.stats.toStart} ${live.stats.toStart === 1 ? "ny order väntar" : "nya ordrar väntar"} på att starta. ` : ""}
        {live.stats.shops} webbshoppar och {live.stats.clubsLive} klubbutiker skickar till er via API.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="block min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4 transition-colors hover:bg-[var(--nw-soft-2)] sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[22px] leading-none text-[var(--club)] sm:text-[26px]"><CountUp value={s.value} /></p>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="nw-club-heading text-[19px] text-[var(--club)]">De sju benen</h2>
            <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Det som händer i navet, live från klubbar, Craft och återförsäljare.</p>
          </div>
          <Link href="/newwave/studio" className="nw-hit hidden shrink-0 text-[13px] font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 sm:inline">
            Designstudion
          </Link>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {LEGS.map((leg) => {
            const l = live.legs[leg.id];
            return (
              <li key={leg.id} className="min-w-0">
                <Link href={l.href} className="group flex h-full flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--club)]">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--club)] text-[11.5px] font-semibold text-[var(--club)]">{leg.n}</span>
                    <p className="text-[13.5px] font-semibold leading-tight text-[var(--nw-ink)]">{leg.title}</p>
                  </div>
                  <p className="nw-club-heading mt-4 truncate text-[26px] leading-none text-[var(--club)]"><CountUp value={l.value} /></p>
                  <p className="mt-1 text-[13px] text-[var(--nw-ink)]">{l.label}</p>
                  <p className="mt-2 line-clamp-2 text-[12.5px] text-[var(--nw-muted)]">{l.detail}</p>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <Link href="/newwave/new-wave/ordrar" className="flex h-full flex-col justify-between rounded-[var(--nw-radius)] bg-[var(--club)] p-4 text-white transition-transform hover:scale-[1.01]">
              <p className="text-[12px] text-white/60">Hub-API · REST + webhooks</p>
              <p className="nw-club-heading mt-4 text-[20px] leading-tight">Allt landar hos New Wave</p>
              <p className="mt-2 text-[12.5px] text-white/70">Godkända ordrar, tryckfiler och kunddata hämtas automatiskt.</p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-10 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-5">
          <h2 className="nw-club-heading text-[17px] text-[var(--club)]">Paket via API</h2>
          <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">Det som ligger redo att hämtas från navet.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {PAYLOADS.map((p) => (
              <li key={p.id}>
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="truncate text-[var(--nw-ink)]">{p.label}</span>
                  <span className="shrink-0 font-semibold text-[var(--nw-ink)]">{live.payloads[p.id]}</span>
                </div>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
                  <span className="block h-full rounded-full bg-[var(--club)]" style={{ width: `${Math.max(4, (live.payloads[p.id] / maxPayload) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-5">
          <h2 className="nw-club-heading text-[17px] text-[var(--club)]">Hos aktörerna</h2>
          <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">New Wave fördelar vidare – det här väntar hos var och en.</p>
          <ul className="mt-3 divide-y divide-[var(--nw-line)]">
            {ACTORS.map((a) => {
              const v = live.actors[a.id];
              return (
                <li key={a.id} className="flex items-center gap-4 py-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--club)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[var(--nw-ink)]">{a.name}</p>
                    <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{v.detail}</p>
                  </div>
                  <p className="shrink-0 text-[14px] font-semibold text-[var(--nw-ink)]">{v.value}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="nw-club-heading flex items-center gap-2.5 text-[19px] text-[var(--club)]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--club-accent)] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--club-accent)]" />
          </span>
          Live
        </h2>
        <ul className="mt-3 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
          {live.feed.map((f, i) => (
            <li key={`${f.at}-${i}`}>
              <Link href={f.href ?? "/newwave"} className="group/row flex items-start gap-3 py-3 sm:items-center sm:gap-4">
                <p className="w-[88px] shrink-0 pt-0.5 text-[12.5px] text-[var(--nw-muted)] sm:pt-0">{fmtWhen(f.at)}</p>
                <span className={`hidden w-[104px] shrink-0 rounded-full px-2.5 py-1 text-center text-[11.5px] font-medium sm:inline ${SOURCE[f.source]}`}>{f.source}</span>
                <p className="min-w-0 flex-1 text-[13.5px] text-[var(--nw-ink)] group-hover/row:underline sm:truncate">
                  <span className="font-medium">{f.who}</span> · {f.text}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
