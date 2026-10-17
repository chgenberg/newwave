import type { Metadata } from "next";
import { AgentStrip } from "@/components/newwave/craft/AgentStrip";
import { MaterialBoard } from "@/components/newwave/craft/MaterialBoard";
import { craftData } from "@/lib/newwave/craft";
import { materialSuggestions } from "@/lib/newwave/craftAgent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Material" };

export default async function CraftMaterial({ searchParams }: { searchParams: Promise<{ klubb?: string; kalla?: string; q?: string }> }) {
  const initial = await searchParams;
  const now = new Date().getTime();
  const data = await craftData(now);
  const materials = data.rows.flatMap((r) => r.materials).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Material</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Allt som klubbarna och Craft har skapat, med granskningsagentens betyg och status hos varje klubb.</p>
      <div className="mt-5">
        <AgentStrip collapsible suggestions={materialSuggestions(data, now)} />
      </div>
      <div className="mt-7">
        <MaterialBoard
          key={`${initial.q ?? ""}:${initial.klubb ?? ""}:${initial.kalla ?? ""}`}
          materials={materials}
          clubs={[...data.rows].sort((a, b) => a.name.localeCompare(b.name, "sv")).map((r) => ({ id: r.id, name: r.name, colors: r.colors, logo: r.logo, logoDark: r.logoDark, region: r.region, sports: r.sports, city: r.city }))}
          occasions={[...new Set(materials.map((m) => m.occasion))]}
          now={now}
          initial={initial}
        />
      </div>
    </div>
  );
}
