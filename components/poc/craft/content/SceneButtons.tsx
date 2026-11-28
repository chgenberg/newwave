"use client";

/* eslint-disable @next/next/no-img-element -- miljöbilderna är sparade filer */
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Miljöbilden – ett foto där en person i klubbens miljö bär plagget – görs bara när Craft ber om den: per produkt,
 * eller för alla produkter som saknar en, efter en bekräftelse. Inga priser visas: modellanropen ingår i det fasta priset.
 */

type SceneResponse = { url?: string; cached?: boolean; left?: number; error?: string };

async function makeScene(clubProductId: string): Promise<{ ok: boolean; status: number } & SceneResponse> {
  const res = await fetch("/api/v1/craft/innehall/miljobild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubProductId }) });
  const json = (await res.json().catch(() => ({}))) as SceneResponse;
  return { ok: res.ok && !!json.url, status: res.status, ...json };
}

/** Produkten med sin mockup, och miljöbilden när den finns – annars knappen som skapar den. */
export function SceneCard({ product, scene }: { product: { id: string; title: string; mockupUrl: string }; scene?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(scene);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await makeScene(product.id);
      if (!r.ok) throw new Error(r.error ?? "Kunde inte skapa miljöbilden.");
      setUrl(r.url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa miljöbilden.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="min-w-0">
      <div className="grid grid-cols-2 gap-1.5">
        <a href={product.mockupUrl} target="_blank" rel="noreferrer" className="block aspect-[4/5] overflow-hidden rounded-2xl bg-[#F3F2EF]">
          <img src={product.mockupUrl.replace("&s=800", "&s=480")} alt={product.title} loading="lazy" className="h-full w-full object-contain p-2" />
        </a>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--nw-soft)]">
            <img src={url} alt={`${product.title} – miljöbild`} loading="lazy" className="h-full w-full object-cover" />
          </a>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={make}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#cfcfca] px-2 text-center text-[12.5px] text-[var(--nw-muted)] transition hover:border-[var(--nw-ink)] hover:text-[var(--nw-ink)] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="font-medium text-[var(--nw-ink)]">{busy ? "Skapar…" : "Skapa miljöbild"}</span>
            <span>cirka en minut</span>
          </button>
        )}
      </div>
      <p className="mt-1.5 truncate text-[12.5px] font-medium text-[var(--nw-ink)]">{product.title}</p>
      {error ? <p className="text-[12px] text-[#9B1C1C]">{error}</p> : null}
    </li>
  );
}

/**
 * "Skapa för alla N": en bekräftelse, sedan två bilder åt gången. Stannar när timmens gräns är
 * nådd och säger hur många som blev klara.
 */
export function SceneBulk({ ids, left, label }: { ids: string[]; left: number; label: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (!ids.length && !message) return null;
  const n = ids.length;

  const run = async () => {
    setAsking(false);
    setMessage(null);
    const queue = ids.slice(0, Math.max(0, Math.min(n, left)));
    const total = queue.length;
    let done = 0;
    let stop = "";
    setProgress({ done, total });
    const worker = async () => {
      while (queue.length && !stop) {
        const id = queue.shift()!;
        const r = await makeScene(id).catch((): { ok: boolean; status: number; error?: string } => ({ ok: false, status: 0, error: "Nätverksfel." }));
        if (r.ok) done++;
        else if (r.status === 429 || r.status === 503) stop = r.error ?? "Gränsen är nådd.";
        setProgress({ done, total });
      }
    };
    await Promise.all([worker(), worker()]);
    setProgress(null);
    setMessage(stop ? { text: `${done} av ${total} klara. ${stop}`, error: true } : { text: `${done} av ${total} miljöbilder klara${done < total ? " – några gick inte att göra, försök igen" : ""}.`, error: done < total });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      {progress ? (
        <p role="status" className="text-[13px] text-[var(--nw-muted)]">
          Skapar miljöbilder… {progress.done} av {progress.total} klara
        </p>
      ) : asking ? (
        <div className="flex max-w-[560px] flex-col gap-2 rounded-[22px] border border-[var(--nw-line)] p-3 sm:p-4">
          <p className="text-[14px] font-medium text-[var(--nw-ink)]">
            Skapa {n} {n === 1 ? "miljöbild" : "miljöbilder"} för {label}?
          </p>
          <p className="text-[13px] text-[var(--nw-muted)]">
            Varje bild tar ungefär en minut.
            {left < n ? ` Högst ${left} kan göras den här timmen – resten när du trycker igen senare.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={run} disabled={left <= 0} className="nw-btn disabled:opacity-40">
              Skapa {Math.min(n, left)} {Math.min(n, left) === 1 ? "miljöbild" : "miljöbilder"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="nw-btn nw-btn-ghost">
              Avbryt
            </button>
          </div>
        </div>
      ) : n ? (
        <button type="button" onClick={() => setAsking(true)} className="nw-btn nw-btn-ghost self-start">
          Skapa miljöbild för alla {n}
        </button>
      ) : null}
      {message ? (
        <p role="status" className={`text-[13px] ${message.error ? "text-[#9B1C1C]" : "text-[#1E6B34]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
