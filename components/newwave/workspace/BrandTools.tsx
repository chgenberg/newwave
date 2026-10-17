"use client";

import { useRef, useState } from "react";
import type { LogoResult } from "@/lib/logo";
import { type BrandKit, type Brandbook, DEFAULT_KIT, MAX_COLORS, isHex, isOwnKit } from "@/lib/newwave/brandKit";
import { PLACEHOLDER } from "../shop/cart";
import { call, readDataUrl } from "../shop/api";

const FIELD = "h-10 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 text-[14px] outline-none transition focus:border-[var(--ink)]";
const ACTION = "flex flex-col items-start gap-1 rounded-2xl border border-[var(--line)] bg-white p-3 text-left text-[13px] font-semibold transition hover:border-[var(--ink)] disabled:opacity-50";
const HINT = "text-[12px] font-normal text-[var(--mute)]";

/** Kör filvalet och tömmer fältet så att samma fil kan väljas igen. */
const picked = (e: React.ChangeEvent<HTMLInputElement>, then: (f: File) => void) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (f) then(f);
};

const withColor = (colors: BrandKit["colors"], hex: string, name: string) =>
  colors.some((c) => c.hex === hex) ? colors : [{ name, hex }, ...colors].slice(0, MAX_COLORS);

/**
 * Varumärket: brandbook som AI:n läser, logga från fil eller webbplats, och egna färger. `home` är profilen från servern
 * (klubbens eller återförsäljarens); en ny logga eller brandbook ersätter den helt, och går att byta tillbaka.
 */
export function BrandTools({ kit, home, onChange }: { kit: BrandKit; home?: BrandKit; onChange: (next: BrandKit) => void }) {
  const [busy, setBusy] = useState<"" | "pdf" | "logo" | "url">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const own = isOwnKit(kit);
  const [url, setUrl] = useState(own ? "" : kit.site);
  const from = own ? DEFAULT_KIT : kit;
  const edit = (next: BrandKit) => onChange(kit.source.kind === "profil" ? { ...next, source: { kind: "justerad", label: "Justerad här i studion" } } : next);
  const pdf = useRef<HTMLInputElement>(null);
  const logoFile = useRef<HTMLInputElement>(null);

  const run = async (kind: "pdf" | "logo" | "url", job: () => Promise<string>) => {
    setBusy(kind);
    setError("");
    setNote("");
    try {
      setNote(await job());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel.");
    } finally {
      setBusy("");
    }
  };

  const applyLogo = (logo: LogoResult, source: BrandKit["source"]) => {
    const hex = logo.color?.toUpperCase();
    onChange({
      ...from,
      name: from.source.kind === "standard" || from.name === DEFAULT_KIT.name ? logo.name.split(/\s+[-–—|·:]\s+/)[0].trim() || from.name : from.name,
      logo: logo.light,
      logoDark: logo.dark,
      site: logo.site || from.site,
      colors: isHex(hex) && from.source.kind !== "brandbook" ? withColor(from.colors, hex, "Märkesfärg") : from.colors,
      source,
    });
  };

  const readBook = (file: File) =>
    run("pdf", async () => {
      if (file.size > 20_000_000) throw new Error("PDF:en är större än 20 MB.");
      const book = await call<Brandbook>("/api/v1/newwave/brandbook", { dataUrl: await readDataUrl(file), name: file.name });
      onChange({ ...from, ...book, name: book.name || from.name, source: { kind: "brandbook", label: file.name } });
      return `Läste ${book.colors.length} färger${book.fonts.length ? `, ${book.fonts.length} typsnitt` : ""} och ${book.rules.length} regler ur profilen.${from.logo ? "" : " Lägg till loggan nedan."}`;
    });

  const readLogo = (file: File) =>
    run("logo", async () => {
      const named = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      const name = own && named ? named[0].toUpperCase() + named.slice(1) : from.name;
      const logo = await call<LogoResult>("/api/v1/logo", { dataUrl: await readDataUrl(file), name });
      applyLogo(logo, { kind: "logga", label: file.name });
      return "Bakgrunden är borttagen och loggan finns i ljust och mörkt utförande.";
    });

  const readSite = () =>
    run("url", async () => {
      const logo = await call<LogoResult>("/api/v1/logo", { url: url.trim() });
      applyLogo(logo, { kind: "webb", label: logo.site || url.trim() });
      return `Hämtade loggan${isHex(logo.color) ? " och märkesfärgen" : ""} från ${logo.site || url.trim()}.`;
    });

  const setColor = (i: number, hex: string) => edit({ ...kit, colors: kit.colors.map((c, j) => (j === i ? { ...c, hex: hex.toUpperCase() } : c)) });
  const removeColor = (i: number) => edit({ ...kit, colors: kit.colors.filter((_, j) => j !== i) });
  const addColor = () => edit({ ...kit, colors: [...kit.colors, { name: `Färg ${kit.colors.length + 1}`, hex: "#3A6B4F" }] });

  return (
    <div className="grid gap-5">
      <div>
        <p className="drawer-label">Varumärke</p>
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white p-2.5">
          <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-[#F2F2EF] p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={kit.logo ?? PLACEHOLDER.light} alt="" className="max-h-full max-w-full object-contain" />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <input value={kit.name} onChange={(e) => edit({ ...kit, name: e.target.value.slice(0, 80) })} aria-label="Varumärkets namn" className="w-full min-w-0 bg-transparent text-[14px] font-semibold outline-none" />
            <span className={`flex items-center gap-1.5 truncate ${HINT}`}>
              {kit.source.kind !== "standard" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[#2F7D4F]" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : null}
              <span className="truncate">{kit.source.label}</span>
            </span>
          </span>
        </div>
        {home && kit.source.kind !== "profil" ? (
          <button type="button" onClick={() => onChange(home)} className={`mt-2 underline underline-offset-4 hover:text-[var(--ink)] ${HINT}`}>
            Tillbaka till {home.name}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={ACTION} onClick={() => pdf.current?.click()} disabled={Boolean(busy)}>
          {busy === "pdf" ? "AI läser profilen…" : "Ladda upp brandbook"}
          <span className={HINT}>PDF – AI fyller i färger, typsnitt och regler</span>
        </button>
        <button type="button" className={ACTION} onClick={() => logoFile.current?.click()} disabled={Boolean(busy)}>
          {busy === "logo" ? "Läser loggan…" : "Ladda upp logga"}
          <span className={HINT}>PNG, JPG, WebP eller SVG</span>
        </button>
        <input ref={pdf} type="file" accept="application/pdf" className="sr-only" tabIndex={-1} aria-label="Välj brandbook (PDF)" onChange={(e) => picked(e, (f) => void readBook(f))} />
        <input ref={logoFile} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" tabIndex={-1} aria-label="Välj loggfil" onChange={(e) => picked(e, (f) => void readLogo(f))} />
      </div>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim().length > 2) void readSite();
        }}
      >
        <label className="drawer-label !mb-0" htmlFor="nw-brand-url">
          Från webbplats
        </label>
        <div className="flex gap-2">
          <input id="nw-brand-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="foretaget.se" inputMode="url" autoComplete="url" className={FIELD} />
          <button type="submit" disabled={Boolean(busy) || url.trim().length < 3} className="h-10 shrink-0 rounded-xl bg-[var(--cz-accent)] px-4 text-[13px] font-semibold text-[var(--cz-on-accent)] transition disabled:opacity-40">
            {busy === "url" ? "Hämtar…" : "Hämta"}
          </button>
        </div>
      </form>

      <div>
        <p className="drawer-label">
          Färger <span>{kit.colors.length} av {MAX_COLORS}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {kit.colors.map((c, i) => (
            <span key={`${i}-${c.name}`} className="group relative">
              <label className="block h-10 w-10 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] transition hover:scale-105" style={{ background: c.hex }} title={`${c.name} ${c.hex}`}>
                <input type="color" value={c.hex.toLowerCase()} onChange={(e) => setColor(i, e.target.value)} className="sr-only" aria-label={`Ändra ${c.name}`} />
              </label>
              {kit.colors.length > 1 ? (
                <button type="button" onClick={() => removeColor(i)} aria-label={`Ta bort ${c.name}`} className="absolute -right-1 -top-1 hidden h-5 w-5 place-items-center rounded-full bg-[var(--ink)] text-[12px] leading-none text-white group-focus-within:grid group-hover:grid">
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {kit.colors.length < MAX_COLORS ? (
            <button type="button" onClick={addColor} aria-label="Lägg till färg" className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-[rgba(17,17,17,0.3)] text-[18px] text-[var(--mute)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]">
              +
            </button>
          ) : null}
        </div>
      </div>

      {kit.fonts.length ? (
        <div>
          <p className="drawer-label">Typsnitt</p>
          <div className="flex flex-wrap gap-1.5">
            {kit.fonts.map((f) => (
              <span key={f} className="rounded-full bg-[#F2F2EF] px-3 py-1.5 text-[12px] font-semibold">
                {f}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {kit.rules.length || kit.tone ? (
        <div>
          <p className="drawer-label">Ur profilen</p>
          {kit.tone ? <p className="mb-2 text-[13px] leading-snug text-[var(--mute)]">{kit.tone}</p> : null}
          <ul className="grid gap-1.5 text-[13px] leading-snug">
            {kit.rules.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--ink)]" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p role="status" className={`min-h-[1lh] text-[12px] leading-snug ${error ? "text-[#B42318]" : "text-[var(--mute)]"}`}>
        {error || note}
      </p>
    </div>
  );
}
