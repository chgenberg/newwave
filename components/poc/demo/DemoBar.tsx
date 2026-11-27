"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DEMO_KEY, DEMO_START, DEMO_STEPS, type DemoState, NEXT_LABEL } from "./steps";

/** Demons läge i webbläsaren; tål att lagringen saknas (privat fönster). */
export function readDemo(): DemoState | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    const s = raw ? (JSON.parse(raw) as DemoState) : null;
    return s && Number.isInteger(s.step) && s.step >= 0 && s.step < DEMO_STEPS.length ? s : null;
  } catch {
    return null;
  }
}

export function writeDemo(s: DemoState | null) {
  try {
    if (s) localStorage.setItem(DEMO_KEY, JSON.stringify(s));
    else localStorage.removeItem(DEMO_KEY);
  } catch {}
  window.dispatchEvent(new Event(DEMO_KEY));
}

const post = async (body: Record<string, unknown>) => {
  const res = await fetch("/api/v1/poc/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Steget gick inte att göra.");
  return json;
};

/**
 * Den guidade demons list längst ner på sidorna: vilket steg visningen är på, en knapp som gör steget och vägen till
 * nästa sida. Syns bara när demon är startad (/newwave/demo).
 */
export function DemoBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [list, setList] = useState(false);

  useEffect(() => {
    const sync = () => setState(readDemo());
    sync();
    window.addEventListener(DEMO_KEY, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DEMO_KEY, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((s: DemoState | null) => {
    writeDemo(s);
    setState(s);
  }, []);

  const go = useCallback(
    (s: DemoState, step: number) => {
      const next = { ...s, step };
      save(next);
      setError("");
      setList(false);
      router.push(DEMO_STEPS[step].url(next));
    },
    [router, save],
  );

  // Ordern kan ha gått vidare i köerna (någon tryckte där själv): läs av den när ett av orderstegen visas.
  const orderId = state?.orderId;
  const step = state?.step ?? -1;
  useEffect(() => {
    if (!orderId || step < 3 || step > 6) return;
    let live = true;
    post({ action: "status", orderId })
      .then((s: { jobs: { producer: "tryckeri" | "stickeri"; status: string }[] }) => {
        if (!live) return;
        const cur = readDemo();
        if (cur) save({ ...cur, jobs: Object.fromEntries(s.jobs.map((j) => [j.producer, j.status])) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [orderId, step, save]);

  if (!state || pathname === DEMO_START) return null;
  const s = DEMO_STEPS[state.step];
  const here = pathname === s.url(state).split(/[?#]/)[0];

  async function act() {
    if (!state || !s.action) return;
    setBusy(true);
    setError("");
    try {
      if (s.action === "publicera") {
        const r = await post({ action: "publicera" });
        go({ ...state, clubIds: r.clubIds }, state.step + 1);
      } else if (s.action === "order") {
        const r = await post({ action: "order" });
        go({ ...state, orderId: r.orderId, number: r.number, statusPath: r.statusPath, jobs: Object.fromEntries((r.jobs as { producer: string; status: string }[]).map((j) => [j.producer, j.status])) }, state.step + 1);
      } else if (state.orderId) {
        const r = await post({ action: "producent", orderId: state.orderId, producer: s.action });
        save({ ...state, jobs: { ...state.jobs, [s.action]: r.status } });
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Steget gick inte att göra.");
    } finally {
      setBusy(false);
    }
  }

  const producer = s.action === "tryckeri" || s.action === "stickeri" ? s.action : null;
  const jobStatus = producer ? (state.jobs?.[producer] ?? "ny") : null;
  const label =
    s.action === "publicera"
      ? state.clubIds
        ? "Publicera igen"
        : "Publicera provkollektionen"
      : s.action === "order"
        ? state.orderId
          ? "Lägg en provorder till"
          : "Lägg provordern"
        : producer
          ? state.orderId
            ? NEXT_LABEL[jobStatus ?? "ny"]
            : null
          : null;
  const last = state.step === DEMO_STEPS.length - 1;

  return (
    <>
      <div aria-hidden className="h-36 sm:h-28" />
      <div className="fixed inset-x-2 bottom-2 z-[60] mx-auto max-w-[1080px] sm:inset-x-4 sm:bottom-4" role="region" aria-label="Guidad demo">
        {list && (
          <ol className="mb-2 max-h-[50vh] overflow-y-auto rounded-[20px] bg-[#111] p-2 text-white shadow-2xl ring-1 ring-white/10">
            {DEMO_STEPS.map((x, i) => (
              <li key={x.title}>
                <button type="button" onClick={() => go(state, i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition hover:bg-white/10 ${i === state.step ? "bg-white/10 font-semibold" : "text-white/80"}`}>
                  <span className="nw-mono w-6 shrink-0 text-[11px] text-white/50">{String(i + 1).padStart(2, "0")}</span>
                  {x.title}
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-col gap-3 rounded-[22px] bg-[#111] p-3.5 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setList(!list)} aria-expanded={list} className="nw-mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-white/55 hover:text-white">
              Guidad demo · steg {state.step + 1} av {DEMO_STEPS.length}
              <svg viewBox="0 0 24 24" aria-hidden className={`h-3 w-3 fill-none stroke-current transition ${list ? "" : "rotate-180"}`} strokeWidth="2.5">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <p className="mt-0.5 text-[15.5px] font-semibold leading-tight">{s.title}</p>
            <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-white/70 sm:line-clamp-2">{s.text}</p>
            {state.number && state.step >= 3 && state.step <= 6 && (
              <p className="nw-mono mt-1 text-[11px] text-white/50">
                Ordern {state.number}
                {producer && jobStatus ? ` · ${producer === "tryckeri" ? "tryckeriet" : "stickeriet"}: ${jobStatus}` : ""}
              </p>
            )}
            {error && <p className="mt-1 text-[12.5px] text-[#FCA5A5]">{error}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!here && (
              <button type="button" onClick={() => go(state, state.step)} className="h-10 rounded-full px-3.5 text-[13px] font-medium text-white ring-1 ring-white/25 transition hover:ring-white/60">
                Till steget
              </button>
            )}
            {s.action && label && (
              <button type="button" onClick={act} disabled={busy} className="h-10 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#111] transition hover:bg-white/85 disabled:opacity-60">
                {busy ? "Arbetar …" : label}
              </button>
            )}
            {producer && jobStatus === "skickad" && <span className="px-1 text-[13px] text-[#86EFAC]">Skickad ✓</span>}
            <button type="button" onClick={() => go(state, state.step - 1)} disabled={state.step === 0} aria-label="Föregående steg" className="grid h-10 w-10 place-items-center rounded-full text-white ring-1 ring-white/25 transition hover:ring-white/60 disabled:opacity-30">
              ←
            </button>
            {!last ? (
              <button type="button" onClick={() => go(state, state.step + 1)} className="h-10 rounded-full px-4 text-[13.5px] font-semibold text-white ring-1 ring-white/40 transition hover:bg-white hover:text-[#111]">
                Nästa →
              </button>
            ) : (
              <button type="button" onClick={() => router.push(DEMO_START)} className="h-10 rounded-full px-4 text-[13.5px] font-semibold text-white ring-1 ring-white/40 transition hover:bg-white hover:text-[#111]">
                Klar
              </button>
            )}
            <button type="button" onClick={() => save(null)} aria-label="Avsluta demon" className="grid h-10 w-10 place-items-center rounded-full text-[18px] text-white/60 transition hover:text-white">
              ×
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
