"use client";

import { useState } from "react";
import { PROMO_PRODUCTS } from "@/lib/demoCatalog";
import type { EventConfig } from "@/lib/demoEvents";
import type { SiteAnalysis } from "@/lib/demoSiteCache";

/** Collapsed by default: the booth speaks for itself, the details are there for the curious. */
export function TailorCard({ analysis, event }: { analysis: SiteAnalysis; event: EventConfig }) {
  /** Stored files can disappear (e.g. a wiped disk after a redeploy); missing pictures are dropped instead of shown broken. */
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const images = [...analysis.images]
    .sort((a, b) => Number(b.selected) - Number(a.selected))
    .slice(0, 6)
    .filter((im) => !failed.has(im.url));
  const direction = event.id === "massa" ? null : analysis.events?.[event.id];
  const picks = direction ? direction.merch.map((id) => ({ id, reason: direction.reasons[id] ?? "" })) : analysis.merch;
  const merch = picks.map((m) => ({ ...m, product: PROMO_PRODUCTS.find((p) => p.id === m.id) })).filter((m) => m.product);
  const theme = event.id === "massa" ? analysis.tagline : direction?.theme;
  return (
    <details className="group rounded-2xl border border-black/[0.08] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        Se hur vi anpassade {event.the}
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[#6E6E73] transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </summary>
      <div className="grid gap-6 px-5 pb-5 text-[13px] leading-relaxed text-[#424245] sm:grid-cols-3">
        <div>
          <p className="font-semibold text-[#1D1D1F]">Bransch</p>
          <p className="mt-1">
            {analysis.industry || "Okänd"}
            {analysis.offering && ` – ${analysis.offering}`}
          </p>
          {theme && (
            <p className="mt-2">
              {event.themeLabel}: ”{theme}”
            </p>
          )}
          {analysis.logo.status !== "ok" && (
            <p className="mt-2">{analysis.logo.status === "replaced" ? "Vi hittade en bättre version av er logga i sidhuvudet och använder den." : "Vi satte namnet som ordmärke tills ni laddar upp er logga."}</p>
          )}
        </div>
        {images.length > 0 && (
          <div>
            <p className="font-semibold text-[#1D1D1F]">Från er webbplats</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {images.map((im) => (
                <span key={im.url} className={`aspect-square overflow-hidden rounded-lg bg-[#F5F5F7] ${im.selected ? "ring-2 ring-[#1D1D1F]" : ""}`} title={im.caption}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={im.caption} onError={() => setFailed((f) => new Set(f).add(im.url))} className="h-full w-full object-cover" />
                </span>
              ))}
            </div>
            {images.some((i) => i.selected) && <p className="mt-1.5 text-[12px] text-[#86868B]">Markerade bilder användes som förlaga.</p>}
          </div>
        )}
        {merch.length > 0 && (
          <div>
            <p className="font-semibold text-[#1D1D1F]">Profilprodukter vi föreslår</p>
            <ul className="mt-1 space-y-1.5">
              {merch.map((m) => (
                <li key={m.id}>
                  <span className="font-medium text-[#1D1D1F]">{m.product!.name}</span>
                  {m.reason && ` – ${m.reason}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
