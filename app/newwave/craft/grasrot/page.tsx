/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { GRASROT_CLUBS } from "@/lib/newwave/grasrot/clubs";
import { emblemSet } from "@/lib/newwave/grasrot/emblem";
import { fileHref, printChecks } from "@/lib/newwave/grasrot/files";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Gräsrot 360 · New Waves dashboard" };

const STATUS = {
  ok: { label: "Klar för tryck", className: "bg-[#E7F6EC] text-[#1E6B3A]" },
  varning: { label: "Granska", className: "bg-[#FFF4DB] text-[#8A5A00]" },
  original: { label: "Original behövs", className: "bg-[#FDECEC] text-[#B42318]" },
  stopp: { label: "Åtgärda", className: "bg-[#FDECEC] text-[#B42318]" },
  fel: { label: "Kunde inte byggas", className: "bg-[#FDECEC] text-[#B42318]" },
} as const;

export default async function GrasrotPage() {
  const rows = await Promise.all(
    GRASROT_CLUBS.map(async (club) => {
      try {
        const [set, emblem, wordmark] = await Promise.all([emblemSet(club.id)!, printChecks(club.id, "klubbmarke", "original"), printChecks(club.id, "ordmarke", "original")]);
        const levels = [...(emblem ?? []), ...(wordmark ?? [])].map((c) => c.level);
        const level = !set.quality.ready ? "original" : levels.includes("stopp") ? "stopp" : levels.includes("varning") ? "varning" : "ok";
        return { club, set, level } as const;
      } catch (err) {
        console.error(`[grasrot] ${club.id}`, err);
        return { club, set: null, level: "fel" } as const;
      }
    }),
  );
  const ready = rows.filter((r) => r.set?.quality.ready).length;

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Gräsrot 360</h1>
      <p className="mt-1 max-w-[680px] text-[14.5px] text-[var(--nw-muted)]">
        Tio föreningar i betan. Varje förening har klubbmärket och ordmärket i original, solid och negativ – som PDF och EPS med Pantone-dekorfärger, CMYK eller RGB, och som SVG – och
        produkterna i Bilaga 2 i 3D, en herobild från klubbstugan, inlägg för sociala medier och produktionsunderlag till leverantörerna.
      </p>
      <p className="mt-3 text-[13.5px] text-[var(--nw-muted)]">
        {ready} av {rows.length} märken håller för tryck i dag. Övriga är provisoriska tills föreningens originalfil (AI, EPS, PDF eller SVG) kommit in.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {rows.map(({ club, set, level }) => (
          <li key={club.id} className="min-w-0">
            <Link href={`/newwave/craft/grasrot/${club.id}`} className="group flex h-full flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--club)]">
              <div className="grid h-[180px] grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
                <div className="relative min-h-0 overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                  <img src={fileHref(club.id, "klubbmarke-original.svg")} alt={`${club.name} klubbmärke`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-4" />
                </div>
                <div className="relative min-h-0 overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                  <img src={fileHref(club.id, "ordmarke-original.svg")} alt={`${club.name} ordmärke`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-3" />
                </div>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="nw-club-heading truncate text-[17px] leading-tight text-[var(--club)]">{club.name}</p>
                  <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
                    {club.city} · {club.sport}
                    {set ? ` · ${set.quality.kind === "vektor" ? "vektorfil" : `vektoriserad från ${set.quality.px} px`}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS[level].className}`}>{STATUS[level].label}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
