"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLoader } from "@/components/IFKLoader";
import { ClubLoader } from "@/components/newwave/ClubLoader";
import type { BrandState } from "@/lib/newwave/store";

export function BrandScan({
  clubId,
  site,
  defaultTone,
  initial,
  loaderLines,
  loaderDone,
}: {
  clubId: string;
  site: string;
  defaultTone: string;
  initial: BrandState;
  loaderLines?: string[];
  loaderDone?: string;
}) {
  const router = useRouter();
  const loader = useLoader();
  const [brand, setBrand] = useState(initial);
  const [tone, setTone] = useState(initial.tone ?? defaultTone);
  const [busy, setBusy] = useState<null | "scan" | "approve">(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (action: "scan" | "approve") => {
    setBusy(action);
    setError(null);
    if (action === "scan") loader.start(`Varumärkesagenten läser ${site}`, 94, 25000);
    try {
      const res = await fetch("/api/v1/newwave/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "scan" ? { action, clubId } : { action, clubId, tone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Något gick fel");
      setBrand(json);
      if (json.tone) setTone(json.tone);
      router.refresh();
      if (action === "scan") loader.done();
    } catch (e) {
      loader.fail();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 sm:p-5">
      <ClubLoader state={loader.state} crestUrl={`/api/v1/brand/${clubId}/skold-farg.png`} lines={loaderLines} doneLine={loaderDone} wide />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${brand.toneApproved ? "bg-[var(--club)] text-white" : "bg-[var(--club-accent)] text-[var(--club-on-accent)]"}`}
        >
          {brand.toneApproved ? "✓ Godkänd" : brand.scannedAt ? "Förslag från agenten" : "Inte godkänd än"}
        </span>
        {brand.scannedAt ? (
          <span className="text-[12.5px] text-[var(--nw-muted)]">
            Läst från {site} {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(brand.scannedAt))}
          </span>
        ) : null}
      </div>

      <textarea
        value={tone}
        onChange={(e) => setTone(e.target.value)}
        rows={4}
        aria-label="Tonalitet"
        className="mt-3 w-full resize-none rounded-xl bg-[var(--nw-soft)] p-3 text-[16px] leading-relaxed text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14.5px]"
      />

      {brand.keywords?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {brand.keywords.map((k) => (
            <span key={k} className="nw-chip h-7 text-[12px]">
              {k}
            </span>
          ))}
        </div>
      ) : null}

      {brand.rules?.length ? (
        <ul className="mt-4 space-y-1.5 text-[13.5px] text-[var(--nw-muted)]">
          {brand.rules.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="text-[var(--nw-faint)]">–</span>
              <span className="min-w-0">{r}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="nw-btn nw-club-btn" disabled={busy !== null || tone.trim().length < 10} onClick={() => call("approve")}>
          {busy === "approve" ? "Sparar…" : "Godkänn tonalitet"}
        </button>
        <button type="button" className="nw-btn nw-btn-ghost" disabled={busy !== null} onClick={() => call("scan")}>
          {busy === "scan" ? `Läser ${site}…` : `Låt agenten läsa av ${site}`}
        </button>
      </div>
      {error ? <p className="mt-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}
