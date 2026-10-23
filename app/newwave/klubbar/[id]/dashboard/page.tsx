import Link from "next/link";
import { notFound } from "next/navigation";
import { KpiTiles, RecentOrders, Section } from "@/components/newwave/clubs/DashboardParts";
import { CopyLink } from "@/components/newwave/shop/QuoteActions";
import { intersportPath } from "@/lib/intersport";
import { clubLink } from "@/lib/newwave/clubLink";
import { loadClubShop } from "@/lib/newwave/clubShop";
import { clubShopStats } from "@/lib/newwave/clubShopStats";

export const dynamic = "force-dynamic";

/** Startsidan i klubbens dashboard: länken att dela, läget i korthet och vad som återstår att göra. */
export default async function ClubDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await loadClubShop(id);
  if (!shop) notFound();
  const { club, content, prefs } = shop;
  const [stats, link] = await Promise.all([clubShopStats(id), clubLink(id, "shop")]);
  const base = `/newwave/klubbar/${id}/dashboard`;
  const steps = [
    { done: Boolean(content.headline || content.intro), label: "Skriv butikens rubrik och ingress", href: `${base}/webshop#texter` },
    { done: Boolean(content.email || content.phone), label: "Lägg till kontaktuppgifter", href: `${base}/webshop#kontakt` },
    { done: Boolean(content.photo), label: "Ladda upp ett eget lagfoto", href: `${base}/webshop#foto` },
    { done: Boolean(prefs.approved), label: "Godkänn wordmarken för tryck", href: `/newwave/klubbar/${id}#godkann` },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <>
      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#6F6B63]">Översikt</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] min-[760px]:text-[40px]">{club.name}</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[#4A4740]">Här ser ni hur butiken går och ändrar det supportrarna ser. Det ni sparar syns direkt i butiken och i klubbshoppen hos Intersport.</p>

      <div className="mt-6 flex flex-col gap-3 rounded-[18px] bg-[#F2F1EE] p-4 min-[760px]:flex-row min-[760px]:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Länken till butiken</p>
          <p className="mt-0.5 text-[13px] text-[#6F6B63]">Dela med medlemmar och supportrar – i nyhetsbrevet, på hemsidan och i sociala medier. De ser bara butiken.</p>
          <p className="mt-1 truncate font-mono text-[12px] text-[#4A4740]">{link}</p>
        </div>
        <CopyLink url={link} label="Kopiera länken" />
      </div>

      <Section id="lage" title="De senaste 30 dagarna">
        <KpiTiles stats={stats} keys={["visits", "orders", "sales"]} />
        <Link href={`${base}/statistik`} className="mt-3 inline-flex text-[14px] font-semibold underline-offset-4 hover:underline">
          All statistik →
        </Link>
      </Section>

      <div className="mt-10 grid gap-3 min-[1000px]:grid-cols-2">
        <section aria-labelledby="kom-igang" className="rounded-[18px] border border-[rgba(17,17,17,0.08)] p-4">
          <h2 id="kom-igang" className="text-[14px] font-semibold">
            Kom igång
          </h2>
          <p className="text-[12.5px] text-[#6F6B63]">{left ? `${steps.length - left} av ${steps.length} klara` : "Allt klart – butiken är redo att delas."}</p>
          <ul className="mt-2 divide-y divide-[#ECEAE5]">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 py-2.5 text-[14px] hover:underline">
                  <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? "bg-[#1F7A3A] text-white" : "border border-[#CFCBC2]"}`}>
                    {s.done ? "✓" : ""}
                  </span>
                  <span className={s.done ? "text-[#6F6B63] line-through" : "font-medium"}>{s.label}</span>
                  <span className="sr-only">{s.done ? "(klart)" : "(att göra)"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <RecentOrders stats={stats} max={4} />
      </div>

      <div className="mt-10 grid gap-3 min-[760px]:grid-cols-2">
        <Link href={`${base}/webshop`} className="rounded-[20px] bg-[#111] p-5 text-white transition hover:bg-[#222]">
          <p className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-white/60">Webshop</p>
          <p className="mt-1 text-[18px] font-semibold">Texter, kontakt, foto och sortiment →</p>
          <p className="mt-1 text-[13.5px] text-white/70">Ändra det supportrarna läser och ser i butiken.</p>
        </Link>
        <Link href={intersportPath(id)} className="rounded-[20px] border border-[rgba(17,17,17,0.12)] p-5 transition hover:border-[#111]">
          <p className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-[#6F6B63]">Intersport</p>
          <p className="mt-1 text-[18px] font-semibold">Klubbshoppen hos Intersport →</p>
          <p className="mt-1 text-[13.5px] text-[#6F6B63]">Där supportrarna väljer storlek, betalar och får hem varorna.</p>
        </Link>
      </div>
    </>
  );
}
