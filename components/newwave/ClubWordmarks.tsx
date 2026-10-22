"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";

type Issue = { id: string; level: "fel" | "varning" | "info"; text: string; fix: string };
type Prefs = { colors?: string[]; names?: { name1?: string; name2?: string }; favorites: string[]; approved?: { at: string; by: string }; updatedAt?: string };
type Loaded = { club: { id: string; name: string; logo?: string; colors: string[]; founded?: number; names: { name1: string; name2: string } }; prefs: Prefs; issues: Issue[] };
type Listed = { id: string; name: string; style: string };

const SHOWN = 12;
const MAX_FAV = 12;
const dateFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" });

async function put(clubId: string, body: unknown): Promise<{ prefs: Prefs; issues: Issue[] }> {
  const res = await fetch(`/api/v1/newwave/wordmark/club/${clubId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Kunde inte spara.");
  return json;
}

/**
 * Klubbens egna ordmärken: rätta namn och färger, välj favoriter och godkänn att Craft trycker dem. Det klubben
 * rättar gäller överallt där klubbens ordmärken ritas; ändras något efter godkännandet behöver det godkännas igen.
 */
export function ClubWordmarks({ clubId, colorsHref }: { clubId: string; colorsHref?: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [list, setList] = useState<Listed[]>([]);
  const [names, setNames] = useState({ name1: "", name2: "" });
  const [colors, setColors] = useState<string[]>([]);
  const [by, setBy] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const [club, templates] = await Promise.all([
      fetch(`/api/v1/newwave/wordmark/club/${clubId}`).then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null)),
      fetch(`/api/v1/newwave/wordmark/templates?c=${clubId}`).then((r) => (r.ok ? r.json() : { templates: [] })),
    ]);
    return { club, templates: (templates.templates ?? []) as Listed[] };
  }, [clubId]);

  useEffect(() => {
    let live = true;
    load().then(({ club, templates }) => {
      if (!live || !club) return;
      setData(club);
      setList(templates);
      setNames({ name1: club.prefs.names?.name1 ?? "", name2: club.prefs.names?.name2 ?? "" });
      setColors(club.prefs.colors ?? club.club.colors.slice(0, 4));
    });
    return () => {
      live = false;
    };
  }, [load]);

  if (!data) return <p className="mt-4 text-[14px] text-[var(--nw-muted)]">Hämtar ordmärkena…</p>;
  const { club, prefs } = data;
  const version = encodeURIComponent(prefs.updatedAt ?? "");
  const favs = new Set(prefs.favorites);
  const shown = [...list.filter((t) => favs.has(t.id)), ...list.filter((t) => !favs.has(t.id))].slice(0, Math.max(SHOWN, favs.size));

  const save = async (body: unknown, done: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await put(clubId, body);
      setData({ ...data, prefs: r.prefs, issues: r.issues });
      setMsg(done);
      // Sidan runt omkring (förhandsvisningar och mockups) ritas om med det klubben rättat.
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  };
  const toggleFav = (id: string) => {
    const next = favs.has(id) ? prefs.favorites.filter((f) => f !== id) : [...prefs.favorites, id].slice(-MAX_FAV);
    void save({ favorites: next }, favs.has(id) ? "Borttagen från favoriterna" : "Sparad som favorit");
  };
  const ownColors = Boolean(prefs.colors);
  const colorsChanged = colors.length > 0 && JSON.stringify(colors) !== JSON.stringify(prefs.colors ?? club.colors.slice(0, 4));
  const issues = data.issues.filter((i) => i.level !== "info");

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--nw-radius)] border p-4 ${prefs.approved ? "border-[#1F7A4D]/30 bg-[#EEF7F1]" : "border-[var(--nw-line)] bg-white"}`}>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--nw-ink)]">{prefs.approved ? "Godkänt för tryck" : "Inte godkänt än"}</p>
          <p className="text-[13.5px] text-[var(--nw-muted)]">
            {prefs.approved
              ? `${prefs.approved.by} godkände ${dateFmt.format(new Date(prefs.approved.at))}. Ändrar ni namn eller färger behöver det godkännas igen.`
              : "Kontrollera namnet och färgerna, välj favoriter och godkänn – sedan kan Craft trycka."}
          </p>
        </div>
        {prefs.approved ? (
          <button type="button" disabled={busy} onClick={() => void save({ approve: null }, "Godkännandet är återkallat")} className="nw-btn nw-btn-ghost h-9 px-4 text-[13px]">
            Återkalla
          </button>
        ) : null}
      </div>

      {issues.length ? (
        <section>
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Titta på det här</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {issues.map((i) => (
              <li key={i.id} className="rounded-[12px] bg-[var(--nw-soft)] px-3 py-2 text-[13.5px]">
                <span className={i.level === "fel" ? "font-semibold text-[#B42318]" : "font-semibold text-[#8A5300]"}>{i.level === "fel" ? "Måste rättas" : "Kontrollera"}:</span> <span className="text-[var(--nw-ink)]">{i.text}</span>{" "}
                <span className="text-[var(--nw-muted)]">{i.fix}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-5 min-[760px]:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Namnet</h3>
          <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">Namn 1 är förkortningen eller första ordet, Namn 2 huvudnamnet. Tomt = som vi delar det.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--nw-muted)]">
              Namn 1
              <input value={names.name1} maxLength={30} placeholder={club.names.name1 || "—"} onChange={(e) => setNames((n) => ({ ...n, name1: e.target.value }))} className="nw-input h-10" />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-[var(--nw-muted)]">
              Namn 2
              <input value={names.name2} maxLength={30} placeholder={club.names.name2 || "—"} onChange={(e) => setNames((n) => ({ ...n, name2: e.target.value }))} className="nw-input h-10" />
            </label>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Färgerna</h3>
          {colorsHref ? (
            <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">
              Ordmärkena följer klubbens färger under{" "}
              <Link href={colorsHref} className="underline underline-offset-4">
                Varumärke
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">Första färgen är huvudfärgen – tröjans färg. {ownColors ? "Ni har rättat färgerna." : "Hämtade från er webbplats."}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {colors.map((c, i) => (
                  <span key={i} className="relative">
                    <input type="color" value={c} aria-label={`Färg ${i + 1}`} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} className="h-10 w-12 cursor-pointer rounded-[10px] border border-[var(--nw-line)] bg-white p-1" />
                    {colors.length > 1 ? (
                      <button type="button" aria-label={`Ta bort färg ${i + 1}`} onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[12px] shadow">
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
                {colors.length < 4 ? (
                  <button type="button" onClick={() => setColors((cs) => [...cs, "#111111"])} className="nw-chip h-10 px-3">
                    + Färg
                  </button>
                ) : null}
                {ownColors ? (
                  <button type="button" disabled={busy} onClick={() => void save({ colors: null }, "Färgerna är återställda").then(() => setColors(club.colors.slice(0, 4)))} className="text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4">
                    Återställ
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 min-[760px]:col-span-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ names: names.name1 || names.name2 ? names : null, ...(colorsHref || !colorsChanged ? {} : { colors }) }, "Rättelserna är sparade")}
            className="nw-btn h-10 disabled:opacity-50"
          >
            Spara rättelser
          </button>
          {msg ? (
            <p role="status" className="text-[13px] text-[var(--nw-muted)]">
              {msg}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Välj favoriter</h3>
        <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">Hjärtmarkera de ni gillar – Craft börjar med dem. {favs.size ? `${favs.size} valda.` : ""}</p>
        <ul className="mt-3 grid grid-cols-2 gap-2.5 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {shown.map((t) => (
            <li key={t.id} className="min-w-0">
              <button type="button" aria-pressed={favs.has(t.id)} onClick={() => toggleFav(t.id)} disabled={busy} className="group relative block w-full rounded-[14px] border border-[var(--nw-line)] bg-white p-1.5 text-left aria-pressed:border-[var(--nw-ink)]">
                <span className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] bg-[var(--nw-soft)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                  <img src={`${wordmarkUrl({ template: t.id, icon: true, ornament: true }, clubId, "light", 480)}&u=${version}`} alt={`${t.name} med ${club.name}`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[9%]" />
                </span>
                <span className="mt-1 flex items-center justify-between gap-2 px-1 text-[12.5px]">
                  <span className="truncate font-medium text-[var(--nw-ink)]">{t.name}</span>
                  <span aria-hidden className={favs.has(t.id) ? "text-[#C8102E]" : "text-[var(--nw-muted)] group-hover:text-[var(--nw-ink)]"}>
                    {favs.has(t.id) ? "♥" : "♡"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!prefs.approved ? (
        <section className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-4">
          <h3 className="text-[15px] font-semibold text-[var(--nw-ink)]">Godkänn</h3>
          <label className="mt-2 flex items-start gap-2 text-[13.5px] text-[var(--nw-ink)]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            Vi godkänner att Craft och New Wave trycker {genitive(club.name)} namn, märke och färger i de här ordmärkena på klubbens produkter.
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={60} placeholder="Ert namn och roll, t.ex. Anna, kansliet" aria-label="Ert namn och roll" className="nw-input h-10 w-[280px] max-w-full" />
            <button type="button" disabled={busy || !agree || by.trim().length < 2} onClick={() => void save({ approve: { by: by.trim() } }, "Tack! Ordmärkena är godkända.")} className="nw-btn h-10 disabled:opacity-50">
              Godkänn ordmärkena
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
