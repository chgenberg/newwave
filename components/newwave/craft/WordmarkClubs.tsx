"use client";

import { useEffect, useState } from "react";
import { registryAsset } from "@/lib/newwave/clubAssets";
import type { ClubItem } from "@/lib/newwave/clubRegistry";
import type { LabClub } from "./WordmarkLab";

type Page = { total: number; items: ClubItem[] };

const API = "/api/v1/newwave/registry";

type Props = {
  selected: LabClub[];
  onToggle: (c: LabClub) => void;
  /** Med den här går det att välja alla klubbar som sökningen visar på en gång. */
  onPickAll?: (clubs: LabClub[]) => void;
  title?: string;
  hint?: string;
};

/** Klubbarna i klubbregistret som har fått ett klubbmärke, de största först eller de som matchar sökningen; listan växer medan skrapningen pågår. */
export function useRegistryClubs() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [limit, setLimit] = useState(48);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const p = new URLSearchParams({ sort: q ? "name" : "size", limit: String(limit) });
      if (q) p.set("q", q);
      const res = await fetch(`${API}?${p}`, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? ((await res.json()) as Page) : null;
      if (live && body) setPage(body);
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [q, limit]);

  return { text, setText, page, more: () => setLimit((l) => l + 48) };
}

export const num = new Intl.NumberFormat("sv-SE");

/** Alla klubbar i klubbregistret som har fått ett klubbmärke, som en rad med kort. */
export function WordmarkClubs({ selected, onToggle, onPickAll, title = "Alla klubbar", hint = "välj en för att se alla wordmarks för den" }: Props) {
  const { text, setText, page, more } = useRegistryClubs();

  return (
    <section className="mt-5 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-3 min-[900px]:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-[var(--nw-ink)]">{title}</h2>
          <p className="text-[13px] text-[var(--nw-muted)]">{page ? `${num.format(page.total)} klubbar med klubbmärke i klubbregistret – ${hint}` : "Hämtar klubbar…"}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 min-[700px]:w-auto">
          <label className="relative w-full min-[700px]:w-[300px]">
            <span className="sr-only">Sök klubb</span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Sök klubb eller ort" className="h-10 w-full rounded-full border border-[var(--nw-line)] bg-[var(--nw-soft)] px-4 text-[14px] outline-none focus:border-[var(--nw-ink)]" />
          </label>
          {onPickAll && page?.items.length ? (
            <button type="button" onClick={() => onPickAll(page.items.map((c) => ({ id: c.id, name: c.name })))} className="nw-chip h-10 px-4">
              Välj alla {num.format(page.items.length)} som visas
            </button>
          ) : null}
        </div>
      </div>
      <ul className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {selected
          .filter((v) => !page?.items.some((c) => c.id === v.id))
          .map((v) => (
            <li key={v.id} className="snap-start">
              <Chip club={{ id: v.id, name: v.name }} active onClick={() => onToggle(v)} />
            </li>
          ))}
        {page?.items.map((c) => (
          <li key={c.id} className="snap-start">
            <Chip club={c} active={selected.some((v) => v.id === c.id)} onClick={() => onToggle({ id: c.id, name: c.name })} />
          </li>
        ))}
        {page && page.items.length < page.total ? (
          <li className="snap-start">
            <button type="button" onClick={more} className="grid h-[118px] w-[112px] place-items-center rounded-[12px] border border-dashed border-[var(--nw-line)] text-[12.5px] text-[var(--nw-muted)] hover:border-[var(--nw-ink)] hover:text-[var(--nw-ink)]">
              Visa fler
            </button>
          </li>
        ) : null}
        {page && page.total === 0 ? <li className="py-6 text-[13px] text-[var(--nw-muted)]">Ingen klubb med klubbmärke matchar sökningen än.</li> : null}
      </ul>
    </section>
  );
}

export function ClubLogo({ club, className }: { club: Pick<ClubItem, "id"> & Partial<Pick<ClubItem, "at" | "onDark">>; className: string }) {
  return (
    <span className={`flex items-center justify-center ${className}`} style={{ background: club.onDark ? "#1C1C1E" : "#F4F3F0" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- skrapat klubbmärke */}
      <img src={registryAsset(club.id, club.at, "logo.png")} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
    </span>
  );
}

function Chip({ club, active, onClick }: { club: Pick<ClubItem, "id" | "name"> & Partial<Pick<ClubItem, "at" | "onDark" | "colors">>; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`block w-[112px] rounded-[12px] p-1 text-left transition ${active ? "bg-[var(--nw-ink)] text-white" : "hover:bg-[var(--nw-soft)]"}`}>
      <ClubLogo club={club} className="h-[84px] rounded-[9px] p-2.5" />
      <span className="mt-1 block truncate px-0.5 text-[11.5px] font-medium leading-tight">{club.name}</span>
    </button>
  );
}
