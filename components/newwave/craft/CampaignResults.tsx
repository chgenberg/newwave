"use client";

import Link from "next/link";
import { useState } from "react";
import type { CampaignResult } from "@/lib/newwave/craft";
import { Crest, STATUS_PILL, fmtDate, fmtN } from "./parts";

type MiniClub = { id: string; name: string; colors: [string, string]; logo?: string };

const PILL = {
  ...STATUS_PILL,
  schemalagd: { label: "Schemalagd", cls: "bg-[#EAF1FE] text-[#1D4ED8]" },
  granskas: { label: "Hos Craft", cls: "bg-[var(--nw-ink)] text-white" },
};

export function CampaignResults({ campaigns, clubs }: { campaigns: CampaignResult[]; clubs: MiniClub[] }) {
  const [open, setOpen] = useState<string | null>(campaigns.find((c) => !c.scheduled)?.id ?? null);
  const byId = Object.fromEntries(clubs.map((c) => [c.id, c]));

  return (
    <ul className="flex flex-col gap-2">
      {campaigns.map((c) => {
        const n = c.clubs.length;
        const isOpen = open === c.id;
        const steps = [
          { label: "Skickad", v: c.scheduled ? 0 : n },
          { label: "Godkänd", v: c.approved },
          { label: "Säljer", v: c.clubs.filter((x) => x.sold > 0).length },
        ];
        return (
          <li key={c.id} className={`overflow-hidden rounded-2xl border ${isOpen ? "border-[var(--nw-ink)]" : "border-[var(--nw-line)]"}`}>
            <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} className="grid w-full gap-3 p-4 text-left sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)_90px] sm:items-center">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14.5px] font-semibold text-[var(--nw-ink)]">{c.title}</span>
                  {c.scheduled ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${PILL.schemalagd.cls}`}>Schemalagd</span> : null}
                </span>
                <span className="block truncate text-[12.5px] text-[var(--nw-muted)]">
                  {c.occasion} · {c.scheduled ? `skickas ${fmtDate(c.sendAt!)}` : fmtDate(c.sendAt ?? c.createdAt)} · {n} klubbar
                  {c.deadline ? ` · godkänn senast ${fmtDate(c.deadline)}` : ""}
                </span>
              </span>
              <span className="grid grid-cols-3 gap-1.5" aria-label="Tratt">
                {steps.map((s) => (
                  <span key={s.label} className="min-w-0">
                    <span className="block h-1.5 rounded-full bg-[var(--nw-soft)]">
                      <span className="block h-full rounded-full bg-[var(--nw-ink)]" style={{ width: `${n ? (s.v / n) * 100 : 0}%` }} />
                    </span>
                    <span className="mt-1 block truncate text-[11.5px] text-[var(--nw-muted)]">
                      {s.label} <span className="font-semibold tabular-nums text-[var(--nw-ink)]">{s.v}</span>
                    </span>
                  </span>
                ))}
              </span>
              <span className="text-[13px] sm:text-right">
                <span className="text-[17px] font-semibold tabular-nums text-[var(--nw-ink)]">{fmtN(c.sold)}</span>
                <span className="text-[var(--nw-muted)]"> sålda</span>
              </span>
            </button>
            {isOpen ? (
              <div className="nw-fade border-t border-[var(--nw-line)] bg-[var(--nw-soft)]/60 p-4">
                <p className="text-[13px] text-[var(--nw-muted)]">{c.brief}</p>
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {c.clubs.map((x) => {
                    const club = byId[x.clubId];
                    return (
                      <li key={x.clubId} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-[13px]">
                        {club ? <Crest name={club.name} logo={club.logo} colors={club.colors} size={22} /> : null}
                        <span className="min-w-0 flex-1 truncate text-[var(--nw-ink)]">{club?.name ?? x.clubId}</span>
                        {x.sold ? <span className="tabular-nums text-[var(--nw-muted)]">{x.sold} st</span> : null}
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${PILL[x.status].cls}`}>{PILL[x.status].label}</span>
                      </li>
                    );
                  })}
                </ul>
                {!c.scheduled && clubs.length > n ? (
                  <Link href={`/newwave/craft/skapa?kampanj=${c.id}`} className="nw-btn mt-4 h-9 px-4 text-[13px]">
                    Skicka till de {clubs.length - n} andra klubbarna
                  </Link>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
