import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DELIVERY_DAYS } from "@/components/newwave/clubshop/pricing";
import { ShopNav } from "@/components/newwave/clubshop/ShopNav";
import { ShopBeacon } from "@/components/newwave/clubshop/track";
import { Icon } from "@/components/newwave/DashNav";
import { intersportPath } from "@/lib/intersport";
import { shopPath } from "@/lib/newwave/clubShop";
import { canEditShop, readContent } from "@/lib/newwave/clubShopContent";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { clubTheme, shopVars } from "@/lib/newwave/theme";
import { clubQuality } from "@/lib/newwave/wordmark/quality";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const club = await wordmarkClub((await params).id);
  return { title: club ? `${genitive(club.name)} butik` : "Butik" };
}

/** Klubbens demobutik: klubbens färger och märke runt sidorna. Man köper i klubbshoppen hos Intersport. */
export default async function ClubShopLayout({ params, children }: Props) {
  const { id } = await params;
  const [club, quality, content, editor] = await Promise.all([wordmarkClub(id), clubQuality(id), readContent(id), canEditShop(id)]);
  if (!club) notFound();
  const theme = clubTheme(club.colors.map((hex) => ({ name: hex, hex })));
  const whiteLogo = Boolean(quality?.issues.some((i) => i.id === "logo-white"));
  const home = shopPath(id);
  const intersport = intersportPath(id);
  return (
    <div style={shopVars({ primary: theme.primary, accent: theme.accent, background: theme.soft })} className="flex min-h-screen flex-col bg-white text-[#111]">
      <p className="bg-[var(--shop)] px-4 py-2 text-center text-[12.5px] font-medium text-[var(--shop-on)]">
        Beställ hos Intersport · Trycks på beställning, hos dig inom {DELIVERY_DAYS[0]}–{DELIVERY_DAYS[1]} arbetsdagar
      </p>
      <header className="sticky top-0 z-30 border-b border-[var(--shop-line)] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6">
          <Link href={home} className="flex min-w-0 items-center gap-3">
            {club.logo ? (
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl p-1.5 ${whiteLogo ? "bg-[var(--shop)]" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- klubbens märke */}
                <img src={club.logo} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            ) : null}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[16px] font-bold tracking-[-0.01em]">{club.name}</span>
              <span className="block text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#6F6B63]">Klubbens butik</span>
            </span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ShopNav home={home} />
            <Link href={intersport} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--shop)] px-4 text-[14px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
              <span className="sm:hidden">Intersport</span>
              <span className="hidden sm:inline">Handla hos Intersport</span>
              <span aria-hidden>→</span>
            </Link>
            {editor ? (
              <Link href={`/newwave/klubbar/${id}/dashboard`} aria-label="Klubbens dashboard" className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--shop-line)] px-3 text-[14px] font-medium transition hover:border-[#111] sm:px-4">
                <Icon name="chart" className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            ) : null}
          </div>
        </div>
        <ShopNav home={home} mobile />
      </header>
      <ShopBeacon clubId={id} />
      <main className="flex-1">{children}</main>
      <footer className="mt-16 bg-[var(--shop)] text-[var(--shop-on)]">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="min-w-0">
            <p className="text-[19px] font-bold">{club.name}</p>
            <p className="mt-2 max-w-[40ch] text-[13.5px] leading-relaxed opacity-75">Kläder med {genitive(club.name)} namn, färger och märke. Varje köp stöttar klubben.</p>
          </div>
          <div className="text-[13.5px]">
            <p className="font-semibold">Handla</p>
            <ul className="mt-3 grid gap-1.5 opacity-75">
              <li>
                <Link href={`${home}#sortiment`} className="hover:underline">
                  Hela sortimentet
                </Link>
              </li>
              <li>
                <Link href={intersport} className="hover:underline">
                  Klubbshoppen hos Intersport
                </Link>
              </li>
              <li>
                <Link href={`${home}/om-oss`} className="hover:underline">
                  Om oss
                </Link>
              </li>
            </ul>
          </div>
          <div id="kontakt" className="min-w-0 scroll-mt-20 text-[13.5px]">
            <p className="font-semibold">Kontakta oss</p>
            <div className="mt-3 grid gap-1.5 leading-relaxed opacity-75">
              {content.email ? (
                <a href={`mailto:${content.email}`} className="break-all hover:underline">
                  {content.email}
                </a>
              ) : null}
              {content.phone ? (
                <a href={`tel:${content.phone.replace(/[\s-]/g, "")}`} className="hover:underline">
                  {content.phone}
                </a>
              ) : null}
              <Link href={`${home}/kontakt`} className="hover:underline">
                Alla kontaktvägar →
              </Link>
            </div>
          </div>
          <div className="text-[13.5px]">
            <p className="font-semibold">Leverans</p>
            <p className="mt-3 leading-relaxed opacity-75">
              Du beställer och betalar hos Intersport. Allt trycks på beställning av New Wave och skickas inom {DELIVERY_DAYS[0]}–{DELIVERY_DAYS[1]} arbetsdagar.
            </p>
          </div>
        </div>
        <p className="mx-auto max-w-[1320px] border-t border-current/15 px-4 py-5 text-[12px] opacity-60 sm:px-6">Demobutik från Next Wave – klubbshoppen hos Intersport är också en demo, där skickas inga beställningar och inga pengar dras.</p>
      </footer>
    </div>
  );
}
