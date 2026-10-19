import type { Metadata } from "next";
import { BrandColors } from "@/components/newwave/BrandColors";
import { BrandScan } from "@/components/newwave/BrandScan";
import { ClubRules } from "@/components/newwave/ClubRules";
import { ASA_IF as CLUB } from "@/lib/club";
import { copyFor } from "@/lib/copy";
import { ASA_IF } from "@/lib/newwave/club";
import { readCraftRules } from "@/lib/newwave/craftState";
import { readBrand } from "@/lib/newwave/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Varumärke` };

const VARIANTS = [
  { file: "skold-farg.png", label: "Fullfärg", note: "Ljusa produkter och digitalt", bg: "bg-white" },
  { file: "skold-svart.png", label: "Svart", note: "En färg på ljust", bg: "bg-white" },
  { file: "skold-vit.png", label: "Vit", note: "En färg på mörkt", bg: "bg-[var(--club)]" },
];

export default async function BrandPage() {
  const [brand, craft] = await Promise.all([readBrand(CLUB.id), readCraftRules()]);
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Varumärke</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Det här vet hubben om {CLUB.name}. Alla agenter följer det när de skapar material.</p>

      <section className="mt-8">
        <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Klubbmärke</h2>
        <ul className="mt-3 grid grid-cols-3 gap-3">
          {VARIANTS.map((v) => (
            <li key={v.file} className="min-w-0">
              <div className={`grid aspect-square place-items-center rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-5 ${v.bg}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/brand/${CLUB.id}/${v.file}`} alt={`${CLUB.name} ${v.label.toLowerCase()}`} className="max-h-full w-full object-contain" />
              </div>
              <p className="mt-2 truncate text-[13.5px] font-medium text-[var(--nw-ink)]">{v.label}</p>
              <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{v.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Färger</h2>
          <BrandColors clubId={CLUB.id} original={CLUB.palette} saved={brand.palette} />
        </div>
        <div className="min-w-0">
          <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Typsnitt</h2>
          <div className="mt-3 flex flex-col gap-2">
            <div className="rounded-2xl bg-[var(--nw-soft)] p-4">
              <p className="nw-club-heading text-[26px] leading-none text-[var(--club)]">Oswald</p>
              <p className="mt-1.5 text-[12.5px] text-[var(--nw-muted)]">Rubriker, slogans och tryck</p>
            </div>
            <div className="rounded-2xl bg-[var(--nw-soft)] p-4">
              <p className="text-[20px] font-semibold leading-none text-[var(--nw-ink)]" style={{ fontFamily: '"Open Sans", var(--font-inter), sans-serif' }}>
                Open Sans
              </p>
              <p className="mt-1.5 text-[12.5px] text-[var(--nw-muted)]">Brödtext på webb och i nyhetsbrev</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Tonalitet</h2>
        <BrandScan clubId={CLUB.id} site={new URL(CLUB.sources.website).host} defaultTone={CLUB.tone} initial={brand} loaderLines={copyFor(CLUB).loaderLines} loaderDone={copyFor(CLUB).loaderDone} />
      </section>

      <ClubRules clubId={CLUB.id} base={CLUB.rules} craft={craft.rules} initial={brand.ownRules ?? []} />
    </div>
  );
}
