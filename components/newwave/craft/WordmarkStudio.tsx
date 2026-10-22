"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { FONT_ROLE_LABEL, FONT_ROLES, FONTS } from "@/lib/newwave/wordmark/fonts";
import { COLOR_SLOTS, type ColorSlot, SHAPES, type ShapeKind, TEXT_SLOTS, type TemplateInput, type TextSlot } from "@/lib/newwave/wordmark/schema";
import type { MatchOption } from "@/lib/newwave/wordmark/match";
import type { Note } from "@/lib/newwave/wordmark/render";
import type { WordmarkVariant } from "@/lib/newwave/wordmark/spec";
import { likeness } from "@/lib/newwave/wordmark/likeness";
import { ClubBatch, type FromImport, iconBoxes, matchPatch, type SavedTemplate } from "./DesignImport";
import { Provenance } from "./Provenance";
import type { LabClub } from "./WordmarkLab";

type LayerIn = TemplateInput["layers"][number];
type TextIn = Extract<LayerIn, { kind: "text" }>;
type ShapeIn = Extract<LayerIn, { kind: "shape" }>;
type ArtIn = Extract<LayerIn, { kind: "art" }>;
type BoxIn = LayerIn["box"];
type Palette = Record<ColorSlot, string>;

const SLOT_LABEL: Record<TextSlot, string> = {
  name: "Hela namnet",
  name1: "Namnets första del",
  name2: "Namnets andra del",
  tagline: "Rad (Sedan 1904)",
  monogram: "Förkortning",
  sport: "Sport eller lag",
  est: "”Est.”",
  year: "Grundandeår",
  player: "Spelarnamn",
  number: "Nummer",
  jubilee: "Jubileum (100 år)",
  span: "Jubileumsår (1926–2026)",
};
const COLOR_LABEL: Record<ColorSlot, string> = { primary: "Huvudfärg", secondary: "Andrafärg", ink: "Svart eller vitt", paper: "Plaggets färg", on: "Mot huvudfärgen" };
const SHAPE_LABEL: Record<ShapeKind, string> = {
  checker: "Rutor",
  stripes: "Ränder",
  stars: "Stjärnor",
  rule: "Linje",
  diamond: "Romb",
  banner: "Banderoll",
  ring: "Ring",
  disc: "Cirkel",
  swash: "Svep",
  shield: "Sköld",
  pill: "Kapsel",
  plate: "Platta",
  laurel: "Lagerkrans",
  burst: "Strålar",
  pennant: "Vimpel",
  tail: "Svans",
  bars: "Staplar",
};
const SQUARE = new Set<ShapeKind>(["diamond", "ring", "disc", "shield", "laurel", "burst"]);
const COUNTED = new Set<ShapeKind>(["checker", "stripes", "stars", "bars"]);
const CASES = [
  { value: "upper", label: "VERSALER" },
  { value: "asis", label: "Som namnet" },
  { value: "lower", label: "gemener" },
] as const;
const ALIGNS = [
  { value: "left", label: "Vänster" },
  { value: "center", label: "Mitten" },
  { value: "right", label: "Höger" },
] as const;
const MAX_LAYERS = 40;
const HISTORY = 50;
const SNAP = 8;
/** Klubbvalet som ritar mallen med originalets egna texter och färger. */
const ORIGINAL = "__original";
/** Det som ritas – inte namnet eller hur mallen kom till – för att se om designen ändrats för hand. */
const drawing = (t: TemplateInput) => JSON.stringify([t.height, t.layers]);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
const layerLabel = (l: LayerIn) => (l.kind === "text" ? SLOT_LABEL[l.slot] : l.kind === "shape" ? SHAPE_LABEL[l.shape] : l.kind === "icon" ? "Klubbens märke" : "Grafik från filen");
const artSlots = (l: ArtIn) => COLOR_SLOTS.filter((c) => l.svg.includes(`{${c}}`));
const outlineOf = (l: TextIn) => (Array.isArray(l.outline) ? l.outline[0] : l.outline);

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--nw-muted)]">{label}</span>
      {children}
    </div>
  );
}

function Swatches({ value, palette, onChange, none }: { value: ColorSlot | null; palette: Palette | null; onChange: (c: ColorSlot | null) => void; none?: boolean }) {
  const ring = (on: boolean) => (on ? "ring-2 ring-[#0A84FF] ring-offset-2" : "");
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup">
      {none ? (
        <button type="button" role="radio" aria-checked={value === null} aria-label="Ingen" title="Ingen" onClick={() => onChange(null)} className={`grid h-8 w-8 place-items-center rounded-full border border-[var(--nw-line)] bg-white text-[13px] text-[var(--nw-muted)] ${ring(value === null)}`}>
          ∅
        </button>
      ) : null}
      {COLOR_SLOTS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} onClick={() => onChange(c)} className={`h-8 w-8 rounded-full border border-black/15 ${ring(value === c)}`} style={{ background: palette?.[c] ?? "#DDD" }} />
      ))}
    </div>
  );
}

function Segments<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className="nw-chip h-8 flex-1 justify-center px-2 text-[12.5px] aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white">
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ett reglage som sparar ett ångra-steg när man tar tag i det, inte för varje steg medan man drar. */
function Slider({ label, value, min, max, unit = "", onStart, onChange }: { label: string; value: number; min: number; max: number; unit?: string; onStart: () => void; onChange: (v: number) => void }) {
  return (
    <Field
      label={
        <span className="flex justify-between">
          {label}
          <span className="tabular-nums text-[var(--nw-ink)]">
            {value}
            {unit}
          </span>
        </span>
      }
    >
      <input type="range" min={min} max={max} value={value} aria-label={label} onPointerDown={onStart} onKeyDown={(e) => !e.repeat && onStart()} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--nw-ink)]" />
    </Field>
  );
}

/**
 * Designstudion: ordmärket på sin duk, där delarna dras på plats, ändrar storlek i hörnet och får färg, typsnitt och
 * lutning. Förhandsvisningen ritas av servern med en riktig klubb; Spara gör en ny design som sedan tilldelas klubbar.
 */
export function WordmarkStudio({ initial, clubs, from, onSave, onClose }: { initial: TemplateInput; clubs: LabClub[]; from?: FromImport; onSave: (t: TemplateInput) => Promise<SavedTemplate>; onClose: () => void }) {
  const [t, setT] = useState<TemplateInput>(() => ({ ...initial, source: undefined, hidden: undefined, small: undefined }));
  const [drawnAtStart] = useState(() => drawing(initial));
  const [past, setPast] = useState<TemplateInput[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [club, setClub] = useState(from ? ORIGINAL : (clubs[0]?.id ?? ""));
  const [ghost, setGhost] = useState(false);
  const [originalHeight] = useState(initial.height);
  const [variant, setVariant] = useState<WordmarkVariant>("light");
  const [shot, setShot] = useState<{ url: string; palette: Palette; text: Palette; notes: Note[] } | null>(null);
  const [broken, setBroken] = useState(false);
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedTemplate | null>(null);
  const [like, setLike] = useState<number | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  const key = JSON.stringify(t);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/v1/newwave/wordmark/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: JSON.parse(key), club: club === ORIGINAL ? (clubs[0]?.id ?? "") : club, variant, canvas: true, ...(club === ORIGINAL && from ? { original: from.sample } : {}) }), signal: ctrl.signal });
        if (!r.ok) throw new Error();
        const palette = JSON.parse(r.headers.get("X-Nw-Palette") ?? "null") as Palette;
        const text = JSON.parse(r.headers.get("X-Nw-Text-Palette") ?? "null") as Palette;
        const notes = JSON.parse(decodeURIComponent(r.headers.get("X-Nw-Notes") ?? "%5B%5D")) as Note[];
        const url = URL.createObjectURL(await r.blob());
        if (shown.current) URL.revokeObjectURL(shown.current);
        shown.current = url;
        setShot({ url, palette, text, notes });
        setBroken(false);
      } catch {
        if (!ctrl.signal.aborted) setBroken(true);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, club, variant, from, clubs]);
  const comparing = Boolean(from) && club === ORIGINAL && variant === "light";
  useEffect(() => {
    if (!comparing || !from || !shot) return;
    let live = true;
    const drawn = JSON.parse(key) as TemplateInput;
    likeness(from.image, shot.url, { height: drawn.height, originalHeight, skip: iconBoxes(drawn) })
      .then((n) => live && setLike(n))
      .catch(() => live && setLike(null));
    return () => {
      live = false;
    };
    // Mäts när en ny bild kommit – inte för varje ändring som ännu inte ritats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, comparing]);
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );

  const remember = (snapshot = t) => setPast((p) => [...p.slice(1 - HISTORY), snapshot]);
  const change = (next: TemplateInput, record = true) => {
    if (record) remember();
    setT(next);
  };
  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setT(prev);
    if (sel !== null && sel >= prev.layers.length) setSel(null);
  };
  const setLayer = (i: number, patch: Partial<LayerIn>, record = true) => change({ ...t, layers: t.layers.map((l, j) => (j === i ? ({ ...l, ...patch } as LayerIn) : l)) }, record);
  const addLayer = (l: LayerIn) => {
    if (t.layers.length >= MAX_LAYERS) return;
    change({ ...t, layers: [...t.layers, l] });
    setSel(t.layers.length);
  };
  const removeLayer = (i: number) => {
    if (t.layers.length <= 1) return;
    change({ ...t, layers: t.layers.filter((_, j) => j !== i) });
    setSel(null);
  };
  const duplicate = (i: number) => {
    if (t.layers.length >= MAX_LAYERS) return;
    const l = t.layers[i];
    const copy = { ...l, box: { ...l.box, x: clamp(l.box.x + 24, -200, 1200), y: clamp(l.box.y + 24, -200, 3000) } } as LayerIn;
    change({ ...t, layers: [...t.layers.slice(0, i + 1), copy, ...t.layers.slice(i + 1)] });
    setSel(i + 1);
  };
  const reorder = (i: number, to: number) => {
    if (to < 0 || to >= t.layers.length) return;
    const layers = [...t.layers];
    [layers[i], layers[to]] = [layers[to], layers[i]];
    change({ ...t, layers });
    setSel(to);
  };
  const nudge = (i: number, dx: number, dy: number, record: boolean) => {
    const b = t.layers[i].box;
    setLayer(i, { box: { ...b, x: clamp(b.x + dx, -200, 1200), y: clamp(b.y + dy, -200, 3000) } }, record);
  };

  const grab = (e: React.PointerEvent, i: number, mode: "move" | "size") => {
    if (e.button !== 0 || !canvas.current) return;
    e.stopPropagation();
    e.preventDefault();
    setSel(i);
    const k = 1000 / canvas.current.getBoundingClientRect().width;
    const start = { x: e.clientX, y: e.clientY, box: { ...t.layers[i].box }, t };
    const keepRatio = t.layers[i].kind === "icon" || t.layers[i].kind === "art";
    let moved = false;
    const move = (ev: PointerEvent) => {
      const [dx, dy] = [(ev.clientX - start.x) * k, (ev.clientY - start.y) * k];
      if (!moved && Math.hypot(dx, dy) < 1) return;
      if (!moved) remember(start.t);
      moved = true;
      const b = start.box;
      let box: BoxIn;
      if (mode === "move") {
        const snap = !ev.altKey && Math.abs(b.x + dx + b.w / 2 - 500) < SNAP;
        setGuide(snap);
        box = { ...b, x: clamp(snap ? 500 - b.w / 2 : b.x + dx, -200, 1200), y: clamp(b.y + dy, -200, 3000) };
      } else {
        let [w, h] = [Math.max(12, b.w + dx), Math.max(12, b.h + dy)];
        if (keepRatio !== ev.shiftKey) [w, h] = w / b.w > h / b.h ? [w, (w * b.h) / b.w] : [(h * b.w) / b.h, h];
        box = { ...b, w: clamp(w, 1, 1400), h: clamp(h, 1, 3000) };
      }
      setT((cur) => ({ ...cur, layers: cur.layers.map((l, j) => (j === i ? ({ ...l, box } as LayerIn) : l)) }));
    };
    const up = () => {
      setGuide(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (saved) return;
      const typing = e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undo();
        return;
      }
      if (typing || sel === null) return;
      const step = e.shiftKey ? 10 : 1;
      const arrow = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (arrow) {
        e.preventDefault();
        nudge(sel, arrow[0], arrow[1], !e.repeat);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeLayer(sel);
      } else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const close = () => {
    if (!saved && past.length && !window.confirm("Stänga studion utan att spara ändringarna?")) return;
    onClose();
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const edited = drawing(t) !== drawnAtStart;
      // Likheten gäller bara bilden som jämfördes; ändrades designen utan jämförelse är den gamla siffran inaktuell.
      const likeness = comparing && like !== null ? like : edited ? undefined : t.made?.likeness;
      const made = { ...t.made, likeness, ...(edited ? { edited: new Date().toISOString() } : {}) };
      setSaved(await onSave({ ...t, name: t.name.trim().slice(0, 40) || "Egen design", made }));
      setPast([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  };

  if (saved)
    return (
      <div role="dialog" aria-modal="true" aria-label={`Tilldela ${saved.name}`} className="nw-fade fixed inset-0 z-50 overflow-y-auto bg-white p-5 min-[900px]:p-8">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-semibold text-[var(--nw-ink)]">Tilldela designen</h2>
            <button type="button" onClick={onClose} aria-label="Stäng" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--nw-soft)] text-[18px]">
              ×
            </button>
          </div>
          <ClubBatch template={saved} variant={variant} onNew={() => setSaved(null)} newLabel="Tillbaka till studion" />
        </div>
      </div>
    );

  const layer = sel === null ? null : t.layers[sel];
  const palette = shot?.palette ?? null;
  const dark = variant === "dark";
  return (
    <div role="dialog" aria-modal="true" aria-label="Designstudion" className="nw-fade fixed inset-0 z-50 flex flex-col bg-[#F5F5F7]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--nw-line)] bg-white px-4 py-2.5">
        <button type="button" onClick={close} className="nw-chip h-9 px-3">
          ← Stäng
        </button>
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value.slice(0, 40) })} aria-label="Designens namn" className="nw-input h-9 w-[200px] font-semibold" />
        <span className="flex-1" />
        {comparing && like !== null ? (
          <span className="text-[13px] text-[var(--nw-muted)]" data-likeness={like} title="Mallen med originalets texter och färger jämförd pixel för pixel med filen – klubbmärkets ruta räknas inte">
            Likhet med originalet <span className="font-semibold tabular-nums text-[var(--nw-ink)]">{like} %</span>
          </span>
        ) : null}
        {from ? (
          <button type="button" aria-pressed={ghost} onClick={() => setGhost((g) => !g)} title="Lägg originalfilen genomskinligt ovanpå" className="nw-chip h-9 px-3 aria-pressed:border-[#0A84FF] aria-pressed:bg-[#E8F1FF]">
            Originalet ovanpå
          </button>
        ) : null}
        <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Visa med klubben" className="nw-input h-9 w-auto pr-8">
          {from ? <option value={ORIGINAL}>Originalets namn och färger</option> : null}
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="Plaggets färg">
          {(["light", "dark"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={variant === v} onClick={() => setVariant(v)} className="nw-chip h-9 px-3 aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white">
              {v === "light" ? "Ljust" : "Mörkt"}
            </button>
          ))}
        </div>
        <button type="button" disabled={!past.length} onClick={undo} title="Ångra (⌘Z)" className="nw-chip h-9 px-3 disabled:opacity-40">
          ↶ Ångra
        </button>
        <button type="button" disabled={busy} onClick={() => void save()} className="nw-btn h-9 px-4 text-[13px] disabled:opacity-50">
          {busy ? "Sparar…" : "Spara och välj klubbar"}
        </button>
      </header>
      {error ? <p className="bg-[#FEF3F2] px-4 py-2 text-[13.5px] text-[#B42318]">{error}</p> : null}

      <div className="grid min-h-0 flex-1 overflow-y-auto min-[960px]:grid-cols-[minmax(0,1fr)_340px] min-[960px]:overflow-hidden">
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 p-4 min-[960px]:overflow-auto min-[960px]:p-8" onPointerDown={() => setSel(null)}>
          <div className={`w-full max-w-[780px] rounded-[18px] p-[6%] shadow-sm ${dark ? "bg-[#1C1C1E]" : "bg-white"}`}>
            <div ref={canvas} className={`relative w-full select-none outline-1 outline-dashed ${dark ? "outline-white/15" : "outline-black/10"}`} style={{ aspectRatio: `1000 / ${t.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern vid varje ändring */}
              {shot ? <img src={shot.url} alt={`${t.name} med ${club === ORIGINAL ? "originalets namn" : (clubs.find((c) => c.id === club)?.name ?? "klubben")}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" /> : null}
              {/* eslint-disable-next-line @next/next/no-img-element -- originalfilen över exakt mallens duk */}
              {from && ghost ? <img src={from.image} alt="" aria-hidden draggable={false} className="pointer-events-none absolute left-0 top-0 w-full opacity-45" style={{ height: `${(originalHeight / t.height) * 100}%` }} /> : null}
              {t.layers.map((l, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Flytta ${layerLabel(l)}`}
                  onPointerDown={(e) => grab(e, i, "move")}
                  className={`absolute min-h-[8px] min-w-[8px] cursor-move touch-none rounded-[2px] ${sel === i ? "outline outline-2 outline-[#0A84FF]" : "hover:outline hover:outline-1 hover:outline-[#0A84FF]/70"}`}
                  style={{ left: `${l.box.x / 10}%`, top: `${(l.box.y / t.height) * 100}%`, width: `${l.box.w / 10}%`, height: `${(l.box.h / t.height) * 100}%`, zIndex: sel === i ? 50 : i + 1 }}
                >
                  {sel === i ? (
                    <>
                      <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-[6px] bg-[#0A84FF] px-1.5 py-0.5 text-[11px] font-medium text-white">{layerLabel(l)}</span>
                      <span aria-hidden onPointerDown={(e) => grab(e, i, "size")} className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-[#0A84FF] bg-white" />
                    </>
                  ) : null}
                </div>
              ))}
              {guide ? <div className="pointer-events-none absolute inset-y-[-6%] left-1/2 z-[60] w-px bg-[#FF2D55]" /> : null}
            </div>
          </div>
          {club !== ORIGINAL && shot?.notes.some((n) => n.kind !== "weak-color") ? (
            <ul className="mx-auto flex max-w-[760px] flex-col gap-1 text-[12.5px]">
              {shot.notes
                .filter((n) => n.kind !== "weak-color")
                .map((n) => (
                  <li key={n.text} className={n.level === "varning" ? "text-[#9A5B00]" : "text-[var(--nw-muted)]"}>
                    {n.level === "varning" ? "⚠ " : "✓ "}
                    {n.text}
                  </li>
                ))}
            </ul>
          ) : null}
          <p className="text-center text-[12.5px] text-[var(--nw-muted)]">
            {broken ? <span className="text-[#B42318]">Kunde inte rita – ångra den senaste ändringen.</span> : "Dra en del för att flytta den, dra i hörnet för storleken. Piltangenterna finjusterar, Skift tar större steg."}
          </p>
        </div>

        <aside className="flex flex-col gap-5 border-t border-[var(--nw-line)] bg-white p-4 min-[960px]:overflow-y-auto min-[960px]:border-l min-[960px]:border-t-0">
          {layer && sel !== null ? (
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">{layerLabel(layer)}</h3>
                <button type="button" onClick={() => setSel(null)} className="text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4">
                  Klar
                </button>
              </div>
              {layer.kind === "text" ? <TextProps l={layer} palette={palette} matches={from?.matches[layer.slot as keyof FromImport["matches"]]} weak={Boolean(shot && shot.text[layer.color] !== shot.palette[layer.color])} set={(p, r) => setLayer(sel, p, r)} remember={() => remember()} /> : null}
              {layer.kind === "shape" ? <ShapeProps l={layer} palette={palette} set={(p, r) => setLayer(sel, p, r)} remember={() => remember()} /> : null}
              {layer.kind === "art" ? <ArtProps l={layer} palette={palette} set={(p) => setLayer(sel, p)} /> : null}
              {layer.kind === "icon" ? <p className="text-[13px] leading-snug text-[var(--nw-muted)]">Här hamnar klubbens märke – varje klubb får sitt eget. Dra i hörnet för storleken.</p> : null}
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={sel === t.layers.length - 1} onClick={() => reorder(sel, sel + 1)} className="nw-chip h-8 px-3 text-[12.5px] disabled:opacity-40">
                  Framåt
                </button>
                <button type="button" disabled={sel === 0} onClick={() => reorder(sel, sel - 1)} className="nw-chip h-8 px-3 text-[12.5px] disabled:opacity-40">
                  Bakåt
                </button>
                <button type="button" onClick={() => duplicate(sel)} className="nw-chip h-8 px-3 text-[12.5px]">
                  Duplicera
                </button>
                <button type="button" disabled={t.layers.length <= 1} onClick={() => removeLayer(sel)} className="nw-chip h-8 px-3 text-[12.5px] text-[#B42318] disabled:opacity-40">
                  Ta bort
                </button>
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Designen</h3>
              <p className="text-[13px] leading-snug text-[var(--nw-muted)]">Klicka på en del i bilden eller i listan för att ändra den. Texterna byts mot varje klubbs namn, märket mot klubbens märke och färgerna mot klubbens färger.</p>
              <Slider label="Dukens höjd" value={Math.round(t.height)} min={100} max={1600} onStart={() => remember()} onChange={(height) => change({ ...t, height }, false)} />
              {t.made ? (
                <div className="mt-1 flex flex-col gap-1.5 border-t border-[var(--nw-line)] pt-3">
                  <h4 className="text-[13px] font-semibold text-[var(--nw-ink)]">Så gjordes designen</h4>
                  <Provenance made={t.made} />
                </div>
              ) : null}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--nw-ink)]">Lager · överst först</h3>
            <ul className="flex flex-col gap-1">
              {t.layers
                .map((l, i) => ({ l, i }))
                .reverse()
                .map(({ l, i }) => (
                  <li key={i}>
                    <button type="button" aria-pressed={sel === i} onClick={() => setSel(i)} className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-[var(--nw-ink)] hover:bg-[var(--nw-soft)] aria-pressed:bg-[#E8F1FF] aria-pressed:font-medium">
                      <span aria-hidden className="w-4 text-center text-[var(--nw-muted)]">
                        {l.kind === "text" ? "T" : l.kind === "shape" ? "◆" : l.kind === "icon" ? "◉" : "✎"}
                      </span>
                      <span className="truncate">{layerLabel(l)}</span>
                    </button>
                  </li>
                ))}
            </ul>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button type="button" disabled={t.layers.length >= MAX_LAYERS} onClick={() => addLayer({ kind: "text", slot: "tagline", font: "role:caps", case: "upper", color: "ink", box: { x: 250, y: clamp(t.height - 120, 0, 3000), w: 500, h: 80 } })} className="nw-chip h-8 px-3 text-[12.5px] disabled:opacity-40">
                + Text
              </button>
              {t.layers.some((l) => l.kind === "icon") ? null : (
                <button type="button" disabled={t.layers.length >= MAX_LAYERS} onClick={() => addLayer({ kind: "icon", box: { x: 400, y: 20, w: 200, h: 200 } })} className="nw-chip h-8 px-3 text-[12.5px] disabled:opacity-40">
                  + Klubbens märke
                </button>
              )}
              <select
                value=""
                disabled={t.layers.length >= MAX_LAYERS}
                aria-label="Lägg till en form"
                onChange={(e) => {
                  const shape = e.target.value as ShapeKind;
                  const box = SQUARE.has(shape) ? { x: 400, y: clamp(t.height / 2 - 100, 0, 3000), w: 200, h: 200 } : { x: 200, y: clamp(t.height / 2 - 40, 0, 3000), w: 600, h: 80 };
                  addLayer({ kind: "shape", shape, colors: ["primary", "secondary"], box });
                }}
                className="nw-input h-8 w-auto py-0 pr-8 text-[12.5px]"
              >
                <option value="" disabled>
                  + Form
                </option>
                {SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {SHAPE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

type PropsOf<L> = { l: L; palette: Palette | null; set: (patch: Partial<L>, record?: boolean) => void; remember: () => void };

function TextProps({ l, palette, weak, matches, set, remember }: PropsOf<TextIn> & { weak: boolean; matches?: MatchOption[] }) {
  const outline = outlineOf(l);
  const tracking = l.tracking ?? [0, 0];
  const share = tracking[0] > 0 ? tracking[1] / tracking[0] : 0.5;
  return (
    <>
      {matches?.length ? (
        <Field label="Närmast originalet – mätt mot filens bokstäver">
          <div className="flex flex-col gap-1">
            {matches.slice(0, 5).map((o) => (
              <button key={o.font} type="button" aria-pressed={l.font === o.font} onClick={() => set(matchPatch(o))} className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--nw-line)] px-2.5 py-1.5 text-left text-[13px] hover:border-[var(--nw-ink)] aria-pressed:border-[#0A84FF] aria-pressed:bg-[#E8F1FF]">
                <span className="truncate">{o.label}</span>
                <span className="shrink-0 tabular-nums text-[var(--nw-muted)]">{o.score} %</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      <Field label="Innehåll – byts mot varje klubbs">
        <select value={l.slot} onChange={(e) => set({ slot: e.target.value as TextSlot })} className="nw-input h-9">
          {TEXT_SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Typsnitt">
        <select value={l.font} onChange={(e) => set({ font: e.target.value })} className="nw-input h-9">
          <optgroup label="Stil">
            {FONT_ROLES.map((r) => (
              <option key={r} value={`role:${r}`}>
                {FONT_ROLE_LABEL[r]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Typsnitt">
            {Object.entries(FONTS).map(([id, f]) => (
              <option key={id} value={id}>
                {f.label}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <Field label="Bokstäver">
        <Segments label="Bokstäver" value={l.case ?? "asis"} options={CASES} onChange={(v) => set({ case: v })} />
      </Field>
      <Field label={`Färg · ${COLOR_LABEL[l.color]}`}>
        <Swatches value={l.color} palette={palette} onChange={(c) => c && set({ color: c })} />
        {weak ? <span className="text-[12px] leading-snug text-[#8A5300]">{COLOR_LABEL[l.color]} syns för svagt mot det här plagget, så bokstäverna blir svarta eller vita här. Som kontur syns färgen.</span> : null}
      </Field>
      <Field label={`Kontur · ${outline ? COLOR_LABEL[outline.color] : "ingen"}`}>
        <Swatches none value={outline?.color ?? null} palette={palette} onChange={(c) => set({ outline: c ? { color: c, width: outline?.width ?? 6 } : undefined })} />
      </Field>
      {outline ? <Slider label="Konturens bredd" value={Math.round(outline.width)} min={1} max={30} onStart={remember} onChange={(width) => set({ outline: { color: outline.color, width } }, false)} /> : null}
      <Field label="Placering i rutan">
        <Segments label="Placering i rutan" value={l.align ?? "center"} options={ALIGNS} onChange={(v) => set({ align: v })} />
      </Field>
      <Field label="Rader för långa namn">
        <Segments
          label="Rader"
          value={String(l.maxLines ?? 1) as "1" | "2"}
          options={[
            { value: "1", label: "En rad" },
            { value: "2", label: "Upp till två" },
          ]}
          onChange={(v) => set({ maxLines: Number(v) })}
        />
      </Field>
      <Slider label="Lutning" value={Math.round(l.rotate ?? 0)} min={-45} max={45} unit="°" onStart={remember} onChange={(rotate) => set({ rotate: rotate || undefined }, false)} />
      <Slider label="Båge" value={Math.round(l.arc ?? 0)} min={-120} max={120} unit="°" onStart={remember} onChange={(arc) => set({ arc: arc || undefined }, false)} />
      <Slider label="Spärrning" value={Math.round(tracking[0] * 100)} min={0} max={60} onStart={remember} onChange={(v) => set({ tracking: v ? [v / 100, Math.round(v * share) / 100] : undefined }, false)} />
    </>
  );
}

function ShapeProps({ l, palette, set, remember }: PropsOf<ShapeIn>) {
  return (
    <>
      <Field label="Form">
        <select value={l.shape} onChange={(e) => set({ shape: e.target.value as ShapeKind })} className="nw-input h-9">
          {SHAPES.map((s) => (
            <option key={s} value={s}>
              {SHAPE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      {l.colors.map((c, i) => (
        <Field key={i} label={`${l.colors.length > 1 ? `Färg ${i + 1}` : "Färg"} · ${COLOR_LABEL[c]}`}>
          <Swatches value={c} palette={palette} onChange={(next) => next && set({ colors: l.colors.map((x, j) => (j === i ? next : x)) })} />
        </Field>
      ))}
      {COUNTED.has(l.shape) ? <Slider label="Antal" value={l.count ?? 8} min={1} max={40} onStart={remember} onChange={(count) => set({ count }, false)} /> : null}
      <Slider label="Lutning" value={Math.round(l.rotate ?? 0)} min={-45} max={45} unit="°" onStart={remember} onChange={(rotate) => set({ rotate: rotate || undefined }, false)} />
    </>
  );
}

/** Grafiken från originalfilen behåller formen; varje klubbfärg i den kan bytas mot en annan. */
function ArtProps({ l, palette, set }: Omit<PropsOf<ArtIn>, "remember">) {
  const slots = artSlots(l);
  if (!slots.length) return <p className="text-[13px] leading-snug text-[var(--nw-muted)]">Grafiken har fasta färger och ser likadan ut för alla klubbar.</p>;
  return (
    <>
      <p className="text-[13px] leading-snug text-[var(--nw-muted)]">Formen kommer från originalfilen. Färgerna följer varje klubbs färger – byt vilken.</p>
      {slots.map((from) => (
        <Field key={from} label={`Det som är ${COLOR_LABEL[from].toLowerCase()} nu`}>
          <Swatches value={from} palette={palette} onChange={(to) => to && to !== from && set({ svg: l.svg.replaceAll(`{${from}}`, `{${to}}`) })} />
        </Field>
      ))}
    </>
  );
}
