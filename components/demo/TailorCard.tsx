"use client";

import { PROMO_PRODUCTS } from "@/lib/demoCatalog";
import type { SiteAnalysis } from "@/lib/demoSiteCache";

/** Collapsed by default: the booth speaks for itself, the details are there for the curious. */
export function TailorCard({ analysis }: { analysis: SiteAnalysis }) {
  const images = [...analysis.images].sort((a, b) => Number(b.selected) - Number(a.selected)).slice(0, 6);
  const merch = analysis.merch.map((m) => ({ ...m, product: PROMO_PRODUCTS.find((p) => p.id === m.id) })).filter((m) => m.product);
  return (
    <details className="group rounded-2xl border border-black/[0.08] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        Se hur vi anpassade montern
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
          {analysis.tagline && <p className="mt-2">På mässväggen: ”{analysis.tagline}”</p>}
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
                  <img src={im.url} alt={im.caption} loading="lazy" className="h-full w-full object-cover" />
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
