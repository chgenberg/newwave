import Link from "next/link";
import { Reveal, SplitText } from "@/components/newwave/motion/Motion";
import type { Reseller } from "@/lib/newwave/reseller";
import { shopVars } from "@/lib/newwave/theme";
import { CartLink, ShopGrid, TesterBanner } from "./ShopClient";

const TITLE = "mt-3 max-w-[760px] text-[36px] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--shop)] @2xl:text-[60px]";

type Shop = Pick<Reseller, "slug" | "name" | "logo" | "theme" | "texts" | "products" | "markup">;

const STEPS = [
  { title: "Ladda upp loggan", text: "Eller hämta den från er webbplats. Vi lägger den på alla produkter direkt." },
  { title: "Se den i 3D", text: "Ändra storlek och placering, och snurra produkten innan ni bestämmer er." },
  { title: "Beställ direkt", text: "Välj storlekar och antal, priset räknas fram medan ni väljer. Eller be om en offert." },
];

/** Butikens sidhuvud och sidfot, i återförsäljarens färger. */
export function ShopFrame({ shop, preview, children }: { shop: Shop; preview?: boolean; children: React.ReactNode }) {
  const home = `/newwave/s/${shop.slug}`;
  const brand = shop.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logo} alt={shop.texts.shopName || shop.name} className="h-11 w-auto max-w-[200px] object-contain object-left" />
  ) : (
    <span className="text-[18px] font-bold tracking-tight">{shop.texts.shopName || shop.name}</span>
  );
  return (
    <div data-studio-root style={shopVars(shop.theme)} className="@container flex min-h-full flex-col bg-white text-[#1D1D1F]">
      {preview ? null : <TesterBanner slug={shop.slug} />}
      <header className={`${preview ? "" : "sticky top-0 z-30 backdrop-blur-md"} border-b border-[var(--shop-line)] bg-white/90`}>
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-5 @2xl:px-8">
          {preview ? brand : <Link href={home}>{brand}</Link>}
          <nav className="ml-auto hidden items-center gap-6 text-[13.5px] font-medium opacity-70 @2xl:flex" aria-label="Butiken">
            {preview ? (
              <>
                <span>Produkter</span>
                <span>Om oss</span>
                <span>Kontakt</span>
              </>
            ) : (
              <>
                <Link href={`${home}#produkter`} className="py-2.5 hover:opacity-100">
                  Produkter
                </Link>
                <Link href={`${home}#om`} className="py-2.5 hover:opacity-100">
                  Om oss
                </Link>
                <Link href={`${home}#kontakt`} className="py-2.5 hover:opacity-100">
                  Kontakt
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto @2xl:ml-0">
            <CartLink slug={shop.slug} preview={preview} />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer data-preview="fot" className="bg-[var(--shop)] text-[var(--shop-on)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 py-10 @2xl:px-8">
          <div className="min-w-0">
            <p className="text-[18px] font-bold">{shop.texts.shopName || shop.name}</p>
            <p className="mt-1 text-[13.5px] opacity-75">{[shop.texts.address, shop.texts.phone, shop.texts.email].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="text-[12px] opacity-60">Produkterna trycks och levereras av New Wave.</p>
        </div>
      </footer>
    </div>
  );
}

/** I förhandsvisningen kan `only` visa bara produkterna, med `sample` som kundens logga. */
export function ShopHome({ shop, preview, sample, only }: { shop: Shop; preview?: boolean; sample?: { light: string; dark: string }; only?: "produkter" }) {
  if (only === "produkter") return <ShopProducts shop={shop} preview={preview} sample={sample} />;
  return (
    <>
      <section data-preview="hem" className="bg-[var(--shop-bg)]">
        <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-12 @2xl:px-8 @2xl:pb-20 @2xl:pt-20">
          {shop.texts.tagline ? <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">{shop.texts.tagline}</p> : null}
          {preview ? <h1 className={TITLE}>{shop.texts.heroTitle || "Rubrik till startsidan"}</h1> : <SplitText text={shop.texts.heroTitle || shop.name} className={TITLE} stagger={0.05} />}
          {shop.texts.heroText ? <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed opacity-75 @2xl:text-[18px]">{shop.texts.heroText}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            {preview ? (
              <span className="inline-flex h-12 items-center rounded-full bg-[var(--shop-accent)] px-6 text-[15px] font-semibold text-[var(--shop-on-accent)]">Se produkterna</span>
            ) : (
              <Link href="#produkter" className="inline-flex h-12 items-center rounded-full bg-[var(--shop-accent)] px-6 text-[15px] font-semibold text-[var(--shop-on-accent)] transition-transform hover:scale-[1.03] active:scale-[0.97]">
                Se produkterna
              </Link>
            )}
          </div>
          <ol className="mt-12 grid gap-3 @2xl:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={0.3 + i * 0.08} y={16} className="rounded-2xl bg-white/80 p-5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--shop)] text-[12.5px] font-bold text-[var(--shop-on)]">{i + 1}</span>
                <p className="mt-3 text-[15px] font-semibold">{s.title}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed opacity-65">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
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
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @2xl:px-8 @2xl:py-20">
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
    <section id="produkter" className="mx-auto max-w-[1180px] scroll-mt-20 px-5 py-12 @2xl:px-8 @2xl:py-16">
      <h2 className="text-[26px] font-bold tracking-tight @2xl:text-[32px]">Produkter</h2>
      <p className="mb-6 mt-1 text-[14px] opacity-60">Alla priser exkl. moms, inklusive tryck. Lägre styckpris ju fler ni beställer.</p>
      <ShopGrid slug={shop.slug} productIds={shop.products} markup={shop.markup} preview={preview} sample={sample} />
    </section>
  );
}
