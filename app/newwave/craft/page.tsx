import type { Metadata } from "next";
import { AgentStrip } from "@/components/newwave/craft/AgentStrip";
import { ClubList } from "@/components/newwave/craft/ClubList";
import { fmtN } from "@/components/newwave/craft/parts";
import { craftData } from "@/lib/newwave/craft";
import { clubSuggestions } from "@/lib/newwave/craftAgent";
import { CountUp } from "@/components/newwave/motion/Motion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Klubbar" };

export default async function CraftClubs({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const now = new Date().getTime();
  const data = await craftData(now);
  const { rows } = data;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const active = rows.filter((r) => r.status === "aktiv").length;
  const decided = sum((r) => r.materials.filter((m) => m.gate === "släppt" && m.status !== "väntar").length);
  const approved = sum((r) => r.stats.approved);

  const stats = [
    { label: "Aktiva klubbar", value: `${active} av ${rows.length}` },
    { label: "Material, 30 dagar", value: fmtN(sum((r) => r.stats.created30)) },
    { label: "Godkänt", value: `${decided ? Math.round((approved / decided) * 100) : 0} %` },
    { label: "Till föreningarna", value: `${fmtN(Math.round(sum((r) => r.stats.revenue) / 1000))} tkr` },
  ];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Klubbarna</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Alla föreningar som skapar merch och innehåll med Craft i hubben.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[24px] leading-none text-[var(--club)] sm:text-[28px]"><CountUp value={s.value} /></p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <AgentStrip collapsible suggestions={clubSuggestions(data, now)} />
      </div>

      <div className="mt-8">
        <ClubList rows={rows} initialQuery={q} />
      </div>
    </div>
  );
}
