"use client";

import type { ReactNode } from "react";
import { BOOTH_ASPECTS, type BoothFormat, sek } from "@/lib/demoCatalog";
import type { EventConfig } from "@/lib/demoEvents";
import { fmtDay, visitorsLabel } from "@/lib/demoPackages";
import { CropThumb, Icons, Primary, Secondary, TrustLine } from "./parts";

export type OfferLine = { id: string; model: string; name: string; spec: string; variant: string; qty: number; unitSek: number; totalSek: number; unit: string; thumb: ReactNode };

type Props = {
  brand: { name: string; logo: string | null; site: string; tagline?: string; industry?: string };
  event: EventConfig;
  date: Date;
  reference: string;
  booth: string;
  format?: BoothFormat;
  lines: OfferLine[];
  total: number;
  eventDate?: string;
  visitors?: string;
  delivery?: string;
  onClose: () => void;
};

const fmtDate = (d: Date) => d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

function Page({ children }: { children: ReactNode }) {
  return (
    <section className="relative mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white px-[14mm] py-[13mm] text-[#1D1D1F] shadow-[0_10px_40px_rgba(0,0,0,0.12)] print:break-after-page print:shadow-none">
      {children}
    </section>
  );
}

function Logo({ brand }: { brand: Props["brand"] }) {
  return brand.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt={brand.name} className="max-h-[9mm] max-w-[48mm] object-contain object-left" />
  ) : (
    <span className="text-[16px] font-semibold tracking-[0.18em]">{brand.name.toUpperCase()}</span>
  );
}

export function PrintOffer(p: Props) {
  const format = p.format ?? "3:2";
  const ev = p.event;
  /** A 4:3 image has the same layout with ceiling and floor added, so its detail crops differ. */
  const [first, second] = ev.detailCrops[format];
  const rows: [ReactNode, string, string][] = [
    [Icons.user, "Kund", p.brand.name],
    [Icons.calendar, "Typ", `${ev.label} ${p.date.getFullYear()}`],
    ...(p.eventDate ? [[Icons.calendar, ev.pdfDateLabel, fmtDay(p.eventDate)] as [ReactNode, string, string]] : []),
    ...(p.visitors ? [[Icons.user, ev.people.replace(/^./, (c) => c.toUpperCase()), `ca ${visitorsLabel(p.visitors, ev.id).toLowerCase()}`] as [ReactNode, string, string]] : []),
    ...(p.delivery ? [[Icons.truck, "Leverans", p.delivery] as [ReactNode, string, string]] : []),
    [Icons.calendar, "Offertdatum", fmtDate(p.date)],
    [Icons.doc, "Offertnummer", `#${p.reference}`],
    [Icons.headset, "Kontaktperson", "Er säljare återkommer inom 1 arbetsdag"],
  ];
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#E8E8ED] print:static print:overflow-visible print:bg-white">
      <style>{`@page { size: A4; margin: 0; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/[0.06] bg-white/90 px-5 py-3 backdrop-blur print:hidden">
        <p className="text-[14px] font-medium">Sammanställning · #{p.reference}</p>
        <div className="flex gap-2">
          <Secondary className="h-10" onClick={p.onClose}>
            Stäng
          </Secondary>
          <Primary className="h-10" onClick={() => window.print()}>
            {Icons.download} Spara som PDF
          </Primary>
        </div>
      </div>

      <div className="space-y-8 py-8 print:space-y-0 print:py-0 [&_*]:[print-color-adjust:exact]">
        <Page>
          <div className="flex items-start justify-between">
            <Logo brand={p.brand} />
            <p className="text-[9px] text-[#86868B]">Offertnummer #{p.reference} · Sida 1 av 2</p>
          </div>
          <div className="mt-[7mm] grid grid-cols-[62mm_1fr] items-start gap-[7mm]">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#6E6E73]">Offertförslag</p>
              <h1 className="mt-2 text-[25px] font-semibold leading-[1.05] tracking-tight">{ev.title} med produkter</h1>
              {p.brand.tagline && <p className="mt-2 text-[12px] font-medium italic leading-snug text-[#1D1D1F]">”{p.brand.tagline}”</p>}
              <p className="mt-3 text-[10px] leading-relaxed text-[#424245]">
                {`Ett komplett förslag på ${ev.pitch}${p.brand.industry ? ` anpassad för ${p.brand.industry.toLowerCase()}` : ""}, med varumärkesprofil och utvalda produkter. Alla produkter är anpassade med er logotyp och era färger.`}
              </p>
              <div className="mt-4 space-y-2 rounded-xl bg-[#F5F5F7] p-3.5">
                {rows.map(([icon, k, v]) => (
                  <div key={k} className="flex gap-2.5">
                    <span className="mt-0.5 text-[#6E6E73] [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
                    <div>
                      <p className="text-[8px] text-[#86868B]">{k}</p>
                      <p className="text-[10px] font-medium">{v}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.booth} alt={ev.title} className="aspect-[3/2] w-full rounded-xl object-cover" />
          </div>

          <h2 className="mt-[6mm] text-[13px] font-semibold">Produkter i offerten</h2>
          <table className="mt-2 w-full border-collapse text-[9px]">
            <thead>
              <tr className="border-b border-black/10 text-left text-[8px] text-[#6E6E73]">
                <th className="py-1.5 font-medium">Produkt</th>
                <th className="py-1.5 font-medium">Specifikation</th>
                <th className="py-1.5 font-medium">Variant / färg</th>
                <th className="py-1.5 text-right font-medium">Antal</th>
                <th className="py-1.5 text-right font-medium">À-pris</th>
                <th className="py-1.5 text-right font-medium">Summa</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.id} className="border-b border-black/[0.06]">
                  <td className="py-[0.6mm]">
                    <span className="flex items-center gap-2">
                      <span className="block w-[7.5mm] overflow-hidden rounded">{l.thumb}</span>
                      <span className="font-medium">{l.name}</span>
                    </span>
                  </td>
                  <td className="py-1 text-[#424245]">{l.spec}</td>
                  <td className="py-1 text-[#424245]">{l.variant}</td>
                  <td className="py-1 text-right tabular-nums">
                    {l.qty.toLocaleString("sv-SE").replace(/\u00a0/g, " ")} {l.unit}
                  </td>
                  <td className="py-1 text-right tabular-nums">{sek(l.unitSek)}</td>
                  <td className="py-1 text-right font-medium tabular-nums">{sek(l.totalSek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex justify-end">
            <p className="text-[12px] font-semibold">
              Totalpris <span className="font-normal text-[#6E6E73]">(exkl. moms)</span> <span className="ml-3 tabular-nums">{sek(p.total)}</span>
            </p>
          </div>

          <TrustLine className="mt-3 text-[9px] [&_svg]:!h-3 [&_svg]:!w-3" />
          <div className="mt-auto flex items-end justify-between gap-6 pt-4">
            <p className="max-w-[95mm] text-[7.5px] leading-relaxed text-[#86868B]">
              Priserna är riktpriser och kan variera beroende på antal, design och leveranstid. Moms tillkommer. Offerten är giltig i 30 dagar.
            </p>
            <span className="inline-flex items-center gap-2 rounded-lg bg-[#1D1D1F] px-4 py-2.5 text-[9px] font-medium text-white">Kontakta oss för att bekräfta och beställa →</span>
          </div>
        </Page>

        <Page>
          <div className="flex items-start justify-between">
            <Logo brand={p.brand} />
            <p className="text-[9px] text-[#86868B]">Offertnummer #{p.reference} · Sida 2 av 2</p>
          </div>
          <h2 className="mt-[9mm] text-[22px] font-semibold tracking-tight">Visualisering av {ev.the}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.booth} alt={ev.title} className="mt-4 aspect-[3/2] w-full rounded-xl object-cover" />
          <div className="mt-[5mm] grid grid-cols-2 gap-[5mm]">
            <figure>
              <CropThumb url={p.booth} crop={first} source={BOOTH_ASPECTS[format]} aspect={3 / 2} className="rounded-xl" />
              <figcaption className="mt-1.5 text-[8px] text-[#6E6E73]">{ev.details[0]}</figcaption>
            </figure>
            <figure>
              <CropThumb url={p.booth} crop={second} source={BOOTH_ASPECTS[format]} aspect={3 / 2} className="rounded-xl" />
              <figcaption className="mt-1.5 text-[8px] text-[#6E6E73]">{ev.details[1]}</figcaption>
            </figure>
          </div>
          <div className="mt-auto grid grid-cols-4 gap-[4mm] border-t border-black/10 pt-[6mm]">
            {[
              [Icons.truck, "Helhetslösning", `Allt du behöver för ${ev.bigOne.replace(/^(en|ett) stort? /, (m) => (m.startsWith("ett") ? "ett lyckat " : "en lyckad "))} på ett ställe.`],
              [Icons.brush, "Varumärkesanpassat", "Alla produkter med er logotyp och era färger."],
              [Icons.doc, "Snabb leverans", "Vi ser till att allt levereras i tid inför ert event."],
              [Icons.headset, "Personlig kontakt", "En av våra säljare hjälper er hela vägen."],
            ].map(([icon, t, d]) => (
              <div key={t as string}>
                <span className="text-[#1D1D1F] [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
                <p className="mt-1.5 text-[10px] font-semibold">{t}</p>
                <p className="mt-0.5 text-[8px] leading-snug text-[#6E6E73]">{d}</p>
              </div>
            ))}
          </div>
        </Page>
      </div>
    </div>
  );
}
