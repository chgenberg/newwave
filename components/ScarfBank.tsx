"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, FactoryDialog, Pictures, ScarfActions, type ScarfInfo } from "@/components/ScarfParts";
import { LogoMark } from "@/components/newwave/Logo";
import { SCARF } from "@/lib/scarf";
import type { BankScarf } from "@/lib/scarfBank";

type Group = "alla" | "idrott" | "annat" | "motiv";

export function ScarfBank({ bank }: { bank: { date: string; scarves: BankScarf[] } }) {
  const [group, setGroup] = useState<Group>("alla");
  const [factory, setFactory] = useState(false);
  const match = (s: BankScarf, g: Group) => g === "alla" || (g === "motiv" ? s.art : s.club.group === g);
  const shown = bank.scarves.filter((s) => match(s, group));
  const groups: [Group, string][] = [
    ["alla", "Alla"],
    ["idrott", "Idrottsföreningar"],
    ["annat", "Företag och föreningar"],
    ["motiv", "Ritade motiv"],
  ];

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
          <Link href="/halsduk" className="hidden h-10 items-center rounded-full px-3 text-[13px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60 sm:inline-flex">
            Rita själv i studion
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
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">En halsduk åt var och en.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#6E6E73]">Idrottsföreningar, företag och föreningar – var och en med sin egen halsduk och stickfilerna till produktionen.</p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {groups.map(([g, label]) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition ${group === g ? "bg-[#1D1D1F] text-white" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}>
              {label}
              <span className={group === g ? "text-white/60" : "text-[#86868B]"}>{bank.scarves.filter((s) => match(s, g)).length}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {shown.map((s) => {
            const crest = `/halsduk/bank/${s.club.id}-skold.png`;
            const info: ScarfInfo = {
              eyebrow: `${s.club.name} · ${s.recipeLabel}`,
              title: s.idea.title,
              why: s.idea.why,
              images: { front: `/halsduk/bank/${s.slug}-fram.jpg`, back: `/halsduk/bank/${s.slug}-bak.jpg` },
              text: s.text,
              yarns: s.yarns,
              machine: { ok: s.ok, summary: `${s.yarns.length} garner, högst ${s.maxColorsPerRow} per varv${s.system === "dubbel" ? " – dubbelsystem möjligt" : ""}${s.minTextMm !== null ? `, minsta text ${s.minTextMm} mm` : ""}.` },
              review: s.review,
              first: s.firstReview ? { review: s.firstReview } : null,
              consent: s.consent,
            };
            return (
              <article key={s.slug} className="flex flex-col rounded-3xl border border-black/[0.08] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={crest} alt="" className="max-h-11 max-w-11 object-contain" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold tracking-tight">{s.club.name}</p>
                    <p className="truncate text-[12.5px] text-[#86868B]">{[s.club.category, s.club.city].filter(Boolean).join(" · ")}</p>
                  </div>
                  {s.art && (
                    <span className="ml-auto">
                      <Badge>Ritat motiv</Badge>
                    </span>
                  )}
                </div>
                <div className="mt-4 rounded-2xl bg-[#F5F5F7] p-3">
                  <Pictures front={info.images.front} back={info.images.back} text={s.text} />
                </div>
                <div className="mt-auto pt-4">
                  <ScarfActions info={info} download={{ bank: s.slug }} photo={{ club: s.club.name, headline: s.idea.front.main || s.idea.back.main, crestUrl: crest, everyday: s.club.group === "annat" }} />
                </div>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-[13px] leading-relaxed text-[#86868B]">
          Halsdukarna är förslag. Företagen är påhittade exempel, klubbmärkena kommer från Gräsrot 360 och klubbregistret, och inget stickas förrän beställaren har godkänt.{" "}
          <button type="button" onClick={() => setFactory(true)} className="font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
            Vad får stickeriet?
          </button>
        </p>
      </div>
      {factory && <FactoryDialog onClose={() => setFactory(false)} />}
    </main>
  );
}
