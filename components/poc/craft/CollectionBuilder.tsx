"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Crest, fmtN } from "@/components/newwave/craft/parts";
import { SearchBox } from "@/components/newwave/craft/SearchBox";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { colorRef, productStock, type SkuStock, type StockLabel } from "@/lib/poc/hub/stock-rules";
import type { CatalogProduct } from "@/lib/poc/types";
import { VariantRows } from "./VariantRows";
import { type ClubFacts, crowded, distribute, STANDARD_VARIANT, sameChoice, usable, type VariantChoice, variantKey, variantLabel, variantTexts } from "./variants";

/**
 * Klubbkollektionen: Craft gör en eller flera designer en gång och publicerar dem som varje vald klubbs egna i
 * klubbarnas Intersport-shoppar – med klubbens namn, färger och märke. Flera designer fördelas så att klubbar i samma
 * kommun får olika design, och ordmallarnas texter kan bli varianter per klubb (smeknamn, ort, stadsdel). Designer,
 * produkter, klubbar, texter och fördelning, förhandsvisning, publicera.
 */

export type TemplateOption = { id: string; name: string; style: string; own: boolean };
/**
 * `colorOptions` är färgerna plagget kan få, `clubColor` att klubbens mörkaste färg också går (tryckkedjan klarar den).
 * `stock` är lagret i New Waves hubb; saknas det säljs plagget obegränsat.
 */
export type ProductOption = CatalogProduct & { photo?: string; method?: string; colorOptions?: { name: string; hex: string }[]; clubColor?: boolean; stock?: SkuStock };

/** Lagret för produkten i alla färger, eller i en färg: "Slut i M och L", "Få kvar i S", "Tillfälligt slut". */
export function stockLabelOf(p: Pick<ProductOption, "stock" | "sizes" | "colors">, color?: { name?: string; hex?: string } | null): StockLabel | null {
  if (!p.stock?.tracked) return null;
  return productStock(p.stock, p.sizes, color ? colorRef(color, p.colors) : undefined).label;
}

/** Lagrets text i Crafts vyer, röd när något är slut och gul när det är lite kvar. */
export function StockNote({ label, className = "" }: { label: StockLabel | null; className?: string }) {
  if (!label) return null;
  return <span className={`${label.tone === "slut" ? "text-[#9B1C1C]" : "text-[#8A4B00]"} ${className}`}>{label.text}</span>;
}
/** `published` och `clubs`: hur många produkter och klubbshoppar designen finns i nu. */
export type SavedDesign = { id: string; name: string; type: "ordmall" | "fil"; template?: string; art?: string; createdAt: string; published?: number; clubs?: number };
/** Säsongen klubbkollektionen öppnades från (lib/poc/seasons.ts): id, namn, datum och budskap. */
export type PresetSeason = { id: string; label?: string; date?: string; hook?: string };
/** Förval ur adressen (se docs/poc-flode.md, kontraktet mellan D och E). */
export type Preset = { templates?: string[]; designIds?: string[]; name?: string; skus?: string[]; sport?: string; county?: string; municipality?: string; season?: PresetSeason };

/** En rad ur klubbregistret: id, namn, län, kommun, sport, färger med komma emellan, märkets version och grundandeåret. */
type Row = [string, string, string, string, string, string, string, string?];
type Club = { id: string; name: string; county: string; municipality: string; sport: string; colors: string[]; logo: string; founded?: number; text: string };
type PreviewItem = { clubId: string; sku: string; kind: string; title: string; priceSek: number; mockupUrl: string; variant: string; label: string; color?: { name: string; hex: string; how: "auto" | "vald" }; note?: string };
/** En vald design: en ordmall som sparas när den publiceras (`template`), eller en sparad design (`designId`). */
type Chosen = { key: string; name: string; type: "ordmall" | "fil"; template?: string; designId?: string; art?: string };
type Group = { key: string; name: string; type: "ordmall" | "fil"; template?: string; designId?: string; clubIds: string[]; done: number };
/** En publicering i omgångar, design för design: hur långt den kommit, så att den kan fortsätta efter ett fel. */
type Run = {
  groups: Group[];
  skus: string[];
  colors: Record<string, string>;
  variants: Record<string, VariantChoice[]>;
  content: boolean;
  published: number;
  okClubs: string[];
  okSkus: string[];
  drafts: number;
  draftsKnown: boolean;
  contentFailed: boolean;
};
type Published = { names: string[]; published: number; clubIds: string[]; skus: string[]; content: boolean; drafts: number; draftsKnown: boolean; contentFailed: boolean };
type Removal = { designId: string; name: string; ids: string[]; clubs: number; undone?: boolean };

const PREVIEW_MAX = 24;
/** Klubbar per anrop när Craft publicerar: tusentals klubbar går i omgångar, med förlopp. Också högst så många per innehållsanrop. */
const BATCH = 250;
const PAGE = 40;
/** Klubbar i fördelningen innan Craft vill se fler. */
const DIST_PAGE = 60;
/** Ordmallarna som syns innan Craft vill se alla: två rader. */
const TEMPLATES_SHOWN = 10;
/** Förvalda produkter: de två första plaggen och halsduken. */
const defaultSkus = (products: ProductOption[]) => [...products.filter((p) => p.kind === "plagg").slice(0, 2), ...products.filter((p) => p.kind === "halsduk")].map((p) => p.sku);
/** Klubben som ordmallarna visas med innan någon klubb är vald. */
const SAMPLE = "storvreta-ibk";

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const toClub = ([id, name, county, municipality, sport, colors, v, founded]: Row): Club => ({
  id,
  name,
  county,
  municipality,
  sport,
  colors: colors.split(","),
  logo: `/api/v1/newwave/registry/${id}/logo.png?v=${v}`,
  founded: Number(founded) || undefined,
  text: fold(`${name} ${municipality} ${county} ${sport}`),
});
const factsOf = (c: Club | undefined): ClubFacts | undefined => (c ? { name: c.name, municipality: c.municipality, sport: c.sport, founded: c.founded } : undefined);

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
  return json;
}

/** Antalet utkast i svaret från innehållsroutinen (del E): ett tal eller en lista under något av de vanliga namnen. */
function draftCount(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  for (const k of ["created", "count", "drafts", "utkast", "items"]) {
    if (typeof j[k] === "number") return j[k] as number;
    if (Array.isArray(j[k])) return (j[k] as unknown[]).length;
  }
  return null;
}

const chip = (on: boolean) => `nw-chip h-8 px-3 ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "hover:border-[var(--nw-ink)]"}`;
const small = (url: string) => url.replace("&s=800", "&s=480");
const plural = (n: number, one: string, many: string) => `${fmtN(n)} ${n === 1 ? one : many}`;
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} och ${names.at(-1)}` : (names[0] ?? ""));
const isStandard = (v: VariantChoice[]) => v.length === 1 && sameChoice(v[0], STANDARD_VARIANT);

function Step({ n, title, sub, children, aside }: { n: number; title: string; sub?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">
            {n}. {title}
          </h2>
          {sub ? <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">{sub}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Tick({ on }: { on: boolean }) {
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "border-[#c9c9c4] bg-white"}`} aria-hidden>
      {on ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      {colors.slice(0, 4).map((c) => (
        <span key={c} className="h-3 w-3 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }} />
      ))}
    </span>
  );
}

function Select({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: { name: string; n: number }[]; all: string }) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none truncate rounded-full bg-[var(--nw-soft)] pl-4 pr-9 text-[14px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]"
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.name} value={o.name}>
            {o.name} ({fmtN(o.n)})
          </option>
        ))}
      </select>
      <Chevron />
    </label>
  );
}

export function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const facet = (clubs: Club[], key: "sport" | "county" | "municipality") => {
  const m = new Map<string, number>();
  for (const c of clubs) if (c[key]) m.set(c[key], (m.get(c[key]) ?? 0) + 1);
  return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name, "sv"));
};

/** Säsongen överst när klubbkollektionen öppnas från en säsong (`?sasong=`). */
function SeasonBanner({ season }: { season: PresetSeason }) {
  const when = season.date && !Number.isNaN(Date.parse(season.date)) ? new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(season.date)) : season.date;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[var(--nw-soft)] px-4 py-3">
      <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-[var(--nw-muted)]">Säsong</span>
      <span className="text-[14.5px] font-semibold text-[var(--nw-ink)]">{season.label ?? season.id}</span>
      {when ? <span className="text-[13px] text-[var(--nw-muted)]">{when}</span> : null}
      {season.hook ? <span className="w-full text-[13px] text-[var(--nw-muted)] sm:w-auto">”{season.hook}”</span> : null}
      <Link href="/newwave/craft/sasonger" className="ml-auto text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
        Säsongerna
      </Link>
    </div>
  );
}

/**
 * `catalogNote` säger var produkterna kommer ifrån (New Waves hubb, Crafts produktdata eller platshållarna).
 */
export function CollectionBuilder({
  templates,
  products,
  designs: initialDesigns,
  preset = {},
  catalogNote = "plaggen är platshållare tills Crafts produktdata finns",
}: {
  templates: TemplateOption[];
  products: ProductOption[];
  designs: SavedDesign[];
  preset?: Preset;
  catalogNote?: string;
}) {
  // 1. Designerna
  const [mode, setMode] = useState<"ordmall" | "fil" | "sparad">(preset.designIds?.length && !preset.templates?.length ? "sparad" : "ordmall");
  // En förvald mall längre ner i listan syns direkt.
  const [allTemplates, setAllTemplates] = useState(() => (preset.templates ?? []).some((id) => templates.findIndex((t) => t.id === id) >= TEMPLATES_SHOWN));
  const [designs, setDesigns] = useState(initialDesigns);
  const [chosen, setChosen] = useState<Chosen[]>(() => {
    const fromTemplates = (preset.templates ?? []).flatMap((id): Chosen[] => {
      const t = templates.find((x) => x.id === id);
      return t ? [{ key: `t:${t.id}`, name: (preset.templates!.length === 1 && preset.name) || t.name, type: "ordmall", template: t.id }] : [];
    });
    const fromSaved = (preset.designIds ?? []).flatMap((id): Chosen[] => {
      const d = initialDesigns.find((x) => x.id === id);
      return d ? [{ key: `d:${d.id}`, name: d.name, type: d.type, template: d.template, designId: d.id, art: d.art }] : [];
    });
    return [...fromTemplates, ...fromSaved];
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  // 2. Produkterna
  const [skus, setSkus] = useState<string[]>(() => {
    const own = (preset.skus ?? []).filter((s) => products.some((p) => p.sku === s));
    return own.length ? own : defaultSkus(products);
  });
  /** Plaggets färg per artikelnummer: "auto", "klubb" eller en färg. */
  const [colors, setColors] = useState<Record<string, string>>({});
  // 3. Klubbarna
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [sport, setSport] = useState(preset.sport ?? "");
  const [county, setCounty] = useState(preset.county ?? "");
  const [municipality, setMunicipality] = useState(preset.municipality ?? "");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE);
  // 4. Texterna och fördelningen
  const [variants, setVariants] = useState<VariantChoice[]>([STANDARD_VARIANT]);
  const [clubVariants, setClubVariants] = useState<Record<string, VariantChoice[]>>({});
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [distLimit, setDistLimit] = useState(DIST_PAGE);
  // 5–6. Förhandsvisning och publicering
  const [preview, setPreview] = useState<{ key: string; items: PreviewItem[] } | null>(null);
  const [content, setContent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Published | null>(null);
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/craft/clubs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: { clubs: Row[] }) => live && setClubs(json.clubs.map(toClub)))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, []);

  const byId = useMemo(() => new Map((clubs ?? []).map((c) => [c.id, c])), [clubs]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  // Varje filter räknas med de andra, så att siffrorna visar vad ett val ger.
  const words = fold(q).split(/\s+/).filter(Boolean);
  const all = clubs ?? [];
  const base = all.filter((c) => (!onlyPicked || pickedSet.has(c.id)) && words.every((w) => c.text.includes(w)));
  const bySport = (c: Club) => !sport || c.sport === sport;
  const byCounty = (c: Club) => !county || c.county === county;
  const byTown = (c: Club) => !municipality || c.municipality === municipality;
  const filtered = base.filter((c) => bySport(c) && byCounty(c) && byTown(c));
  const sports = facet(base.filter((c) => byCounty(c) && byTown(c)), "sport");
  const counties = facet(base.filter((c) => bySport(c) && byTown(c)), "county");
  const towns = facet(base.filter((c) => bySport(c) && byCounty(c)), "municipality");
  const allFiltered = filtered.length > 0 && filtered.every((c) => pickedSet.has(c.id));
  const filtering = Boolean(q.trim() || sport || county || municipality || onlyPicked);

  const toggleClub = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickFiltered = () => {
    if (allFiltered) {
      const out = new Set(filtered.map((c) => c.id));
      setPicked((p) => p.filter((id) => !out.has(id)));
    } else setPicked((p) => [...new Set([...p, ...filtered.map((c) => c.id)])]);
  };

  const toggleChosen = (c: Chosen) => setChosen((list) => (list.some((x) => x.key === c.key) ? list.filter((x) => x.key !== c.key) : [...list, c]));
  const chosenKeys = chosen.map((c) => c.key);
  const chosenBy = new Map(chosen.map((c) => [c.key, c]));
  const sample = picked[0] ?? SAMPLE;
  const sampleFacts = factsOf(byId.get(sample));

  // Fördelningen: klubbar i samma kommun får olika designer så långt det går; Crafts egna val per klubb räknas med.
  const pickedClubs = useMemo(() => picked.map((id) => ({ id, municipality: byId.get(id)?.municipality ?? "" })), [picked, byId]);
  const assigned = useMemo(() => distribute(pickedClubs, chosenKeys, fixed), [pickedClubs, chosenKeys.join("|"), fixed]); // eslint-disable-line react-hooks/exhaustive-deps
  const crowd = chosen.length ? crowded(pickedClubs, assigned) : [];
  const variantsOf = (id: string) => clubVariants[id] ?? variants;
  const appliesTo = (id: string) => chosenBy.get(assigned[id])?.type === "ordmall";
  const anyWordmark = chosen.some((c) => c.type === "ordmall");

  /** Klubbens varianter med texterna ifyllda, utan dubbletter – som servern gör dem. */
  const resolved = (id: string) => {
    if (!appliesTo(id)) return [{ key: "", label: "" }];
    const facts = factsOf(byId.get(id));
    if (!facts) return [{ key: "", label: "" }];
    const out = new Map<string, string>();
    for (const v of usable(variantsOf(id))) {
      const t = variantTexts(v, facts);
      out.set(variantKey(t), variantLabel(t));
    }
    return [...out].map(([key, label]) => ({ key, label }));
  };
  const productCount = picked.reduce((n, id) => n + resolved(id).length * skus.length, 0);

  // Förhandsvisningen: de första klubbarna, en förfrågan per design.
  const previewClubs = picked.slice(0, PREVIEW_MAX);
  const chosenColors = Object.fromEntries(Object.entries(colors).filter(([sku, c]) => c !== "auto" && skus.includes(sku)));
  const variantPayload = (ids: string[]) => Object.fromEntries(ids.filter((id) => appliesTo(id) && !isStandard(variantsOf(id))).map((id) => [id, variantsOf(id)]));
  const previewBodies = chosen.length && skus.length && previewClubs.length
    ? chosen.flatMap((c) => {
        const ids = previewClubs.filter((id) => assigned[id] === c.key);
        return ids.length ? [{ designId: c.designId, template: c.designId ? undefined : c.template, clubIds: ids, skus, colors: chosenColors, variants: variantPayload(ids) }] : [];
      })
    : [];
  const previewKey = previewBodies.length ? JSON.stringify(previewBodies) : "";

  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    const t = setTimeout(() => {
      Promise.all((JSON.parse(previewKey) as unknown[]).map((body) => post<{ items: PreviewItem[] }>("/api/v1/craft/preview", body).then((r) => r.items).catch(() => [] as PreviewItem[])))
        .then((parts) => live && setPreview({ key: previewKey, items: parts.flat() }))
        .catch(() => live && setPreview({ key: previewKey, items: [] }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [previewKey]);

  const chooseFile = (f: File | undefined) => {
    if (!f) return;
    setError("");
    setFile(f);
    setFileName(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 60));
  };
  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("name", fileName.trim() || "Egen design");
      form.set("file", file);
      const res = await fetch("/api/v1/craft/designs", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { design?: SavedDesign; error?: string };
      if (!res.ok || !json.design) throw new Error(json.error ?? "Kunde inte ladda upp filen.");
      const d = json.design;
      setDesigns((list) => [d, ...list]);
      setChosen((list) => [...list, { key: `d:${d.id}`, name: d.name, type: "fil", designId: d.id, art: d.art }]);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ladda upp filen.");
    } finally {
      setUploading(false);
    }
  };

  /** Tar bort en sparad design ur alla klubbars shoppar, eller lägger tillbaka det som togs bort. */
  const removeEverywhere = async (d: SavedDesign, undo?: Removal) => {
    if (!undo && !window.confirm(`Ta bort ”${d.name}” ur ${plural(d.clubs ?? 0, "klubbshop", "klubbshoppar")}? Produkterna försvinner ur shopparna men finns kvar i ordrarna som redan gjorts.`)) return;
    setRemoving(d.id);
    setError("");
    try {
      const res = await post<{ removed?: number; restored?: number; ids: string[]; clubs: number }>(`/api/v1/craft/designs/${d.id}/remove`, undo ? { restore: undo.ids } : {});
      setDesigns((list) => list.map((x) => (x.id === d.id ? { ...x, published: undo ? (x.published ?? 0) + res.ids.length : 0, clubs: undo ? res.clubs : 0 } : x)));
      setRemoval(undo ? { ...undo, undone: true } : { designId: d.id, name: d.name, ids: res.ids, clubs: res.clubs });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ta bort designen.");
    } finally {
      setRemoving(null);
    }
  };

  /** Publicerar design för design, klubbarna i omgångar om BATCH; efter ett fel fortsätter `resume` där publiceringen stannade. */
  const publish = async (resume?: Run) => {
    if (!resume && (!chosen.length || !skus.length || !picked.length)) return;
    setBusy(true);
    setError("");
    let job =
      resume ??
      ({
        groups: chosen.flatMap((c) => {
          const ids = picked.filter((id) => assigned[id] === c.key);
          return ids.length ? [{ key: c.key, name: c.name, type: c.type, template: c.template, designId: c.designId, clubIds: ids, done: 0 }] : [];
        }),
        skus: [...skus],
        colors: chosenColors,
        variants: variantPayload(picked),
        content,
        published: 0,
        okClubs: [],
        okSkus: [],
        drafts: 0,
        draftsKnown: true,
        contentFailed: false,
      } satisfies Run);
    setRun(job);
    try {
      for (let g = 0; g < job.groups.length; g++) {
        let group = job.groups[g];
        if (!group.designId) {
          const made = await post<{ design: SavedDesign }>("/api/v1/craft/designs", { name: group.name.slice(0, 60), template: group.template });
          group = { ...group, designId: made.design.id };
          job = { ...job, groups: job.groups.map((x, i) => (i === g ? group : x)) };
          setRun(job);
          setDesigns((d) => [made.design, ...d]);
          setChosen((list) => list.map((c) => (c.key === group.key ? { ...c, designId: made.design.id } : c)));
        }
        while (group.done < group.clubIds.length) {
          const part = group.clubIds.slice(group.done, group.done + BATCH);
          const vars = Object.fromEntries(part.filter((id) => job.variants[id]).map((id) => [id, job.variants[id]]));
          const res = await post<{ published: number; clubIds: string[]; skus: string[] }>(`/api/v1/craft/designs/${group.designId}/publish`, {
            clubIds: part,
            skus: job.skus,
            colors: job.colors,
            ...(Object.keys(vars).length ? { variants: vars } : {}),
          });
          group = { ...group, done: group.done + part.length };
          job = { ...job, groups: job.groups.map((x, i) => (i === g ? group : x)), published: job.published + res.published, okClubs: [...new Set([...job.okClubs, ...res.clubIds])], okSkus: [...new Set([...job.okSkus, ...res.skus])] };
          // Innehåll och mejlutkast till klubbarna i omgången (del E). Går det inte står publiceringen ändå kvar.
          if (job.content && res.clubIds.length) {
            const made = await fetch("/api/v1/craft/innehall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: group.designId, clubIds: res.clubIds, ...(preset.season ? { season: preset.season.id } : {}) }) })
              .then(async (r) => (r.ok ? { n: draftCount(await r.json().catch(() => null)) } : null))
              .catch(() => null);
            job = made ? { ...job, drafts: job.drafts + (made.n ?? 0), draftsKnown: job.draftsKnown && made.n !== null } : { ...job, contentFailed: true };
          }
          setRun(job);
        }
        job = { ...job, groups: job.groups.map((x, i) => (i === g ? group : x)) };
      }
      setDone({ names: job.groups.map((x) => x.name), published: job.published, clubIds: job.okClubs, skus: job.okSkus, content: job.content, drafts: job.drafts, draftsKnown: job.draftsKnown, contentFailed: job.contentFailed });
      setRun(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setRun(job);
      const why = e instanceof Error ? e.message : "Kunde inte publicera.";
      const total = job.groups.reduce((n, x) => n + x.clubIds.length, 0);
      const doneN = job.groups.reduce((n, x) => n + x.done, 0);
      setError(total > BATCH || job.groups.length > 1 ? `${why.replace(/\.$/, "")} – ${fmtN(doneN)} av ${fmtN(total)} klubbar är publicerade.` : why);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const shown = done.clubIds.slice(0, 30);
    return (
      <div className="nw-fade mt-6 rounded-[28px] bg-[var(--nw-soft)] p-6 sm:p-8">
        <p className="text-[12.5px] font-medium uppercase tracking-[0.1em] text-[var(--nw-muted)]">Publicerad i Intersport</p>
        <h2 className="nw-club-heading mt-2 text-[24px] leading-tight text-[var(--club)] sm:text-[28px]">
          {list(done.names.map((n) => `”${n}”`))} finns nu i {plural(done.clubIds.length, "klubbshop", "klubbshoppar")}
        </h2>
        <p className="mt-2 max-w-[600px] text-[14.5px] text-[var(--nw-muted)]">
          {plural(done.published, "produkt", "produkter")}: {done.skus.map((s) => products.find((p) => p.sku === s)?.name ?? s).join(", ")}. Varje klubb har fått sin design med sitt eget namn, sina färger och sitt märke. Ordrarna syns i
          Crafts ordervy.
        </p>
        {done.content ? (
          <p className={`mt-2 text-[14px] ${done.contentFailed ? "text-[#9B1C1C]" : "text-[var(--nw-ink)]"}`} role="status">
            {done.contentFailed
              ? "Innehållet kunde inte skapas – produkterna är publicerade ändå."
              : done.draftsKnown
                ? `${plural(done.drafts, "utkast", "utkast")} med innehåll och mejl till klubbarna – inget skickas förrän Craft godkänner.`
                : "Innehåll och mejlutkast till klubbarna är skapade – inget skickas förrän Craft godkänner."}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {shown.map((id) => {
            const c = byId.get(id);
            return (
              <a key={id} href={`/intersport/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-[13px] text-[var(--nw-ink)] transition hover:shadow-[0_6px_16px_-10px_rgba(17,17,17,0.45)]">
                <Crest name={c?.name ?? id} logo={c?.logo} colors={[c?.colors[0] ?? "#111111", c?.colors[1] ?? "#FFFFFF"]} size={24} />
                {c?.name ?? id}
                <span aria-hidden className="text-[var(--nw-muted)]">
                  ↗
                </span>
              </a>
            );
          })}
          {done.clubIds.length > shown.length ? <span className="self-center text-[13px] text-[var(--nw-muted)]">+{fmtN(done.clubIds.length - shown.length)} klubbar till</span> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`/intersport/${done.clubIds[0]}`} target="_blank" rel="noreferrer" className="nw-btn">
            Öppna {byId.get(done.clubIds[0])?.name ?? "första klubbens"} shop
          </a>
          <Link href={`/newwave/craft/shoppar?klubb=${encodeURIComponent(done.clubIds[0] ?? "")}`} className="nw-btn nw-btn-ghost">
            Ändra i shoppen
          </Link>
          <Link href="/newwave/craft/ordrar" className="nw-btn nw-btn-ghost">
            Ordrarna
          </Link>
          <button
            type="button"
            className="nw-btn nw-btn-ghost"
            onClick={() => {
              setDone(null);
              setPicked([]);
              setClubVariants({});
              setFixed({});
            }}
          >
            Ny kollektion
          </button>
        </div>
      </div>
    );
  }

  const previewItems = preview?.key === previewKey ? preview.items : null;
  const chosenGarments = products.filter((p) => p.kind === "plagg" && skus.includes(p.sku) && (p.colorOptions?.length || p.clubColor));
  /** Klubbarna i förhandsvisningen vars halsduk inte kan bära ordmallen. */
  const classic = [...new Map((previewItems ?? []).filter((i) => i.note).map((i) => [i.clubId, i])).values()];
  const ready = Boolean(chosen.length && skus.length && picked.length);
  const files = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const thumb = (c: Pick<Chosen, "art" | "template">) => c.art ?? (c.template ? wordmarkUrl({ template: c.template, icon: true, ornament: true }, sample, "light", 480) : undefined);
  const perDesign = chosen.map((c) => ({ c, n: picked.filter((id) => assigned[id] === c.key).length }));
  // Fördelningen kommun för kommun, så att grannarna står bredvid varandra.
  const distRows = [...picked].sort((a, b) => (byId.get(a)?.municipality ?? "").localeCompare(byId.get(b)?.municipality ?? "", "sv") || (byId.get(a)?.name ?? a).localeCompare(byId.get(b)?.name ?? b, "sv"));
  const savedInShops = designs.filter((d) => (d.published ?? 0) > 0);
  const totalClubs = run ? run.groups.reduce((n, x) => n + x.clubIds.length, 0) : 0;
  const doneClubs = run ? run.groups.reduce((n, x) => n + x.done, 0) : 0;

  return (
    <div className="mt-6 flex flex-col gap-9">
      {preset.season ? <SeasonBanner season={preset.season} /> : null}
      <Step
        n={1}
        title="Designerna"
        sub="En eller flera: ordmallar som sätter in klubbens namn, egna filer eller sparade designer. Flera designer fördelas över klubbarna."
        aside={
          <div className="flex rounded-full bg-[var(--nw-soft)] p-0.5" role="group" aria-label="Designens källa">
            {(
              [
                ["ordmall", "Ordmall"],
                ["fil", "Egen fil"],
                ["sparad", `Sparade${designs.length ? ` (${designs.length})` : ""}`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id} className={`h-8 rounded-full px-3.5 text-[13px] font-medium ${mode === id ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)]"}`}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        {mode === "ordmall" ? (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {(allTemplates ? templates : templates.slice(0, TEMPLATES_SHOWN)).map((t) => {
                const on = chosenBy.has(`t:${t.id}`);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggleChosen({ key: `t:${t.id}`, name: t.name, type: "ordmall", template: t.id })}
                      aria-pressed={on}
                      className={`relative w-full rounded-2xl border p-1.5 text-left transition-all ${on ? "border-[var(--nw-ink)] ring-1 ring-[var(--nw-ink)]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"}`}
                    >
                      <span className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern för klubben */}
                        <img src={wordmarkUrl({ template: t.id, icon: true, ornament: true }, sample, "light", 480)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[10%]" />
                      </span>
                      <span className="mt-1.5 block truncate px-1 text-[12.5px] font-medium text-[var(--nw-ink)]">{t.name}</span>
                      <span className="block truncate px-1 pb-0.5 text-[11.5px] text-[var(--nw-muted)]">{t.own ? "Egen" : t.style}</span>
                      {on ? (
                        <span className="absolute right-2.5 top-2.5">
                          <Tick on />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {templates.length > TEMPLATES_SHOWN ? (
                <button type="button" onClick={() => setAllTemplates((v) => !v)} className="nw-hit text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
                  {allTemplates ? "Visa färre mallar" : `Visa alla ${templates.length} mallar`}
                </button>
              ) : null}
              <p className="text-[12.5px] text-[var(--nw-muted)]">
                Visas med {byId.get(sample)?.name ?? "en klubb"}.{" "}
                <Link href="/newwave/craft/designa/ordmarken" className="font-medium text-[var(--nw-ink)] underline underline-offset-4">
                  Gör en egen ordmall av en fil
                </Link>
              </p>
            </div>
          </>
        ) : mode === "fil" ? (
          <div
            className={`relative rounded-[22px] border border-dashed p-4 transition-colors sm:p-5 ${drag ? "border-[var(--nw-ink)] bg-[var(--nw-soft)]" : "border-[#cfcfca]"}`}
            onDragEnter={(e) => files(e) && setDrag(true)}
            onDragOver={(e) => {
              if (!files(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDrag(false)}
            onDrop={(e) => {
              if (!files(e)) return;
              e.preventDefault();
              setDrag(false);
              chooseFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid aspect-[4/3] w-full shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--nw-soft)] sm:w-[200px]">
                <span className="px-4 text-center text-[12.5px] text-[var(--nw-muted)]">{file ? file.name : "Släpp en fil här"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-snug text-[var(--nw-muted)]">
                  PNG, JPG, WEBP eller SVG, högst 10 MB. En vit bakgrund blir genomskinlig. Motivet trycks i klubbens färger – mörka partier i den första färgen som syns på plagget, ljusa i den andra – med klubbens märke ovanför.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="nw-btn nw-btn-ghost cursor-pointer">
                    {file ? "Välj en annan fil" : "Välj fil"}
                    <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0])} />
                  </label>
                  {file ? (
                    <>
                      <input value={fileName} onChange={(e) => setFileName(e.target.value)} maxLength={60} placeholder="Designens namn" className="nw-input h-10 w-auto min-w-0 flex-1 sm:max-w-[260px]" />
                      <button type="button" disabled={uploading} onClick={upload} className="nw-btn disabled:opacity-50">
                        {uploading ? "Laddar upp…" : "Ladda upp"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : designs.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {designs.map((d) => {
              const on = chosenBy.has(`d:${d.id}`);
              const img = thumb(d);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => toggleChosen({ key: `d:${d.id}`, name: d.name, type: d.type, template: d.template, designId: d.id, art: d.art })}
                    aria-pressed={on}
                    className={`relative w-full rounded-2xl border p-1.5 text-left transition-all ${on ? "border-[var(--nw-ink)] ring-1 ring-[var(--nw-ink)]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"}`}
                  >
                    <span className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern */}
                      {img ? <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[10%]" /> : null}
                    </span>
                    <span className="mt-1.5 block truncate px-1 text-[12.5px] font-medium text-[var(--nw-ink)]">{d.name}</span>
                    <span className="block truncate px-1 pb-0.5 text-[11.5px] text-[var(--nw-muted)]">
                      {d.type === "fil" ? "Egen fil" : "Ordmall"} · {d.published ? `i ${plural(d.clubs ?? 0, "shop", "shoppar")}` : new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(d.createdAt))}
                    </span>
                    {on ? (
                      <span className="absolute right-2.5 top-2.5">
                        <Tick on />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">Inga sparade designer än. Välj en ordmall eller ladda upp en fil.</p>
        )}

        {chosen.length ? (
          <ul className="mt-4 flex flex-col gap-1.5" aria-label="Valda designer">
            {chosen.map((c) => {
              const saved = c.designId ? designs.find((d) => d.id === c.designId) : undefined;
              const img = thumb(c);
              return (
                <li key={c.key} className="flex items-center gap-2.5 rounded-2xl bg-[var(--nw-soft)] p-1.5 pr-2">
                  <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern */}
                    {img ? <img src={img} alt="" className="absolute inset-0 h-full w-full object-contain p-1" /> : null}
                  </span>
                  {c.designId ? (
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--nw-ink)]">{c.name}</span>
                  ) : (
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Designens namn</span>
                      <input
                        value={c.name}
                        onChange={(e) => setChosen((l) => l.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))}
                        maxLength={60}
                        placeholder="Designens namn"
                        className="h-8 w-full rounded-lg bg-transparent px-1 text-[13.5px] font-medium text-[var(--nw-ink)] outline-none focus:bg-white focus:ring-1 focus:ring-[var(--nw-line)]"
                      />
                    </label>
                  )}
                  <span className="hidden shrink-0 text-[12px] text-[var(--nw-muted)] sm:inline">{c.type === "fil" ? "Egen fil" : "Ordmall"}</span>
                  {saved?.published ? (
                    <button type="button" disabled={removing === saved.id} onClick={() => removeEverywhere(saved)} className="nw-hit shrink-0 text-[12.5px] font-medium text-[#9B1C1C] underline underline-offset-4 disabled:opacity-50">
                      {removing === saved.id ? "Tar bort…" : `Ta bort designen ur alla klubbar (${fmtN(saved.clubs ?? 0)})`}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => toggleChosen(c)} aria-label={`Ta bort ${c.name} ur valet`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--nw-muted)] hover:bg-white hover:text-[var(--nw-ink)]">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {removal ? (
          <p className="mt-2 text-[13px] text-[var(--nw-ink)]" role="status">
            {removal.undone ? `”${removal.name}” är tillbaka i shopparna.` : `”${removal.name}” är borttagen ur ${plural(removal.clubs, "klubbshop", "klubbshoppar")} (${plural(removal.ids.length, "produkt", "produkter")}). Ordrarna som redan gjorts påverkas inte.`}{" "}
            {!removal.undone ? (
              <button
                type="button"
                onClick={() => {
                  const d = designs.find((x) => x.id === removal.designId);
                  if (d) void removeEverywhere(d, removal);
                }}
                className="font-medium underline underline-offset-4"
              >
                Ångra
              </button>
            ) : null}
          </p>
        ) : null}
        {mode === "sparad" && savedInShops.length && !chosen.some((c) => c.designId && savedInShops.some((d) => d.id === c.designId)) ? (
          <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">Välj en sparad design för att ta bort den ur alla klubbars shoppar.</p>
        ) : null}
      </Step>

      <Step n={2} title="Produkterna" sub={`${skus.length ? `${skus.length} valda` : "Välj vad klubbarna ska sälja"} · ${catalogNote}`}>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {products.map((p) => {
            const on = skus.includes(p.sku);
            const stock = stockLabelOf(p);
            return (
              <li key={p.sku}>
                <button
                  type="button"
                  onClick={() => setSkus((s) => (on ? s.filter((x) => x !== p.sku) : [...s, p.sku]))}
                  aria-pressed={on}
                  className={`relative w-full rounded-2xl border p-1.5 text-left transition-all ${on ? "border-[var(--nw-ink)] ring-1 ring-[var(--nw-ink)]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"}`}
                >
                  <span className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                    {p.photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- produktfoto */
                      <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <ScarfIcon />
                    )}
                  </span>
                  <span className="mt-1.5 block truncate px-1 text-[12.5px] font-medium text-[var(--nw-ink)]">{p.name.replace(/^Craft\s+/, "")}</span>
                  <span className="block truncate px-1 pb-0.5 text-[11.5px] text-[var(--nw-muted)]">
                    {p.priceSek} kr · {p.kind === "halsduk" ? "Stickeriet" : p.method}
                  </span>
                  {stock ? <StockNote label={stock} className="block truncate px-1 pb-0.5 text-[11.5px] font-medium" /> : null}
                  {on ? (
                    <span className="absolute right-2.5 top-2.5">
                      <Tick on />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {chosenGarments.length ? (
          <div className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-3 sm:p-4">
            <p className="text-[13.5px] font-medium text-[var(--nw-ink)]">Plaggets färg</p>
            <p className="mt-0.5 text-[12.5px] text-[var(--nw-muted)]">Automatiskt får varje klubb den färg där trycket syns bäst – en svart hoodie med mörkblått tryck blir till exempel vit.</p>
            <ul className="mt-2.5 flex flex-col gap-2">
              {chosenGarments.map((p) => {
                const value = colors[p.sku] ?? "auto";
                const pick = (v: string) => setColors((c) => ({ ...c, [p.sku]: v }));
                // Lagret i hubben för varje färg, när någon storlek är slut eller har få kvar.
                const low = (p.colorOptions ?? []).flatMap((c) => {
                  const label = stockLabelOf(p, c);
                  return label ? [{ name: c.name, label }] : [];
                });
                return (
                  <li key={p.sku} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <span className="w-40 shrink-0 truncate text-[13px] text-[var(--nw-ink)]">{p.name}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Färg på ${p.name}`}>
                        <button type="button" onClick={() => pick("auto")} aria-pressed={value === "auto"} className={chip(value === "auto")}>
                          Automatiskt
                        </button>
                        {(p.colorOptions ?? []).map((c) => (
                          <button key={c.hex} type="button" onClick={() => pick(c.hex)} aria-pressed={value === c.hex} className={`${chip(value === c.hex)} inline-flex items-center gap-1.5`}>
                            <span className="h-3 w-3 rounded-full" style={{ background: c.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)" }} aria-hidden />
                            {c.name}
                          </button>
                        ))}
                        {p.clubColor ? (
                          <button type="button" onClick={() => pick("klubb")} aria-pressed={value === "klubb"} className={chip(value === "klubb")}>
                            Klubbens mörkaste färg
                          </button>
                        ) : null}
                      </div>
                      {low.length ? (
                        <p className="mt-1 text-[12px] text-[var(--nw-muted)]">
                          Lager:{" "}
                          {low.map((l, i) => (
                            <span key={l.name}>
                              {i ? " · " : ""}
                              {l.name} – <StockNote label={{ ...l.label, text: l.label.text.charAt(0).toLowerCase() + l.label.text.slice(1) }} />
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Step>

      <Step
        n={3}
        title="Klubbarna"
        sub={clubs ? `${plural(picked.length, "vald", "valda")} av ${fmtN(clubs.length)} i klubbregistret` : loadError ? "Klubbregistret gick inte att läsa." : "Läser klubbregistret…"}
        aside={
          picked.length ? (
            <button type="button" onClick={() => setPicked([])} className="nw-hit text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
              Rensa valet
            </button>
          ) : null
        }
      >
        <SearchBox value={q} onChange={setQ} placeholder="Sök klubb, ort eller sport" size="md" />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Select label="Sport" value={sport} onChange={setSport} options={sports} all="Alla sporter" />
          <Select
            label="Län"
            value={county}
            onChange={(v) => {
              setCounty(v);
              setMunicipality("");
            }}
            options={counties}
            all="Alla län"
          />
          <Select label="Kommun" value={municipality} onChange={setMunicipality} options={towns} all="Alla kommuner" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[13px] text-[var(--nw-muted)]">
            <span className="font-semibold tabular-nums text-[var(--nw-ink)]">{fmtN(filtered.length)}</span> {filtered.length === 1 ? "klubb" : "klubbar"} i filtret
          </p>
          {picked.length ? (
            <button type="button" onClick={() => setOnlyPicked((v) => !v)} aria-pressed={onlyPicked} className={chip(onlyPicked)}>
              Bara valda
            </button>
          ) : null}
          {filtering ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSport("");
                setCounty("");
                setMunicipality("");
                setOnlyPicked(false);
              }}
              className="nw-chip h-8 px-3 hover:border-[var(--nw-ink)]"
            >
              Rensa filtret
            </button>
          ) : null}
          <button type="button" disabled={!filtered.length} onClick={pickFiltered} className="nw-btn h-8 px-3.5 text-[13px] disabled:opacity-40">
            {allFiltered ? "Avmarkera filtret" : `Välj alla i filtret (${fmtN(filtered.length)})`}
          </button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {filtered.slice(0, limit).map((c) => {
            const on = pickedSet.has(c.id);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => toggleClub(c.id)} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${on ? "border-[var(--nw-ink)] bg-[var(--nw-soft)]" : "border-[var(--nw-line)] hover:border-[#bdbdb8]"}`}>
                  <Crest name={c.name} logo={c.logo} colors={[c.colors[0], c.colors[1] ?? "#FFFFFF"]} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[var(--nw-ink)]">{c.name}</span>
                    <span className="block truncate text-[12px] text-[var(--nw-muted)]">{[c.municipality, c.sport].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Swatches colors={c.colors} />
                  <Tick on={on} />
                </button>
              </li>
            );
          })}
        </ul>
        {filtered.length > limit ? (
          <button type="button" onClick={() => setLimit((n) => n + PAGE * 2)} className="nw-hit mt-3 text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
            Visa fler ({fmtN(filtered.length - limit)} till)
          </button>
        ) : null}
        {clubs && !filtered.length ? <p className="mt-4 text-center text-[14px] text-[var(--nw-muted)]">Inga klubbar matchar.</p> : null}
      </Step>

      <Step
        n={4}
        title="Texterna och fördelningen"
        sub={
          chosen.length > 1
            ? "Klubbar i samma kommun får olika designer så långt det går. Ändra design och texter per klubb."
            : "Ordmallens texter för alla klubbar, och per klubb om någon ska ha ett smeknamn eller en stadsdel."
        }
      >
        {anyWordmark ? (
          <div className="rounded-2xl bg-[var(--nw-soft)] p-3 sm:p-4">
            <p className="text-[13.5px] font-medium text-[var(--nw-ink)]">Ordmallens texter</p>
            <p className="mt-0.5 text-[12.5px] text-[var(--nw-muted)]">
              Huvudraden är mallens stora text, underraden den lilla. Varje variant blir en egen produkt i klubbens shop, t.ex. ”AIK” + ”Solna” och ”AIK” + ”Norra”. Lämna en egen text tom här och skriv den per klubb nedan – klubbar utan text får inte den varianten.
            </p>
            <VariantRows value={variants} onChange={setVariants} sample={sampleFacts} />
          </div>
        ) : chosen.length ? (
          <p className="rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">Texterna går att ändra i ordmallarna; en egen fil trycks som den är.</p>
        ) : null}

        {!chosen.length || !picked.length ? (
          <p className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">{!chosen.length ? "Välj minst en design." : "Välj klubbar för att se fördelningen."}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {perDesign.map(({ c, n }) => (
                <span key={c.key} className="inline-flex h-8 items-center gap-2 rounded-full border border-[var(--nw-line)] pl-1 pr-3 text-[13px] text-[var(--nw-ink)]">
                  <span className="relative h-6 w-8 overflow-hidden rounded-full bg-[var(--nw-soft)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern */}
                    {thumb(c) ? <img src={thumb(c)} alt="" className="absolute inset-0 h-full w-full object-contain p-0.5" /> : null}
                  </span>
                  <span className="max-w-[160px] truncate">{c.name}</span>
                  <span className="tabular-nums text-[var(--nw-muted)]">{fmtN(n)}</span>
                </span>
              ))}
              {Object.keys(fixed).length ? (
                <button type="button" onClick={() => setFixed({})} className="nw-hit ml-1 text-[12.5px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
                  Fördela om automatiskt
                </button>
              ) : null}
            </div>
            {chosen.length > 1 && crowd.length ? (
              <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">
                {crowd
                  .slice(0, 2)
                  .map((x) => `I ${x.municipality} har ${fmtN(x.most)} av ${fmtN(x.clubs)} klubbar samma design`)
                  .join(", ")}
                {crowd.length > 2 ? ` och i ${plural(crowd.length - 2, "kommun", "kommuner")} till` : ""} – kommunen har fler klubbar än det finns designer.
              </p>
            ) : chosen.length > 1 ? (
              <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">Ingen kommun har två klubbar med samma design.</p>
            ) : null}
            <ul className="mt-3 flex flex-col">
              {distRows.slice(0, distLimit).map((id, i, rows) => {
                const c = byId.get(id);
                const town = c?.municipality ?? "";
                const head = i === 0 || (byId.get(rows[i - 1])?.municipality ?? "") !== town;
                const design = chosenBy.get(assigned[id]);
                const labels = resolved(id);
                const own = Boolean(clubVariants[id]);
                const isOpen = open === id;
                return (
                  <li key={id}>
                    {head ? (
                      <p className="mb-1 mt-3 px-1 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[var(--nw-muted)] first:mt-0">
                        {town || "Utan kommun"} · {fmtN(picked.filter((x) => (byId.get(x)?.municipality ?? "") === town).length)}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-2.5 border-b border-[var(--nw-line)] py-2 pl-1">
                      <Crest name={c?.name ?? id} logo={c?.logo} colors={[c?.colors[0] ?? "#111111", c?.colors[1] ?? "#FFFFFF"]} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-[var(--nw-ink)]">{c?.name ?? id}</span>
                        <span className="block truncate text-[12px] text-[var(--nw-muted)]">{labels.map((l) => l.label || "Mallens texter").join(" + ")}</span>
                      </span>
                      {chosen.length > 1 ? (
                        <label className="relative shrink-0">
                          <span className="sr-only">Design för {c?.name ?? id}</span>
                          <select
                            value={assigned[id]}
                            onChange={(e) => setFixed((f) => ({ ...f, [id]: e.target.value }))}
                            className={`h-8 max-w-[150px] appearance-none truncate rounded-full pl-3 pr-8 text-[12.5px] font-medium outline-none focus:ring-2 focus:ring-[var(--club)] sm:max-w-[190px] ${fixed[id] ? "bg-[var(--nw-ink)] text-white" : "bg-[var(--nw-soft)] text-[var(--nw-ink)]"}`}
                          >
                            {chosen.map((x) => (
                              <option key={x.key} value={x.key}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                          <Chevron />
                        </label>
                      ) : null}
                      {design?.type === "ordmall" ? (
                        <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className={`${chip(isOpen || own)} shrink-0`}>
                          Texter{own ? " ✓" : ""}
                        </button>
                      ) : null}
                    </div>
                    {isOpen ? (
                      <div className="mb-2 mt-1 rounded-2xl bg-[var(--nw-soft)] p-3">
                        <p className="text-[12.5px] text-[var(--nw-muted)]">{own ? `Egna texter för ${c?.name ?? id}.` : `Samma texter som kollektionen. Ändra för att ge ${c?.name ?? id} egna varianter.`}</p>
                        <VariantRows value={variantsOf(id)} onChange={(v) => setClubVariants((m) => ({ ...m, [id]: v }))} sample={factsOf(c)} />
                        {own ? (
                          <button
                            type="button"
                            onClick={() =>
                              setClubVariants((m) => {
                                const { [id]: _drop, ...rest } = m;
                                void _drop;
                                return rest;
                              })
                            }
                            className="nw-hit mt-2 text-[12.5px] font-medium text-[var(--nw-ink)] underline underline-offset-4"
                          >
                            Samma texter som kollektionen
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {distRows.length > distLimit ? (
              <button type="button" onClick={() => setDistLimit((n) => n + DIST_PAGE * 2)} className="nw-hit mt-3 text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
                Visa fler ({fmtN(distRows.length - distLimit)} till)
              </button>
            ) : null}
          </>
        )}
      </Step>

      <Step
        n={5}
        title="Förhandsvisning"
        sub={
          picked.length > PREVIEW_MAX
            ? `Visar de ${PREVIEW_MAX} första av ${fmtN(picked.length)} valda – alla ${fmtN(picked.length)} publiceras.`
            : picked.length
              ? "Så blir designen hos varje klubb, i klubbens färger och med klubbens märke."
              : "Välj klubbar för att se designen hos dem."
        }
      >
        {!chosen.length || !skus.length || !picked.length ? (
          <p className="rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">{!chosen.length ? "Välj en design först." : !skus.length ? "Välj minst en produkt." : "Välj minst en klubb."}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {previewClubs.map((id) => {
              const c = byId.get(id);
              const mine = previewItems?.filter((i) => i.clubId === id) ?? null;
              const keys = resolved(id);
              return (
                <li key={id} className="nw-fade min-w-0 rounded-[22px] border border-[var(--nw-line)] p-2.5">
                  <div className="flex items-center gap-2.5 px-1 pb-2.5 pt-1">
                    <Crest name={c?.name ?? id} logo={c?.logo} colors={[c?.colors[0] ?? "#111111", c?.colors[1] ?? "#FFFFFF"]} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-[var(--nw-ink)]">{c?.name ?? id}</span>
                      {chosen.length > 1 ? <span className="block truncate text-[11.5px] text-[var(--nw-muted)]">{chosenBy.get(assigned[id])?.name}</span> : null}
                    </span>
                    {c ? <Swatches colors={c.colors} /> : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {keys.map((k) => {
                      const items: Pick<PreviewItem, "sku" | "title" | "mockupUrl" | "color" | "note">[] = mine ? mine.filter((i) => (i.variant ?? "") === k.key) : skus.map((sku) => ({ sku, title: "", mockupUrl: "" }));
                      return (
                        <div key={k.key}>
                          {keys.length > 1 || k.label ? <p className="mb-1 truncate px-0.5 text-[11.5px] font-medium text-[var(--nw-ink)]">{k.label || "Mallens texter"}</p> : null}
                          <div className="grid grid-cols-3 gap-1.5">
                            {items.map((i) => (
                              <figure key={i.sku} className="min-w-0">
                                <div className="aspect-square overflow-hidden rounded-xl bg-[var(--nw-soft)]">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- mockup ritad av servern */}
                                  {i.mockupUrl ? <img src={small(i.mockupUrl)} alt={i.title} loading="lazy" className="h-full w-full object-contain" /> : null}
                                </div>
                                {i.title ? (
                                  <figcaption className="mt-1 truncate px-0.5 text-[11px] text-[var(--nw-muted)]" title={i.note ?? (i.color ? (i.color.how === "auto" ? `${i.color.name}, vald efter kontrasten mot trycket` : `${i.color.name}, vald av Craft`) : undefined)}>
                                    {(products.find((p) => p.sku === i.sku)?.name ?? i.sku).replace(/^Craft\s+/, "").replace(/^Stickad klubbhalsduk$/, "Halsduk")}
                                    {i.color ? ` · ${i.color.name}` : i.note ? " · klassisk" : ""}
                                  </figcaption>
                                ) : null}
                              </figure>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {classic.length ? (
          <p className="mt-3 text-[12.5px] leading-snug text-[var(--nw-muted)]">
            Halsduken blir klassisk med mallens texter för {plural(classic.length, "klubb", "klubbar")} av {fmtN(previewClubs.length)}: ordmallen går inte att sticka läsbart med deras namn i 120 maskors bredd. {classic[0].note}
          </p>
        ) : null}
      </Step>

      <div className="-mb-5 flex items-start gap-2.5 px-1">
        <button type="button" onClick={() => setContent((v) => !v)} aria-pressed={content} className="flex items-start gap-2.5 text-left">
          <Tick on={content} />
          <span>
            <span className="block text-[13.5px] font-medium text-[var(--nw-ink)]">Skapa innehåll och mejlutkast till klubbarna</span>
            <span className="block text-[12.5px] text-[var(--nw-muted)]">Inlägg till sociala medier och ett mejl per klubb, sparade som utkast. Inget skickas automatiskt.</span>
          </span>
        </button>
      </div>

      <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 overflow-hidden rounded-[24px] border border-[var(--nw-line)] bg-white/90 shadow-[var(--nw-shadow)] backdrop-blur min-[900px]:bottom-4">
        <div className="flex items-center justify-between gap-3 p-2 pl-4 sm:p-3 sm:pl-5">
          <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--nw-muted)] sm:text-[13.5px]" aria-live="polite">
            {busy && run ? (
              <span className="text-[var(--nw-ink)]">
                Publicerar {fmtN(Math.min(doneClubs + BATCH, totalClubs))} av {fmtN(totalClubs)} {totalClubs === 1 ? "klubb" : "klubbar"}…
              </span>
            ) : error ? (
              <span className="text-[#9B1C1C]">{error}</span>
            ) : ready ? (
              `${plural(chosen.length, "design", "designer")} · ${plural(picked.length, "klubb", "klubbar")} = ${plural(productCount, "produkt", "produkter")} i shopparna`
            ) : (
              "Välj designer, produkter och klubbar"
            )}
          </p>
          {run && !busy ? (
            <>
              <button type="button" onClick={() => setRun(null)} className="nw-hit shrink-0 text-[13px] font-medium text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                Avbryt
              </button>
              <button type="button" onClick={() => publish(run)} className="nw-btn shrink-0">
                Fortsätt ({fmtN(totalClubs - doneClubs)} kvar)
              </button>
            </>
          ) : (
            <button type="button" disabled={!ready || busy} onClick={() => publish()} className="nw-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? (
                "Publicerar…"
              ) : (
                <>
                  <span className="sm:hidden">Publicera</span>
                  <span className="hidden sm:inline">Publicera till Intersport</span>
                </>
              )}
            </button>
          )}
        </div>
        {run ? (
          <div className="h-1 bg-[var(--nw-soft)]" role="progressbar" aria-label="Publiceringen" aria-valuemin={0} aria-valuemax={totalClubs} aria-valuenow={doneClubs}>
            <div className="h-full bg-[var(--nw-ink)] transition-[width] duration-500" style={{ width: `${totalClubs ? (doneClubs / totalClubs) * 100 : 0}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScarfIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-1/2 w-1/2 text-[var(--nw-muted)]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
      <path d="M14 10h12v34H14zM38 20h12v34H38zM26 10l12 10M26 44l12-10" />
      <path d="M14 18h12M14 36h12M38 28h12M38 46h12" />
    </svg>
  );
}
