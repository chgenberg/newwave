"use client";

import { useState } from "react";
import { Badge, Modal, QUIET } from "@/components/ScarfParts";
import { CHANNELS, channelText, type Channel, type ScarfCopy, type ScarfMaterial } from "@/lib/scarfChannels";

/** Det valda motivets material: popuprutan där man väljer ett av de tre förslagen, och kanalerna med bild eller film och text. */

export type Proposal = { key: string; title: string; label: string; why: string; front: string; back: string; stopped: boolean };

export function ChooseDialog({ club, proposals, chosen, onPick, onClose }: { club: string; proposals: Proposal[]; chosen: string | null; onPick: (key: string) => void; onClose: () => void }) {
  return (
    <Modal title="Välj ett motiv" eyebrow={club} onClose={onClose} wide>
      <p className="text-[14.5px] leading-snug text-[#424245]">Du får inlägg, banner och film för det motiv du väljer.</p>
      <ul className="mt-4 space-y-3">
        {proposals.map((p) => (
          <li key={p.key}>
            <button type="button" disabled={p.stopped} onClick={() => onPick(p.key)} className={`group block w-full rounded-3xl border p-4 text-left transition disabled:opacity-55 ${chosen === p.key ? "border-[#1D1D1F] shadow-[inset_0_0_0_1px_#1D1D1F]" : "border-black/[0.1] enabled:hover:border-black/50"}`}>
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">{p.title}</span>
                <Badge>{p.label}</Badge>
                {p.stopped ? <Badge>Stoppad</Badge> : <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-[#1D1D1F] px-3.5 text-[13px] font-medium text-white transition group-hover:bg-black">{chosen === p.key ? "Vald" : "Välj"}</span>}
              </span>
              <span className="mt-3 block space-y-2 rounded-2xl bg-[#F5F5F7] p-2.5">
                {/* På mobilen visas halsdukens mitt, där texten står; på större skärmar hela halsduken. */}
                {/* eslint-disable @next/next/no-img-element */}
                <img src={p.front} alt={`${p.title}, framsida`} className="block h-14 w-full rounded-md object-cover sm:h-auto" />
                <img src={p.back} alt={`${p.title}, baksida`} className="block h-14 w-full rounded-md object-cover sm:h-auto" />
                {/* eslint-enable @next/next/no-img-element */}
              </span>
              <span className="mt-2.5 line-clamp-2 block text-[13px] leading-snug text-[#6E6E73]">{p.stopped ? "Stoppad av kontrollen – välj ett annat motiv, eller ändra halsduken på kortet." : p.why}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Kanalerna i tre spalter som blir ungefär lika höga: stående bilder och filmer blandas med de liggande. */
const COLUMNS: Channel["id"][][] = [
  ["instagram", "facebook"],
  ["linkedin", "reels"],
  ["banner", "tiktok"],
];

function ChannelCard({ channel, src, poster, text }: { channel: Channel; src: string | null; poster?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <figure className="overflow-hidden rounded-3xl border border-black/[0.08] bg-white">
      <div className="bg-[#F5F5F7]" style={{ aspectRatio: `${channel.w} / ${channel.h}` }}>
        {src && channel.kind === "film" ? (
          <video src={src} poster={poster} muted loop playsInline autoPlay controls preload="metadata" className="h-full w-full object-cover" />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${channel.label}: ${channel.format}`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[#86868B]">Filmen gick inte att klippa den här gången.</div>
        )}
      </div>
      <figcaption className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15.5px] font-semibold tracking-tight">{channel.label}</p>
          <p className="text-[12px] text-[#86868B]">{channel.format}</p>
        </div>
        <p className="mt-2 whitespace-pre-line break-words text-[13.5px] leading-snug text-[#424245]">{text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className={QUIET}>
            {copied ? "Kopierad" : "Kopiera text"}
          </button>
          {src && (
            <a href={src} download={channel.file} className={QUIET}>
              {channel.kind === "film" ? "Ladda ner film" : "Ladda ner bild"}
            </a>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

/** `title` och `onChange` utelämnas när materialet visas i en popupruta som redan har rubriken. */
export function MaterialView({ title, copy, material, notes, onZip, onChange }: { title?: string; copy: ScarfCopy; material: ScarfMaterial; notes: string[]; onZip: () => Promise<void>; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = (c: Channel) => (c.kind === "film" ? (material.films[c.id]?.url ?? null) : material.images[c.id]);
  return (
    <div>
      {title && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#86868B]">Material för det valda motivet</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          </div>
          {onChange && (
            <button type="button" onClick={onChange} className={QUIET}>
              Byt motiv
            </button>
          )}
        </div>
      )}
      <div className="mx-auto grid max-w-sm gap-5 md:max-w-none md:grid-cols-3">
        {COLUMNS.map((ids) => (
          <div key={ids.join()} className="space-y-5">
            {ids.map((id) => {
              const channel = CHANNELS.find((c) => c.id === id)!;
              return <ChannelCard key={id} channel={channel} src={src(channel)} poster={channel.kind === "film" ? material.films[channel.id]?.poster : undefined} text={channelText(copy, id)} />;
            })}
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onZip();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kunde inte packa materialet.");
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-[#1D1D1F] px-8 text-[16.5px] font-semibold tracking-tight text-white transition hover:bg-black disabled:bg-[#C7C7CC]"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
          {busy ? "Packar …" : "Ladda hem zip"}
        </button>
        <p className="mt-2.5 text-[12.5px] text-[#86868B]">Bilderna, filmerna, texterna och stickfilerna i en fil.</p>
        {error && <p className="mt-2 text-[12.5px] text-[#B3261E]">{error}</p>}
        {notes.map((n) => (
          <p key={n} className="mt-1.5 text-[12.5px] text-[#86868B]">
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}
