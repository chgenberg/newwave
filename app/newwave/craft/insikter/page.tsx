import type { Metadata } from "next";
import { AgentStrip } from "@/components/newwave/craft/AgentStrip";
import { CampaignResults } from "@/components/newwave/craft/CampaignResults";
import { Crest, fmtN } from "@/components/newwave/craft/parts";
import { craftData } from "@/lib/newwave/craft";
import { weeklySummary } from "@/lib/newwave/craftAgent";
import { nwProduct } from "@/lib/newwave/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Insikter" };

const DAY = 86_400_000;

function week(t: number) {
  const d = new Date(t);
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  return Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-5 ${className}`}>
      <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">{title}</h2>
      {sub ? <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function CraftInsights() {
  const now = new Date().getTime();
  const data = await craftData(now);
  const { rows } = data;
  const summary = weeklySummary(data, now);
  const all = rows.flatMap((r) => r.materials);

  const weeks = Array.from({ length: 12 }, (_, w) => {
    const to = now - (11 - w) * 7 * DAY;
    const inWeek = all.filter((m) => {
      const t = new Date(m.createdAt).getTime();
      return t > to - 7 * DAY && t <= to;
    });
    return { label: `v${week(to)}`, club: inWeek.filter((m) => m.from !== "Craft").length, craft: inWeek.filter((m) => m.from === "Craft").length };
  });
  const peak = Math.max(1, ...weeks.map((w) => w.club + w.craft));

  const approved = all.filter((m) => m.gate === "släppt" && m.status === "godkänd");
  const productCount = approved.flatMap((m) => m.products).reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});
  const topProducts = Object.entries(productCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, n]) => ({ p: nwProduct(id), n }))
    .filter((x) => x.p);

  const occ = Object.entries(all.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.occasion]: (acc[m.occasion] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  const occMax = Math.max(1, ...occ.map(([, n]) => n));

  const funnel = [
    { label: "Skapat", n: all.length },
    { label: "Godkänt", n: approved.length },
    { label: "Produkter i butik", n: rows.reduce((n, r) => n + r.stats.inShop, 0) },
    { label: "Sålda", n: rows.reduce((n, r) => n + r.stats.sold, 0) },
  ];

  const usage = [...rows].sort((a, b) => b.stats.total - a.stats.total);
  const usageMax = Math.max(1, ...usage.map((r) => r.stats.total));

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Insikter</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Hur klubbarna använder navet – vad som skapas, godkänns och säljs.</p>

      <div className="mt-5">
        <AgentStrip summary={summary.text} suggestions={summary.tips} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {funnel.map((f, i) => (
          <div key={f.label} className="relative min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{f.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[24px] leading-none text-[var(--club)] sm:text-[28px]">{fmtN(f.n)}</p>
            {i > 0 && i < 2 ? <p className="mt-1.5 text-[12px] text-[var(--nw-muted)]">{Math.round((f.n / Math.max(1, funnel[i - 1].n)) * 100)} % av skapat</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Material per vecka" sub="Senaste 12 veckorna">
          <div className="flex h-[180px] items-end gap-1.5 sm:gap-2.5">
            {weeks.map((w) => (
              <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[11px] tabular-nums text-[var(--nw-muted)]">{w.club + w.craft || ""}</span>
                <div className="flex w-full flex-col overflow-hidden rounded-md" style={{ height: `${((w.club + w.craft) / peak) * 130}px` }} title={`${w.label}: ${w.club} från klubbarna, ${w.craft} från Craft`}>
                  <div className="bg-[#8E8E89]" style={{ flex: w.craft }} />
                  <div className="bg-[var(--nw-ink)]" style={{ flex: w.club }} />
                </div>
                <span className="text-[11px] text-[var(--nw-faint)]">{w.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-[12px] text-[var(--nw-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--nw-ink)]" /> Klubbarnas agenter
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#8E8E89]" /> Från Craft
            </span>
          </div>
        </Panel>

        <Panel title="Populäraste tillfällena">
          <ul className="flex flex-col gap-2.5">
            {occ.map(([o, n]) => (
              <li key={o} className="text-[13px]">
                <div className="flex justify-between gap-3">
                  <span className="truncate text-[var(--nw-ink)]">{o}</span>
                  <span className="tabular-nums text-[var(--nw-muted)]">{n}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--nw-soft)]">
                  <div className="h-full rounded-full bg-[var(--nw-ink)]" style={{ width: `${(n / occMax) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Kampanjer från Craft" sub="Hur långt varje kampanj har kommit hos klubbarna" className="mt-4">
        <CampaignResults campaigns={data.campaigns} clubs={rows.map((r) => ({ id: r.id, name: r.name, colors: r.colors, logo: r.logo }))} />
      </Panel>

      <Panel title="Mest godkända produkter" sub="Antal godkända kampanjer där produkten ingår" className="mt-4">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {topProducts.map(({ p, n }, i) => (
            <li key={p!.id} className="min-w-0">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p!.photo} alt="" loading="lazy" className="aspect-square w-full rounded-2xl bg-[var(--nw-soft)] object-contain" />
                <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-[11.5px] font-semibold text-[var(--nw-ink)]">{i + 1}</span>
              </div>
              <p className="mt-2 truncate text-[13px] font-medium text-[var(--nw-ink)]">{p!.name}</p>
              <p className="text-[12px] text-[var(--nw-muted)]">{n} kampanjer</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Användning per klubb" sub="Material totalt och andel som godkänts" className="mt-4">
        <ul className="flex flex-col gap-3">
          {usage.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px] sm:grid-cols-[200px_minmax(0,1fr)_120px]">
              <span className="flex min-w-0 items-center gap-2">
                <Crest name={r.name} logo={r.logo} colors={r.colors} size={22} />
                <span className="truncate text-[var(--nw-ink)]">{r.name}</span>
              </span>
              <span className="h-2 rounded-full bg-[var(--nw-soft)]">
                <span className="block h-full rounded-full bg-[var(--nw-ink)]" style={{ width: `${(r.stats.total / usageMax) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-[var(--nw-muted)]">
                {r.stats.total} <span className="hidden sm:inline">· {r.stats.approvalRate} % godk.</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
