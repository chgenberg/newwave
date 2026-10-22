import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DELIVERY_DAYS, FLOCK_PRICE } from "@/components/newwave/clubshop/pricing";
import { intersportPath } from "@/lib/intersport";
import { clubDetail } from "@/lib/newwave/clubRegistry";
import { canEditShop, readContent } from "@/lib/newwave/clubShopContent";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await wordmarkClub((await params).id);
  return { title: club ? `Kontakta oss · ${genitive(club.name)} butik` : "Kontakta oss" };
}

const CARD = "rounded-[24px] p-6 sm:p-8";
const BTN = "inline-flex h-11 items-center rounded-full px-5 text-[14.5px] font-semibold transition";

export default async function ClubShopContact({ params }: Props) {
  const { id } = await params;
  const [club, content, detail, editor] = await Promise.all([wordmarkClub(id), readContent(id), clubDetail(id), canEditShop(id)]);
  if (!club) notFound();
  const reachable = Boolean(content.email || content.phone);
  const faq = [
    { q: "När kommer min beställning?", a: `Allt trycks på beställning och är hos dig inom ${DELIVERY_DAYS[0]}–${DELIVERY_DAYS[1]} arbetsdagar.` },
    { q: "Kan jag få namn och nummer på ryggen?", a: `Ja, det väljer du hos Intersport när du lägger varan i varukorgen. Det kostar ${FLOCK_PRICE} kr.` },
    { q: "Hur får jag hem varorna?", a: "Du väljer hemleverans, ombud eller att hämta i en Intersport-butik när du betalar." },
    { q: "Vill du byta eller lämna tillbaka?", a: "Kontakta Intersports kundservice – de har din beställning." },
  ];

  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-10 sm:px-6">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.18em] text-[#6F6B63]">Kontakta oss</p>
      <h1 className="mt-2 text-[36px] font-black leading-[1] tracking-[-0.03em] sm:text-[52px]">Hur kan vi hjälpa till?</h1>

      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        <section aria-labelledby="till-klubben" className={`${CARD} bg-[var(--shop)] text-[var(--shop-on)]`}>
          <h2 id="till-klubben" className="text-[22px] font-bold tracking-[-0.01em]">
            Frågor till {club.name}
          </h2>
          <p className="mt-2 max-w-[52ch] text-[15.5px] leading-relaxed opacity-85">{content.contact || "Om klubbkläderna, sortimentet eller vart pengarna går – hör av dig till klubben."}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {content.email ? (
              <a href={`mailto:${content.email}`} className={`${BTN} bg-[var(--shop-on)] text-[var(--shop)] hover:opacity-90`}>
                {content.email}
              </a>
            ) : null}
            {content.phone ? (
              <a href={`tel:${content.phone.replace(/[\s-]/g, "")}`} className={`${BTN} border border-current/30 hover:border-current`}>
                {content.phone}
              </a>
            ) : null}
            {!reachable && detail?.url ? (
              <a href={detail.url} target="_blank" rel="noopener noreferrer" className={`${BTN} border border-current/30 hover:border-current`}>
                Klubbens webbplats ↗
              </a>
            ) : null}
          </div>
          {editor && !reachable ? (
            <Link href={`/newwave/klubbar/${id}/dashboard/webshop#kontakt`} className="mt-5 inline-flex text-[13.5px] font-semibold underline underline-offset-4">
              Lägg till e-post och telefon i dashboarden →
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="om-bestallning" className={`${CARD} bg-[var(--shop-bg)]`}>
          <h2 id="om-bestallning" className="text-[22px] font-bold tracking-[-0.01em]">
            Frågor om en beställning
          </h2>
          <p className="mt-2 max-w-[52ch] text-[15.5px] leading-relaxed text-[#4A4740]">Du beställer och betalar hos Intersport. Frågor om leverans, betalning, byten och returer besvaras därför av Intersports kundservice – ha ordernumret till hands.</p>
          <div className="mt-5">
            <Link href={intersportPath(id)} className={`${BTN} bg-[#111] text-white hover:bg-[#333]`}>
              Till klubbshoppen hos Intersport →
            </Link>
          </div>
        </section>
      </div>

      <section aria-labelledby="vanliga-fragor" className="mt-14 max-w-[820px]">
        <h2 id="vanliga-fragor" className="text-[24px] font-black tracking-[-0.02em] sm:text-[28px]">
          Vanliga frågor
        </h2>
        <ul className="mt-4 divide-y divide-[var(--shop-line)] border-y border-[var(--shop-line)]">
          {faq.map((f) => (
            <li key={f.q}>
              <details className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-[20px] font-normal transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-4 text-[15px] leading-relaxed text-[#4A4740]">{f.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
