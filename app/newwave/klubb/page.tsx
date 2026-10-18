import type { Metadata } from "next";
import { Suspense } from "react";
import { HubSection, HubSkeleton, MailSection, MotifSection, PackSection, ShopSection } from "@/components/newwave/showcase/CaseSections";
import { ClubShowcase } from "@/components/newwave/showcase/ClubShowcase";
import { ASA_IF as CLUB } from "@/lib/club";
import { ASA_IF, packClub } from "@/lib/newwave/club";
import { CLUB_CASE as C } from "@/lib/newwave/clubCase";
import { readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Så fungerar det` };

export default async function ClubShowcasePage() {
  const brand = await readBrand(CLUB.id);
  const theme = clubTheme(brand.palette ?? CLUB.palette);
  const win = C.motifs[C.picked];
  const images = C.photos.length + Object.keys(C.assets).length + C.products.length;
  const pack = {
    club: packClub(ASA_IF, theme),
    clubId: CLUB.id,
    slogan: C.title,
    story: C.story,
    occasion: C.occasion,
    week: C.week,
    content: C.content,
    assets: C.assets,
    photos: C.photos,
    products: C.products,
    printFiles: C.printFiles,
    shopUrl: C.shopUrl,
  };
  return (
    <ClubShowcase
      club={{ name: ASA_IF.name, founded: ASA_IF.founded, logo: ASA_IF.logo, agent: CLUB.agent.name }}
      week={C.week}
      dashboard="/newwave/klubb/oversikt"
      peeks={[`${C.motifs.length} motiv ur ${C.signals.length} signaler`, `”${win.slogan}” vann`, `${images} bilder och alla texter`, "Skickat 07.00 med zip-fil", `${C.products.length} produkter till tryck och butik`]}
      sections={[
        { id: "motiv", after: 2, node: <MotifSection signals={C.signals} motifs={C.motifs} picked={C.picked} art={C.printFiles.light} /> },
        { id: "paket", after: 3, node: <PackSection slogan={C.title} assets={C.assets} photos={C.photos} products={C.products} content={C.content} /> },
        { id: "mejl", after: 4, node: <MailSection pack={pack} agent={CLUB.agent.name} sentAt={C.mailedAt} /> },
        {
          id: "tryck",
          after: 5,
          node: (
            <Suspense fallback={<HubSkeleton />}>
              <HubSection approvedAt={C.approvedAt} />
            </Suspense>
          ),
        },
        { id: "butik", after: 5, node: <ShopSection club={ASA_IF.name} logo={ASA_IF.logo} slogan={C.title} week={C.week} products={C.products} /> },
      ]}
    />
  );
}
