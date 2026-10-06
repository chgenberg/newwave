"use client";

import { PROMO_PRODUCTS } from "@/lib/demoCatalog";
import type { SiteAnalysis } from "@/lib/demoSiteCache";

/** Shows what the site read found, so the tailoring feels earned rather than random. */
export function TailorCard({ analysis }: { analysis: SiteAnalysis }) {
  const images = [...analysis.images].sort((a, b) => Number(b.selected) - Number(a.selected)).slice(0, 6);
  const merch = analysis.merch.map((m) => ({ ...m, product: PROMO_PRODUCTS.find((p) => p.id === m.id) })).filter((m) => m.product);
  return (
    <div className="mt-5 border-t border-black/[0.08] pt-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6E6E73]">Så anpassade vi montern</p>
      {analysis.industry && (
        <p className="mt-3 text-[14px] font-semibold">
          {analysis.industry}
          {analysis.offering && <span className="font-normal text-[#424245]"> · {analysis.offering}</span>}
        </p>
      )}
      {analysis.tagline && <p className="mt-1 text-[12px] italic text-[#6E6E73]">På mässväggen: ”{analysis.tagline}”</p>}

      {images.length > 0 && (
        <>
          <p className="mt-4 text-[12px] font-medium text-[#424245]">Från er webbplats</p>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {images.map((im) => (
              <span key={im.url} className={`relative aspect-square overflow-hidden rounded-lg bg-white ${im.selected ? "ring-2 ring-[#2563EB]" : "ring-1 ring-black/[0.06]"}`} title={im.caption}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.caption} loading="lazy" className="h-full w-full object-cover" />
              </span>
            ))}
          </div>
          {images.some((i) => i.selected) && <p className="mt-1.5 text-[11px] text-[#86868B]">Markerade bilder användes som förlaga i montern.</p>}
        </>
      )}

      {merch.length > 0 && (
        <>
          <p className="mt-4 text-[12px] font-medium text-[#424245]">Profilprodukter vi valt åt er</p>
          <ul className="mt-2 space-y-1.5">
            {merch.map((m) => (
              <li key={m.id} className="text-[12px] leading-snug">
                <span className="font-semibold">{m.product!.name}</span>
                {m.reason && <span className="text-[#6E6E73]"> – {m.reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {analysis.logo.status !== "ok" && (
        <p className="mt-4 rounded-xl bg-white px-3 py-2.5 text-[12px] leading-snug text-[#6E6E73]">
          {analysis.logo.status === "replaced" ? "Vi hittade en bättre version av er logga i sidhuvudet och använder den." : "Vi satte namnet som ordmärke tills ni laddar upp er logga."}
        </p>
      )}
    </div>
  );
}
