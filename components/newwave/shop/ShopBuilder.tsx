"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LogoResult } from "@/lib/logo";
import { BUILDER_STEPS, SHOP_CATALOG, exVat, fromPrice, sek, shopUrl, stepsDone, type BuilderStep, type Reseller } from "@/lib/newwave/reseller";
import { call, readDataUrl } from "./api";
import { ShopFrame, ShopHome } from "./Storefront";

type Props = { initial: Reseller; initialStep: BuilderStep };

const EDITABLE = ["name", "website", "logo", "logoDark", "theme", "texts", "products", "markup"] as const;
const patchOf = (r: Reseller) => Object.fromEntries(EDITABLE.map((k) => [k, r[k]]).filter(([, v]) => v !== undefined));
const same = (a: Reseller, b: Reseller) => JSON.stringify(patchOf(a)) === JSON.stringify(patchOf(b));

export function ShopBuilder({ initial, initialStep }: Props) {
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
    if (await save()) {
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const index = BUILDER_STEPS.findIndex((s) => s.id === step);
  const nextStep = BUILDER_STEPS[index + 1]?.id;
  const set = <K extends keyof Reseller>(k: K, v: Reseller[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Butiken</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Bygg er webbshop steg för steg. Era företagskunder designar sin merch här och begär offert av er.</p>

      <ol className="mt-6 grid grid-cols-4 gap-1.5 sm:gap-2" aria-label="Steg">
        {BUILDER_STEPS.map((s, i) => {
          const on = s.id === step;
          return (
            <li key={s.id} className="min-w-0">
              <button type="button" onClick={() => go(s.id)} aria-current={on ? "step" : undefined} className="group w-full text-left">
                <span className={`block h-1.5 rounded-full transition-colors ${on ? "bg-[var(--club)]" : done[s.id] ? "bg-[var(--club-accent)]" : "bg-[var(--nw-soft-2)]"}`} />
                <span className={`mt-2 flex items-center gap-1.5 text-[12.5px] sm:text-[13.5px] ${on ? "font-semibold text-[var(--nw-ink)]" : "text-[var(--nw-muted)] group-hover:text-[var(--nw-ink)]"}`}>
                  <span className={`hidden h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold sm:grid ${done[s.id] ? "bg-[var(--club)] text-white" : "bg-[var(--nw-soft-2)]"}`}>{done[s.id] ? "✓" : i + 1}</span>
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="hidden truncate pl-[26px] text-[11.5px] text-[var(--nw-faint)] sm:block">{s.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          {step === "varumarke" ? <BrandStep draft={draft} set={set} onImported={apply} /> : null}
          {step === "utseende" ? <LookStep draft={draft} set={set} /> : null}
          {step === "sortiment" ? <RangeStep draft={draft} set={set} /> : null}
          {step === "publicera" ? <PublishStep saved={saved} dirty={dirty} onSaved={apply} /> : null}

          {error ? <p className="mt-4 text-[13px] text-[#B42318]">{error}</p> : null}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--nw-line)] pt-5">
            {nextStep ? (
              <button type="button" disabled={busy} onClick={() => go(nextStep)} className="nw-btn nw-club-btn disabled:opacity-50">
                {busy ? "Sparar…" : `Fortsätt till ${BUILDER_STEPS[index + 1].label.toLowerCase()}`}
              </button>
            ) : null}
            {dirty ? (
              <>
                <button type="button" disabled={busy} onClick={save} className="nw-btn nw-btn-ghost disabled:opacity-50">
                  Spara
                </button>
                <button type="button" onClick={() => setDraft(saved)} className="text-[13px] text-[var(--nw-muted)] underline underline-offset-4">
                  Ångra
                </button>
              </>
            ) : (
              <span className="text-[12.5px] text-[var(--nw-faint)]">Allt är sparat</span>
            )}
          </div>
        </div>
        <Preview draft={draft} />
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

const IMPORT_STEPS = ["Öppnar webbplatsen…", "Letar efter loggan…", "Läser av färgerna…", "Skriver butikens texter…", "Väljer produkter som passar…"];

function BrandStep({ draft, set, onImported }: StepProps & { onImported: (r: Reseller) => void }) {
  const router = useRouter();
  const [site, setSite] = useState(draft.website ?? "");
  const [busy, setBusy] = useState<"" | "import" | "upload" | "reset">("");
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (busy !== "import") return;
    const t = setInterval(() => setTick((n) => Math.min(n + 1, IMPORT_STEPS.length - 1)), 4000);
    return () => clearInterval(t);
  }, [busy]);

  const runImport = async () => {
    setBusy("import");
    setTick(0);
    setError("");
    setNote("");
    try {
      const r = await call<{ reseller: Reseller; found: { logo: boolean; texts: boolean; products: number; mode: string | null }; note: string }>("/api/v1/newwave/reseller", { action: "import", website: site });
      onImported(r.reseller);
      const parts = [r.found.logo && "loggan", r.found.texts && "texterna", r.found.products && `${r.found.products} produkter`].filter(Boolean);
      setNote([parts.length ? `Klart – vi hämtade ${parts.join(", ")}. Justera fritt i nästa steg.` : "", r.note].filter(Boolean).join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta");
    } finally {
      setBusy("");
    }
  };

  const upload = async (f: File) => {
    setBusy("upload");
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
      setBusy("");
    }
  };

  const reset = async () => {
    if (!confirm("Börja om med en tom butik? Logga, texter och sortiment tas bort.")) return;
    setBusy("reset");
    try {
      onImported((await call<{ reseller: Reseller }>("/api/v1/newwave/reseller", { action: "reset" })).reseller);
      setSite("");
      setNote("");
      router.refresh();
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <Section title="Hämta från er webbplats" text="Vi läser er hemsida och hämtar logga, färger och texter. Ni kan ändra allt efteråt.">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (site.trim().length > 3) runImport();
          }}
        >
          <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="foretaget.se" aria-label="Webbplats" className="nw-input min-w-0 sm:flex-1" disabled={Boolean(busy)} />
          <button type="submit" disabled={Boolean(busy) || site.trim().length < 4} className="nw-btn nw-club-btn shrink-0 disabled:opacity-50">
            {busy === "import" ? "Hämtar…" : "Hämta"}
          </button>
        </form>
        {busy === "import" ? (
          <p className="nw-fade mt-3 flex items-center gap-2 text-[13.5px] text-[var(--nw-muted)]" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--club)]" />
            {IMPORT_STEPS[tick]}
          </p>
        ) : null}
      </Section>

      <Section title="Eller ladda upp loggan" text="PNG, JPG eller SVG. Vi tar bort bakgrunden och gör en ljus version till mörka produkter.">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Välj loggfil" />
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={Boolean(busy)}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--nw-radius)] border-2 border-dashed border-[var(--nw-line)] px-4 py-6 text-[14px] font-medium text-[var(--nw-ink)] transition-colors hover:border-[var(--club)] disabled:opacity-50"
        >
          {busy === "upload" ? "Laddar upp…" : "Välj fil"}
        </button>
      </Section>

      {note ? <p className="mb-6 rounded-xl bg-[#DFF5E7] px-4 py-3 text-[13.5px] text-[#17703A]">{note}</p> : null}
      {error ? <p className="mb-6 rounded-xl bg-[#FDECEC] px-4 py-3 text-[13.5px] text-[#B42318]">{error}</p> : null}

      <Section title="Brand bucket" text="Så här ser er logga ut på ljusa och mörka produkter.">
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["primary", "accent", "background"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-2 rounded-full border border-[var(--nw-line)] py-1 pl-1 pr-3 text-[12.5px]">
              <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: draft.theme[k] }} />
              {draft.theme[k]}
            </span>
          ))}
        </div>
        <label className="mt-4 block text-[13px] font-medium text-[var(--nw-ink)]">
          Företagsnamn
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} className="nw-input mt-1.5 w-full" maxLength={60} />
        </label>
      </Section>

      <button type="button" onClick={reset} disabled={Boolean(busy)} className="nw-hit text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
        Börja om med en tom butik
      </button>
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

function RangeStep({ draft, set }: StepProps) {
  const categories = [...new Set(SHOP_CATALOG.map((p) => p.category))];
  const chosen = new Set(draft.products);
  const toggle = (ids: string[], on: boolean) => set("products", on ? [...new Set([...draft.products, ...ids])] : draft.products.filter((id) => !ids.includes(id)));
  const example = SHOP_CATALOG.find((p) => p.id === "p004") ?? SHOP_CATALOG[0];
  const price = fromPrice(example, draft.markup);
  const cost = Math.round(exVat(example) * 0.55 + 6 * 0.7);

  return (
    <div>
      <Section title="Ert påslag" text="Läggs på New Waves cirkapriser. Kunden ser bara ert pris.">
        <div className="rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4">
          <div className="flex items-center gap-4">
            <input type="range" min={-10} max={40} step={5} value={draft.markup} onChange={(e) => set("markup", Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--club)]" aria-label="Påslag i procent" />
            <span className="nw-club-heading w-16 shrink-0 text-right text-[22px] text-[var(--club)]">
              {draft.markup > 0 ? "+" : ""}
              {draft.markup} %
            </span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--nw-muted)]">
            Exempel, {example.name.toLowerCase()} med tryck vid 100 st: kunden betalar {sek(price)}/st, New Wave tar cirka {sek(cost)}/st, ni tjänar cirka {sek(price - cost)}/st.
          </p>
        </div>
      </Section>
      <Section title={`Produkter (${draft.products.length} av ${SHOP_CATALOG.length})`} text="Välj vad era kunder ska kunna beställa.">
        <div className="flex flex-col gap-6">
          {categories.map((c) => {
            const items = SHOP_CATALOG.filter((p) => p.category === c);
            const all = items.every((p) => chosen.has(p.id));
            return (
              <div key={c}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">{c}</p>
                  <button type="button" onClick={() => toggle(items.map((p) => p.id), !all)} className="nw-hit text-[12.5px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                    {all ? "Ta bort alla" : "Välj alla"}
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
      </Section>
    </div>
  );
}

function PublishStep({ saved, dirty, onSaved }: { saved: Reseller; dirty: boolean; onSaved: (r: Reseller) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const live = saved.status === "publicerad";
  const checks = [
    { ok: Boolean(saved.logo), label: "Logga", step: "varumarke" },
    { ok: Boolean(saved.texts.heroTitle), label: "Rubrik på startsidan", step: "utseende" },
    { ok: Boolean(saved.texts.email || saved.texts.phone), label: "Kontaktuppgifter", step: "utseende" },
    { ok: saved.products.length > 0, label: `Produkter (${saved.products.length})`, step: "sortiment" },
  ];
  const ready = checks.filter((c) => c.label !== "Kontaktuppgifter").every((c) => c.ok);

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved((await call<{ reseller: Reseller }>("/api/v1/newwave/reseller", { action: live ? "unpublish" : "publish" })).reseller);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte publicera");
    } finally {
      setBusy(false);
    }
  };

  const url = shopUrl(saved);
  return (
    <div>
      <Section title="Klart att publicera?" text="När butiken är publicerad kan era kunder designa och begära offert.">
        <ul className="divide-y divide-[var(--nw-line)] rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-3 text-[14px]">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${c.ok ? "bg-[var(--club)] text-white" : "border border-[var(--nw-line)]"}`}>{c.ok ? "✓" : ""}</span>
              <span className={c.ok ? "text-[var(--nw-ink)]" : "text-[var(--nw-muted)]"}>{c.label}</span>
              {!c.ok ? <span className="ml-auto text-[12px] text-[var(--nw-faint)]">{c.label === "Kontaktuppgifter" ? "Valfritt" : "Saknas"}</span> : null}
            </li>
          ))}
        </ul>
      </Section>
      {dirty ? <p className="mb-4 text-[13px] text-[var(--nw-muted)]">Ni har osparade ändringar – spara först.</p> : null}
      <div className="rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white">
        <p className="text-[12px] text-white/60">{live ? "Butiken är live" : "Utkast"}</p>
        <p className="mt-1 break-all text-[15px] font-semibold">{url}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {live ? (
            <>
              <Link href={url} className="inline-flex h-10 items-center rounded-full bg-[var(--club-accent)] px-4 text-[13.5px] font-semibold text-[var(--club-on-accent)]">
                Öppna butiken
              </Link>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}${url}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex h-10 items-center rounded-full border border-white/30 px-4 text-[13.5px] font-semibold"
              >
                {copied ? "Kopierad" : "Kopiera länken"}
              </button>
              <button type="button" onClick={toggle} disabled={busy} className="inline-flex h-10 items-center rounded-full px-3 text-[13px] text-white/70 underline underline-offset-4">
                Avpublicera
              </button>
            </>
          ) : (
            <button type="button" onClick={toggle} disabled={busy || !ready || dirty} className="inline-flex h-11 items-center rounded-full bg-[var(--club-accent)] px-5 text-[14px] font-semibold text-[var(--club-on-accent)] disabled:opacity-40">
              {busy ? "Publicerar…" : "Publicera butiken"}
            </button>
          )}
        </div>
        {error ? <p className="mt-2 text-[13px] text-[#FFB4AB]">{error}</p> : null}
      </div>
    </div>
  );
}

const WIDTH = { dator: 1200, mobil: 390 } as const;

/** Butiken i skala, uppdaterad medan man ändrar. */
function Preview({ draft }: { draft: Reseller }) {
  const [chosen, setMode] = useState<keyof typeof WIDTH | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(800);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(800);
  /** På smala skärmar blir datorvyn oläslig, så mobilvyn visas tills man väljer själv. */
  const mode = chosen ?? (boxWidth < 560 ? "mobil" : "dator");

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      setBoxWidth(box.current.clientWidth);
      setScale(Math.min(1, box.current.clientWidth / WIDTH[mode]));
      setHeight(inner.current.scrollHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [mode]);

  return (
    <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-medium text-[var(--nw-muted)]">Förhandsvisning</p>
        <div className="nw-segment">
          {(Object.keys(WIDTH) as (keyof typeof WIDTH)[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "dator" ? "Dator" : "Mobil"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] bg-[var(--nw-soft)] shadow-[var(--nw-shadow)]">
        <div className="flex h-8 items-center gap-1.5 border-b border-[var(--nw-line)] bg-white px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-2 truncate text-[11px] text-[var(--nw-faint)]">{shopUrl(draft)}</span>
        </div>
        <div ref={box} className="h-[min(70vh,640px)] overflow-y-auto overflow-x-hidden">
          <div className="mx-auto" style={{ width: WIDTH[mode] * scale, height: height * scale }}>
            <div ref={inner} style={{ width: WIDTH[mode], transform: `scale(${scale})`, transformOrigin: "top left" }} className="pointer-events-none select-none" aria-hidden>
              <ShopFrame shop={draft} preview>
                <ShopHome shop={draft} preview />
              </ShopFrame>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
