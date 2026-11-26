"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * "Replikera förra säsongen": en tidigare publicerad design förs över till den nya säsongen som en ny design – samma
 * mall eller en ny – till samma klubbar och produkter. Designen skapas och publiceras med klubbkollektionens routes
 * (POST /api/v1/craft/designs och /api/v1/craft/designs/[id]/publish, i omgångar om 250 klubbar). "Planera" sparar i
 * stället en plan som publiceras när dagen kommer.
 */

export type ReplicateSeason = { id: string; key: string; label: string; date: string; name: string; template: string };
export type ReplicateSource = { id: string; name: string; type: "ordmall" | "fil"; template?: string; clubIds: string[]; skus: string[]; season?: string };

const SAME = "samma";
const BATCH = 250;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
  return json;
}

const chip = (on: boolean) => `nw-chip h-8 px-3 ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "hover:border-[var(--nw-ink)]"}`;
const select = "h-10 w-full appearance-none truncate rounded-full bg-[var(--nw-soft)] pl-4 pr-9 text-[14px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]";

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Replicate({ season, sources, templates, products, today }: { season: ReplicateSeason; sources: ReplicateSource[]; templates: { id: string; name: string }[]; products: { sku: string; name: string }[]; today: string }) {
  const router = useRouter();
  // Förra säsongens design med samma säsong om det finns en, annars den senast publicerade.
  const first = sources.find((s) => s.season?.startsWith(`${season.key}-`) && s.season !== season.id) ?? sources[0];
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(first?.id ?? "");
  const source = sources.find((s) => s.id === sourceId);
  const [template, setTemplate] = useState(SAME);
  const [skus, setSkus] = useState<string[]>(first?.skus ?? []);
  const [name, setName] = useState(season.name);
  const [date, setDate] = useState(season.date > today ? season.date : today);
  const [content, setContent] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ text: string; shop?: string } | null>(null);

  const templateName = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);
  if (!sources.length) return null;

  const pick = (id: string) => {
    setSourceId(id);
    setSkus(sources.find((s) => s.id === id)?.skus ?? []);
  };

  /** Den nya designen, med klubbkollektionens route. Samma uppladdade fil laddas upp igen som en ny design. */
  const createDesign = async (): Promise<string> => {
    if (!source) throw new Error("Välj förra säsongens design.");
    const title = name.trim().slice(0, 60) || season.name;
    if (template === SAME && source.type === "fil") {
      const art = await fetch(`/api/v1/craft/designs/${source.id}/art`);
      if (!art.ok) throw new Error("Förra designens fil gick inte att hämta.");
      const form = new FormData();
      form.set("name", title);
      form.set("file", new File([await art.blob()], "design.png", { type: "image/png" }));
      const res = await fetch("/api/v1/craft/designs", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { design?: { id: string }; error?: string };
      if (!res.ok || !json.design) throw new Error(json.error ?? "Kunde inte skapa designen.");
      return json.design.id;
    }
    const made = await post<{ design: { id: string } }>("/api/v1/craft/designs", { name: title, template: template === SAME ? source.template : template });
    return made.design.id;
  };

  const run = async (now: boolean) => {
    if (!source || !skus.length) return;
    setError("");
    setDone(null);
    try {
      setBusy("Skapar designen…");
      const designId = await createDesign();
      const clubIds = source.clubIds;
      if (!now) {
        await post("/api/v1/craft/sasong", { season: season.id, designId, sourceDesignId: source.id, clubIds, skus, runAt: new Date(`${date}T06:00:00`).toISOString(), content });
        setDone({ text: `”${name}” är planerad till ${date} för ${clubIds.length} ${clubIds.length === 1 ? "klubb" : "klubbar"}.` });
      } else {
        let published = 0;
        let drafts = 0;
        const okClubs: string[] = [];
        for (let i = 0; i < clubIds.length; i += BATCH) {
          setBusy(`Publicerar… ${Math.min(i + BATCH, clubIds.length)} av ${clubIds.length} klubbar`);
          const res = await post<{ published: number; clubIds: string[] }>(`/api/v1/craft/designs/${designId}/publish`, { clubIds: clubIds.slice(i, i + BATCH), skus });
          published += res.published;
          okClubs.push(...res.clubIds);
          if (content && res.clubIds.length) drafts += (await post<{ drafts: number }>("/api/v1/craft/innehall", { designId, clubIds: res.clubIds, season: season.id })).drafts;
        }
        await post("/api/v1/craft/sasong", { season: season.id, designId, sourceDesignId: source.id, clubIds, skus, runAt: new Date().toISOString(), content, done: { published, clubs: okClubs.length, drafts } });
        setDone({ text: `”${name}” är publicerad: ${published} produkter i ${okClubs.length} klubbshoppar${content ? `, ${drafts} mejlutkast` : ""}.`, shop: okClubs[0] ? `/intersport/${okClubs[0]}` : undefined });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel.");
    } finally {
      setBusy("");
    }
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="nw-btn nw-btn-ghost">
        Replikera förra säsongen
      </button>
    );

  return (
    <div className="w-full rounded-[22px] border border-[var(--nw-line)] p-3 sm:p-4">
      <p className="text-[14px] font-semibold text-[var(--nw-ink)]">Replikera förra säsongen till {season.label.toLocaleLowerCase("sv-SE")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-[12.5px] text-[var(--nw-muted)]">Förra säsongens design</span>
          <span className="relative mt-1 block">
            <select value={sourceId} onChange={(e) => pick(e.target.value)} className={select}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.clubIds.length} {s.clubIds.length === 1 ? "klubb" : "klubbar"}
                </option>
              ))}
            </select>
            <Chevron />
          </span>
        </label>
        <label className="block min-w-0">
          <span className="text-[12.5px] text-[var(--nw-muted)]">Ny design</span>
          <span className="relative mt-1 block">
            <select value={template} onChange={(e) => setTemplate(e.target.value)} className={select}>
              <option value={SAME}>Samma som förra{source?.template ? ` (${templateName.get(source.template) ?? source.template})` : source?.type === "fil" ? " (uppladdad fil)" : ""}</option>
              <option value={season.template}>Säsongens förslag: {templateName.get(season.template) ?? season.template}</option>
              {templates
                .filter((t) => t.id !== season.template)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <Chevron />
          </span>
        </label>
        <label className="block min-w-0">
          <span className="text-[12.5px] text-[var(--nw-muted)]">Namn</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="nw-input mt-1 h-10 w-full" />
        </label>
        <label className="block min-w-0">
          <span className="text-[12.5px] text-[var(--nw-muted)]">Publiceras</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="nw-input mt-1 h-10 w-full" />
        </label>
      </div>
      <p className="mt-3 text-[12.5px] text-[var(--nw-muted)]">Produkter</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {products.map((p) => {
          const on = skus.includes(p.sku);
          return (
            <button key={p.sku} type="button" aria-pressed={on} onClick={() => setSkus((s) => (on ? s.filter((x) => x !== p.sku) : [...s, p.sku]))} className={chip(on)}>
              {p.name}
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13.5px] text-[var(--nw-ink)]">
        <input type="checkbox" checked={content} onChange={(e) => setContent(e.target.checked)} className="h-4 w-4 accent-[var(--nw-ink)]" />
        Skapa innehåll och mejlutkast till klubbarna
      </label>
      <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">
        {source ? `${source.clubIds.length} ${source.clubIds.length === 1 ? "klubb" : "klubbar"} från ”${source.name}”.` : ""} Varje klubb får designen med sitt namn, sina färger och sitt märke.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy || !skus.length || !source} onClick={() => run(true)} className="nw-btn disabled:opacity-40">
          Publicera nu
        </button>
        <button type="button" disabled={!!busy || !skus.length || !source || !date} onClick={() => run(false)} className="nw-btn nw-btn-ghost disabled:opacity-40">
          Planera till {date}
        </button>
        <button type="button" disabled={!!busy} onClick={() => setOpen(false)} className="nw-btn nw-btn-ghost disabled:opacity-40">
          Stäng
        </button>
      </div>
      {busy ? (
        <p role="status" className="mt-2 text-[13px] text-[var(--nw-muted)]">
          {busy}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-[#9B1C1C]">{error}</p> : null}
      {done ? (
        <p role="status" className="mt-2 text-[13px] text-[#1E6B34]">
          {done.text}{" "}
          {done.shop ? (
            <a href={done.shop} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
              Öppna en shop
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
