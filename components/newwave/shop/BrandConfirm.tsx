"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { SiteAnalysis } from "@/lib/demoSiteCache";
import type { LogoResult } from "@/lib/logo";
import { call, readDataUrl } from "./api";
import type { CustomerLogo } from "./cart";

export type BrandSource = { url: string } | { file: File };

type Found = { light: string; dark: string; name: string; colors: string[]; site: string; industry: string; offering: string; tone: string; tagline: string; note: string };

const URL_STEPS = ["Öppnar er webbplats", "Hittar loggan", "Granskar loggan och färgerna", "Läser vad ni gör och hur ni låter"];
const FILE_STEPS = ["Läser filen", "Frilägger loggan", "Gör en ljus och en mörk version"];

const fromFile = async (f: File) => call<LogoResult>("/api/v1/logo", { dataUrl: await readDataUrl(f), name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) });

/**
 * Varumärkesagenten: hämtar loggan från webbplatsen eller filen, läser av företaget och visar vad den hittade, så att
 * fel logga eller färg rättas innan scenerna ritas.
 */
export function BrandConfirm({ source, cta, onDone, onClose }: { source: BrandSource; cta: string; onDone: (logo: CustomerLogo) => void; onClose: () => void }) {
  const steps = "url" in source ? URL_STEPS : FILE_STEPS;
  const [done, setDone] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#111111");
  const [swapping, setSwapping] = useState(false);
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  const file = useRef<HTMLInputElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const logo = "url" in source ? await call<LogoResult>("/api/v1/logo", { url: source.url }) : await fromFile(source.file);
      if (!live) return;
      setDone("url" in source ? 2 : steps.length);
      let a: SiteAnalysis | null = null;
      if ("url" in source && logo.site) a = await call<SiteAnalysis>("/api/v1/demo/analyze", { site: logo.site, light: logo.light, event: "massa" }).catch(() => null);
      if (!live) return;
      const better = a?.logo.status === "replaced" && a.logo.result ? a.logo.result : null;
      const colors = [...new Set([a?.brandColor, logo.color].filter((c): c is string => Boolean(c && /^#[0-9a-f]{6}$/i.test(c))).map((c) => c.toUpperCase()))];
      const f: Found = {
        light: better?.light ?? logo.light,
        dark: better?.dark ?? logo.dark,
        name: a?.brandName || logo.name,
        colors,
        site: logo.site,
        industry: a?.industry ?? "",
        offering: a?.offering ?? "",
        tone: a?.tone ?? "",
        tagline: a?.tagline ?? "",
        note: better ? a!.logo.note : "",
      };
      setDone(steps.length);
      setFound(f);
      setName(f.name);
      setColor(colors[0] ?? "#111111");
    })().catch((e) => live && setError(e instanceof Error ? e.message : "Kunde inte läsa varumärket."));
    return () => {
      live = false;
    };
  }, [source, steps.length]);

  useEffect(() => {
    if (found || error) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [found, error]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useEffect(() => {
    if (found) confirmBtn.current?.focus();
  }, [found]);

  const swap = async (f: File) => {
    setSwapping(true);
    setError("");
    try {
      const l = await fromFile(f);
      setFound((x) => (x ? { ...x, light: l.light, dark: l.dark, colors: [...new Set([...x.colors, l.color.toUpperCase()])], note: "" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa filen.");
    } finally {
      setSwapping(false);
    }
  };

  const confirm = () => {
    if (!found) return;
    onDone({
      light: found.light,
      dark: found.dark,
      name: name.trim() || found.name,
      color,
      profile: found.industry ? { site: found.site, industry: found.industry, offering: found.offering, tone: found.tone, tagline: found.tagline } : undefined,
    });
  };

  const elapsed = (now - start) / 1000;
  const progress = Math.max(done / (steps.length + 0.5), 0.95 * (1 - Math.exp(-elapsed / 18)));
  const running = Math.min(steps.length - 1, Math.max(done, Math.floor(progress * steps.length)));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bc-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[720px] rounded-[28px] bg-white p-6 text-[#1D1D1F] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)] sm:p-9"
      >
        <button type="button" onClick={onClose} aria-label="Stäng" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-[#F4F4F2] text-[18px] transition hover:bg-[#EAEAE6]">
          ×
        </button>
        <AnimatePresence mode="wait" initial={false}>
          {!found ? (
            <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">Varumärkesagenten</p>
              <h2 id="bc-title" className="mt-2 pr-10 text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">
                {error ? "Det gick inte att läsa varumärket" : "Agenten läser ert varumärke…"}
              </h2>
              <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed opacity-65">{error || "Vi hittar och granskar loggan, färgerna och vad ni gör, så att allt vi visar blir rätt från början."}</p>
              {error ? (
                <button type="button" onClick={onClose} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)]">
                  Försök igen
                </button>
              ) : (
                <>
                  <ol className="mt-6 flex flex-col gap-2.5">
                    {steps.map((s, i) => {
                      const state = i < done ? "done" : i === running ? "now" : "later";
                      return (
                        <li key={s} className={`flex items-center gap-3 text-[15px] transition-opacity ${state === "later" ? "opacity-35" : ""}`}>
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-[var(--shop)] text-[var(--shop-on)]" : "border-2 border-[var(--shop-line)]"}`}>
                            {state === "done" ? (
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="m5 12 5 5 9-10" />
                              </svg>
                            ) : state === "now" ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--shop)] border-t-transparent" aria-hidden />
                            ) : null}
                          </span>
                          {s}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-[#F0EFEB]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Agentens framsteg">
                    <div className="h-full rounded-full bg-[var(--shop)] transition-[width] duration-300" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div key="found" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">Varumärkesagenten</p>
              <h2 id="bc-title" className="mt-2 pr-10 text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">
                Stämmer det här?
              </h2>
              <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed opacity-65">Så här tolkade vi ert varumärke. Rätta det som inte stämmer – allt vi skapar utgår från det här.</p>
              {found.note ? <p className="mt-4 rounded-2xl bg-[var(--shop-bg)] px-4 py-3 text-[14px] leading-snug">{found.note}</p> : null}
              <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold opacity-60">Logga</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <span className="grid aspect-[4/3] place-items-center rounded-2xl border border-[#ECEBE6] bg-white p-4">
                      <img src={found.light} alt={`${name} logga på ljus bakgrund`} className="max-h-full max-w-full object-contain" />
                    </span>
                    <span className="grid aspect-[4/3] place-items-center rounded-2xl bg-[#1D1D1F] p-4">
                      <img src={found.dark} alt={`${name} logga på mörk bakgrund`} className="max-h-full max-w-full object-contain" />
                    </span>
                  </div>
                  <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-label="Välj rätt logga" onChange={(e) => e.target.files?.[0] && swap(e.target.files[0])} />
                  <button type="button" disabled={swapping} onClick={() => file.current?.click()} className="mt-2 text-[13.5px] font-medium underline underline-offset-4 opacity-75 hover:opacity-100 disabled:opacity-40">
                    {swapping ? "Läser filen…" : "Fel logga? Ladda upp rätt"}
                  </button>
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <label className="block">
                    <span className="text-[13px] font-semibold opacity-60">Företag</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1.5 h-12 w-full rounded-xl border border-[#E4E3DE] px-4 text-[16px] outline-none transition focus:border-[var(--shop)]" />
                  </label>
                  <div>
                    <p className="text-[13px] font-semibold opacity-60">Märkesfärg</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {found.colors.map((c) => (
                        <button key={c} type="button" title={c} aria-label={`Använd ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-10 w-10 rounded-full border border-black/10 transition-transform hover:scale-110 ${color === c ? "ring-2 ring-[var(--shop)] ring-offset-2" : ""}`} style={{ background: c }} />
                      ))}
                      <label title="Välj egen färg" className={`relative grid h-10 w-10 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-black/25 ${found.colors.includes(color) ? "" : "ring-2 ring-[var(--shop)] ring-offset-2"}`} style={found.colors.includes(color) ? undefined : { background: color }}>
                        {found.colors.includes(color) ? <span aria-hidden className="text-[18px] opacity-50">+</span> : null}
                        <input type="color" value={color.toLowerCase()} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Välj egen färg" className="absolute inset-0 cursor-pointer opacity-0" />
                      </label>
                      <code className="ml-1 text-[12.5px] opacity-55">{color}</code>
                    </div>
                  </div>
                  {found.industry ? (
                    <dl className="rounded-2xl bg-[#F6F6F3] px-4 py-3 text-[13.5px] leading-snug">
                      <div className="flex gap-2">
                        <dt className="shrink-0 opacity-55">Bransch</dt>
                        <dd className="font-medium">{found.industry}</dd>
                      </div>
                      {found.offering ? <dd className="mt-1 opacity-70">{found.offering}</dd> : null}
                    </dl>
                  ) : null}
                </div>
              </div>
              {error ? <p className="mt-4 text-[13.5px] text-[#B42318]">{error}</p> : null}
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12.5px] opacity-50">{found.site ? `Hämtat från ${found.site}` : "Från er fil"}</p>
                <button ref={confirmBtn} type="button" onClick={confirm} className="inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition-transform hover:scale-[1.02] active:scale-[0.98]">
                  {cta}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
