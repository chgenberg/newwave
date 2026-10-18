import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { HubMapButton } from "@/components/newwave/landing/HubMap";
import { PortalFilm } from "@/components/newwave/landing/PortalFilm";
import { LogoMark } from "@/components/newwave/Logo";
import { ShareDemo } from "@/components/newwave/ShareDemo";
import { PORTALS } from "@/lib/newwave/hub";

export const metadata: Metadata = { title: "Välj ingång · Next Wave" };

/** På bred skärm står kartan i mitten och ingångarna två och två på var sida. */
const PLACE = ["xl:col-start-1 xl:row-start-1", "xl:col-start-3 xl:row-start-1", "xl:col-start-1 xl:row-start-2", "xl:col-start-3 xl:row-start-2"];

/** Efter filmen: de fyra ingångarna i samma skal som designmotorn och dashboardsen. */
export default function StartPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-4 py-3 backdrop-blur-xl min-[900px]:gap-5 min-[900px]:px-6">
          <Link href="/newwave" className="flex min-h-9 min-w-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – till filmen">
            <LogoMark size={28} />
            <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
          </Link>
          <span className="text-[14px] text-[#6F6B63]">Välj ingång</span>
          <div className="ml-auto">
            <ShareDemo />
          </div>
        </header>

        <div className="flex flex-1 flex-col">
          <main className="min-w-0 flex-1 px-3 py-5 min-[900px]:px-10 min-[900px]:py-7">
            <div className="mx-auto max-w-[1180px] xl:max-w-[min(1280px,calc((100svh-290px)*1.6+330px))]">
              <p className="nw-mono text-[12px] uppercase tracking-[0.06em] text-[#6F6B63]">Fyra ingångar · samma motor</p>
              <h1 className="mt-2 text-[clamp(30px,3.6vw,46px)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#111]">Vem är du?</h1>
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 sm:gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(250px,0.62fr)_minmax(0,1fr)] xl:gap-x-10 xl:gap-y-9">
                {PORTALS.map((p, i) => (
                  <Fragment key={p.id}>
                    {i === 2 ? (
                      <li className="grid place-items-center sm:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-span-2 xl:row-start-1">
                        <HubMapButton className="w-full max-w-[420px]" />
                      </li>
                    ) : null}
                    <li className={PLACE[i]}>
                      <PortalFilm portal={p} n={i + 1} />
                    </li>
                  </Fragment>
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
