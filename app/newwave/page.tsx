import Link from "next/link";
import { HeroFilm } from "@/components/newwave/landing/HeroFilm";
import { HERO_VIDEO } from "@/lib/newwave/hub";

export default function NewWaveHome() {
  return (
    <main className="flex h-[100svh] min-h-[520px] flex-col bg-[#141416]">
      <HeroFilm src={HERO_VIDEO.src} poster={HERO_VIDEO.poster} title="Filmen om Next Wave" track />
      <Link
        href="/newwave/start"
        className="group flex h-20 w-full shrink-0 items-center justify-between gap-4 bg-white px-5 text-[#111] transition-colors duration-300 hover:bg-[#F1F1EE] sm:h-24 sm:px-8 lg:px-10"
      >
        <span className="nw-mono hidden text-[12px] uppercase tracking-[0.06em] text-[#6F6B63] sm:inline">Klubb · Craft · New Wave · Återförsäljare</span>
        <span className="flex flex-1 items-center justify-between gap-4 sm:flex-none">
          <span className="text-[clamp(22px,2.6vw,32px)] font-semibold tracking-[-0.035em]">Starta</span>
          <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-[#111] text-white transition-transform duration-500 group-hover:translate-x-1 sm:h-12 sm:w-12">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      </Link>
    </main>
  );
}
