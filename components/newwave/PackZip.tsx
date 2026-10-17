"use client";

import { useState } from "react";
import { buildPackZip, type ZipPack, zipName } from "@/lib/newwave/packZip";
import { downloadBlob } from "@/lib/zip";

const CONTENTS = [
  "Inlägg med bild och text till Instagram och Facebook",
  "Story och manus till Reels och TikTok",
  "Banner och nyhetsnotis till hemsidan",
  "Nyhetsbrevet som färdig HTML-mall",
  "Affisch i A4 med QR-kod",
  "AI-foton, produktbilder och tryckfiler",
  "”Så här gör du” – vad som ska upp var och när",
];

export function ZipButton({ pack, ghost }: { pack: ZipPack; ghost?: boolean }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    setProgress(0);
    try {
      downloadBlob(await buildPackZip(pack, (p) => setProgress(Math.round(p))), zipName(pack));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };
  return (
    <>
      <button type="button" className={`nw-btn ${ghost ? "nw-btn-ghost" : "nw-club-btn"} justify-center`} disabled={progress !== null} onClick={run}>
        {progress !== null ? `Packar zip-filen… ${progress} %` : "Ladda ner allt (zip)"}
      </button>
      {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
    </>
  );
}

/** Måndagsmejlet till kansliet: inget publiceras, allt kommer som en zip att lägga upp själva. */
export function OfficeMail({ pack, agent, sentAt }: { pack: ZipPack; agent: string; sentAt: string }) {
  return (
    <section className="mt-6 overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white">
      <dl className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-[var(--nw-line)] bg-[var(--nw-soft)] px-4 py-3 text-[13px] sm:px-5">
        <dt className="text-[var(--nw-faint)]">Från</dt>
        <dd className="truncate text-[var(--nw-ink)]">{agent} · Next Wave</dd>
        <dt className="text-[var(--nw-faint)]">Till</dt>
        <dd className="truncate text-[var(--nw-ink)]">Kansliet, {pack.club.name}</dd>
        <dt className="text-[var(--nw-faint)]">Ämne</dt>
        <dd className="font-medium text-[var(--nw-ink)] [overflow-wrap:anywhere]">
          {pack.week ? `Vecka ${pack.week}: ` : ""}”{pack.slogan}” – allt material i en zip
        </dd>
        <dt className="text-[var(--nw-faint)]">Skickat</dt>
        <dd className="text-[var(--nw-muted)]">{sentAt}</dd>
      </dl>
      <div className="px-4 py-5 sm:px-5">
        <p className="text-[14.5px] text-[var(--nw-ink)]">Hej! Här är veckans material för {pack.club.name}. Ingenting publiceras automatiskt – lägg upp det ni vill, när ni vill. I zip-filen finns:</p>
        <ul className="mt-3 grid gap-1.5 text-[13.5px] text-[var(--nw-muted)] sm:grid-cols-2">
          {CONTENTS.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-[var(--club)]">✓</span>
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[var(--nw-soft)] p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--club)] text-[11px] font-semibold text-white">
              ZIP
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[var(--nw-ink)]">{zipName(pack)}</p>
              <p className="text-[12.5px] text-[var(--nw-muted)]">Bilaga · alla bilder, texter och guiden</p>
            </div>
          </div>
          <ZipButton pack={pack} />
        </div>
        <p className="mt-4 text-[13px] text-[var(--nw-muted)]">Produkterna läggs i butiken hos Intersport när ni godkänner nedan. Passar motivet inte? Neka, så kommer det näst bästa samma dag.</p>
      </div>
    </section>
  );
}
