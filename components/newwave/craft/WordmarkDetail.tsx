"use client";

import { useEffect, useState } from "react";
import { nwProduct } from "@/lib/newwave/catalog";
import { maxSizeCm, METHOD_INFO, methodsFor } from "@/lib/newwave/marking";
import { type SocialKind, SMALL_PRINT_CM, type WordmarkSpec, wordmarkExportUrl, wordmarkSocialUrl, wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import type { LabClub } from "./WordmarkLab";

type Ink = { hex: string; name: string; pantone: string; detail?: string };
type Info = { method: string; sizeMm: number[]; inks: Ink[]; facts: { label: string; value: string }[]; notes: string[]; colors: number; prices: { qty: number; each: number; setup: number }[]; files: { name: string; label: string; format: string }[] };

const GARMENTS = [
  { product: "p001", label: "Vit t-shirt" },
  { product: "p002", label: "Svart t-shirt" },
  { product: "p004", label: "Svart hoodie" },
  { product: "p011", label: "Keps" },
];
const EXPORTS = ["screentryck", "brodyr", "transfer", "dtg"] as const;
const SOCIAL: { kind: SocialKind; label: string }[] = [
  { kind: "profil", label: "Profilbild" },
  { kind: "banner", label: "Omslagsbild" },
  { kind: "story", label: "Story" },
  { kind: "anim", label: "Animerad SVG" },
];
const kr = (n: number) => `${new Intl.NumberFormat("sv-SE").format(n)} kr`;
const BOX = "relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[12px]";
const IMG = "absolute inset-0 h-full w-full object-contain p-[9%]";

/** Allt om ett ordmärke för en klubb: stor och liten version, tryckfiler med Pantone, stygn och pris, och de digitala formaten. */
export function WordmarkDetail({ spec, name, club, onClose }: { spec: WordmarkSpec; name: string; club: LabClub; onClose: () => void }) {
  const [garment, setGarment] = useState(GARMENTS[0].product);
  const product = nwProduct(garment)!;
  const methods = EXPORTS.filter((m) => methodsFor(product).includes(m));
  const [method, setMethod] = useState<string>("screentryck");
  const m = methods.includes(method as (typeof EXPORTS)[number]) ? method : methods[0];
  const max = maxSizeCm(product);
  const [cm, setCm] = useState(25);
  const size = Math.min(cm, max);
  const opts = { method: m, product: garment, cm: size, garment: product.garmentHex };
  const infoUrl = wordmarkExportUrl(spec, club.id, { ...opts, info: true });
  const [info, setInfo] = useState<{ url: string; data: Info | null } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    let live = true;
    fetch(infoUrl)
      .then((r) => (r.ok ? (r.json() as Promise<Info>) : null))
      .then((data) => live && setInfo({ url: infoUrl, data }))
      .catch(() => live && setInfo({ url: infoUrl, data: null }));
    return () => {
      live = false;
    };
  }, [infoUrl]);
  const ready = info?.url === infoUrl ? info.data : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${name} för ${club.name}`} onClick={(e) => e.stopPropagation()} className="nw-fade h-full w-full max-w-[880px] overflow-y-auto bg-white p-5 shadow-2xl min-[900px]:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-[var(--nw-muted)]">{club.name}</p>
            <h2 className="text-[22px] font-semibold text-[var(--nw-ink)]">{name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--nw-soft)] text-[18px]">
            ×
          </button>
        </div>

        <section className="mt-5">
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Versioner</h3>
          <p className="text-[13px] text-[var(--nw-muted)]">Tryck upp till {SMALL_PRINT_CM} cm (bröst, ärm, keps) får den lilla versionen automatiskt.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
            {[
              { label: "Ljust plagg", bg: "bg-[var(--nw-soft)]", src: wordmarkUrl(spec, club.id, "light", 800) },
              { label: "Mörkt plagg", bg: "bg-[#1C1C1E]", src: wordmarkUrl(spec, club.id, "dark", 800) },
              { label: "Litet tryck", bg: "bg-[var(--nw-soft)]", src: wordmarkUrl(spec, club.id, "light", 800, "png", SMALL_PRINT_CM) },
              { label: "Klubbfärg", bg: "bg-[var(--nw-soft)]", src: wordmarkSocialUrl(spec, club.id, "profil") },
            ].map((v) => (
              <figure key={v.label} className="min-w-0">
                <div className={`${BOX} ${v.bg}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                  <img src={v.src} alt={`${name}, ${v.label.toLowerCase()}`} className={v.label === "Klubbfärg" ? "absolute inset-0 h-full w-full object-cover" : IMG} />
                </div>
                <figcaption className="mt-1 text-[12px] text-[var(--nw-muted)]">{v.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Tryckfiler och pris</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={garment} onChange={(e) => setGarment(e.target.value)} aria-label="Produkt" className="nw-input h-10 w-auto pr-8">
              {GARMENTS.map((g) => (
                <option key={g.product} value={g.product}>
                  {g.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5" role="group" aria-label="Metod">
              {methods.map((x) => (
                <button key={x} type="button" aria-pressed={m === x} onClick={() => setMethod(x)} className="nw-chip h-9 px-3 aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white">
                  {METHOD_INFO[x].label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13px] text-[var(--nw-muted)]">
              Bredd
              <input type="number" min={3} max={max} value={size} onChange={(e) => setCm(Math.max(3, Math.min(max, Number(e.target.value) || 3)))} className="nw-input h-10 w-[76px]" />
              cm
            </label>
          </div>

          {ready === undefined ? (
            <p className="mt-3 text-[13.5px] text-[var(--nw-muted)]">Gör tryckfilerna…</p>
          ) : ready === null ? (
            <p className="mt-3 text-[13.5px] text-[#B42318]">Kunde inte göra tryckfilerna.</p>
          ) : (
            <div className="mt-3 grid gap-4 min-[760px]:grid-cols-2">
              <div className="min-w-0">
                {ready.inks.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {ready.inks.map((i) => (
                      <li key={`${i.hex}-${i.pantone}`} className="flex items-center gap-2.5 text-[13px]">
                        <span className="h-6 w-6 shrink-0 rounded-[6px] border border-[var(--nw-line)]" style={{ background: i.hex }} />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold text-[var(--nw-ink)]">{i.pantone}</span> <span className="text-[var(--nw-muted)]">· {i.name} · {i.hex}</span>
                        </span>
                        {i.detail ? <span className="shrink-0 text-[12px] text-[var(--nw-muted)]">{i.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-[var(--nw-muted)]">Fyrfärg – inga separata färger.</p>
                )}
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                  {ready.facts.map((f) => (
                    <div key={f.label} className="contents">
                      <dt className="text-[var(--nw-muted)]">{f.label}</dt>
                      <dd className="text-[var(--nw-ink)]">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--nw-ink)]">Trycket per plagg</p>
                <table className="mt-1 w-full text-[13px]">
                  <tbody>
                    {ready.prices.map((p) => (
                      <tr key={p.qty} className="border-b border-[var(--nw-line)] last:border-0">
                        <td className="py-1 text-[var(--nw-muted)]">{p.qty} st</td>
                        <td className="py-1 text-right font-semibold text-[var(--nw-ink)]">{kr(p.each)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[12px] text-[var(--nw-muted)]">
                  Inklusive startkostnad {kr(ready.prices[0]?.setup ?? 0)}, exklusive plagg och moms.
                </p>
                <a href={wordmarkExportUrl(spec, club.id, opts)} className="nw-btn mt-3 h-10">
                  Ladda ner tryckfiler (zip)
                </a>
                <p className="mt-1.5 text-[12px] text-[var(--nw-muted)]">{ready.files.map((f) => f.label).join(" · ")}</p>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6">
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Digitalt</h3>
          <div className="mt-2 grid grid-cols-2 items-start gap-2 min-[700px]:grid-cols-4">
            {SOCIAL.map((s) => {
              const src = wordmarkSocialUrl(spec, club.id, s.kind);
              return (
                <figure key={s.kind} className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                  <img src={src} alt={`${s.label} för ${club.name}`} loading="lazy" className="max-h-[220px] w-full rounded-[12px] bg-[var(--nw-soft)] object-contain" />
                  <a href={src} download={`${club.id}-${spec.template}-${s.kind}.${s.kind === "anim" ? "svg" : "png"}`} className="mt-1 inline-block text-[12px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                    {s.label} ↓
                  </a>
                </figure>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
