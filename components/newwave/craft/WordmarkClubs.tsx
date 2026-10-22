"use client";

import { useEffect, useState } from "react";
import { registryAsset } from "@/lib/newwave/clubAssets";
import type { ClubItem } from "@/lib/newwave/clubRegistry";
import type { LabClub } from "./WordmarkLab";

type Page = { total: number; items: ClubItem[] };

const API = "/api/v1/newwave/registry";
const num = new Intl.NumberFormat("sv-SE");

/** Alla klubbar i klubbregistret som har fått ett klubbmärke; listan växer medan skrapningen pågår. */
export function WordmarkClubs({ value, onPick }: { value: LabClub | null; onPick: (c: LabClub | null) => void }) {
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
      const p = new URLSearchParams({ show: "logo", sort: q ? "name" : "size", limit: String(limit) });
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

  return (
    <section className="mt-5 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-3 min-[900px]:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-[var(--nw-ink)]">Alla klubbar</h2>
          <p className="text-[13px] text-[var(--nw-muted)]">{page ? `${num.format(page.total)} klubbar med klubbmärke i klubbregistret – välj en för att se alla ordmärken för den` : "Hämtar klubbar…"}</p>
        </div>
        <label className="relative w-full min-[700px]:w-[300px]">
          <span className="sr-only">Sök klubb</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Sök klubb eller ort" className="h-10 w-full rounded-full border border-[var(--nw-line)] bg-[var(--nw-soft)] px-4 text-[14px] outline-none focus:border-[var(--nw-ink)]" />
        </label>
      </div>
      <ul className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {value && !page?.items.some((c) => c.id === value.id) ? (
          <li className="snap-start">
            <Chip club={{ id: value.id, name: value.name, logo: true }} active onClick={() => onPick(null)} />
          </li>
        ) : null}
        {page?.items.map((c) => (
          <li key={c.id} className="snap-start">
            <Chip club={c} active={value?.id === c.id} onClick={() => onPick(value?.id === c.id ? null : { id: c.id, name: c.name })} />
          </li>
        ))}
        {page && page.items.length < page.total ? (
          <li className="snap-start">
            <button type="button" onClick={() => setLimit((l) => l + 48)} className="grid h-[118px] w-[112px] place-items-center rounded-[12px] border border-dashed border-[var(--nw-line)] text-[12.5px] text-[var(--nw-muted)] hover:border-[var(--nw-ink)] hover:text-[var(--nw-ink)]">
              Visa fler
            </button>
          </li>
        ) : null}
        {page && page.total === 0 ? <li className="py-6 text-[13px] text-[var(--nw-muted)]">Ingen klubb med klubbmärke matchar sökningen än.</li> : null}
      </ul>
    </section>
  );
}

function Chip({ club, active, onClick }: { club: Pick<ClubItem, "id" | "name" | "logo" | "at" | "onDark" | "colors">; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`block w-[112px] rounded-[12px] p-1 text-left transition ${active ? "bg-[var(--nw-ink)] text-white" : "hover:bg-[var(--nw-soft)]"}`}>
      <span className="flex h-[84px] items-center justify-center rounded-[9px] p-2.5" style={{ background: club.onDark ? "#1C1C1E" : "#F4F3F0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- skrapat klubbmärke */}
        <img src={registryAsset(club.id, club.at, "logo.png")} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
      </span>
      <span className="mt-1 block truncate px-0.5 text-[11.5px] font-medium leading-tight">{club.name}</span>
    </button>
  );
}
