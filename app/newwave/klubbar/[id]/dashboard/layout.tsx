/* eslint-disable @next/next/no-img-element -- klubbens märke */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ClubDashNav } from "@/components/newwave/clubs/ClubDashNav";
import { ClubPortal } from "@/components/newwave/clubs/ClubPortal";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { intersportPath } from "@/lib/intersport";
import { shopPath } from "@/lib/newwave/clubShop";
import { clubQuality } from "@/lib/newwave/wordmark/quality";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await wordmarkClub((await params).id);
  return { title: club ? `${club.name} · Dashboard · Next Wave` : "Next Wave" };
}

/** Klubbens dashboard: översikt, statistik och webshoppen, med sidomeny. */
export default async function ClubDashboardLayout({ params, children }: Props & { children: React.ReactNode }) {
  const { id } = await params;
  const [club, quality, insider] = await Promise.all([wordmarkClub(id), clubQuality(id), (async () => hasAccess((await cookies()).get(ACCESS_COOKIE)?.value))()]);
  if (!club) notFound();
  const whiteLogo = Boolean(quality?.issues.some((i) => i.id === "logo-white"));
  const base = `/newwave/klubbar/${id}/dashboard`;
  return (
    <ClubPortal id={id} active="dashboard" insider={insider}>
      <div className="grid gap-6 min-[900px]:grid-cols-[220px_minmax(0,1fr)] min-[900px]:gap-10">
        <aside className="min-w-0">
          <div className="mb-4 hidden items-center gap-3 px-1 min-[900px]:flex">
            {club.logo ? (
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] p-1.5 ${whiteLogo ? "bg-[#1B1B1D]" : "bg-[#F2F1EE]"}`}>
                <img src={club.logo} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            ) : null}
            <p className="min-w-0 text-[14px] font-semibold leading-tight">{club.name}</p>
          </div>
          <ClubDashNav
            base={base}
            more={[
              { href: `/newwave/klubbar/${id}`, label: "Wordmarks", icon: "layers" },
              { href: shopPath(id), label: "Butiken", icon: "bag", out: true },
              { href: intersportPath(id), label: "Intersport", icon: "truck", out: true },
            ]}
          />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </ClubPortal>
  );
}
