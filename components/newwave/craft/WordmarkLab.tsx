"use client";

import { useCallback, useEffect, useState } from "react";
import { importSvg } from "@/lib/newwave/wordmark/importSvg";
import type { TemplateInput } from "@/lib/newwave/wordmark/schema";
import { type WordmarkVariant, wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { readLogoFile } from "../studio/readLogoFile";
import { Fold } from "./Fold";
import { Toast } from "./SearchBox";
import { WordmarkClubs } from "./WordmarkClubs";
import { WordmarkDetail } from "./WordmarkDetail";
import { WordmarkQueue } from "./WordmarkQueue";

type Stat = { picks: number; orders: number; favorites: number; score: number; weak: boolean };
type Listed = { id: string; name: string; style: string; source: string; stats?: Stat };
type Sort = "fit" | "popular";
type ClubInfo = { prefs: { favorites: string[]; approved?: { at: string; by: string } }; issues: { id: string; level: "fel" | "varning" | "info"; text: string }[] };
export type LabClub = { id: string; name: string };

const tile = (v: WordmarkVariant) => `relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[12px] ${v === "dark" ? "bg-[#1C1C1E]" : "bg-[var(--nw-soft)]"}`;
const IMG = "absolute inset-0 h-full w-full object-contain p-[9%]";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
  return json;
}

/** Med en klubb kommer mallarna i ordning efter hur väl de passar klubbens namn; `popular` sorterar efter klubbarnas val. */
const fetchList = async (club: string | undefined, sort: Sort): Promise<Listed[]> => {
  const q = new URLSearchParams({ ...(club ? { c: club } : {}), ...(sort === "popular" ? { sort } : {}) });
  const res = await fetch(`/api/v1/newwave/wordmark/templates?${q}`);
  const json = (await res.json().catch(() => null)) as { templates: Listed[] } | null;
  return json?.templates ?? [];
};

/** En osparad mall ritad av servern för en klubb. */
function Draft({ template, club, variant }: { template: TemplateInput; club: LabClub; variant: WordmarkVariant }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(template);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    fetch("/api/v1/newwave/wordmark/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: JSON.parse(key), club: club.id, variant }) })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        url = URL.createObjectURL(await r.blob());
        if (live) setSrc(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, club.id, variant]);
  return (
    <figure className="min-w-0">
      <div className={tile(variant)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- osparad mall */}
        {src ? <img src={src} alt={`Förhandsvisning med ${club.name}`} className={IMG} /> : <span className="text-[12px] text-[var(--nw-muted)]">{failed ? "Gick inte att rita" : "Ritar…"}</span>}
      </div>
      <figcaption className="mt-1 truncate text-[12px] text-[var(--nw-muted)]">{club.name}</figcaption>
    </figure>
  );
}

const PRESSED = "nw-chip h-8 px-3 aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white";

/** Val, favoriter och beställningar; de mest valda märks, och de minst valda inbyggda föreslås för utfasning. */
function StatLine({ s, top }: { s?: Stat; top: boolean }) {
  if (!s) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 px-0.5 text-[11.5px] text-[var(--nw-muted)]">
      {top ? <span className="rounded-full bg-[#EEF7F1] px-2 py-0.5 font-medium text-[#1F7A4D]">Populär</span> : null}
      {s.weak ? (
        <span title="Bland de minst valda – byt ut eller ta bort" className="rounded-full bg-[#FFF4E0] px-2 py-0.5 font-medium text-[#8A5300]">
          Lite vald
        </span>
      ) : null}
      <span>
        {s.picks} val · {s.favorites} favoriter · {s.orders} beställda
      </span>
    </p>
  );
}

/** Kontrollerna och klubbens eget godkännande för klubben i fokus. */
function FocusInfo({ club, info }: { club: LabClub; info: ClubInfo | null }) {
  if (!info) return null;
  const issues = info.issues.filter((i) => i.level !== "info");
  return (
    <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 rounded-[14px] bg-[var(--nw-soft)] px-4 py-3 text-[13px]">
      <span className={`font-semibold ${info.prefs.approved ? "text-[#1F7A4D]" : "text-[var(--nw-ink)]"}`}>
        {info.prefs.approved ? `Godkänd av klubben (${info.prefs.approved.by})` : "Inte godkänd av klubben"}
        {info.prefs.favorites.length ? ` · ${info.prefs.favorites.length} favoriter` : ""}
      </span>
      {issues.length ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-0.5">
          {issues.map((i) => (
            <li key={i.id} className={i.level === "fel" ? "text-[#B42318]" : "text-[#8A5300]"}>
              {i.text}
            </li>
          ))}
        </ul>
      ) : (
        <span className="flex-1 text-[var(--nw-muted)]">Inga anmärkningar.</span>
      )}
      <a href={`/newwave/klubbar/${club.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium underline underline-offset-4">
        Klubbens sida ↗
      </a>
    </div>
  );
}

function Variant({ value, onChange }: { value: WordmarkVariant; onChange: (v: WordmarkVariant) => void }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Plaggets färg">
      {(["light", "dark"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className="nw-chip h-8 px-3 aria-pressed:border-[var(--nw-ink)] aria-pressed:bg-[var(--nw-ink)] aria-pressed:text-white">
          {v === "light" ? "Ljust plagg" : "Mörkt plagg"}
        </button>
      ))}
    </div>
  );
}

export function WordmarkLab({ clubs }: { clubs: LabClub[] }) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [variant, setVariant] = useState<WordmarkVariant>("light");
  const [worn, setWorn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [focus, setFocus] = useState<LabClub | null>(null);
  const [sort, setSort] = useState<Sort>("fit");
  const [detail, setDetail] = useState<Listed | null>(null);
  const [info, setInfo] = useState<{ id: string; data: ClubInfo | null } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const load = useCallback(async () => setList(await fetchList(focus?.id, sort)), [focus, sort]);
  useEffect(() => {
    let live = true;
    fetchList(focus?.id, sort).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [focus, sort]);
  useEffect(() => {
    if (!focus) return;
    let live = true;
    fetch(`/api/v1/newwave/wordmark/club/${focus.id}`)
      .then((r) => (r.ok ? (r.json() as Promise<ClubInfo>) : null))
      .then((data) => live && setInfo({ id: focus.id, data }));
    return () => {
      live = false;
    };
  }, [focus]);
  const focusInfo = focus && info?.id === focus.id ? info.data : null;
  const favs = new Set(focusInfo?.prefs.favorites ?? []);
  const topIds = new Set(
    [...(list ?? [])]
      .filter((t) => t.stats)
      .sort((a, b) => b.stats!.score - a.stats!.score)
      .slice(0, 3)
      .map((t) => t.id),
  );
  const pickFocus = (c: LabClub | null) => {
    setFocus(c);
    if (c) window.scrollTo({ top: document.getElementById("nw-wm-gallery")?.offsetTop ?? 0, behavior: "smooth" });
  };

  const save = async (template: TemplateInput, source: "import" | "agent") => {
    const { template: saved } = await post<{ template: Listed }>("/api/v1/newwave/wordmark/templates", { template, source });
    await load();
    setToast(`"${saved.name}" finns nu bland ordmärkena i Designa`);
  };
  const remove = async (t: Listed) => {
    const res = await fetch(`/api/v1/newwave/wordmark/templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      setToast(`"${t.name}" är borttagen`);
    }
  };

  const own = list?.filter((t) => t.source !== "inbyggd") ?? [];
  const spec = (template: string) => ({ template, icon: true, ornament: true, worn });
  return (
    <div className="mt-6 flex flex-col gap-3">
      <Fold title="Lägg till mall från Illustrator" summary="SVG">
        <ImportPanel clubs={clubs} variant={variant} onSave={(t) => save(t, "import")} />
      </Fold>
      <Fold title="Inspirationsbank" summary="AI">
        <AgentPanel clubs={clubs} variant={variant} onSave={(t) => save(t, "agent")} />
      </Fold>
      <Fold title="Granskningskö" summary="Kontroller per klubb">
        <WordmarkQueue onFocus={pickFocus} />
      </Fold>

      <WordmarkClubs value={focus} onPick={setFocus} />

      <section id="nw-wm-gallery" className="mt-5 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[var(--nw-ink)]">{focus ? `Alla ordmärken för ${focus.name}` : "Alla ordmärken"}</h2>
            <p className="text-[13px] text-[var(--nw-muted)]">
              {list ? `${list.length} mallar${own.length ? `, varav ${own.length} egna` : ""}` : "Hämtar…"} ·{" "}
              {focus ? "bäst passande först, med klubbens namn, färger och märke" : "visas med ett kort, ett mellanlångt och ett långt namn"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {focus ? (
              <button type="button" onClick={() => setFocus(null)} className="nw-chip h-8 px-3">
                Visa exempelklubbarna
              </button>
            ) : null}
            <div className="flex gap-1.5" role="group" aria-label="Ordning">
              <button type="button" aria-pressed={sort === "fit"} onClick={() => setSort("fit")} className={PRESSED}>
                {focus ? "Bäst passform" : "Standard"}
              </button>
              <button type="button" aria-pressed={sort === "popular"} onClick={() => setSort("popular")} className={PRESSED}>
                Populärast
              </button>
            </div>
            <Variant value={variant} onChange={setVariant} />
            <button type="button" aria-pressed={worn} onClick={() => setWorn((w) => !w)} className={PRESSED}>
              Slitet tryck
            </button>
          </div>
        </div>
        {focus ? <FocusInfo club={focus} info={focusInfo} /> : null}
        {focus ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
            {(list ?? []).map((t) => (
              <li key={t.id} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-2">
                <button type="button" onClick={() => setDetail(t)} aria-label={`${t.name}: tryckfiler, pris och digitalt`} className={`${tile(variant)} w-full`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                  <img src={wordmarkUrl(spec(t.id), focus.id, variant, 480)} alt={`${t.name} med ${focus.name}`} loading="lazy" className={IMG} />
                  {favs.has(t.id) ? <span className="absolute right-1.5 top-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#C8102E]">♥ Klubbens favorit</span> : null}
                </button>
                <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
                  <p className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--nw-ink)]">
                    {t.name} <span className="font-normal text-[var(--nw-muted)]">· {t.style}</span>
                  </p>
                  <span className="flex shrink-0 gap-2.5 text-[12px]">
                    <button type="button" onClick={() => setDetail(t)} className="text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                      Tryckfiler
                    </button>
                    <a href={wordmarkUrl(spec(t.id), focus.id, variant, 3543)} download={`${focus.id}-${t.id}-${variant === "dark" ? "morkt" : "ljust"}${worn ? "-slitet" : ""}.png`} className="text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                      PNG
                    </a>
                  </span>
                </div>
                <StatLine s={t.stats} top={topIds.has(t.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
            {(list ?? []).map((t) => (
              <li key={t.id} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[14px] font-semibold text-[var(--nw-ink)]">
                    {t.name} <span className="font-normal text-[var(--nw-muted)]">· {t.style}</span>
                    {t.source !== "inbyggd" ? <span className="ml-2 rounded-full bg-[var(--nw-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--nw-muted)]">{t.source === "agent" ? "Från agenten" : "Importerad"}</span> : null}
                  </p>
                  <StatLine s={t.stats} top={topIds.has(t.id)} />
                  {t.source !== "inbyggd" ? (
                    <button type="button" onClick={() => void remove(t)} className="shrink-0 text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                      Ta bort
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {clubs.map((c) => (
                    <figure key={c.id} className="min-w-0">
                      <div className={tile(variant)}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                        <img src={wordmarkUrl(spec(t.id), c.id, variant, 480)} alt={`${t.name} med ${c.name}`} loading="lazy" className={IMG} />
                      </div>
                      <figcaption className="mt-1 truncate text-[12px] text-[var(--nw-muted)]">{c.name}</figcaption>
                    </figure>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {detail && focus ? <WordmarkDetail spec={spec(detail.id)} name={detail.name} club={focus} onClose={closeDetail} /> : null}
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

const GUIDE = [
  "Skriv texten med levande text – konvertera den inte till banor. Typsnittet får vara vilket som helst; vi väljer ett licensierat i samma stil.",
  "Lägg Namn 1 (t.ex. MIAMI) i ett lager som heter name1 och Namn 2 (Dolphins) i name2. Raden \"Sedan 1919\" kan heta tagline, sporten sport och grundandeåret year.",
  "Rutband, ränder och annan dekor i ett lager som heter ornament. Rita en platshållare för klubbmärket i ett lager som heter icon.",
  "Färglägg med klubbens färger. Vill du styra vilken som är vilken: lägg två små rutor som heter primary och secondary – de ritas inte.",
  "Text på en böjd bana blir en båge och fortsätter böja sig för längre och kortare namn.",
  "Arkiv → Exportera → Exportera som → SVG. Välj Teckensnitt: SVG och Objekt-ID: Lagernamn.",
];

function ImportPanel({ clubs, variant, onSave }: { clubs: LabClub[]; variant: WordmarkVariant; onSave: (t: TemplateInput) => Promise<void> }) {
  const [draft, setDraft] = useState<{ template: TemplateInput; notes: string[]; sample: string } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setDraft(null);
    try {
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") throw new Error(/\.ai$/i.test(file.name) ? "AI-filer går inte att läsa direkt – exportera som SVG enligt guiden." : "Välj en SVG-fil.");
      const r = await importSvg(await file.text(), file.name);
      setDraft({ template: r.template, notes: r.notes, sample: [r.sample.name1, r.sample.name2].filter(Boolean).join(" · ") });
      setName(r.template.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa filen.");
    }
  };
  const keep = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ ...draft.template, name: name.trim().slice(0, 40) || draft.template.name });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold text-[var(--nw-ink)]">Så exporterar du från Illustrator</p>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] leading-snug text-[var(--nw-muted)]">
          {GUIDE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
      </div>
      <label className="nw-chip h-10 w-fit cursor-pointer border-dashed px-4 hover:border-[var(--nw-ink)]">
        <input type="file" accept=".svg,image/svg+xml,.ai" className="sr-only" onChange={(e) => void read(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        Välj SVG-fil
      </label>
      {error ? <p className="text-[13.5px] text-[#B42318]">{error}</p> : null}
      {draft ? (
        <div className="nw-fade flex flex-col gap-3">
          <p className="text-[13px] text-[var(--nw-muted)]">
            {draft.template.layers.length} lager{draft.sample ? ` · i filen: ${draft.sample}` : ""}
          </p>
          {draft.notes.length ? (
            <ul className="flex flex-col gap-1 text-[13px] text-[#8A5300]">
              {draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            {clubs.map((c) => (
              <Draft key={c.id} template={draft.template} club={c} variant={variant} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Mallens namn" className="nw-input h-10 w-[220px]" />
            <button type="button" disabled={busy} onClick={() => void keep()} className="nw-btn h-10 disabled:opacity-50">
              {busy ? "Sparar…" : "Lägg till mall"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="nw-btn nw-btn-ghost h-10">
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgentPanel({ clubs, variant, onSave }: { clubs: LabClub[]; variant: WordmarkVariant; onSave: (t: TemplateInput) => Promise<void> }) {
  const [refs, setRefs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [proposals, setProposals] = useState<TemplateInput[]>([]);
  const [sketchClub, setSketchClub] = useState(clubs[0]?.id ?? "");
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "agent" | "sketch">("");
  const [error, setError] = useState("");

  const add = async (files: FileList | null) => {
    setError("");
    try {
      const read = await Promise.all([...(files ?? [])].slice(0, 3 - refs.length).map(readLogoFile));
      setRefs((r) => [...r, ...read].slice(0, 3));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa bilden.");
    }
  };
  const propose = async (popular = false) => {
    setBusy("agent");
    setError("");
    try {
      const { templates } = await post<{ templates: TemplateInput[] }>("/api/v1/newwave/wordmark/agent", { images: popular ? [] : refs, note: note.trim() || undefined, ...(popular ? { popular: true } : {}) });
      setProposals(templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ta fram förslag.");
    } finally {
      setBusy("");
    }
  };
  const draw = async () => {
    setBusy("sketch");
    setError("");
    try {
      const { url } = await post<{ url: string }>("/api/v1/newwave/wordmark/sketch", { image: refs[0], club: sketchClub, note: note.trim() || undefined });
      setSketch(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skissa.");
    } finally {
      setBusy("");
    }
  };
  const takeSketch = async (url: string) => {
    const blob = await (await fetch(url)).blob();
    const data = await readLogoFile(new File([blob], "skiss.png", { type: blob.type || "image/png" }));
    setRefs((r) => [...r, data].slice(0, 3));
  };
  const accept = async (t: TemplateInput) => {
    setError("");
    try {
      await onSave(t);
      setProposals((p) => p.filter((x) => x !== t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-snug text-[var(--nw-muted)]">
        Ladda upp upp till tre ordmärken ni gillar. Mallagenten läser kompositionen – placering, typsnittsstil, bågar och ornament – och föreslår nya mallar som ritas exakt och går att trycka. Inget sparas förrän ni lägger till det.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {refs.map((r, i) => (
          <span key={i} className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-[12px] bg-[var(--nw-soft)] p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- uppladdad referens */}
            <img src={r} alt={`Referens ${i + 1}`} className="max-h-full max-w-full object-contain" />
            <button type="button" aria-label={`Ta bort referens ${i + 1}`} onClick={() => setRefs((x) => x.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-[14px] text-[var(--nw-ink)] shadow">
              ×
            </button>
          </span>
        ))}
        {refs.length < 3 ? (
          <label className="nw-chip h-20 w-20 cursor-pointer justify-center border-dashed text-center text-[12.5px] leading-tight hover:border-[var(--nw-ink)]">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="sr-only" onChange={(e) => void add(e.target.files).finally(() => (e.target.value = ""))} />+ Referens
          </label>
        ) : null}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Önskemål, t.ex. mer retro, inget märke, två rader" aria-label="Önskemål till agenten" className="nw-input h-10" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!refs.length || Boolean(busy)} onClick={() => void propose()} className="nw-btn h-10 disabled:opacity-50">
          {busy === "agent" ? "Agenten tittar…" : "Föreslå mallar"}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void propose(true)} title="Utan referenser: nya varianter av de mallar klubbarna väljer mest" className="nw-btn nw-btn-ghost h-10 disabled:opacity-50">
          Fler som de populäraste
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--nw-line)]" aria-hidden />
        <select value={sketchClub} onChange={(e) => setSketchClub(e.target.value)} aria-label="Klubb för skissen" className="nw-input h-10 w-auto pr-8">
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!refs.length || Boolean(busy)} onClick={() => void draw()} className="nw-btn nw-btn-ghost h-10 disabled:opacity-50">
          {busy === "sketch" ? "Skissar…" : "Skissa med AI"}
        </button>
      </div>
      {error ? <p className="text-[13.5px] text-[#B42318]">{error}</p> : null}

      {proposals.map((t, i) => (
        <div key={`${t.id}-${i}`} className="nw-fade rounded-[14px] border border-[var(--nw-line)] p-3">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-[var(--nw-ink)]">
              {t.name} <span className="font-normal text-[var(--nw-muted)]">· förslag från agenten</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void accept(t)} className="nw-btn h-9 px-4 text-[13px]">
                Lägg till
              </button>
              <button type="button" onClick={() => setProposals((p) => p.filter((x) => x !== t))} className="nw-btn nw-btn-ghost h-9 px-4 text-[13px]">
                Skippa
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {clubs.map((c) => (
              <Draft key={c.id} template={t} club={c} variant={variant} />
            ))}
          </div>
        </div>
      ))}

      {sketch ? (
        <figure className="nw-fade w-full max-w-[360px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- AI-skiss */}
          <img src={sketch} alt="AI-skiss av ett ordmärke" className="w-full rounded-[14px] bg-[var(--nw-soft)]" />
          <figcaption className="mt-1.5 text-[12.5px] text-[var(--nw-muted)]">Inspiration – inte för tryck. Gillar ni den? Låt mallagenten göra en tryckbar mall av den.</figcaption>
          {refs.length < 3 ? (
            <button type="button" onClick={() => void takeSketch(sketch)} className="nw-btn nw-btn-ghost mt-2 h-9 px-4 text-[13px]">
              Använd som referens
            </button>
          ) : null}
        </figure>
      ) : null}
    </div>
  );
}
