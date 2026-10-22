import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CartLink } from "@/components/newwave/clubshop/ShopParts";
import { ShopBeacon } from "@/components/newwave/clubshop/track";
import { intersportClub, intersportPath } from "@/lib/intersport";
import { shopVars } from "@/lib/newwave/theme";

type Props = { params: Promise<{ clubId: string }>; children: React.ReactNode };

const INTERSPORT = shopVars({ primary: "#164194", accent: "#E30613", background: "#F5F5F7" });

export async function generateMetadata({ params }: { params: Promise<{ clubId: string }> }): Promise<Metadata> {
  const club = await intersportClub((await params).clubId);
  return { title: club ? `${club.name} klubbshop · Intersport` : "Intersport" };
}

/** Klubbshoppen hos Intersport, simulerad: produkterna kommer via API:t, och här ligger varukorgen och kassan. */
export default async function IntersportLayout({ params, children }: Props) {
  const { clubId } = await params;
  const club = await intersportClub(clubId);
  if (!club) notFound();
  const home = intersportPath(clubId);
  return (
    <div style={INTERSPORT} className="flex min-h-screen flex-col bg-white text-[#1D1D1F]">
      <p className="bg-[#FFF4E5] px-4 py-1.5 text-center text-xs text-[#8A4B00]">Simulerad Intersport-klubbshop för demo – produkterna publiceras hit via API från Next Wave</p>
      <header className="sticky top-0 z-30 border-b border-[#E5E5EA] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4 sm:px-6">
          <Link href={home} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- Intersports logga */}
            <img src="/intersport-logo.svg" alt="Intersport" className="h-[15px] w-auto sm:h-[18px]" />
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[13px] text-[#3A3A3C] sm:gap-6 sm:text-sm">
            <span className="hidden sm:inline">Dam</span>
            <span className="hidden sm:inline">Herr</span>
            <span className="hidden sm:inline">Barn</span>
            <Link href={home} className="font-semibold text-[#164194]">
              Klubbshop
            </Link>
            <CartLink clubId={clubId} href={`${home}/kassa`} />
          </nav>
        </div>
      </header>
      <ShopBeacon clubId={clubId} />
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-[#E5E5EA] bg-[#F5F5F7] text-[13px] text-[#3A3A3C]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-8 sm:px-6">
          <p>
            <span className="font-semibold text-[#1D1D1F]">{club.name} klubbshop</span> · Tryckt på beställning av New Wave · Varje köp stöttar klubben
          </p>
          <p>kundservice@intersport.se</p>
        </div>
        <p className="mx-auto max-w-[1320px] border-t border-[#E5E5EA] px-4 py-4 text-[12px] text-[#6E6E73] sm:px-6">Demo – det här är inte Intersports riktiga butik. Inga beställningar skickas och inga pengar dras.</p>
      </footer>
    </div>
  );
}
