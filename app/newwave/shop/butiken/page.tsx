import type { Metadata } from "next";
import Link from "next/link";
import { TestAsCustomer } from "@/components/newwave/shop/ShopClient";
import { BUILDER_STEPS, fmtDay, shopUrl, stepsDone, withinDays } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { shopVars } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Butiken · Återförsäljarens dashboard" };

const CUSTOMER = [
  { title: "Lägger in sin logga", text: "Laddar upp filen eller hämtar den från sin egen webbplats. Den syns direkt på alla produkter." },
  { title: "Designar i 3D", text: "Samma designmotor som ni har: placering, storlek, färg och tryckmetod, med korrektur." },
  { title: "Ser priset direkt", text: "Ert påslag och mängdrabatten räknas in medan kunden väljer storlekar och antal." },
  { title: "Beställer eller begär offert", text: "Direkt till ert pris, eller som offert ni svarar på. Ordern går till New Wave, som trycker och skickar i ert namn." },
];

export default async function Butiken() {
  const [reseller, quotes] = await Promise.all([getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER)]);
  if (!reseller) return null;
  const live = reseller.status === "publicerad";
  const recent = quotes.filter((q) => withinDays(q.createdAt, 30));
  const done = stepsDone(reseller);
  const summary: Record<(typeof BUILDER_STEPS)[number]["id"], string> = {
    varumarke: reseller.brandbook ? "Logga och grafisk profil" : reseller.logo ? "Logga klar" : "Ingen logga än",
    hemsidan: [reseller.texts.heroTitle ? "Startsida" : "", reseller.texts.about ? "Om oss" : "", reseller.texts.email || reseller.texts.phone ? "kontakt" : ""].filter(Boolean).join(", ") || "Texterna saknas",
    sortiment: `${reseller.products.length} produkter · påslag ${reseller.markup} %`,
    publicera: live ? "Live – länk, QR-kod och mejl" : "Inte publicerad än",
  };

  return (
    <div className="nw-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Butiken</h1>
          <p className="mt-1 max-w-[62ch] text-[14.5px] text-[var(--nw-muted)]">Er egen webbshop, med ert namn och er logga. Företagskunderna designar och beställer här – New Wave sköter tryck och leverans i bakgrunden.</p>
        </div>
        <Link href="/newwave/shop/butiken/ny" className="nw-btn nw-btn-ghost">
          Bygg om från en webbplats
        </Link>
      </div>

      <section className="mt-7 grid overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex min-h-[180px] flex-col justify-between gap-6 bg-[var(--shop-bg)] p-5 text-[var(--shop)]" style={shopVars(reseller.theme)}>
          {reseller.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reseller.logo} alt={reseller.name} className="h-11 w-auto max-w-[200px] object-contain object-left" />
          ) : (
            <p className="text-[18px] font-bold">{reseller.texts.shopName || reseller.name}</p>
          )}
          <div>
            <p className="line-clamp-2 text-[22px] font-bold leading-tight tracking-tight">{reseller.texts.heroTitle || "Rubrik till startsidan"}</p>
            <span className="mt-3 inline-flex h-8 items-center rounded-full bg-[var(--shop-accent)] px-3.5 text-[12.5px] font-semibold text-[var(--shop-on-accent)]">Se produkterna</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col p-5">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${live ? "bg-[#DFF5E7] text-[#17703A]" : "bg-[#FFF1CC] text-[#7A4F00]"}`}>{live ? "Live" : "Utkast"}</span>
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{shopUrl(reseller)}</p>
          </div>
          <p className="mt-3 text-[14px] text-[var(--nw-ink)]">
            {reseller.products.length} produkter · påslag {reseller.markup} % ·{" "}
            <Link href="/newwave/shop/offerter" className="underline-offset-4 hover:underline">
              {recent.length} {recent.length === 1 ? "beställning eller förfrågan" : "beställningar och förfrågningar"} senaste 30 dagarna
            </Link>
          </p>
          <p className="mt-0.5 text-[12.5px] text-[var(--nw-muted)]">Uppdaterad {fmtDay(reseller.updatedAt)}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            {live ? (
              <>
                <Link href={shopUrl(reseller)} className="nw-btn nw-club-btn">
                  Öppna butiken
                </Link>
                <TestAsCustomer slug={reseller.slug} />
              </>
            ) : (
              <Link href="/newwave/shop/butiken/redigera?flik=publicera" className="nw-btn nw-club-btn">
                Publicera
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mt-9">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--nw-muted)]">Ändra butiken</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BUILDER_STEPS.map((s) => (
            <li key={s.id}>
              <Link href={`/newwave/shop/butiken/redigera?flik=${s.id}`} className="flex h-full flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--nw-ink)]">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-[var(--nw-ink)]">{s.label}</span>
                  <span aria-label={done[s.id] ? "Klart" : "Inte klart"} className={`h-2 w-2 shrink-0 rounded-full ${done[s.id] ? "bg-[#17703A]" : "bg-[#E0A800]"}`} />
                </span>
                <span className="mt-1 line-clamp-2 text-[12.5px] text-[var(--nw-muted)]">{summary[s.id]}</span>
                <span className="mt-auto pt-3 text-[13px] font-medium text-[var(--nw-ink)]">Ändra →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-9 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold text-[var(--nw-ink)]">Så handlar ett företag i butiken</p>
          <p className="text-[12.5px] text-[var(--nw-muted)]">Allt ser ut som er butik. Plattformen syns inte för kunden.</p>
        </div>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CUSTOMER.map((h, i) => (
            <li key={h.title} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--club)] text-[11.5px] font-bold text-white">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-[var(--nw-ink)]">{h.title}</span>
                <span className="block text-[12.5px] leading-snug text-[var(--nw-muted)]">{h.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
