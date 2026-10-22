import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/newwave/clubs/DashboardParts";
import { WebshopSections } from "@/components/newwave/clubs/ShopSections";
import { CountUp } from "@/components/newwave/motion/Motion";
import { CopyLink } from "@/components/newwave/shop/QuoteActions";
import { StudioButton } from "@/components/newwave/studio/StudioButton";
import { intersportPath, listProducts } from "@/lib/intersport";
import { ASA_IF } from "@/lib/newwave/club";
import { splitTitle } from "@/lib/newwave/clubCollection";
import { clubLink } from "@/lib/newwave/clubLink";
import { CATEGORIES, NW_CATALOG, seasonLabel } from "@/lib/newwave/catalog";
import { loadClubShop, shopPath } from "@/lib/newwave/clubShop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Webshop` };

const catalogId = (sku: string) => NW_CATALOG.find((c) => sku.startsWith(`CRAFT-POD-${c.id.toUpperCase()}-`))?.id;
const localPath = (url: string) => (url.startsWith("http") ? new URL(url).pathname : url);
const fmtDate = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).format(new Date(iso));

/** Klubbens webshop: kollektionerna från Material överst, sedan texter, kontakt, foto och sortiment som alla klubbar har. */
export default async function WebshopPage() {
  const [shop, products, link] = await Promise.all([loadClubShop(ASA_IF.id), listProducts(ASA_IF.id), clubLink(ASA_IF.id, "shop")]);
  if (!shop) notFound();
  const hidden = new Set(shop.content.hidden);
  const drops = new Set(products.map((p) => p.dropId)).size;
  const home = shopPath(ASA_IF.id);

  const collection = (
    <Section id="kollektion" title="Kollektionerna" text="Det ni godkänner under Material publiceras här – överst i butiken som veckans kollektion, och i klubbshoppen hos Intersport.">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Produkter", value: String(products.length) },
          { label: "Kollektioner", value: String(drops) },
          { label: "Lager", value: "0 st" },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[24px] leading-none text-[var(--club)] sm:text-[28px]">
              <CountUp value={s.value} />
            </p>
          </div>
        ))}
      </div>
      {products.length === 0 ? (
        <div className="mt-4 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-8 text-center">
          <p className="text-[14.5px] text-[var(--nw-ink)]">Ingen kollektion än.</p>
          <p className="mt-1 text-[13.5px] text-[var(--nw-muted)]">Skapa ett motiv under Material och godkänn det – då läggs produkterna ut i butiken.</p>
          <Link href="/newwave/klubb/material" className="nw-btn nw-club-btn mt-5">
            Skapa material
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
          {products.map((p) => {
            const img = p.images.find((i) => i.kind === "foto") ?? p.images[0];
            const { slogan, name } = splitTitle(p.title);
            const id = catalogId(p.sku);
            return (
              <li key={p.id} className="relative min-w-0">
                <Link href={`/newwave/klubb/webshop/${p.id}`} className="group block">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-[var(--nw-radius)] bg-white ring-1 ring-[var(--nw-line)] transition-shadow group-hover:ring-[var(--nw-ink)]/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt} className={`h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03] ${hidden.has(p.id) ? "opacity-40" : ""}`} />
                    {hidden.has(p.id) ? <span className="absolute left-2 top-2 rounded-full bg-[#111] px-2.5 py-1 text-[11.5px] font-semibold text-white">Dold</span> : null}
                  </div>
                  <p className="mt-2.5 truncate text-[12px] text-[var(--nw-muted)]">
                    {name} · {fmtDate(p.publishedAt)}
                  </p>
                  <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{slogan}</p>
                  <p className="text-[14px] font-semibold text-[var(--club)]">{p.priceSek} kr</p>
                </Link>
                {id ? <StudioButton productId={id} art={{ light: localPath(p.printFileUrl), label: "klubbens motiv" }} initial={p.custom?.design} color={p.custom?.color} target={{ kind: "shop", clubId: ASA_IF.id, shopProductId: p.id }} wordmarkClub={ASA_IF} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-medium">
        <Link href={`${home}#kollektion`} className="underline underline-offset-4">
          Se kollektionen i butiken →
        </Link>
        <Link href={intersportPath(ASA_IF.id)} className="underline underline-offset-4">
          Se den hos Intersport →
        </Link>
        <Link href="/newwave/klubb/material" className="underline underline-offset-4">
          Skapa nytt
        </Link>
      </div>
    </Section>
  );

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Webshop</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Klubbens butik, där supportrarna handlar hos Intersport. Allt trycks på beställning – inget lager, inget svinn, och varje köp stöttar föreningen.</p>

      <div className="mt-6 flex flex-col gap-3 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Länken till butiken</p>
          <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">Dela med medlemmar och supportrar. De ser bara butiken.</p>
          <p className="mt-1 truncate font-mono text-[12px] text-[var(--nw-muted)]">{link}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={home} className="nw-btn">
            Öppna
          </Link>
          <CopyLink url={link} label="Kopiera" />
        </div>
      </div>

      <WebshopSections shop={shop} lead={{ id: "kollektion", label: "Kollektioner", node: collection }} />

      <details className="group mt-10 border-y border-[var(--nw-line)]">
        <summary className="flex cursor-pointer list-none items-center gap-4 py-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="nw-club-heading text-[18px] text-[var(--club)]">Sortiment att trycka på</p>
            <p className="mt-0.5 truncate text-[13.5px] text-[var(--nw-muted)]">
              {NW_CATALOG.length} produkter i {CATEGORIES.length} kategorier · från {Math.min(...NW_CATALOG.map((p) => p.priceSek))} kr
            </p>
          </div>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--nw-line)] text-[var(--nw-muted)] transition-transform group-open:rotate-180">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </summary>
        <div className="space-y-7 pb-6">
          {CATEGORIES.map((cat) => (
            <section key={cat}>
              <p className="nw-kicker">{cat}</p>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {NW_CATALOG.filter((p) => p.category === cat).map((p) => (
                  <li key={p.id} className="min-w-0">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--nw-line)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photo} alt={p.name} loading="lazy" className="h-full w-full object-contain" />
                      <StudioButton
                        productId={p.id}
                        art={{ light: `/api/v1/brand/${ASA_IF.id}/skold-farg.png`, dark: `/api/v1/brand/${ASA_IF.id}/skold-vit.png`, label: "klubbens märke" }}
                        target={{ kind: "new-shop", clubId: ASA_IF.id }}
                        wordmarkClub={ASA_IF}
                        label="Designa"
                      />
                    </div>
                    <p className="mt-2 truncate text-[13.5px] font-medium text-[var(--nw-ink)]">
                      {p.name} <span className="font-normal text-[var(--nw-muted)]">· {p.priceSek} kr</span>
                    </p>
                    <p className="truncate text-[12px] text-[var(--nw-muted)]">
                      {p.garmentColor} · {seasonLabel(p.seasons)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
