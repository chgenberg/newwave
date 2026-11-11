"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, FactoryDialog, Pictures, ScarfActions, type PhotoTarget, type ScarfInfo } from "@/components/ScarfParts";
import { LogoMark } from "@/components/newwave/Logo";
import { SCARF } from "@/lib/scarf";
import type { BankScarf } from "@/lib/scarfBank";
import type { DemoScarf } from "@/lib/scarfDemo";

/** Ett kort i banken, oavsett om halsduken kommer från bankens körning eller demokörningen. */
type Card = { key: string; name: string; sub: string; crest: string; art: boolean; info: ScarfInfo; download: unknown; photo: PhotoTarget };

const machine = (s: { yarns: unknown[]; maxColorsPerRow: number; system: "dubbel" | "enkel"; minTextMm: number | null }) =>
  `${s.yarns.length} garner, högst ${s.maxColorsPerRow} per varv${s.system === "dubbel" ? " – dubbelsystem möjligt" : ""}${s.minTextMm !== null ? `, minsta text ${s.minTextMm} mm` : ""}.`;

function fromBank(s: BankScarf): Card {
  const crest = `/halsduk/bank/${s.club.id}-skold.png`;
  return {
    key: s.slug,
    name: s.club.name,
    sub: [s.club.category, s.club.city].filter(Boolean).join(" · "),
    crest,
    art: s.art,
    info: {
      eyebrow: `${s.club.name} · ${s.recipeLabel}`,
      title: s.idea.title,
      why: s.idea.why,
      images: { front: `/halsduk/bank/${s.slug}-fram.jpg`, back: `/halsduk/bank/${s.slug}-bak.jpg` },
      text: s.text,
      yarns: s.yarns,
      machine: { ok: s.ok, summary: machine(s) },
      review: s.review,
      first: s.firstReview ? { review: s.firstReview } : null,
      consent: s.consent,
    },
    download: { bank: s.slug },
    photo: { club: s.club.name, headline: s.idea.front.main || s.idea.back.main, crestUrl: crest },
  };
}

function fromDemo(s: DemoScarf, sub: string): Card {
  const crest = `/api/v1/brand/${s.clubId}/skold-farg.png`;
  return {
    key: s.slug,
    name: s.club,
    sub,
    crest,
    art: s.art,
    info: {
      eyebrow: `${s.club} · ${s.recipeLabel}`,
      title: s.idea.title,
      why: s.idea.why,
      signal: s.idea.signal,
      images: { front: `/halsduk/demo/${s.slug}-fram.jpg`, back: `/halsduk/demo/${s.slug}-bak.jpg` },
      text: s.text,
      yarns: s.yarns,
      machine: { ok: s.ok, summary: machine(s) },
      review: s.review,
      first: s.firstReview ? { review: s.firstReview } : null,
      consent: s.consent,
    },
    download: { clubId: s.clubId, idea: s.idea, demo: s.slug },
    photo: { club: s.club, headline: s.idea.front.main || s.idea.back.main, crestUrl: crest },
  };
}

/**
 * Inspirationsbanken: idrottsföreningarnas halsdukar ur bankens körning och demokörningen, varvade så att föreningarna blandas.
 * `places` är raden under föreningens namn för demokörningens föreningar (sport och ort).
 */
export function ScarfBank({ bank, demo, places }: { bank: BankScarf[]; demo: DemoScarf[]; places: Record<string, string> }) {
  const [factory, setFactory] = useState(false);
  const [a, b] = [bank.map(fromBank), demo.map((s) => fromDemo(s, places[s.clubId] ?? ""))];
  const cards = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter((c): c is Card => Boolean(c));

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Link href="/newwave/start" className="flex min-h-9 items-center gap-2.5 text-[15px] font-semibold tracking-tight" aria-label="Next Wave – till ingångarna">
          <LogoMark size={28} />
          <span>
            <span className="hidden text-[13px] tracking-[0.18em] sm:inline">NEXT WAVE </span>
            <span className="font-normal text-[#86868B]">Inspirationsbanken</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/halsduk/sparade" className="hidden h-10 items-center rounded-full bg-[#F5F5F7] px-4 text-[13px] font-medium text-[#1D1D1F] hover:bg-[#E8E8ED] sm:inline-flex">
            Sparade designer
          </Link>
          <Link href="/halsduk/agent" className="inline-flex h-10 items-center rounded-full bg-[#1D1D1F] px-4 text-[13px] font-medium text-white hover:bg-black">
            Kör agenten
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mt-8 text-center sm:mt-12">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#86868B]">
            Inspirationsbank · stickas av {SCARF.factory} på {SCARF.machine}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">Halsdukar att börja från.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#6E6E73]">
            {cards.length} halsdukar som agenten har tagit fram för idrottsföreningar – var och en med stickfilerna till produktionen.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {cards.map((c) => (
            <article key={c.key} className="flex flex-col rounded-3xl border border-black/[0.08] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.crest} alt="" className="max-h-11 max-w-11 object-contain" loading="lazy" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold tracking-tight">{c.name}</p>
                  <p className="truncate text-[12.5px] text-[#86868B]">{[c.sub, c.info.title].filter(Boolean).join(" · ")}</p>
                </div>
                {c.art && (
                  <span className="ml-auto">
                    <Badge>Ritat motiv</Badge>
                  </span>
                )}
              </div>
              <div className="mt-4 rounded-2xl bg-[#F5F5F7] p-3">
                <Pictures front={c.info.images.front} back={c.info.images.back} text={c.info.text} />
              </div>
              <div className="mt-auto pt-4">
                <ScarfActions info={c.info} download={c.download} photo={c.photo} />
              </div>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-[13px] leading-relaxed text-[#86868B]">
          Halsdukarna är förslag. Klubbmärkena kommer från klubbarna, Gräsrot 360 och klubbregistret, och inget stickas förrän beställaren har godkänt.{" "}
          <button type="button" onClick={() => setFactory(true)} className="font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
            Vad får stickeriet?
          </button>
        </p>
      </div>
      {factory && <FactoryDialog onClose={() => setFactory(false)} />}
    </main>
  );
}
