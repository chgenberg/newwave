"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { LogoResult } from "@/lib/logo";
import { nwProduct } from "@/lib/newwave/catalog";
import { BUILDER_STEPS, SHOP_CATALOG, SHOP_PACKS, costPrice, fromPrice, sek, stepsDone, type BuilderStep, type Reseller } from "@/lib/newwave/reseller";
import { call, readDataUrl } from "./api";
import { ResellerShare } from "./ShareShop";
import { ShopPreview } from "./ShopPreview";

type Props = { initial: Reseller; initialStep: BuilderStep; ws: string | null };

const EDITABLE = ["name", "website", "logo", "logoDark", "theme", "texts", "products", "markup"] as const;
const patchOf = (r: Reseller) => Object.fromEntries(EDITABLE.map((k) => [k, r[k]]).filter(([, v]) => v !== undefined));
const same = (a: Reseller, b: Reseller) => JSON.stringify(patchOf(a)) === JSON.stringify(patchOf(b));

/** Finjustering av en byggd butik. Flikarna går att öppna i vilken ordning som helst. */
export function ShopBuilder({ initial, initialStep, ws }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<BuilderStep>(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = !same(draft, saved);
  const done = stepsDone(saved);

  const apply = (r: Reseller) => {
    setSaved(r);
    setDraft(r);
    router.refresh();
  };

  const save = async () => {
    if (!dirty) return true;
    setBusy(true);
    setError("");
    try {
      apply((await call<{ reseller: Reseller }>("/api/v1/newwave/reseller", { action: "save", patch: patchOf(draft) })).reseller);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const go = async (next: BuilderStep) => {
    if (await save()) setStep(next);
  };

  const set = <K extends keyof Reseller>(k: K, v: Reseller[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="nw-page">
      <p className="text-[13px] text-[var(--nw-muted)]">
        <Link href="/newwave/shop/butiken" className="hover:text-[var(--nw-ink)]">
          ← Butiker
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Redigera {saved.texts.shopName || saved.name}</h1>
        <Link href="/newwave/shop/butiken/ny" className="nw-hit text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
          Bygg om från webbplatsen
        </Link>
      </div>

      <div role="tablist" aria-label="Redigera butiken" className="mt-5 flex gap-1 overflow-x-auto border-b border-[var(--nw-line)]">
        {BUILDER_STEPS.map((s) => {
          const on = s.id === step;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(s.id)}
              className={`-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[13.5px] transition-colors ${on ? "border-[var(--club)] font-semibold text-[var(--nw-ink)]" : "border-transparent text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}
            >
              <span className={`grid h-4.5 w-4.5 place-items-center rounded-full text-[10px] font-bold ${done[s.id] ? "bg-[var(--club)] text-white" : "border border-[var(--nw-line)]"}`} aria-hidden>
                {done[s.id] ? "✓" : ""}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0" role="tabpanel">
          {step === "varumarke" ? <BrandStep draft={draft} set={set} /> : null}
          {step === "utseende" ? <LookStep draft={draft} set={set} /> : null}
          {step === "sortiment" ? <RangeStep draft={draft} set={set} /> : null}
          {step === "publicera" ? <PublishStep saved={saved} dirty={dirty} onSaved={apply} ws={ws} /> : null}

          {error ? <p className="mt-4 text-[13px] text-[#B42318]">{error}</p> : null}
          {step !== "publicera" ? (
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--nw-line)] pt-5">
              <button type="button" disabled={busy || !dirty} onClick={save} className="nw-btn nw-club-btn disabled:opacity-50">
                {busy ? "Sparar…" : dirty ? "Spara" : "Allt är sparat"}
              </button>
              {dirty ? (
                <button type="button" onClick={() => setDraft(saved)} className="nw-hit text-[13px] text-[var(--nw-muted)] underline underline-offset-4">
                  Ångra
                </button>
              ) : null}
              {saved.status === "publicerad" && dirty ? <span className="text-[12.5px] text-[var(--nw-faint)]">Butiken är live, så det ni sparar syns direkt.</span> : null}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <ShopPreview shop={draft} />
        </div>
      </div>
    </div>
  );
}

type StepProps = { draft: Reseller; set: <K extends keyof Reseller>(k: K, v: Reseller[K]) => void };

function Section({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">{title}</h2>
      {text ? <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">{text}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function BrandStep({ draft, set }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const logo = await call<LogoResult>("/api/v1/logo", { dataUrl: await readDataUrl(f), name: draft.name });
      set("logo", logo.light);
      set("logoDark", logo.dark);
      if (/^#[0-9A-F]{6}$/i.test(logo.color)) set("theme", { ...draft.theme, primary: logo.color.toUpperCase() });
      setNote("Loggan är uppladdad och märkesfärgen hämtad. Glöm inte att spara.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa loggan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Section title="Logga" text="PNG, JPG eller SVG. Vi tar bort bakgrunden och gör en ljus version till mörka produkter.">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex h-28 items-center justify-center rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-white p-4">
            {draft.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.logo} alt="Logga på ljus botten" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[13px] text-[var(--nw-faint)]">Ingen logga än</span>
            )}
          </div>
          <div className="flex h-28 items-center justify-center rounded-[var(--nw-radius)] bg-[#141414] p-4">
            {draft.logoDark || draft.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.logoDark || draft.logo} alt="Logga på mörk botten" className="max-h-full max-w-full object-contain" />
            ) : null}
          </div>
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Välj loggfil" />
        <button type="button" onClick={() => file.current?.click()} disabled={busy} className="nw-btn nw-btn-ghost mt-3 disabled:opacity-50">
          {busy ? "Laddar upp…" : draft.logo ? "Byt logga" : "Ladda upp loggan"}
        </button>
        {note ? <p className="mt-3 rounded-xl bg-[#DFF5E7] px-4 py-3 text-[13.5px] text-[#17703A]">{note}</p> : null}
        {error ? <p className="mt-3 rounded-xl bg-[#FDECEC] px-4 py-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
      </Section>

      <Section title="Företagsnamn">
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} className="nw-input w-full" maxLength={60} aria-label="Företagsnamn" />
      </Section>

      <Section title="Webbplats" text="Vill ni hämta allt på nytt från webbplatsen? Bygg om butiken på en minut.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={draft.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="foretaget.se" className="nw-input min-w-0 sm:flex-1" aria-label="Webbplats" />
          <Link href="/newwave/shop/butiken/ny" className="nw-btn nw-btn-ghost shrink-0">
            Bygg om
          </Link>
        </div>
      </Section>
    </div>
  );
}

const TEXT_FIELDS: { key: keyof Reseller["texts"]; label: string; max: number; rows?: number }[] = [
  { key: "shopName", label: "Butikens namn", max: 60 },
  { key: "tagline", label: "Kort rad ovanför rubriken", max: 120 },
  { key: "heroTitle", label: "Rubrik", max: 90 },
  { key: "heroText", label: "Ingress", max: 300, rows: 3 },
  { key: "about", label: "Om er", max: 600, rows: 4 },
  { key: "email", label: "E-post", max: 120 },
  { key: "phone", label: "Telefon", max: 40 },
];

const COLORS: { key: keyof Reseller["theme"]; label: string }[] = [
  { key: "primary", label: "Huvudfärg" },
  { key: "accent", label: "Knappar" },
  { key: "background", label: "Bakgrund" },
];

function LookStep({ draft, set }: StepProps) {
  return (
    <div>
      <Section title="Färger" text="Hämtade från loggan. Klicka på en färg för att ändra.">
        <div className="grid grid-cols-3 gap-3">
          {COLORS.map((c) => (
            <label key={c.key} className="block min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-3">
              <span className="relative block h-14 overflow-hidden rounded-xl border border-black/10" style={{ background: draft.theme[c.key] }}>
                <input type="color" value={draft.theme[c.key]} onChange={(e) => set("theme", { ...draft.theme, [c.key]: e.target.value.toUpperCase() })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={c.label} />
              </span>
              <span className="mt-2 block truncate text-[12.5px] font-medium text-[var(--nw-ink)]">{c.label}</span>
              <input
                value={draft.theme[c.key]}
                onChange={(e) => /^#[0-9A-Fa-f]{0,6}$/.test(e.target.value) && set("theme", { ...draft.theme, [c.key]: e.target.value.toUpperCase() })}
                className="mt-0.5 w-full bg-transparent text-[12px] text-[var(--nw-muted)] outline-none"
                aria-label={`${c.label}, hex`}
              />
            </label>
          ))}
        </div>
      </Section>
      <Section title="Texter" text="Allt syns direkt i förhandsvisningen.">
        <div className="flex flex-col gap-3">
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className="block text-[13px] font-medium text-[var(--nw-ink)]">
              {f.label}
              {f.rows ? (
                <textarea value={draft.texts[f.key]} rows={f.rows} maxLength={f.max} onChange={(e) => set("texts", { ...draft.texts, [f.key]: e.target.value })} className="nw-input mt-1.5 w-full resize-y" />
              ) : (
                <input value={draft.texts[f.key]} maxLength={f.max} onChange={(e) => set("texts", { ...draft.texts, [f.key]: e.target.value })} className="nw-input mt-1.5 w-full" />
              )}
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Paketen, påslaget och prislistan: vad kunden betalar, vad New Wave tar och vad som blir kvar. */
export function RangePicker({ products, markup, onChange, catalog = SHOP_CATALOG.map((p) => p.id) }: { products: string[]; markup: number; onChange: (v: { products?: string[]; markup?: number }) => void; catalog?: string[] }) {
  const all = catalog.map(nwProduct).filter((p) => p !== undefined);
  const categories = [...new Set(all.map((p) => p.category))];
  const chosen = new Set(products);
  const toggle = (ids: string[], on: boolean) => onChange({ products: on ? [...new Set([...products, ...ids])] : products.filter((id) => !ids.includes(id)) });
  const rows = all.filter((p) => chosen.has(p.id));
  const packs = SHOP_PACKS.map((p) => ({ ...p, products: p.products.filter((id) => catalog.includes(id)) })).filter((p) => p.products.length);

  return (
    <div>
      <Section title="Börja från ett paket" text="Sortiment som brukar sälja till kundgruppen, med ett påslag som passar. Ändra fritt efteråt.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {packs.map((pk) => {
            const on = sameSet(pk.products, products) && pk.markup === markup;
            return (
              <li key={pk.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ products: pk.products, markup: pk.markup })}
                  className={`flex w-full items-center gap-3 rounded-[var(--nw-radius)] border-2 p-3 text-left transition-colors ${on ? "border-[var(--club)] bg-[var(--club-soft)]" : "border-[var(--nw-line)] hover:border-[var(--nw-ink)]"}`}
                >
                  <span className="flex shrink-0 -space-x-4">
                    {pk.products.slice(0, 2).map((id) => {
                      const p = nwProduct(id);
                      return p ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={id} src={p.photo} alt="" className="h-11 w-11 rounded-xl border-2 border-white bg-[#F4F4F2] object-contain" loading="lazy" />
                      ) : null;
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-tight text-[var(--nw-ink)]">{pk.name}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--nw-muted)]">{pk.text}</span>
                    <span className="mt-0.5 block text-[12px] font-medium text-[var(--nw-ink)]">
                      {pk.products.length} produkter · +{pk.markup} %
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Ert påslag" text="Läggs på New Waves cirkapriser. Kunden ser bara ert pris.">
        <div className="flex items-center gap-4 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4">
          <input type="range" min={-10} max={40} step={1} value={markup} onChange={(e) => onChange({ markup: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--club)]" aria-label="Påslag i procent" />
          <span className="nw-club-heading w-16 shrink-0 text-right text-[22px] text-[var(--club)]">
            {markup > 0 ? "+" : ""}
            {markup} %
          </span>
        </div>
      </Section>

      <Section title={`Prislista (${rows.length} produkter)`} text="Per styck vid 100 st med standardtryck, exkl. moms.">
        {rows.length ? (
          <div className="overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--nw-soft)] text-left text-[12px] text-[var(--nw-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Produkt</th>
                  <th className="px-3 py-2 text-right font-medium">Kunden betalar</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">New Wave</th>
                  <th className="px-3 py-2 text-right font-medium">Ni tjänar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--nw-line)]">
                {rows.map((p) => {
                  const price = fromPrice(p, markup);
                  const cost = costPrice(p);
                  return (
                    <tr key={p.id}>
                      <td className="truncate px-3 py-2 text-[var(--nw-ink)]">{p.name}</td>
                      <td className="px-3 py-2 text-right font-medium text-[var(--nw-ink)]">{sek(price)}</td>
                      <td className="hidden px-3 py-2 text-right text-[var(--nw-muted)] sm:table-cell">{sek(cost)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${price - cost > 0 ? "text-[#17703A]" : "text-[#B42318]"}`}>{sek(price - cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--nw-muted)]">Välj ett paket eller produkter nedan.</p>
        )}
      </Section>

      <details className="group mb-7 rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-semibold text-[var(--nw-ink)] [&::-webkit-details-marker]:hidden">
          Välj produkter själv ({products.length} av {all.length})
          <span aria-hidden className="text-[var(--nw-muted)] transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-6 px-4 pb-4">
          {categories.map((c) => {
            const items = all.filter((p) => p.category === c);
            const every = items.every((p) => chosen.has(p.id));
            return (
              <div key={c}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">{c}</p>
                  <button type="button" onClick={() => toggle(items.map((p) => p.id), !every)} className="nw-hit text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                    {every ? "Ta bort alla" : "Välj alla"}
                  </button>
                </div>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {items.map((p) => {
                    const on = chosen.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle([p.id], !on)}
                          className={`relative block w-full overflow-hidden rounded-2xl border-2 text-left transition-colors ${on ? "border-[var(--club)]" : "border-transparent hover:border-[var(--nw-line)]"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.photo} alt="" className="aspect-square w-full bg-[#F4F4F2] object-contain" loading="lazy" />
                          <span className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${on ? "bg-[var(--club)] text-white" : "border border-[var(--nw-line)] bg-white"}`}>{on ? "✓" : ""}</span>
                          <span className="block truncate px-2 pb-2 pt-1.5 text-[12px] font-medium text-[var(--nw-ink)]">{p.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function RangeStep({ draft, set }: StepProps) {
  return (
    <RangePicker
      products={draft.products}
      markup={draft.markup}
      onChange={(v) => {
        if (v.products) set("products", v.products);
        if (v.markup !== undefined) set("markup", v.markup);
      }}
    />
  );
}

function PublishStep({ saved, dirty, onSaved, ws }: { saved: Reseller; dirty: boolean; onSaved: (r: Reseller) => void; ws: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const live = saved.status === "publicerad";
  const checks = [
    { ok: Boolean(saved.logo), label: "Logga" },
    { ok: Boolean(saved.texts.heroTitle), label: "Rubrik på startsidan" },
    { ok: Boolean(saved.texts.email || saved.texts.phone), label: "Kontaktuppgifter", optional: true },
    { ok: saved.products.length > 0, label: `Produkter (${saved.products.length})` },
  ];
  const ready = checks.every((c) => c.ok || c.optional);

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved((await call<{ reseller: Reseller }>("/api/v1/newwave/reseller", { action: live ? "unpublish" : "publish" })).reseller);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte publicera");
    } finally {
      setBusy(false);
    }
  };

  if (live)
    return (
      <div>
        <Section title="Butiken är live" text="Dela den med kunderna. Varje förfrågan hamnar under Offerter.">
          <ResellerShare shop={saved} ws={ws} />
        </Section>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--nw-line)] pt-5 text-[13px]">
          {confirm ? (
            <>
              <span className="text-[var(--nw-ink)]">Kunderna kommer inte åt butiken förrän ni publicerar igen.</span>
              <button type="button" onClick={toggle} disabled={busy} className="nw-btn nw-btn-ghost disabled:opacity-50">
                {busy ? "Avpublicerar…" : "Ja, avpublicera"}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="nw-hit text-[var(--nw-muted)] underline underline-offset-4">
                Avbryt
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="nw-hit text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
              Avpublicera butiken
            </button>
          )}
        </div>
        {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
      </div>
    );

  return (
    <div>
      <Section title="Klart att publicera?" text="När butiken är publicerad kan era kunder designa och begära offert.">
        <ul className="divide-y divide-[var(--nw-line)] rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-3 text-[14px]">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${c.ok ? "bg-[var(--club)] text-white" : "border border-[var(--nw-line)]"}`}>{c.ok ? "✓" : ""}</span>
              <span className={c.ok ? "text-[var(--nw-ink)]" : "text-[var(--nw-muted)]"}>{c.label}</span>
              {!c.ok ? <span className="ml-auto text-[12px] text-[var(--nw-faint)]">{c.optional ? "Valfritt" : "Saknas"}</span> : null}
            </li>
          ))}
        </ul>
      </Section>
      {dirty ? <p className="mb-4 text-[13px] text-[var(--nw-muted)]">Ni har osparade ändringar – spara dem först.</p> : null}
      <button type="button" onClick={toggle} disabled={busy || !ready || dirty} className="nw-btn nw-club-btn disabled:opacity-40">
        {busy ? "Publicerar…" : "Publicera butiken"}
      </button>
      {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}
