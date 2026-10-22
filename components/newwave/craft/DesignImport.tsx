"use client";

import { useEffect, useState } from "react";
import type { Converted } from "@/lib/newwave/wordmark/convert";
import { FONT_ROLE_LABEL, FONT_ROLES, type FontRole, FONTS } from "@/lib/newwave/wordmark/fonts";
import { type Candidate, type Described, defaultStyle, describeSvg, type Imported, importSvg, isTextRole, NoLayerNames, PART_HUES, READ_ROLE_LABEL, READ_ROLES, type Reading, type ReadRole, type TextRole } from "@/lib/newwave/wordmark/importSvg";
import { likeness } from "@/lib/newwave/wordmark/likeness";
import type { MatchOption } from "@/lib/newwave/wordmark/match";
import type { ReadResult } from "@/lib/newwave/wordmark/memory";
import type { ClubCheck, Note } from "@/lib/newwave/wordmark/render";
import type { ColorSlot, Made, TemplateInput, TextSlot } from "@/lib/newwave/wordmark/schema";
import { type WordmarkVariant, wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { Provenance } from "./Provenance";
import { WordmarkClubs } from "./WordmarkClubs";
import { WordmarkDetail } from "./WordmarkDetail";
import type { LabClub } from "./WordmarkLab";

export const tile = (v: WordmarkVariant) => `relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[12px] ${v === "dark" ? "bg-[#1C1C1E]" : "bg-[var(--nw-soft)]"}`;
export const IMG = "absolute inset-0 h-full w-full object-contain p-[9%]";

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
  return json;
}

/** Originalets namn, texter och klubbfärger – för att rita en import som originalet såg ut. */
export type OriginalSample = { name: string; texts: Partial<Record<TextSlot, string>>; colors: string[] };
export type Matches = Partial<Record<TextRole, MatchOption[]>>;
/** Det studion får med sig från en import: originalet att lägga ovanpå, dess texter och typsnittsmatchningen. */
export type FromImport = { image: string; sample: OriginalSample; matches: Matches };
/** En sparad mall som den kommer tillbaka från servern, med hur den kom till. */
export type SavedTemplate = { id: string; name: string; made?: Made };

/** En osparad mall ritad av servern för en klubb, eller med originalets texter och färger. */
/** Klubbmärkets rutor: där sitter varje klubbs eget märke, så de räknas inte när mallen jämförs med originalet. */
export const iconBoxes = (t: TemplateInput) => t.layers.flatMap((l) => (l.kind === "icon" ? [l.box] : []));

/** Med `against` ritas mallen på originalets duk och jämförs med originalet – likheten står under bilden. */
export function Draft({ template, club, variant, original, against, onLikeness }: { template: TemplateInput; club: LabClub; variant: WordmarkVariant; original?: OriginalSample; against?: string; onLikeness?: (n: number | null) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [like, setLike] = useState<number | null>(null);
  const key = JSON.stringify({ template, original, canvas: Boolean(against) || undefined });
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    fetch("/api/v1/newwave/wordmark/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(key), club: club.id, variant }) })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        url = URL.createObjectURL(await r.blob());
        if (!live) return;
        setSrc(url);
        if (against) {
          const t = JSON.parse(key).template as TemplateInput;
          const n = await likeness(against, url, { height: t.height, originalHeight: t.height, skip: iconBoxes(t) }).catch(() => null);
          if (!live) return;
          setLike(n);
          onLikeness?.(n);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, club.id, variant, against, onLikeness]);
  return (
    <figure className="min-w-0">
      <div className={tile(variant)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- osparad mall */}
        {src ? <img src={src} alt={`Förhandsvisning med ${club.name}`} className={IMG} /> : <span className="text-[12px] text-[var(--nw-muted)]">{failed ? "Gick inte att rita" : "Ritar…"}</span>}
      </div>
      <figcaption className="mt-1 truncate text-[12px] text-[var(--nw-muted)]">{club.name}</figcaption>
      {against && like !== null ? (
        <p className="text-[12px] font-medium text-[var(--nw-ink)]" data-likeness={like} data-texts={JSON.stringify(original?.texts ?? {})}>
          Återskapar originalet till {like} %
        </p>
      ) : null}
    </figure>
  );
}

const GUIDE = [
  "SVG ger bäst resultat: Arkiv → Exportera → Exportera som → SVG, med Teckensnitt: SVG och Objekt-ID: Lagernamn. Skriv texten med levande text, så blir typsnittets stil rätt för varje klubbnamn.",
  "Lägg Namn 1 (t.ex. IFK) i ett lager som heter name1 och Namn 2 (Göteborg) i name2, eller hela namnet i name. Raden \"Sedan 1904\" kan heta tagline, sporten sport och grundandeåret year. Dekor i ett lager som heter ornament och klubbmärket i icon.",
  "AI och PDF går också: spara AI-filen med ”Skapa PDF-kompatibel fil” ikryssat. Texten blir då former, och agenten väljer ett typsnitt i samma stil.",
  "PNG och JPG görs om till vektorer: välj en bild med rena färger, helst med genomskinlig bakgrund och minst 1500 pixlar bred. Foton och övertoningar går inte, och på vit botten blir vita detaljer genomskinliga.",
];
const MAX_UPLOAD = 10_000_000;
const ACCEPT = ".svg,image/svg+xml,.ai,.pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg,.webp,image/webp";
const fileKind = (f: File) =>
  /\.svg$/i.test(f.name) || f.type === "image/svg+xml" ? "svg" : /\.(ai|pdf)$/i.test(f.name) || f.type === "application/pdf" ? "vector" : /\.(png|jpe?g|webp)$/i.test(f.name) || /^image\/(png|jpeg|webp)$/.test(f.type) ? "image" : null;

/** AI, PDF och bilder görs om till SVG på servern, utan AI. */
async function convertFile(file: File): Promise<Converted> {
  const res = await fetch("/api/v1/newwave/wordmark/convert", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  const json = (await res.json().catch(() => ({}))) as Converted & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Kunde inte läsa filen.");
  return json;
}

const COLOR_CHOICES: { value: ColorSlot | "auto"; label: string }[] = [
  { value: "auto", label: "Automatiskt" },
  { value: "primary", label: "Klubbens huvudfärg" },
  { value: "secondary", label: "Klubbens andrafärg" },
  { value: "on", label: "På huvudfärgen" },
  { value: "ink", label: "Svart" },
  { value: "paper", label: "Plaggets färg" },
];

/** `loaded` är tolkningen som den kom från agenten eller minnet – det Craft ändrar därefter sparas som rättelse. */
type AgentRead = { described: Described; reading: Reading; loaded: Reading; club: string; notes: string[]; mark?: string; meta: Pick<ReadResult, "key" | "memory" | "at" | "model" | "lessons"> };
const plain = (r: Reading) => JSON.stringify([r.roles, r.colors, Object.entries(r.styles ?? {}).map(([i, s]) => [i, s.font, s.upper]), r.texts]);
const changed = (r: AgentRead) => plain(r.reading) !== plain(r.loaded);
type Step = { kind: "idle" } | { kind: "reading"; status: string } | { kind: "draft"; file: string; draft: Imported; read?: AgentRead; matches: Matches } | { kind: "saved"; template: SavedTemplate };
type DraftStep = Extract<Step, { kind: "draft" }>;

/** Det som följer med mallen om hur den kom till: agentens läsning, typsnittsmätningen, likheten och rättigheterna. */
function madeOf(step: DraftStep, like: number | null, rightsAt: string): Made {
  const r = step.read;
  const fonts = fontRows(step.draft, step.matches).flatMap(({ text, used }) => (used ? [{ text: text.slice(0, 60), font: used.font, score: used.score }] : [])).slice(0, 8);
  return {
    file: step.file.slice(0, 80),
    ...(r ? { ai: { task: "read" as const, model: r.meta.model, at: r.meta.at, ...(r.meta.memory !== "new" ? { memory: true } : {}), ...(r.meta.lessons ? { lessons: r.meta.lessons } : {}) } } : {}),
    ...(r && (r.meta.memory === "corrected" || changed(r)) ? { corrected: true } : {}),
    ...(fonts.length ? { fonts } : {}),
    ...(like !== null ? { likeness: like } : {}),
    rights: { at: rightsAt, ...(r?.mark ? { mark: r.mark } : {}) },
  };
}

type Glyph = Imported["original"]["glyphs"][number];
const matched = new Map<string, MatchOption[]>();
const glyphKey = (g: Glyph) => JSON.stringify([g.text, g.rotate ?? 0, g.viewBox, g.paint, g.svg]);
const MATCH_AT_ONCE = 8;
/** Under det här liknar inget typsnitt originalet nog för att väljas automatiskt. */
const MATCH_MIN = 55;

/** Typsnitten närmast originalets bokstäver per textroll, bäst först – mätt på servern, utan AI, och sparat per text. */
async function matchFonts(glyphs: Glyph[]): Promise<Matches> {
  const todo = [...new Map(glyphs.filter((g) => !matched.has(glyphKey(g))).map((g) => [glyphKey(g), g])).values()].slice(0, MATCH_AT_ONCE);
  if (todo.length) {
    const { matches } = await post<{ matches: MatchOption[][] }>("/api/v1/newwave/wordmark/match", { parts: todo.map((g) => ({ text: g.text, svg: g.svg, viewBox: g.viewBox, rotate: g.rotate, prefer: g.prefer, paint: g.paint })) });
    todo.forEach((g, i) => matched.set(glyphKey(g), matches[i] ?? []));
  }
  return Object.fromEntries(glyphs.flatMap((g) => (matched.get(glyphKey(g))?.length ? [[g.slot, matched.get(glyphKey(g))!]] : [])));
}

/** Typsnittet, versalerna, spärrningen, bredden och lutningen från en matchning; det som inte behövs tas bort. */
export const matchPatch = (o: MatchOption) => ({ font: o.font, case: o.case, tracking: o.tracking, condense: o.condense, skew: o.skew, arc: o.arc, rotate: o.rotate });

/**
 * Bästa matchningen per text när den är nära nog, eller när den har stilen agenten såg – eller, när Craft själv valt en
 * stil, den bästa i den stilen.
 */
function withMatches(draft: Imported, matches: Matches): Imported {
  const pick = (slot: string) => {
    const options = matches[slot as TextRole] ?? [];
    const glyph = draft.original.glyphs.find((g) => g.slot === slot);
    const own = glyph?.picked ? options.find((o) => FONTS[o.font].role === glyph.prefer) : undefined;
    const best = options[0];
    return own ?? (best && (best.score >= MATCH_MIN || FONTS[best.font].role === glyph?.prefer) ? best : undefined);
  };
  const layers = draft.template.layers.map((l) => {
    const best = l.kind === "text" ? pick(l.slot) : undefined;
    return l.kind === "text" && best ? { ...l, ...matchPatch(best) } : l;
  });
  return { ...draft, template: { ...draft.template, layers } };
}

/** Typsnittet varje text fick, med hur likt originalet det mättes, och det bästa som fanns. */
const fontRows = (draft: Imported, matches: Matches) =>
  draft.original.glyphs.flatMap((g) => {
    const layer = draft.template.layers.find((l) => l.kind === "text" && l.slot === g.slot);
    const options = matches[g.slot];
    const used = layer?.kind === "text" ? options?.find((o) => o.font === layer.font) : undefined;
    return options?.length ? [{ text: g.text, used, best: options[0] }] : [];
  });

/** Raden under förhandsvisningen: vilket typsnitt varje text fick och hur likt originalet det är. */
function MatchLine({ draft, matches }: { draft: Imported; matches: Matches }) {
  const rows = fontRows(draft, matches);
  if (!rows.length) return null;
  return (
    <p className="text-[13px] leading-snug text-[var(--nw-ink)]">
      <span className="font-semibold">Typsnitten mätta mot originalet:</span>{" "}
      {rows.map((r, i) => (
        <span key={r.text}>
          {i ? " · " : ""}”{r.text}” → {!r.used ? `inget nära – bäst ${r.best.label} ${r.best.score} %` : r.used.score >= MATCH_MIN ? `${r.used.label} (${r.used.score} % likt)` : `${r.used.label} (${r.used.score} % – närmast, men inget licensierat typsnitt är riktigt likt)`}
        </span>
      ))}
      <span className="text-[var(--nw-muted)]"> · finjustera i designstudion</span>
    </p>
  );
}

const sampleOf = (draft: Imported, club?: string): OriginalSample => ({
  name: club || draft.sample.name || [draft.sample.name1, draft.sample.name2].filter(Boolean).join(" ") || "Originalet",
  texts: draft.sample,
  colors: draft.original.colors,
});

/** SVG:n som text i den kodning filen anger; äldre exporter i Latin-1 som påstår sig vara UTF-8 läses som Windows-1252. */
async function readSvgText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const declared = /encoding=["']([\w-]+)["']/i.exec(new TextDecoder("latin1").decode(bytes.slice(0, 300)))?.[1];
  try {
    return new TextDecoder(declared && !/^utf-?8$/i.test(declared) ? declared : "utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Var tolkningen kom ifrån: agenten nu, med hur många rättelser den lärt sig av, eller minnet utan nytt AI-anrop. */
function ReadSource({ meta }: { meta: AgentRead["meta"] }) {
  const text =
    meta.memory === "new"
      ? `Läst nu av AI-modellen ${meta.model}${meta.lessons ? `, med ${meta.lessons} tidigare rättelser från Craft som exempel` : ""}. Läsningen sparas – samma fil öppnas nästa gång utan nytt AI-anrop.`
      : meta.memory === "corrected"
        ? `Ur minnet: er rättade tolkning från ${when(meta.at)}. Inget nytt AI-anrop.`
        : `Ur minnet: filen lästes av ${meta.model} ${when(meta.at)}. Inget nytt AI-anrop.`;
  return <p className="text-[12.5px] text-[var(--nw-muted)]">{text}</p>;
}

const partLabel = (c: Candidate) => (c.text ? `”${c.text}”` : { group: `Grupp · ${c.shapes} former`, shape: "Form", image: "Inbäddad bild", text: "Text" }[c.kind]);

/** Delarna som agenten såg dem, med numren från bilden, och rollen var och en fick – som Craft kan ändra. */
function Parts({ read, onChange }: { read: AgentRead; onChange: (r: Reading) => void }) {
  const { described, reading } = read;
  const hexes = [...new Set(described.candidates.flatMap((c) => c.colors))];
  return (
    <div className="grid gap-4 min-[860px]:grid-cols-[minmax(0,360px)_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element -- agentens bild av designen */}
      <img src={described.annotated} alt="Designen med numrerade delar" className="w-full rounded-[12px] bg-[#8E8E8E]" />
      <div className="flex min-w-0 flex-col gap-3">
        <ol className="flex flex-col gap-1.5">
          {described.candidates.map((c) => {
            const role = reading.roles[c.i] ?? "ornament";
            const style = reading.styles?.[c.i] ?? defaultStyle(role);
            const setStyle = (s: Partial<typeof style>) => onChange({ ...reading, styles: { ...reading.styles, [c.i]: { ...style, ...s, picked: true } } });
            return (
              <li key={c.i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-[6px] px-1 text-[12px] font-bold text-black" style={{ background: PART_HUES[c.i % PART_HUES.length] }}>
                  {c.i}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--nw-ink)]">{partLabel(c)}</span>
                <span className="flex shrink-0 gap-0.5">
                  {c.colors.map((h) => (
                    <span key={h} title={h} className="h-3.5 w-3.5 rounded-full border border-[var(--nw-line)]" style={{ background: h }} />
                  ))}
                </span>
                <select value={role} onChange={(e) => onChange({ ...reading, roles: { ...reading.roles, [c.i]: e.target.value as ReadRole } })} aria-label={`Roll för del ${c.i}`} className="nw-input h-8 w-[170px] shrink-0 py-0 pr-7 text-[12.5px]">
                  {READ_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {READ_ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                {c.kind !== "text" && isTextRole(role) ? (
                  <span className="flex basis-full justify-end gap-1.5">
                    <select value={style.font} onChange={(e) => setStyle({ font: e.target.value as FontRole })} aria-label={`Typsnittets stil för del ${c.i}`} className="nw-input h-8 w-[150px] py-0 pr-7 text-[12.5px]">
                      {FONT_ROLES.map((f) => (
                        <option key={f} value={f}>
                          {FONT_ROLE_LABEL[f]}
                        </option>
                      ))}
                    </select>
                    <select value={style.upper ? "upper" : "asis"} onChange={(e) => setStyle({ upper: e.target.value === "upper" })} aria-label={`Versaler för del ${c.i}`} className="nw-input h-8 w-[130px] py-0 pr-7 text-[12.5px]">
                      <option value="upper">VERSALER</option>
                      <option value="asis">Som namnet</option>
                    </select>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <div>
          <p className="text-[13px] font-semibold text-[var(--nw-ink)]">Färgerna</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {hexes.map((h) => (
              <li key={h} className="flex items-center gap-2 text-[13px]">
                <span className="h-6 w-6 shrink-0 rounded-[6px] border border-[var(--nw-line)]" style={{ background: h }} />
                <span className="w-[72px] shrink-0 font-mono text-[12px] text-[var(--nw-muted)]">{h}</span>
                <select
                  value={reading.colors[h] ?? "auto"}
                  onChange={(e) => {
                    const colors = { ...reading.colors };
                    if (e.target.value === "auto") delete colors[h];
                    else colors[h] = e.target.value as ColorSlot;
                    onChange({ ...reading, colors });
                  }}
                  aria-label={`Färgen ${h}`}
                  className="nw-input h-8 w-[190px] py-0 pr-7 text-[12.5px]"
                >
                  {COLOR_CHOICES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * En färdig design in – t.ex. gjord för IFK Göteborg. Har filen namngivna lager läses den direkt; annars tolkar läsagenten
 * vilken del som är namnet, märket och dekoren och vilka färger som är klubbens. Tolkningen går att rätta innan mallen sparas,
 * och sedan görs designen för de klubbar Craft väljer.
 */
export function ImportPanel({ clubs, variant, onSave, onEdit }: { clubs: LabClub[]; variant: WordmarkVariant; onSave: (t: TemplateInput) => Promise<SavedTemplate>; onEdit: (t: TemplateInput, from?: FromImport) => void }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** När Craft bekräftade rätten att använda designen; utan den går ingen fil att välja. */
  const [rights, setRights] = useState<string | null>(null);
  const [like, setLike] = useState<number | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setLike(null);
    try {
      const kind = fileKind(file);
      if (!kind) throw new Error("Välj en SVG-, AI-, PDF-, PNG- eller JPG-fil.");
      if (file.size > MAX_UPLOAD) throw new Error("Filen är för stor – max 10 MB.");
      let source: Pick<Converted, "svg" | "words" | "fonts">;
      if (kind === "svg") {
        source = { svg: await readSvgText(file), words: [], fonts: [] };
        const named = await importSvg(source.svg, file.name).catch((e) => {
          if (e instanceof NoLayerNames) return null;
          throw e;
        });
        if (named) {
          const matches = await matchFonts(named.original.glyphs).catch(() => ({}));
          setStep({ kind: "draft", file: file.name, draft: withMatches(named, matches), matches });
          setName(named.template.name);
          return;
        }
      } else {
        setStep({ kind: "reading", status: kind === "image" ? "Bilden görs om till vektorer…" : "Filen öppnas…" });
        source = await convertFile(file);
      }
      setStep({ kind: "reading", status: "Läsagenten tittar på designen…" });
      const described = await describeSvg(source.svg, source.words);
      const { roles, colors, styles, texts, club, notes, mark, key, memory, at, model, lessons } = await post<ReadResult>("/api/v1/newwave/wordmark/read", {
        name: file.name.slice(0, 80),
        candidates: described.candidates,
        image: described.image,
        annotated: described.annotated,
        fonts: source.fonts,
      });
      const reading = { roles, colors, styles, texts, club };
      const draft = await importSvg(described.svg, file.name, reading);
      setStep({ kind: "reading", status: "Typsnitten mäts mot originalet…" });
      const matches = await matchFonts(draft.original.glyphs).catch(() => ({}));
      setStep({ kind: "draft", file: file.name, draft: withMatches(draft, matches), read: { described, reading, loaded: reading, club, notes, mark, meta: { key, memory, at, model, lessons } }, matches });
      setName(draft.template.name);
    } catch (e) {
      setStep({ kind: "idle" });
      setError(e instanceof Error ? e.message : "Kunde inte läsa filen.");
    }
  };
  const reinterpret = async (reading: Reading) => {
    if (step.kind !== "draft" || !step.read) return;
    const read = { ...step.read, reading };
    setStep({ ...step, read });
    setError("");
    try {
      const draft = await importSvg(read.described.svg, step.file, reading);
      const matches = await matchFonts(draft.original.glyphs).catch(() => ({}));
      setStep((s) => (s.kind === "draft" && s.read?.reading === reading ? { ...s, draft: withMatches(draft, matches), matches } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa om designen.");
    }
  };
  /** Det Craft ändrat i tolkningen sparas med filen och blir exempel för agenten; misslyckas det stoppar det inget. */
  const learn = () => {
    if (step.kind !== "draft" || !step.read || !changed(step.read)) return;
    const { reading, club, notes, meta } = step.read;
    void fetch("/api/v1/newwave/wordmark/read/correct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: meta.key, reading: { ...reading, club, notes } }) }).catch(() => undefined);
  };
  const finished = (s: DraftStep) => ({ ...s.draft.template, name: name.trim().slice(0, 40) || s.draft.template.name, made: madeOf(s, like, rights ?? new Date().toISOString()) });
  const keep = async () => {
    if (step.kind !== "draft") return;
    setBusy(true);
    setError("");
    learn();
    try {
      const template = await onSave(finished(step));
      setStep({ kind: "saved", template });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === "saved") return <ClubBatch template={step.template} variant={variant} onNew={() => setStep({ kind: "idle" })} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] text-[13.5px] leading-snug text-[var(--nw-muted)]">
        Ladda upp en färdig design – SVG, AI, PDF, PNG eller JPG – till exempel en ni gjort för IFK Göteborg. Läsagenten ser vad som är klubbens namn, märke, dekor och färger, och sedan görs samma design för de klubbar ni väljer – med deras namn, märke och färger.
        Agenten läser designen en gång; varje klubbversion ritas sedan utan AI.
      </p>
      <details className="text-[13px] text-[var(--nw-muted)]">
        <summary className="cursor-pointer font-medium text-[var(--nw-ink)]">Så blir det bäst</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 leading-snug">
          {GUIDE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
        <p className="mt-2">Har lagren i en SVG de här namnen läses filen direkt, utan agenten.</p>
      </details>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className={`nw-chip h-10 w-fit cursor-pointer border-dashed px-4 hover:border-[var(--nw-ink)] ${step.kind === "reading" || !rights ? "pointer-events-none opacity-50" : ""}`}>
          <input type="file" accept={ACCEPT} className="sr-only" disabled={step.kind === "reading" || !rights} onChange={(e) => void read(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          {step.kind === "draft" ? "Välj en annan fil" : "Välj fil"}
        </label>
        <span className="text-[12.5px] text-[var(--nw-muted)]">SVG, AI, PDF, PNG eller JPG · max 10 MB</span>
      </div>
      <label className="flex max-w-[70ch] items-start gap-2 text-[13px] leading-snug text-[var(--nw-ink)]">
        <input type="checkbox" checked={Boolean(rights)} onChange={(e) => setRights(e.target.checked ? new Date().toISOString() : null)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--nw-ink)]" />
        <span>Vi har rätt att använda designen – den är vår egen, beställarens eller klubbens, eller köpt med licens för tryck. Bekräftelsen sparas med mallen.</span>
      </label>
      {step.kind === "reading" ? (
        <p className="nw-fade text-[13.5px] text-[var(--nw-ink)]" role="status">
          {step.status}
        </p>
      ) : null}
      {error ? <p className="text-[13.5px] text-[#B42318]">{error}</p> : null}
      {step.kind === "draft" ? (
        <div className="nw-fade flex flex-col gap-4">
          {step.read ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13.5px] text-[var(--nw-ink)]">
                <span className="font-semibold">{step.read.meta.memory === "corrected" ? "Er rättade tolkning" : "Agentens tolkning"}</span>
                {step.read.club ? <span className="text-[var(--nw-muted)]"> · designen är gjord för {step.read.club}</span> : null}. Stämmer något inte, byt rollen eller färgen – förhandsvisningen ritas om direkt, utan AI.
              </p>
              <ReadSource meta={step.read.meta} />
              {step.read.mark ? (
                <p className="rounded-[10px] border border-[#F5C26B] bg-[#FFF8EB] px-3 py-2 text-[13px] leading-snug text-[#7A4B00]" data-mark={step.read.mark}>
                  <span className="font-semibold">⚠ Agenten känner igen varumärket {step.read.mark}.</span> Det får inte tryckas för andra klubbar utan licens. Använd bara stilen – typsnitt, färger och komposition – och se till att figurer och märken från originalet inte följer med. Klubbmärket byts alltid mot varje klubbs eget.
                </p>
              ) : null}
              {step.read.notes.length ? (
                <ul className="flex flex-col gap-1 text-[13px] text-[#8A5300]">
                  {step.read.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
              <Parts read={step.read} onChange={(r) => void reinterpret(r)} />
            </div>
          ) : (
            <p className="text-[13px] text-[var(--nw-muted)]">
              {step.draft.template.layers.length} lager · namngivna lager i filen{[step.draft.sample.name, step.draft.sample.name1, step.draft.sample.name2].some(Boolean) ? ` · ${[step.draft.sample.name, step.draft.sample.name1, step.draft.sample.name2].filter(Boolean).join(" · ")}` : ""}
            </p>
          )}
          {step.draft.notes.length ? (
            <ul className="flex flex-col gap-1 text-[13px] text-[#8A5300]">
              {step.draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <MatchLine draft={step.draft} matches={step.matches} />
          <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-5">
            <figure className="min-w-0">
              <div className={tile("light")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- originalfilen */}
                <img src={step.draft.original.image} alt="Originalet" className={IMG} />
              </div>
              <figcaption className="mt-1 truncate text-[12px] font-medium text-[var(--nw-ink)]">Originalet</figcaption>
            </figure>
            {clubs[0] ? <Draft template={step.draft.template} club={{ id: clubs[0].id, name: "Mallen med originalets namn" }} variant="light" original={sampleOf(step.draft, step.read?.club)} against={step.draft.original.image} onLikeness={setLike} /> : null}
            {clubs.map((c) => (
              <Draft key={c.id} template={step.draft.template} club={c} variant={variant} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Designens namn" className="nw-input h-10 w-[220px]" />
            <button type="button" disabled={busy || !rights} onClick={() => void keep()} className="nw-btn h-10 disabled:opacity-50">
              {busy ? "Sparar…" : "Spara och välj klubbar"}
            </button>
            <button type="button" onClick={() => {
                learn();
                onEdit(finished(step), { image: step.draft.original.image, sample: sampleOf(step.draft, step.read?.club), matches: step.matches });
              }}
              className="nw-chip h-10 px-4"
            >
              Öppna i designstudion
            </button>
            <button type="button" onClick={() => setStep({ kind: "idle" })} className="nw-btn nw-btn-ghost h-10">
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Publish = "checking" | "idle" | "busy" | "published" | "error";
const PUBLISH_AT_ONCE = 4;
const MAX_CLUBS = 96;

/** Lägger mallen först bland klubbens favoriter, så att den syns överst i klubbens shop. */
async function publishTo(clubId: string, templateId: string) {
  const res = await fetch(`/api/v1/newwave/wordmark/club/${clubId}`);
  if (!res.ok) throw new Error();
  const { prefs } = (await res.json()) as { prefs: { favorites: string[] } };
  const put = await fetch(`/api/v1/newwave/wordmark/club/${clubId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorites: [templateId, ...prefs.favorites.filter((f) => f !== templateId)].slice(0, 12) }),
  });
  if (!put.ok) throw new Error(((await put.json().catch(() => ({}))) as { error?: string }).error ?? "Kunde inte publicera.");
  const saved = (await put.json()) as { prefs: { favorites: string[] } };
  if (!saved.prefs.favorites.includes(templateId)) throw new Error();
}

const FEATURED = "/api/v1/newwave/wordmark/featured";
const CHECK = "/api/v1/newwave/wordmark/check";
const SAMPLE = 200;

async function checkClubs(body: { template: string; clubs?: string[]; sample?: number; variant: WordmarkVariant }) {
  const res = await fetch(CHECK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, variant: body.variant === "dark" ? "dark" : "light" }) });
  if (!res.ok) throw new Error();
  return ((await res.json()) as { checked: ClubCheck[] }).checked;
}

/** Det som är värt att se över: för små namn och saknade märken först, sedan kortade namn. Svaga färger syns i bilden. */
const worthSeeing = (notes: Note[]) => notes.filter((n) => n.kind !== "weak-color").sort((a, b) => Number(b.level === "varning") - Number(a.level === "varning"));

/** Kontrollen av designen för de största klubbarna, innan den går till alla. */
function SampleCheck({ checked }: { checked: ClubCheck[] | null | "error" }) {
  if (checked === null) return <p className="text-[12.5px] text-[var(--nw-muted)]">Kontrollerar designen för de {SAMPLE} största klubbarna…</p>;
  if (checked === "error") return <p className="text-[12.5px] text-[var(--nw-muted)]">Kontrollen kunde inte köras just nu.</p>;
  const count = (kind: Note["kind"]) => checked.filter((c) => c.notes.some((n) => n.kind === kind)).length;
  const flagged = checked.filter((c) => c.notes.some((n) => n.level === "varning"));
  const [small, missing, shortened] = [count("small"), count("no-logo"), count("shortened")];
  return (
    <div className="text-[12.5px] leading-snug">
      <p className={flagged.length ? "text-[#9A5B00]" : "text-[#1F7A4D]"}>
        {flagged.length ? "⚠ " : "✓ "}Kontrollerad för de {checked.length} största klubbarna:{" "}
        {[small ? `${small} får för liten text` : "", missing ? `${missing} saknar märke` : "", shortened ? `${shortened} namn kortas automatiskt` : ""].filter(Boolean).join(", ") || "alla ser bra ut"}.
      </p>
      {flagged.length ? (
        <details className="mt-1 text-[var(--nw-muted)]">
          <summary className="cursor-pointer">Visa klubbarna</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {flagged.slice(0, 30).map((c) => (
              <li key={c.id}>
                <span className="font-medium text-[var(--nw-ink)]">{c.name}</span> – {worthSeeing(c.notes)[0]?.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Designen för alla klubbar på en gång, eller för varje vald klubb med klubbens namn, märke och färger – tryckfiler och
 * publicering i klubbens shop per klubb.
 */
export function ClubBatch({ template, variant, onNew, newLabel = "Ladda upp en ny design" }: { template: SavedTemplate; variant: WordmarkVariant; onNew: () => void; newLabel?: string }) {
  const [clubs, setClubs] = useState<LabClub[]>([]);
  const [state, setState] = useState<Record<string, Publish>>({});
  const [everyone, setEveryone] = useState<Publish>("checking");
  const [detail, setDetail] = useState<LabClub | null>(null);
  const [problem, setProblem] = useState("");
  const [notes, setNotes] = useState<Record<string, Note[]>>({});
  const [sample, setSample] = useState<ClubCheck[] | null | "error">(null);
  const spec = { template: template.id, icon: true, ornament: true };
  const mark = (id: string, s: Publish) => setState((m) => ({ ...m, [id]: s }));

  useEffect(() => {
    let live = true;
    fetch(FEATURED)
      .then((r) => (r.ok ? (r.json() as Promise<{ ids: string[] }>) : null))
      .then((d) => live && setEveryone(d?.ids.includes(template.id) ? "published" : "idle"))
      .catch(() => live && setEveryone("idle"));
    checkClubs({ template: template.id, sample: SAMPLE, variant })
      .then((c) => live && setSample(c))
      .catch(() => live && setSample("error"));
    return () => {
      live = false;
    };
  }, [template.id, variant]);
  const assignAll = async (on: boolean) => {
    setEveryone("busy");
    setProblem("");
    try {
      const res = await fetch(FEATURED, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: template.id, on }) });
      const data = (await res.json().catch(() => ({}))) as { ids?: string[]; error?: string };
      if (!res.ok || !data.ids) throw new Error(data.error ?? "Kunde inte tilldela designen.");
      setEveryone(data.ids.includes(template.id) ? "published" : "idle");
    } catch (e) {
      setEveryone(on ? "error" : "published");
      setProblem(e instanceof Error ? e.message : "Kunde inte tilldela designen.");
    }
  };

  const add = (list: LabClub[]) => {
    const fresh = list.filter((c) => !clubs.some((x) => x.id === c.id)).slice(0, Math.max(0, MAX_CLUBS - clubs.length));
    if (!fresh.length) return;
    setClubs((cur) => [...cur, ...fresh]);
    checkClubs({ template: template.id, clubs: fresh.map((c) => c.id), variant })
      .then((checked) => setNotes((m) => ({ ...m, ...Object.fromEntries(checked.map((c) => [c.id, c.notes])) })))
      .catch(() => undefined);
    for (const c of fresh) {
      mark(c.id, "checking");
      fetch(`/api/v1/newwave/wordmark/club/${c.id}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ prefs: { favorites: string[] } }>) : null))
        .then((d) => mark(c.id, d?.prefs.favorites.includes(template.id) ? "published" : "idle"))
        .catch(() => mark(c.id, "idle"));
    }
  };
  const toggle = (c: LabClub) => (clubs.some((x) => x.id === c.id) ? setClubs((cur) => cur.filter((x) => x.id !== c.id)) : add([c]));
  const publish = async (c: LabClub) => {
    mark(c.id, "busy");
    try {
      await publishTo(c.id, template.id);
      mark(c.id, "published");
    } catch (e) {
      mark(c.id, "error");
      setProblem(e instanceof Error && e.message ? e.message : "Kunde inte publicera.");
    }
  };
  const waiting = clubs.filter((c) => state[c.id] === "idle" || state[c.id] === "error");
  const publishAll = async () => {
    const queue = [...waiting];
    await Promise.all(Array.from({ length: PUBLISH_AT_ONCE }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) await publish(c);
    }));
  };
  const done = clubs.filter((c) => state[c.id] === "published").length;
  const review = clubs.filter((c) => notes[c.id]?.some((n) => n.level === "varning")).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-[var(--nw-ink)]">
          <span className="font-semibold">”{template.name}” är sparad.</span> <span className="text-[var(--nw-muted)]">Välj klubbarna den ska göras för.</span>
        </p>
        <button type="button" onClick={onNew} className="nw-chip h-9 px-3">
          {newLabel}
        </button>
      </div>
      {template.made ? (
        <details className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white px-4 py-3">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-[var(--nw-ink)]">Så gjordes designen</summary>
          <div className="mt-2">
            <Provenance made={template.made} />
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--nw-ink)]">{everyone === "published" ? "✓ Tilldelad alla klubbar" : "Alla klubbar"}</p>
          <p className="text-[13px] leading-snug text-[var(--nw-muted)]">Designen visas i varje klubbs shop med klubbens namn och färger, efter klubbens egna favoriter.</p>
          <div className="mt-1.5">
            <SampleCheck checked={sample} />
          </div>
        </div>
        {everyone === "published" ? (
          <button key="off" type="button" onClick={() => void assignAll(false)} className="nw-chip h-9 px-3">
            Ta bort från alla
          </button>
        ) : (
          <button key="on" type="button" disabled={everyone === "busy" || everyone === "checking"} onClick={() => void assignAll(true)} className="nw-btn h-9 px-4 text-[13px] disabled:opacity-50">
            {everyone === "busy" ? "Tilldelar…" : "Tilldela alla klubbar"}
          </button>
        )}
      </div>
      {problem ? <p className="text-[13.5px] text-[#B42318]">{problem}</p> : null}
      <WordmarkClubs selected={clubs} onToggle={toggle} onPickAll={add} title="Eller välj vissa klubbar" hint={`sök på namn eller ort och välj, högst ${MAX_CLUBS} åt gången`} />
      {clubs.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13.5px] text-[var(--nw-muted)]">
              {clubs.length} {clubs.length === 1 ? "klubb" : "klubbar"} · {done} publicerade i sin shop
              {review ? <span className="text-[#9A5B00]"> · {review} att se över</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setClubs([])} className="nw-chip h-9 px-3">
                Rensa
              </button>
              <button type="button" disabled={!waiting.length} onClick={() => void publishAll()} className="nw-btn h-9 px-4 text-[13px] disabled:opacity-50">
                Publicera {waiting.length ? `${waiting.length} ` : ""}i klubbarnas shoppar
              </button>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
            {clubs.map((c) => {
              const s = state[c.id] ?? "checking";
              return (
                <li key={c.id} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-2">
                  <button type="button" onClick={() => setDetail(c)} aria-label={`${template.name} för ${c.name}: tryckfiler, pris och digitalt`} className={`${tile(variant)} w-full`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                    <img src={wordmarkUrl(spec, c.id, variant, 480)} alt={`${template.name} för ${c.name}`} loading="lazy" className={IMG} />
                  </button>
                  <p className="mt-1.5 truncate px-0.5 text-[12.5px] font-semibold text-[var(--nw-ink)]">{c.name}</p>
                  {worthSeeing(notes[c.id] ?? []).map((n) => (
                    <p key={n.text} className={`mt-0.5 px-0.5 text-[11.5px] leading-snug ${n.level === "varning" ? "text-[#9A5B00]" : "text-[var(--nw-muted)]"}`}>
                      {n.level === "varning" ? "⚠ " : "✓ "}
                      {n.text}
                    </p>
                  ))}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 px-0.5 text-[12px]">
                    <button type="button" onClick={() => setDetail(c)} className="text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                      Tryckfiler
                    </button>
                    {s === "published" ? (
                      <a href={`/newwave/klubbar/${c.id}/butik`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1F7A4D] underline underline-offset-4">
                        ✓ I shoppen ↗
                      </a>
                    ) : (
                      <button type="button" disabled={s === "busy" || s === "checking"} onClick={() => void publish(c)} className={`font-medium underline underline-offset-4 disabled:no-underline disabled:opacity-60 ${s === "error" ? "text-[#B42318]" : "text-[var(--nw-ink)]"}`}>
                        {s === "busy" ? "Publicerar…" : s === "checking" ? "…" : s === "error" ? "Försök igen" : "Publicera"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {detail ? <WordmarkDetail spec={spec} name={template.name} club={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
