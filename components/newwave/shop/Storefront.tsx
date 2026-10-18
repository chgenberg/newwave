import Link from "next/link";
import { offeredOccasions, sellableProducts } from "@/lib/newwave/occasions";
import type { Reseller } from "@/lib/newwave/reseller";
import { shopVars } from "@/lib/newwave/theme";
import { ShopGrid, TesterBanner } from "./ShopClient";
import { Assortment, BrandBand, EventMosaic, StoreHeader, StoreHero } from "./StoreClient";

type Shop = Pick<Reseller, "slug" | "name" | "logo" | "theme" | "texts" | "products" | "markup" | "occasions">;

const searchOf = (shop: Shop) => ({ slug: shop.slug, products: [...sellableProducts(shop)], occasions: offeredOccasions(shop).map((o) => o.id), markup: shop.markup });

/** Butikens sidhuvud och sidfot, i återförsäljarens färger. */
export function ShopFrame({ shop, preview, children }: { shop: Shop; preview?: boolean; children: React.ReactNode }) {
  const name = shop.texts.shopName || shop.name;
  const home = `/newwave/s/${shop.slug}`;
  const brand = shop.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logo} alt={name} className="h-9 w-auto max-w-[130px] object-contain object-left @2xl:h-11 @2xl:max-w-[180px]" />
  ) : (
    <span className="text-[18px] font-bold tracking-tight">{name}</span>
  );
  const events = offeredOccasions(shop);
  const contact = [shop.texts.email, shop.texts.phone, shop.texts.address, shop.texts.hours].filter(Boolean);
  return (
    <div data-studio-root style={shopVars(shop.theme)} className="@container flex min-h-full flex-col bg-white text-[#1D1D1F]">
      {preview ? null : <TesterBanner slug={shop.slug} />}
      <StoreHeader brand={brand} search={searchOf(shop)} preview={preview} />
      <main className="flex-1">{children}</main>
      <footer data-preview="fot" className="bg-[var(--shop)] text-[var(--shop-on)]">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-12 @2xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] @4xl:px-8">
          <div className="min-w-0">
            <p className="text-[19px] font-bold tracking-tight">{name}</p>
            {shop.texts.tagline ? <p className="mt-2 max-w-[36ch] text-[13.5px] leading-relaxed opacity-75">{shop.texts.tagline}</p> : null}
          </div>
          <FooterList title="Handla" items={[{ label: "Alla produkter", href: `${home}#produkter` }, { label: "Varukorg och offert", href: `${home}/offert` }]} />
          {events.length ? <FooterList title="Event" items={events.map((o) => ({ label: o.name, href: `${home}/event/${o.id}` }))} /> : null}
          <div className="min-w-0 text-[13.5px]">
            <p className="font-semibold">Kontakt</p>
            <ul className="mt-3 grid gap-1.5 opacity-75">
              {contact.map((c) => (
                <li key={c} className="break-words">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mx-auto max-w-[1320px] border-t border-current/15 px-5 py-5 text-[12px] opacity-60 @4xl:px-8">Produkterna trycks och levereras av New Wave.</p>
      </footer>
    </div>
  );
}

function FooterList({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div className="min-w-0 text-[13.5px]">
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 grid gap-1.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="opacity-75 transition-opacity hover:opacity-100">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** I förhandsvisningen kan `only` visa bara produkterna, med `sample` som kundens logga. */
export function ShopHome({ shop, preview, sample, only }: { shop: Shop; preview?: boolean; sample?: { light: string; dark: string }; only?: "produkter" }) {
  if (only === "produkter") return <ShopProducts shop={shop} preview={preview} sample={sample} />;
  const search = searchOf(shop);
  return (
    <>
      <div data-preview="hem">
        <StoreHero tagline={shop.texts.tagline} search={search} preview={preview} />
        <BrandBand slug={shop.slug} title={shop.texts.heroTitle} text={shop.texts.heroText} offered={search.occasions} preview={preview} />
      </div>
      <EventMosaic slug={shop.slug} offered={search.occasions} preview={preview} />
      <Assortment products={shop.products} />
      <ShopProducts shop={shop} preview={preview} sample={sample} />
      <ShopAbout texts={shop.texts} name={shop.name} preview={preview} />
    </>
  );
}

/** Om oss och kontaktkortet, så som återförsäljaren skrivit dem under Hemsidan. */
function ShopAbout({ texts, name, preview }: { texts: Reseller["texts"]; name: string; preview?: boolean }) {
  const paragraphs = texts.about.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const contact = [
    { label: "E-post", value: texts.email, href: `mailto:${texts.email}` },
    { label: "Telefon", value: texts.phone, href: `tel:${texts.phone.replace(/[^\d+]/g, "")}` },
    { label: "Adress", value: texts.address },
    { label: "Öppettider", value: texts.hours },
  ].filter((c) => c.value);
  if (!paragraphs.length && !contact.length && !preview) return null;
  return (
    <section id="om" data-preview="om" className="scroll-mt-20 border-t border-[var(--shop-line)] bg-[var(--shop-bg)]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @2xl:px-8 @2xl:py-20">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">Om oss</p>
          <h2 className="mt-3 text-[28px] font-bold leading-[1.1] tracking-tight text-[var(--shop)] @2xl:text-[40px]">{texts.aboutTitle || texts.shopName || name}</h2>
          {paragraphs.length ? (
            paragraphs.map((p, i) => (
              <p key={i} className="mt-4 max-w-[620px] whitespace-pre-line text-[16px] leading-relaxed opacity-75">
                {p}
              </p>
            ))
          ) : (
            <p className="mt-4 text-[16px] opacity-40">Skriv något om er under Hemsidan.</p>
          )}
        </div>
        <div id="kontakt" data-preview="kontakt" className="min-w-0 scroll-mt-24 self-start rounded-[28px] bg-white p-6">
          <p className="text-[18px] font-bold">Kontakt</p>
          {contact.length ? (
            <dl className="mt-4 flex flex-col gap-3 text-[14.5px]">
              {contact.map((c) => (
                <div key={c.label}>
                  <dt className="text-[12.5px] opacity-55">{c.label}</dt>
                  <dd className="mt-0.5 break-words font-medium">
                    {c.href && !preview ? (
                      <a href={c.href} className="underline-offset-4 hover:underline">
                        {c.value}
                      </a>
                    ) : (
                      c.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-[14px] opacity-40">Lägg till e-post, telefon och adress under Hemsidan.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ShopProducts({ shop, preview, sample }: { shop: Shop; preview?: boolean; sample?: { light: string; dark: string } }) {
  return (
    <section id="produkter" className="mx-auto max-w-[1320px] scroll-mt-24 px-5 py-14 @4xl:px-8 @4xl:py-20">
      <h2 className="text-[24px] font-bold tracking-[-0.02em] @2xl:text-[28px]">Alla produkter</h2>
      <p className="mb-5 mt-1 text-[14px] opacity-60">Priser exkl. moms, inklusive tryck. Lägre styckpris ju fler ni beställer. Klicka för att designa i 3D.</p>
      <ShopGrid slug={shop.slug} productIds={shop.products} markup={shop.markup} preview={preview} sample={sample} />
    </section>
  );
}
