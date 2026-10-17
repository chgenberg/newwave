import type { Metadata } from "next";
import { MaterialStudio } from "@/components/newwave/MaterialStudio";
import { MaterialTabs } from "@/components/newwave/MaterialTabs";
import { ASA_IF as CLUB } from "@/lib/club";
import { copyFor } from "@/lib/copy";
import { ASA_IF, clubOccasions, packClub } from "@/lib/newwave/club";
import { listApprovals, readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Material` };

export default async function MaterialPage({ searchParams }: { searchParams: Promise<{ tillfalle?: string }> }) {
  const { tillfalle } = await searchParams;
  const occasions = clubOccasions(new Date(), 365).slice(0, 8);
  const [brand, approvals] = await Promise.all([readBrand(CLUB.id), listApprovals(CLUB.id)]);
  const theme = clubTheme(brand.palette ?? CLUB.palette);
  const text = copyFor(CLUB);
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Material</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">
        Välj ett tillfälle. {CLUB.agent.name} föreslår motiv, Designagenten gör tryckfilen och Contentagenten gör inlägg, banner och nyhetsbrev. Ni godkänner innan produkterna hamnar i butiken, och inläggen lägger ni upp själva.
      </p>
      <div className="mt-5">
        <MaterialTabs active="eget" pending={approvals.some((a) => a.weekly && a.status === "väntar")} />
      </div>
      <div className="mt-6">
        <MaterialStudio
          clubId={CLUB.id}
          clubName={CLUB.name}
          footer={`${CLUB.name} · Sedan ${CLUB.founded}`}
          primary={theme.primary}
          pack={packClub(ASA_IF, theme)}
          shopName={text.shopName}
          occasions={occasions}
          initialId={tillfalle}
          loaderLines={text.loaderLines}
          loaderDone={text.loaderDone}
        />
      </div>
    </div>
  );
}
