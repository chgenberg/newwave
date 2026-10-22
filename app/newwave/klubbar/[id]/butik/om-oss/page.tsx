import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DELIVERY_DAYS, FLOCK_PRICE } from "@/components/newwave/clubshop/pricing";
import { intersportPath } from "@/lib/intersport";
import { clubDetail } from "@/lib/newwave/clubRegistry";
import { grasrotClub } from "@/lib/newwave/grasrot/clubs";
import { shopPath } from "@/lib/newwave/clubShop";
import { canEditShop, readContent } from "@/lib/newwave/clubShopContent";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await wordmarkClub((await params).id);
  return { title: club ? `Om oss · ${genitive(club.name)} butik` : "Om oss" };
}

const SOCIAL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", twitter: "X", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn" };

export default async function ClubShopAbout({ params }: Props) {
  const { id } = await params;
  const [club, content, detail, editor] = await Promise.all([wordmarkClub(id), readContent(id), clubDetail(id), canEditShop(id)]);
  if (!club) notFound();
  const grasrot = grasrotClub(id);
  const site = detail?.url || grasrot?.site;
  const facts = [
    ["Ort", detail?.municipality ?? grasrot?.city],
    ["Idrott", detail?.sport ?? grasrot?.sport ?? club.sports?.[0]],
    ["Grundad", club.founded ? String(club.founded) : undefined],
  ].filter((f): f is [string, string] => Boolean(f[1]));
  const links = [...(site ? [{ href: site, label: "Klubbens webbplats" }] : []), ...Object.entries(detail?.socialLinks ?? {}).map(([k, href]) => ({ href, label: SOCIAL[k] ?? k }))];
  const steps = [
    { title: "Välj här", text: `Hela sortimentet med ${genitive(club.name)} namn, färger och märke.` },
    { title: "Köp hos Intersport", text: `Storlek, namn och nummer för ${FLOCK_PRICE} kr, betalning och leverans hem, till ombud eller butik.` },
    { title: "Trycks åt dig", text: `Plagget trycks på beställning och är hos dig inom ${DELIVERY_DAYS[0]}–${DELIVERY_DAYS[1]} arbetsdagar. En del av köpet går till klubben.` },
  ];

  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-10 sm:px-6">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.18em] text-[#6F6B63]">Om oss</p>
      <h1 className="mt-2 text-[36px] font-black leading-[1] tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-[52px]">{club.name}</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <p className="max-w-[62ch] text-[18px] leading-relaxed text-[#2B2925]">{content.about || `Här finns kläderna med ${genitive(club.name)} namn, färger och märke – för spelare, ledare, familj och supportrar. Varje köp stöttar klubben.`}</p>
          {editor && !content.about ? (
            <Link href={`/newwave/klubbar/${id}/dashboard/webshop#kontakt`} className="mt-4 inline-flex rounded-full border border-dashed border-[#B9B5AC] px-4 py-2 text-[13.5px] font-medium text-[#4A4740] transition hover:border-[#111]">
              Skriv klubbens egen text i dashboarden →
            </Link>
          ) : null}
        </div>
        {facts.length || links.length ? (
          <aside className="rounded-[24px] bg-[var(--shop-bg)] p-5">
            {facts.length ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14.5px]">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-[#6F6B63]">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {links.length ? (
              <ul className={`flex flex-wrap gap-2 ${facts.length ? "mt-5" : ""}`}>
                {links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-full bg-white px-3.5 text-[13.5px] font-medium transition hover:bg-[var(--shop)] hover:text-[var(--shop-on)]">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>
        ) : null}
      </div>

      <section aria-labelledby="sa-funkar" className="mt-14">
        <h2 id="sa-funkar" className="text-[24px] font-black tracking-[-0.02em] sm:text-[28px]">
          Så funkar butiken
        </h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-[20px] border border-[var(--shop-line)] p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--shop)] text-[14px] font-bold text-[var(--shop-on)]">{i + 1}</span>
              <p className="mt-3 text-[16px] font-semibold">{s.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[#6F6B63]">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`${shopPath(id)}#sortiment`} className="inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
            Se sortimentet
          </Link>
          <Link href={intersportPath(id)} className="inline-flex h-12 items-center rounded-full border border-[var(--shop-line)] px-6 text-[15px] font-semibold transition hover:border-[#111]">
            Handla hos Intersport →
          </Link>
        </div>
      </section>
    </div>
  );
}
