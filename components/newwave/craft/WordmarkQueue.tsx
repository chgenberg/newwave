"use client";

import { useEffect, useState } from "react";
import type { LabClub } from "./WordmarkLab";

type Issue = { id: string; level: "fel" | "varning" | "info"; text: string; fix: string };
type Item = { id: string; name: string; logo?: string; issues: Issue[] };
type Queue = { checked: number; approved: number; flagged: number; counts: Record<string, number>; items: Item[]; labels: Record<string, string> };

const PAGE = 20;
const tone = (l: Issue["level"]) => (l === "fel" ? "bg-[#FDECEC] text-[#B42318]" : l === "varning" ? "bg-[#FFF4E0] text-[#8A5300]" : "bg-[var(--nw-soft)] text-[var(--nw-muted)]");

/**
 * Granskningskön: klubbar vars wordmarks inte bör gå ut som de är – vitt märke, fel eller saknade färger, konstig
 * namndelning, lågupplöst märke. Största föreningarna först; klubbar som själva godkänt är redan borta ur kön.
 */
export function WordmarkQueue({ onFocus }: { onFocus: (c: LabClub) => void }) {
  const [issue, setIssue] = useState("");
  const [data, setData] = useState<Queue | null>(null);
  const [more, setMore] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/newwave/wordmark/quality?limit=${PAGE}${issue ? `&issue=${issue}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<Queue>) : null))
      .then((d) => {
        if (!live) return;
        setData(d);
        setMore([]);
      });
    return () => {
      live = false;
    };
  }, [issue]);

  const loadMore = async () => {
    if (!data) return;
    setBusy(true);
    const r = await fetch(`/api/v1/newwave/wordmark/quality?limit=${PAGE}&offset=${data.items.length + more.length}${issue ? `&issue=${issue}` : ""}`);
    const d = r.ok ? ((await r.json()) as Queue) : null;
    if (d) setMore((m) => [...m, ...d.items]);
    setBusy(false);
  };

  if (!data) return <p className="text-[13.5px] text-[var(--nw-muted)]">Kontrollerar klubbarna…</p>;
  const items = [...data.items, ...more];
  const chips = Object.entries(data.counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] text-[var(--nw-muted)]">
        {data.checked} klubbar kontrollerade · <span className="font-semibold text-[var(--nw-ink)]">{data.flagged} behöver granskas</span> · {data.approved} godkända av klubben själv
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrera på kontroll">
        <button type="button" aria-pressed={!issue} onClick={() => setIssue("")} className="nw-chip h-8 px-3 aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white">
          Alla
        </button>
        {chips.map(([id, n]) => (
          <button key={id} type="button" aria-pressed={issue === id} onClick={() => setIssue(id)} className="nw-chip h-8 px-3 aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white">
            {data.labels[id] ?? id} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-[var(--nw-line)]">
        {items.map((c) => {
          const shown = c.issues.filter((i) => i.level !== "info");
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 min-[700px]:flex-nowrap">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[var(--nw-soft)] p-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- klubbens märke */}
                {c.logo ? <img src={c.logo} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[var(--nw-ink)]">{c.name}</p>
                <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{shown[0]?.text}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {shown.map((i) => (
                    <span key={i.id} title={i.fix} className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${tone(i.level)}`}>
                      {data.labels[i.id] ?? i.id}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => onFocus({ id: c.id, name: c.name })} className="nw-btn nw-btn-ghost h-9 px-3.5 text-[13px]">
                  Visa wordmarks
                </button>
                <a href={`/newwave/klubbar/${c.id}#godkann`} target="_blank" rel="noopener noreferrer" className="nw-btn h-9 px-3.5 text-[13px]">
                  Be klubben rätta ↗
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length < data.flagged ? (
        <button type="button" disabled={busy} onClick={() => void loadMore()} className="nw-chip h-9 w-fit px-4">
          {busy ? "Hämtar…" : `Visa fler (${data.flagged - items.length} kvar)`}
        </button>
      ) : null}
    </div>
  );
}
