/* eslint-disable @next/next/no-img-element -- ordmärken och mockups ritas per klubb */
import { notFound } from "next/navigation";
import { CollectionSections } from "@/components/newwave/clubshop/CollectionView";
import { ProductTile } from "@/components/newwave/clubshop/ProductTile";
import { DELIVERY_DAYS, FLOCK_PRICE } from "@/components/newwave/clubshop/pricing";
import { G360_SECTION, G360Section } from "@/components/newwave/grasrot/ShopCollection";
import { loadCollection } from "@/lib/newwave/clubCollection";
import { loadClubShop, mockupUrl, shopPath, wordmarkSpec } from "@/lib/newwave/clubShop";
import { shopPhoto, shopTexts } from "@/lib/newwave/clubShopContent";
import { shopProducts } from "@/lib/newwave/grasrot/shop";
import { luminance } from "@/lib/newwave/theme";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";

export const dynamic = "force-dynamic";

const USPS = (club: string) => [
  { title: "Trycks på beställning", text: `Hos dig inom ${DELIVERY_DAYS[0]}–${DELIVERY_DAYS[1]} arbetsdagar` },
  { title: "Köp hos Intersport", text: "Hem, till ombud eller i butik" },
  { title: "Namn och nummer", text: `På ryggen för ${FLOCK_PRICE} kr` },
  { title: "Stöttar klubben", text: `En del av varje köp går till ${club}` },
];

export default async function ClubShopHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await loadClubShop(id);
  if (!shop) notFound();
  const { club, groups, ranked, v } = shop;
  const texts = shopTexts(club, shop.content);
  const [photo, { drops }, g360] = await Promise.all([shopPhoto(id, shop.content), loadCollection(id, shop.content.hidden), shopProducts(id)]);
  const main = club.colors[0] ?? "#111111";
  const on = luminance(main) > 0.4 ? "#111111" : "#FFFFFF";
  const lead = ranked[0];
  const showcase = groups[0]?.items.slice(0, 2) ?? [];

  return (
    <>
      <section className="mx-auto max-w-[1320px] px-4 pt-5 sm:px-6">
        <div className="relative isolate grid items-center gap-8 overflow-hidden rounded-[28px] p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:p-14" style={{ background: main, color: on }}>
          {photo ? (
            <>
              <img src={photo} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
              <span aria-hidden className="absolute inset-0 -z-10 lg:hidden" style={{ background: `${main}d9` }} />
              <span aria-hidden className="absolute inset-0 -z-10 hidden lg:block" style={{ background: `linear-gradient(90deg, ${main} 30%, ${main}b8 60%, ${main}5c)` }} />
            </>
          ) : (
            <span aria-hidden className="absolute -right-24 -top-32 -z-10 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,var(--shop-accent),transparent_70%)] opacity-40 sm:h-[460px] sm:w-[460px]" />
          )}
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.18em] opacity-75">Klubbens butik</p>
            <h1 className="mt-3 text-[38px] font-black leading-[0.98] tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-[56px]">{texts.headline}</h1>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed opacity-85">{texts.intro}</p>
            <a href="#sortiment" className="mt-7 inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold transition hover:opacity-90" style={{ background: on, color: main }}>
              Handla nu
            </a>
          </div>
          <div className="relative min-w-0">
            {lead ? <img src={`${wordmarkUrl(wordmarkSpec(lead.id), id, "club", 1200)}&u=${encodeURIComponent(v)}`} alt={`${club.name} – ${lead.name}`} className="mx-auto max-h-[300px] w-full object-contain" /> : null}
            {showcase.length ? (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {showcase.map((it, i) => (
                  <img key={it.id} src={mockupUrl(it.product, wordmarkSpec(it.template.id, it.worn), id, v, 480)} alt={it.name} className={`aspect-square w-full rounded-[18px] bg-white object-cover shadow-[0_24px_50px_-28px_rgba(0,0,0,0.6)] ${i ? "translate-y-4" : ""}`} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <ul className="mx-auto mt-6 grid max-w-[1320px] grid-cols-2 gap-3 px-4 sm:px-6 lg:grid-cols-4">
        {USPS(club.name).map((u) => (
          <li key={u.title} className="rounded-2xl bg-[var(--shop-bg)] px-4 py-3.5">
            <p className="text-[14px] font-semibold">{u.title}</p>
            <p className="text-[12.5px] text-[#6F6B63]">{u.text}</p>
          </li>
        ))}
      </ul>

      <div id="sortiment" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 sm:px-6">
        {groups.length + drops.length + (g360 ? 1 : 0) > 2 ? (
          <nav aria-label="Stilar" className="mt-10 flex gap-2 overflow-x-auto pb-1">
            {[...(g360 ? [G360_SECTION] : []), ...(drops.length ? [{ id: "kollektion", name: "Veckans kollektion" }] : []), ...groups].map((g) => (
              <a key={g.id} href={`#${g.id}`} className="inline-flex h-10 shrink-0 items-center rounded-full border border-[#DCDAD4] px-4 text-[14px] font-medium transition hover:border-[var(--shop)] hover:bg-[var(--shop)] hover:text-[var(--shop-on)]">
                {g.name}
              </a>
            ))}
          </nav>
        ) : null}
        {g360 ? <G360Section id={id} home={shopPath(id)} products={g360.products} featured={g360.featured} /> : null}
        <CollectionSections drops={drops} href={(it) => `${shopPath(id)}/${it.id}`} />
        {groups.map((g, gi) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-rubrik`} className="scroll-mt-20 pt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--shop-line)] pb-3">
              <h2 id={`${g.id}-rubrik`} className="text-[24px] font-black tracking-[-0.02em] sm:text-[28px]">
                {g.name}
              </h2>
              <p className="text-[14px] text-[#6F6B63]">{g.blurb}</p>
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4">
              {g.items.map((it) => (
                <li key={it.id} className="min-w-0">
                  <ProductTile item={it} clubId={id} v={v} href={`${shopPath(id)}/${it.id}`} eager={gi === 0} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
