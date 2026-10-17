"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Reseller } from "@/lib/newwave/reseller";
import { call } from "./api";
import { ResellerShare } from "./ShareShop";
import { ShopPreview } from "./ShopPreview";

const STEPS = ["Öppnar webbplatsen", "Hämtar loggan", "Läser av färgerna", "Skriver butikens texter", "Väljer sortiment och priser"];
const STEP_MS = 850;

/** Butiken när `step` steg är klara: varje klart steg lägger till det som hittats. */
function partial(target: Reseller, step: number): Reseller {
  const logo = step >= 2;
  return {
    ...target,
    name: logo ? target.name : "",
    logo: logo ? target.logo : undefined,
    logoDark: logo ? target.logoDark : undefined,
    theme: step >= 3 ? target.theme : { primary: "#1D1D1F", accent: "#8E8E93", background: "#F5F5F7" },
    texts: step >= 4 ? target.texts : { shopName: logo ? target.texts.shopName : "", tagline: "", heroTitle: "", heroText: "", about: "", email: "", phone: "" },
    products: step >= 5 ? target.products : [],
  };
}

type Example = { host: string; label: string };

/** Hela butiken från en webbadress på under en minut, medan förhandsvisningen byggs upp framför en. */
export function QuickBuild({ initial, examples, ws }: { initial: Reseller; examples: Example[]; ws: string | null }) {
  const router = useRouter();
  const [site, setSite] = useState(examples[0]?.host ?? "");
  const [target, setTarget] = useState<Reseller | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [shop, setShop] = useState(initial);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  const done = Boolean(target) && step >= STEPS.length;

  useEffect(() => {
    if (!target || step >= STEPS.length) return;
    const t = setTimeout(() => {
      setStep((s) => s + 1);
      if (step === STEPS.length - 1) setSeconds(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [target, step]);

  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);

  const build = async (host: string) => {
    started.current = Date.now();
    setSite(host);
    setRunning(true);
    setTarget(null);
    setStep(0);
    setError("");
    setNote("");
    try {
      const r = await call<{ reseller: Reseller; note: string }>("/api/v1/newwave/reseller", { action: "import", website: host });
      setShop(r.reseller);
      setTarget(r.reseller);
      setNote(r.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta webbplatsen");
    } finally {
      setRunning(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      setShop((await call<{ reseller: Reseller }>("/api/v1/newwave/reseller", { action: "publish" })).reseller);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte publicera");
    } finally {
      setPublishing(false);
    }
  };

  const building = running || (Boolean(target) && !done);
  const shown = target ? partial(target, step) : building ? partial(shop, 0) : shop;
  const live = shop.status === "publicerad";

  return (
    <div className="nw-page">
      <p className="text-[13px] text-[var(--nw-muted)]">
        <Link href="/newwave/shop/butiken" className="hover:text-[var(--nw-ink)]">
          ← Butiker
        </Link>
      </p>
      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          {done ? (
            <div className="nw-fade">
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[var(--club)]">Klart på {seconds} sekunder</p>
              <h1 className="nw-club-heading mt-1 text-[28px] leading-tight text-[var(--club)] sm:text-[34px]">{live ? "Butiken är uppdaterad" : "Butiken är byggd"}</h1>
              <p className="mt-2 text-[14.5px] text-[var(--nw-muted)]">
                Logga, färger, texter och {shop.products.length} produkter med {shop.markup} % påslag. {live ? "Ändringarna syns redan för kunderna." : "Publicera så kan kunderna börja beställa."}
              </p>
              {note ? <p className="mt-4 rounded-xl bg-[#FFF4D6] px-4 py-3 text-[13.5px] text-[#7A4F00]">{note}</p> : null}
              {!live ? (
                <button type="button" onClick={publish} disabled={publishing} className="nw-btn nw-club-btn mt-5 disabled:opacity-50">
                  {publishing ? "Publicerar…" : "Publicera butiken"}
                </button>
              ) : null}
              {live ? (
                <div className="mt-6">
                  <ResellerShare shop={shop} ws={ws} />
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
                <Link href="/newwave/shop/butiken/redigera?flik=utseende" className="nw-hit font-medium text-[var(--nw-ink)] underline underline-offset-4">
                  Finjustera texter och färger
                </Link>
                <Link href="/newwave/shop/butiken/redigera?flik=sortiment" className="nw-hit font-medium text-[var(--nw-ink)] underline underline-offset-4">
                  Sortiment och priser
                </Link>
                <button type="button" onClick={() => setTarget(null)} className="nw-hit text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                  Bygg från en annan webbplats
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="nw-club-heading text-[28px] leading-tight text-[var(--club)] sm:text-[34px]">Bygg butiken på en minut</h1>
              <p className="mt-2 text-[14.5px] text-[var(--nw-muted)]">Skriv er webbadress. Vi hämtar loggan, färgerna och tonen, skriver texterna och väljer ett sortiment som passar era kunder. Allt går att ändra efteråt.</p>
              <form
                className="mt-6 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (site.trim().length > 3) build(site.trim());
                }}
              >
                <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="foretaget.se" aria-label="Er webbplats" className="nw-input min-w-0 sm:flex-1" disabled={building} />
                <button type="submit" disabled={building || site.trim().length < 4} className="nw-btn nw-club-btn shrink-0 disabled:opacity-50">
                  {building ? "Bygger…" : "Bygg butiken"}
                </button>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-[var(--nw-muted)]">Prova med</span>
                {examples.map((e) => (
                  <button key={e.host} type="button" disabled={building} onClick={() => build(e.host)} className="h-9 rounded-full border border-[var(--nw-line)] bg-white px-3.5 text-[12.5px] font-medium text-[var(--nw-ink)] transition-colors hover:border-[var(--nw-ink)] disabled:opacity-50">
                    {e.label}
                  </button>
                ))}
              </div>
              {error ? <p className="mt-4 rounded-xl bg-[#FDECEC] px-4 py-3 text-[13.5px] text-[#B42318]">{error}</p> : null}

              <ol className="mt-8 flex flex-col gap-2.5" aria-live="polite">
                {STEPS.map((label, i) => {
                  const state = !building ? "idle" : i < step ? "done" : i === step ? "now" : "idle";
                  return (
                    <li key={label} className={`flex items-center gap-3 text-[14px] transition-colors ${state === "idle" ? "text-[var(--nw-faint)]" : "text-[var(--nw-ink)]"}`}>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${state === "done" ? "bg-[var(--club)] text-white" : state === "now" ? "border-2 border-[var(--club)]" : "border border-[var(--nw-line)]"}`}>
                        {state === "done" ? "✓" : state === "now" ? <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--club)]" /> : i + 1}
                      </span>
                      {i === 0 && building ? `Öppnar ${site.trim()}` : label}
                      {i === 0 && running ? <span className="text-[12.5px] text-[var(--nw-faint)]">· en ny adress kan ta en halv minut</span> : null}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-8 text-[13px] text-[var(--nw-muted)]">
                Ingen webbplats?{" "}
                <Link href="/newwave/shop/butiken/redigera?flik=varumarke" className="font-medium text-[var(--nw-ink)] underline underline-offset-4">
                  Ladda upp loggan i stället
                </Link>
              </p>
            </>
          )}
        </div>
        <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <ShopPreview shop={shown} />
        </div>
      </div>
    </div>
  );
}
