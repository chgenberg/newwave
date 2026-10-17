import Image from "next/image";
import Link from "next/link";
import { HubMap } from "@/components/newwave/HubMap";
import { HeroFilm } from "@/components/newwave/landing/HeroFilm";
import { PortalIndex } from "@/components/newwave/landing/PortalIndex";
import { CountUp, Reveal, SplitText } from "@/components/newwave/motion/Motion";
import { SmoothScroll } from "@/components/newwave/motion/SmoothScroll";
import { CRAFT_CLUBS } from "@/lib/newwave/craft";
import { HERO_VIDEO, PORTALS } from "@/lib/newwave/hub";
import { hubLive } from "@/lib/newwave/nwHub";
import { sek } from "@/lib/newwave/reseller";

export const dynamic = "force-dynamic";

export default async function NewWaveHome() {
  const live = await hubLive();
  const stats = [
    { value: live.legs.ytor.value, label: "ytor i drift", detail: live.legs.ytor.detail },
    { value: live.legs.content.value, label: "material senaste 30 dagarna", detail: live.legs.content.detail },
    { value: String(live.stats.toStart + live.stats.inProd), label: "ordrar på väg till tryck", detail: `${live.stats.toStart} att starta, ${live.stats.inProd} i produktion` },
    { value: sek(live.stats.revenue30), label: "orderintäkt för New Wave", detail: "senaste 30 dagarna" },
  ];

  return (
    <>
      <SmoothScroll />

      <section className="nw-container pb-12 pt-8 sm:pb-16 sm:pt-12 lg:pt-16">
        <div className="nw-page nw-mono flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-b border-[var(--nw-line)] pb-4 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-muted)]">
          <span>Next Wave Commerce Hub</span>
          <span className="hidden lg:inline">New Wave Group · Craft · Klubbar · Återförsäljare</span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2BB673] opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2BB673]" />
            </span>
            Navet live
          </span>
        </div>

        <SplitText text="En hub för allt material." className="mt-8 max-w-[13ch] text-[clamp(52px,10.4vw,168px)] font-semibold leading-[0.9] tracking-[-0.055em] text-[var(--nw-ink)] sm:mt-12" />

        <div className="mt-10 grid gap-8 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Reveal delay={0.35}>
            <p className="max-w-[44ch] text-[17px] leading-[1.55] text-[var(--nw-muted)] sm:text-[19px]">
              Klubbar, Craft, New Wave och återförsäljare skapar, granskar och godkänner i samma hub. Det som ska tryckas, säljas och levereras skickas vidare till New Wave via API.
            </p>
          </Reveal>
          <Reveal delay={0.45} className="flex flex-wrap gap-3">
            <Link href="#ingangar" className="group inline-flex h-12 items-center gap-3 rounded-full bg-[var(--nw-ink)] pl-6 pr-2 text-[15px] font-medium text-white transition-transform duration-300 active:scale-[0.97]">
              Välj din ingång
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/12 transition-transform duration-500 group-hover:translate-y-0.5">↓</span>
            </Link>
            <Link href="#navet" className="inline-flex h-12 items-center rounded-full px-5 text-[15px] font-medium text-[var(--nw-ink)] ring-1 ring-[var(--nw-line)] transition-colors hover:ring-[var(--nw-ink)]">
              Så fungerar navet
            </Link>
          </Reveal>
        </div>
      </section>

      <HeroFilm src={HERO_VIDEO.src} poster={HERO_VIDEO.poster} title="Next Wave Commerce Hub" />

      <section aria-label="Navet just nu" className="nw-container pt-20 sm:pt-28">
        <SectionHead n="01" label="Navet just nu" title="Siffrorna är live från klubbar, Craft och återförsäljare." />
        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden border-y border-[var(--nw-line)] bg-[var(--nw-line)] lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06} className="flex flex-col bg-white py-6 pr-4 sm:py-8 sm:pr-6 [&:nth-child(even)]:pl-4 sm:[&:nth-child(even)]:pl-6 lg:[&:not(:first-child)]:pl-6">
              <dt className="nw-mono mt-4 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-ink)]">{s.label}</dt>
              <dd className="order-first whitespace-nowrap text-[clamp(30px,4.2vw,56px)] font-semibold leading-none tracking-[-0.045em] text-[var(--nw-ink)]">
                <CountUp value={s.value} />
              </dd>
              <dd className="mt-1.5 text-[13px] leading-snug text-[var(--nw-muted)]">{s.detail}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      <section aria-label="Klubbar i navet" className="pt-16 sm:pt-20">
        <p className="nw-container nw-mono text-[12px] uppercase tracking-[0.06em] text-[var(--nw-muted)]">{CRAFT_CLUBS.length} klubbar skapar redan i navet</p>
        <div className="nw-marquee-wrap mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <ul className="nw-marquee">
            {[0, 1].map((copy) =>
              CRAFT_CLUBS.map((c) => (
                <li key={`${copy}-${c.id}`} aria-hidden={copy === 1 || undefined} className="flex shrink-0 items-center gap-3 px-7 sm:px-10">
                  {c.logo ? <Image src={c.logo} alt="" width={40} height={40} unoptimized className="h-9 w-9 object-contain grayscale transition duration-500 hover:grayscale-0 sm:h-10 sm:w-10" /> : null}
                  <span className="whitespace-nowrap text-[15px] font-medium tracking-[-0.01em] text-[var(--nw-ink)]">{c.name}</span>
                </li>
              )),
            )}
          </ul>
        </div>
      </section>

      <section id="navet" className="nw-container scroll-mt-20 pt-20 sm:pt-28">
        <SectionHead n="02" label="Navet" title="Sju ben, ett API. Tryck på ett ben för att se vad som händer där." />
        <Reveal className="mt-10">
          <HubMap />
        </Reveal>
      </section>

      <section id="ingangar" className="nw-container scroll-mt-20 pb-24 pt-20 sm:pb-32 sm:pt-28">
        <SectionHead n="03" label="Fyra ingångar" title="Välj vem du är." />
        <Reveal className="mt-10">
          <PortalIndex portals={PORTALS} />
        </Reveal>
      </section>
    </>
  );
}

function SectionHead({ n, label, title }: { n: string; label: string; title: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10">
      <p className="nw-mono pt-2 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-muted)]">
        ({n}) {label}
      </p>
      <Reveal>
        <h2 className="max-w-[22ch] text-[clamp(30px,4.2vw,60px)] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--nw-ink)]">{title}</h2>
      </Reveal>
    </div>
  );
}
