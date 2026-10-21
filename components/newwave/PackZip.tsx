"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OFFICE_MAIL_CONTENTS, officeMailHtml, officeMailSubject } from "@/lib/newwave/officeMail";
import { buildPackZip, type ZipPack, zipName } from "@/lib/newwave/packZip";
import { luminance } from "@/lib/newwave/theme";
import { downloadBlob } from "@/lib/zip";

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
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <section className="mt-6 overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--nw-line)] bg-[var(--nw-soft)] px-4 py-3 sm:flex-row sm:items-start sm:px-5">
        <dl className="grid min-w-0 flex-1 grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-[var(--nw-faint)]">Från</dt>
          <dd className="truncate text-[var(--nw-ink)]">{agent} · Next Wave</dd>
          <dt className="text-[var(--nw-faint)]">Till</dt>
          <dd className="truncate text-[var(--nw-ink)]">Kansliet, {pack.club.name}</dd>
          <dt className="text-[var(--nw-faint)]">Ämne</dt>
          <dd className="font-medium text-[var(--nw-ink)] [overflow-wrap:anywhere]">{officeMailSubject(pack)}</dd>
          <dt className="text-[var(--nw-faint)]">Skickat</dt>
          <dd className="text-[var(--nw-muted)]">{sentAt}</dd>
        </dl>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="nw-btn nw-btn-ghost shrink-0 justify-center bg-white">
          <MailIcon /> Exempelmejl
        </button>
      </div>
      {open ? <MailPreview pack={pack} agent={agent} sentAt={sentAt} onClose={close} /> : null}
      <div className="px-4 py-5 sm:px-5">
        <p className="text-[14.5px] text-[var(--nw-ink)]">Hej! Här är veckans material för {pack.club.name}. Ingenting publiceras automatiskt – lägg upp det ni vill, när ni vill. I zip-filen finns:</p>
        <ul className="mt-3 grid gap-1.5 text-[13.5px] text-[var(--nw-muted)] sm:grid-cols-2">
          {OFFICE_MAIL_CONTENTS.map((c) => (
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

/** Mejlet som kansliet får, i en mejlvy ovanpå sidan. */
function MailPreview({ pack, agent, sentAt, onClose }: { pack: ZipPack; agent: string; sentAt: string; onClose: () => void }) {
  const [html] = useState(() => officeMailHtml(pack, { origin: window.location.origin, agent, sentAt }));
  const [height, setHeight] = useState(1600);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const subject = officeMailSubject(pack);
  const badge = { background: pack.club.colors.primary, color: luminance(pack.club.colors.primary) > 0.4 ? "#111" : "#FFF" };
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={subject} onClick={onClose}>
      <div className="nw-pop flex max-h-[94vh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] sm:max-h-[92vh] sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
        <header className="border-b border-[var(--nw-line)] px-4 pb-3 pt-4 sm:px-6">
          <div className="flex items-start gap-3">
            <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--nw-ink)] sm:text-[19px]">{subject}</h2>
            <button ref={close} type="button" onClick={onClose} aria-label="Stäng" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--nw-soft)] text-[var(--nw-ink)] transition hover:bg-[var(--nw-soft-2)]">
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold" style={badge}>
              {agent.charAt(0)}
            </span>
            <div className="min-w-0 flex-1 text-[13px] leading-tight">
              <p className="truncate">
                <span className="font-semibold text-[var(--nw-ink)]">{agent}</span> <span className="text-[var(--nw-muted)]">· Next Wave</span>
              </p>
              <p className="mt-0.5 truncate text-[var(--nw-muted)]">Till: Kansliet, {pack.club.name}</p>
            </div>
            <p className="hidden shrink-0 text-[12.5px] text-[var(--nw-muted)] sm:block">{sentAt}</p>
          </div>
          <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-[var(--nw-soft)] py-1 pl-1 pr-3 text-[12.5px] text-[var(--nw-ink)]">
            <span aria-hidden className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={badge}>
              ZIP
            </span>
            <span className="truncate">{zipName(pack)}</span>
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#EEEDE9]">
          <iframe
            title={subject}
            srcDoc={html}
            sandbox="allow-same-origin"
            className="block w-full border-0"
            style={{ height }}
            onLoad={(e) => {
              const doc = e.currentTarget.contentDocument;
              if (doc) setHeight(doc.documentElement.scrollHeight);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
