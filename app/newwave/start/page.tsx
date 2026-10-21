import type { Metadata } from "next";
import Link from "next/link";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { HubMapButton } from "@/components/newwave/landing/HubMap";
import { PortalFilm } from "@/components/newwave/landing/PortalFilm";
import { LogoMark } from "@/components/newwave/Logo";
import { ShareDemo } from "@/components/newwave/ShareDemo";
import { PORTALS } from "@/lib/newwave/hub";

export const metadata: Metadata = { title: "Välj ingång · Next Wave" };

/** Efter filmen: de fyra ingångarna i samma skal som designmotorn och dashboardsen, på bred skärm i en rad; kartan öppnas från toppraden. */
export default function StartPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-4 py-3 backdrop-blur-xl min-[900px]:gap-5 min-[900px]:px-6">
          <Link href="/newwave" className="flex min-h-9 min-w-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – till filmen">
            <LogoMark size={28} />
            <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
          </Link>
          <span className="hidden text-[14px] text-[#6F6B63] sm:inline">Välj ingång</span>
          <div className="ml-auto flex items-center gap-2">
            <HubMapButton className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-medium text-[#111] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.35)]">
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2.5" />
                <circle cx="5" cy="6" r="1.8" />
                <circle cx="19" cy="6" r="1.8" />
                <circle cx="5" cy="18" r="1.8" />
                <circle cx="19" cy="18" r="1.8" />
                <path d="M6.5 7.2 10 10.3M17.5 7.2 14 10.3M6.5 16.8 10 13.7M17.5 16.8 14 13.7" />
              </svg>
              <span className="hidden md:inline">Så pratar hubben med New Wave</span>
              <span className="md:hidden">Hubben</span>
            </HubMapButton>
            <ShareDemo />
          </div>
        </header>

        <div className="flex flex-1 flex-col">
          <main className="min-w-0 flex-1 px-3 py-5 min-[900px]:px-10 min-[900px]:py-7 xl:flex xl:flex-col xl:justify-center">
            <div className="mx-auto max-w-[1180px] xl:w-full xl:max-w-[1320px]">
              <p className="nw-mono text-center text-[12px] uppercase tracking-[0.06em] text-[#6F6B63]">Fyra ingångar · samma motor</p>
              <h1 className="sr-only">Välj ingång</h1>
              <ul className="mt-4 grid gap-5 sm:grid-cols-2 sm:gap-8 xl:grid-cols-4 xl:gap-5">
                {PORTALS.map((p, i) => (
                  <li key={p.id}>
                    <PortalFilm portal={p} n={i + 1} />
                  </li>
                ))}
              </ul>
            </div>
          </main>
        </div>
      </div>
      <HubFooterSlim />
    </div>
  );
}
