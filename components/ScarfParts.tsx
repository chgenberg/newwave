"use client";

import { useEffect, useRef, useState } from "react";
import { IFKLoader, useLoader } from "@/components/IFKLoader";
import { SCARF } from "@/lib/scarf";
import type { ScarfReview } from "@/lib/scarfAgent";
import type { ProductionCheck } from "@/lib/scarfProduction";
import type { Level } from "@/lib/scarfRecipes";

/** Delarna som halsduksagenten och inspirationsbanken delar: kortets knappar och de två popuprutorna. */

export const LEVEL: Record<Level, string> = { enkel: "Enkel", mellan: "Mellan", komplex: "Komplex" };
const REVIEW_MIN = { sales: 7, brandFit: 8, legibility: 7, craft: 0 };

export type YarnChip = { hex: string; pantone: string; share: number };

/** Allt om en halsduk som inte får plats på kortet. */
export type ScarfInfo = {
  /** Klubb eller företag, recept och nivå – raden ovanför rubriken. */
  eyebrow: string;
  title: string;
  why: string;
  signal?: string;
  images: { front: string; back: string };
  text: { front: string; back: string };
  yarns: YarnChip[];
  machine: { ok: boolean; summary: string; checks?: ProductionCheck[] };
  review: ScarfReview | null;
  first?: { title?: string; review: ScarfReview } | null;
  consent: string | null;
  note?: string | null;
};

/** `everyday`: företag och föreningar utanför idrotten fotograferas på stan och utanför jobbet i stället för på läktaren. */
export type PhotoTarget = { club: string; headline: string; crestUrl: string; wide?: boolean; everyday?: boolean; /** Klubben i flödet – då tas fotona på sportens egen plats. */ clubId?: string };

export function Badge({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium ${dark ? "bg-[#1D1D1F] text-white" : "bg-[#F5F5F7] text-[#424245]"}`}>{children}</span>;
}

export function Yarns({ yarns }: { yarns: YarnChip[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {yarns.map((y) => (
        <li key={y.hex} className="flex items-center gap-1.5 rounded-full bg-[#F5F5F7] py-1 pl-1 pr-2.5 text-[11.5px]" title={`${y.hex} · ${Math.round(y.share * 100)} % av maskorna`}>
          <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: y.hex }} />
          <span className="font-medium">{y.pantone.replace("PANTONE ", "")}</span>
          <span className="text-[#86868B]">{Math.max(1, Math.round(y.share * 100))} %</span>
        </li>
      ))}
    </ul>
  );
}

/** Fram- och baksida. På kortet visas bara bilderna; i popuprutan står texten under. */
export function Pictures({ front, back, text, captions = false }: { front: string; back: string; text: { front: string; back: string }; captions?: boolean }) {
  return (
    <div className="space-y-2.5">
      {(
        [
          ["Framsida", front, text.front],
          ["Baksida", back, text.back],
        ] as const
      ).map(([label, src, t]) => (
        <figure key={label}>
          <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${label}: ${t}`} className="block w-[240%] max-w-none rounded-lg sm:w-full" loading="lazy" />
          </div>
          {captions && (
            <figcaption className="mt-1 text-[11.5px] text-[#86868B]">
              {label} · {t}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function Scores({ r }: { r: ScarfReview }) {
  const cell = (label: string, v: number, min: number) => (
    <div className="flex flex-col items-center rounded-xl bg-[#F5F5F7] px-2 py-2">
      <span className={`text-[22px] font-semibold leading-none ${v >= min ? "text-[#1E8E3E]" : "text-[#B3261E]"}`}>{v}</span>
      <span className="mt-1 text-[10.5px] text-[#86868B]">{label}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cell("Säljbarhet", r.sales, REVIEW_MIN.sales)}
      {cell("Varumärke", r.brandFit, REVIEW_MIN.brandFit)}
      {cell("Läsbarhet", r.legibility, REVIEW_MIN.legibility)}
      {cell("Hantverk", r.craft, REVIEW_MIN.craft)}
    </div>
  );
}

/** Popupruta: stängs med krysset, Esc eller ett klick utanför. Sidan bakom rullar inte under tiden. */
export function Modal({ title, eyebrow, onClose, children, wide, full }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; full?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_30px_80px_rgba(0,0,0,0.25)] sm:rounded-3xl ${full ? "sm:max-w-6xl" : wide ? "sm:max-w-3xl" : "sm:max-w-2xl"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#86868B]">{eyebrow}</p>}
            <h3 className="mt-0.5 text-[22px] font-semibold tracking-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]">
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6 sm:px-7 sm:pb-7">{children}</div>
      </div>
    </div>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => <p className="mb-2 mt-6 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#86868B]">{children}</p>;

export function InfoDialog({ info, onClose }: { info: ScarfInfo; onClose: () => void }) {
  const { review } = info;
  return (
    <Modal title={info.title} eyebrow={info.eyebrow} onClose={onClose}>
      <p className="text-[14.5px] leading-snug text-[#424245]">{info.why}</p>
      {info.signal && <p className="mt-1 text-[12.5px] text-[#86868B]">Signal: {info.signal}</p>}
      <div className="mt-4 rounded-2xl bg-[#F5F5F7] p-3">
        <Pictures front={info.images.front} back={info.images.back} text={info.text} captions />
      </div>

      <Heading>Garner</Heading>
      <Yarns yarns={info.yarns} />

      <Heading>Maskinen</Heading>
      <p className="text-[13.5px] leading-snug">
        <span className={`font-semibold ${info.machine.ok ? "text-[#1E8E3E]" : "text-[#B3261E]"}`}>{info.machine.ok ? "Går att sticka." : "Behöver rättas."}</span> <span className="text-[#424245]">{info.machine.summary}</span>
      </p>
      {info.machine.checks && (
        <ul className="mt-2.5 space-y-1.5">
          {info.machine.checks.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${c.level === "ok" ? "bg-[#1E8E3E]" : c.level === "info" ? "bg-[#8E8E93]" : "bg-[#B3261E]"}`}>{c.level === "ok" ? "✓" : c.level === "info" ? "i" : "!"}</span>
              <span className="text-[13px] leading-snug">
                <span className="font-medium">{c.title}.</span> <span className="text-[#6E6E73]">{c.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Heading>Granskaren</Heading>
      {review ? (
        <>
          <Scores r={review} />
          <p className="mt-2.5 text-[13.5px] leading-snug">
            <span className={`font-semibold ${review.verdict === "godkänd" ? "text-[#1E8E3E]" : "text-[#B3261E]"}`}>{review.verdict === "godkänd" ? "Godkänd." : "Underkänd."}</span> {review.summary}
          </p>
          {review.issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px] leading-snug text-[#6E6E73]">
              {review.issues.map((i) => (
                <li key={i} className="flex gap-2">
                  <span>–</span>
                  {i}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-[13.5px] text-[#86868B]">Ingen granskning i den här körningen.</p>
      )}
      {info.first && (
        <p className="mt-3 rounded-2xl bg-[#F5F5F7] px-3.5 py-2.5 text-[13px] leading-snug text-[#424245]">
          <span className="font-semibold">Första versionen{info.first.title ? `, ”${info.first.title}”,` : ""} underkändes.</span> {info.first.review.summary}
        </p>
      )}
      {info.consent && <p className="mt-4 text-[13px] leading-snug text-[#8A5A00]">Kräver godkännande: {info.consent}</p>}
      {info.note && <p className="mt-2 text-[13px] leading-snug text-[#86868B]">{info.note}</p>}
    </Modal>
  );
}

// --- Fotografier -----------------------------------------------------------------

type Photo = { id: string; label: string; url: string };

async function toDataUrl(src: string) {
  if (src.startsWith("data:")) return src;
  const blob = await fetch(src).then((r) => {
    if (!r.ok) throw new Error("Kunde inte läsa halsdukens bild.");
    return r.blob();
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Kunde inte läsa halsdukens bild."));
    reader.readAsDataURL(blob);
  });
}

export function fileToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Välj en bildfil (JPG, PNG eller WebP)."));
    if (file.size > 15_000_000) return reject(new Error("Bilden är för stor – välj ett foto under 15 MB."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      c.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Kunde inte läsa bildformatet – prova JPG eller PNG."));
    };
    img.src = url;
  });
}

/** Fotostudion från halsduksstudion, som popupruta: fyra modeller i halsduken, eller halsduken på ett eget foto. */
export function PhotoDialog({ target, scarf, colors, onClose }: { target: PhotoTarget; scarf: string; colors: string[]; onClose: () => void }) {
  const [self, setSelf] = useState<Photo[]>([]);
  const [four, setFour] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const loader = useLoader();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    if (!camera) return stop;
    let live = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      Promise.resolve().then(() => live && setCameraError("Kameran kunde inte öppnas i den här webbläsaren – ladda upp ett foto i stället."));
      return stop;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false })
      .then((stream) => {
        if (!live) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => null);
        }
      })
      .catch(() => live && setCameraError("Ge tillåtelse till kameran, eller ladda upp ett foto."));
    return () => {
      live = false;
      stop();
    };
  }, [camera]);

  const run = async (mode: "four" | "self", personDataUrl?: string) => {
    setCamera(false);
    setBusy(true);
    setError(null);
    loader.start("Lägger upp halsduken i studion", 15, 1500);
    try {
      const scarfDataUrl = await toDataUrl(scarf);
      loader.stage(mode === "self" ? "Sätter halsduken på fotot" : "Fotograferar fyra personer i halsduken", 95, 50000);
      const res = await fetch("/api/v1/scarf/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, club: target.club, headline: target.headline, scarfDataUrl, ...(personDataUrl ? { personDataUrl } : { setting: target.everyday ? "vardag" : "sport", clubId: target.clubId }) }),
      });
      const json = (await res.json().catch(() => ({}))) as { photos?: Photo[]; error?: string };
      if (!res.ok || !json.photos?.length) throw new Error(json.error || "Kunde inte skapa fotografierna.");
      if (mode === "self") setSelf((prev) => [...json.photos!, ...prev].slice(0, 6));
      else setFour(json.photos);
      loader.done();
    } catch (e) {
      loader.fail();
      setError(e instanceof Error ? e.message : "Kunde inte skapa fotografierna.");
    } finally {
      setBusy(false);
    }
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return setCameraError("Kameran är inte redo än – vänta ett ögonblick eller ladda upp ett foto.");
    const s = Math.min(v.videoWidth, v.videoHeight);
    const out = document.createElement("canvas");
    out.width = 1024;
    out.height = 1024;
    const ctx = out.getContext("2d")!;
    ctx.translate(1024, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 1024, 1024);
    void run("self", out.toDataURL("image/jpeg", 0.92));
  };

  const card = (p: Photo, file: string, aspect: string) => (
    <figure key={p.url} className="overflow-hidden rounded-2xl bg-[#F5F5F7] p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.url} alt={p.label} className={`${aspect} w-full rounded-xl object-cover`} />
      <figcaption className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[12.5px]">
        <span className="truncate font-medium">{p.label}</span>
        <a href={p.url} download={file} className="shrink-0 text-[#1D1D1F] underline decoration-black/20 underline-offset-4">
          Ladda ner
        </a>
      </figcaption>
    </figure>
  );

  const [c0, c1] = [colors[0] ?? "#234B9A", colors[1] ?? "#FFFFFF"];
  const theme = { "--brand": c0, "--accent": c1 === "#FFFFFF" ? c0 : c1, "--stripe-a": c0, "--stripe-b": c1, "--bar-a": c1 === "#FFFFFF" ? c0 : c1, "--bar-b": c0, "--bar-bg": "#ECECEF" } as React.CSSProperties;

  return (
    <Modal title="Se halsduken på en person" eyebrow={target.club} onClose={busy ? () => undefined : onClose} wide>
      <div style={theme}>
        <div className="rounded-2xl bg-[#F5F5F7] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scarf} alt="" className="block w-full rounded-lg" />
        </div>

        {!camera && (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={() => void run("four")} className="inline-flex h-12 items-center justify-center rounded-full bg-[#1D1D1F] px-5 text-[14.5px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]">
              Fyra fotografier på modell
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCameraError(null);
                setCamera(true);
              }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#F5F5F7] px-5 text-[14.5px] font-medium text-[#1D1D1F] transition hover:bg-[#E8E8ED] disabled:opacity-50"
            >
              Ett foto på mig själv
            </button>
          </div>
        )}

        {camera && (
          <div className="mt-4">
            <div className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-black">
              {cameraError ? <div className="flex aspect-square items-center justify-center p-6 text-center text-[13px] text-white/80">{cameraError}</div> : <video ref={videoRef} playsInline muted autoPlay className="aspect-square w-full object-cover [transform:scaleX(-1)]" />}
            </div>
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  void run("self", await fileToJpeg(f));
                } catch (err) {
                  setCameraError(err instanceof Error ? err.message : "Kunde inte läsa bilden.");
                }
              }}
            />
            <div className="mx-auto mt-3 flex max-w-sm flex-col gap-2 sm:flex-row">
              {!cameraError && (
                <button type="button" onClick={snap} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#1D1D1F] px-5 text-[14px] font-medium text-white hover:bg-black">
                  Ta bild nu
                </button>
              )}
              <button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#F5F5F7] px-5 text-[14px] font-medium text-[#1D1D1F] hover:bg-[#E8E8ED]">
                Ladda upp foto
              </button>
              <button type="button" onClick={() => setCamera(false)} className="inline-flex h-11 items-center justify-center rounded-full px-4 text-[14px] text-[#86868B] hover:text-[#1D1D1F]">
                Avbryt
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 rounded-2xl bg-[#FDECEA] px-4 py-3 text-[13px] text-[#B3261E]">{error}</p>}

        {self.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{self.map((p, i) => card(p, `halsduk-jag-${i + 1}.jpg`, "aspect-square"))}</div>}
        {four.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{four.map((p) => card(p, `halsduk-${p.id}.jpg`, "aspect-[2/3]"))}</div>}
        {!self.length && !four.length && !camera && <p className="mt-4 text-[12.5px] leading-snug text-[#86868B]">Bilderna skapas av bildmodellen utifrån halsdukens framsida, granskas mot mönstret och tar ungefär en minut. Personerna på modellbilderna finns inte.</p>}

        <IFKLoader state={loader.state} crestUrl={target.crestUrl} wide={target.wide} lines={["Halsduken hängs om halsen…", "Ljuset sätts…", "Fransarna rättas till…", "Kameran ställs in…"]} doneLine="Klart!" />
      </div>
    </Modal>
  );
}

// --- Kortets knappar ---------------------------------------------------------------

/** Hämtar en zip från servern och sparar den. Utan `url` är det stickfilerna för en halsduk. */
export async function downloadZip(body: unknown, url = "/api/v1/scarf/agent/package", fallback = "stickfiler.zip") {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Kunde inte skapa zip-filen.");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallback;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const QUIET = "inline-flex h-10 items-center justify-center rounded-full bg-[#F5F5F7] px-4 text-[13.5px] font-medium text-[#1D1D1F] transition hover:bg-[#E8E8ED] disabled:opacity-50";

/** Kortets knappar: stickfilerna, fotografier, ändringar (när halsduken går att ändra) och allt det andra i en popupruta. `extra` är fler knappar sist på raden. */
export function ScarfActions({ info, download, photo, ready = true, onEdit, extra }: { info: ScarfInfo; download: unknown; photo: PhotoTarget; ready?: boolean; onEdit?: () => void; extra?: React.ReactNode }) {
  const [open, setOpen] = useState<"info" | "photo" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await downloadZip(download);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kunde inte skapa stickfilerna.");
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex h-10 items-center justify-center rounded-full bg-[#1D1D1F] px-4 text-[13.5px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]"
          title={`Mönster, stickorder och garnlista till ${SCARF.factory}`}
        >
          {busy ? "Packar …" : "Stickfiler (.zip)"}
        </button>
        <button type="button" onClick={() => setOpen("photo")} className={QUIET}>
          Fotografera
        </button>
        {onEdit && (
          <button type="button" onClick={onEdit} disabled={!ready} className={QUIET}>
            Ändra
          </button>
        )}
        <button type="button" onClick={() => setOpen("info")} className={QUIET}>
          Mer information
        </button>
        {extra}
      </div>
      {error && <p className="mt-1.5 text-[12px] text-[#B3261E]">{error}</p>}
      {open === "info" && <InfoDialog info={info} onClose={() => setOpen(null)} />}
      {open === "photo" && <PhotoDialog target={photo} scarf={info.images.front} colors={info.yarns.map((y) => y.hex)} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Vad stickeriet får – texten som tidigare låg längst ner på sidan. */
export function FactoryDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = [
    ["Mönstret i JPG", `Formatet ${SCARF.factory} bett om. Sparad utan färgkomprimering och kontrollerad: varje pixel ligger närmast rätt garn.`],
    ["Samma mönster i BMP och PNG", "Indexerade filer där färg 0–6 är garn 1–7, utan mellantoner – det format stickprogram normalt läser."],
    ["Stickorder som PDF", "En sida: korrektur av fram- och baksida, garner med Pantone, maskininställning och kontrollerna."],
    ["Garnlista", "Varje garn med närmaste Pantone, antal maskor och andel – underlag för garnåtgång."],
    ["Korrektur", "Fram- och baksida som de ser ut stickade, med fransar. Det beställaren godkänner."],
    ["Stickorder som data", "Samma uppgifter i maskinläsbar form, för en framtida direktkoppling till stickeriet."],
  ];
  return (
    <Modal title="Det här får stickeriet" eyebrow={`${SCARF.factory} · ${SCARF.machine}`} onClose={onClose}>
      <p className="text-[14.5px] leading-snug text-[#424245]">
        En zip per halsduk. Mönstret är en bild på {SCARF.needles} × {SCARF.rows.toLocaleString("sv-SE")} pixlar där varje pixel är en maska och varje färg ett garn. Teknikern läser in den i {SCARF.software} och för över den till maskinen med USB.
      </p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {rows.map(([t, d]) => (
          <li key={t} className="rounded-2xl bg-[#F5F5F7] p-3.5">
            <p className="text-[14px] font-semibold">{t}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#6E6E73]">{d}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F5F5F7] p-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Kalibreringshalsduk</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-[#6E6E73]">Stickas en gång. Visar hur maskinen vänder filerna – spegelvänt eller inte, var tuben viks och hur baksidan läses.</p>
          {error && <p className="mt-1 text-[12px] text-[#B3261E]">{error}</p>}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await downloadZip({ calibration: true });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kunde inte skapa filen.");
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#1D1D1F] px-4 text-[13.5px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]"
        >
          {busy ? "Packar …" : "Stickfiler (.zip)"}
        </button>
      </div>
    </Modal>
  );
}
