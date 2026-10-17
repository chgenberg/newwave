import type { Metadata } from "next";
import Link from "next/link";
import { TestAsCustomer } from "@/components/newwave/shop/ShopClient";
import { fmtDay, sek, shopUrl, withinDays } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, customerShopsFor, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { shopVars } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Butiker · Återförsäljarens dashboard" };

const HOW = [
  { title: "Välj kund och sortiment", text: "Kundens logga läggs på produkterna direkt." },
  { title: "Skicka länken", text: "Butiken är stängd för alla andra." },
  { title: "Kunden beställer själv", text: "Avtalat pris, ingen offert. Ordern går direkt till New Wave." },
];

export default async function Butiker() {
  const [reseller, quotes, shops] = await Promise.all([getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER), customerShopsFor(CURRENT_RESELLER)]);
  if (!reseller) return null;
  const live = reseller.status === "publicerad";
  const fromShop = quotes.filter((q) => !q.customerShopId && withinDays(q.createdAt, 30));

  return (
    <div className="nw-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Butiker</h1>
          <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Er webbshop för alla kunder, och egna butiker för de största.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/newwave/shop/butiken/kund/ny" className="nw-btn nw-club-btn">
            + Ny kundbutik
          </Link>
          <Link href="/newwave/shop/butiken/ny" className="nw-btn nw-btn-ghost">
            Bygg om webbshoppen
          </Link>
        </div>
      </div>

      <section className="mt-7">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--nw-muted)]">Er webbshop</h2>
        <div className="grid overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-[180px] flex-col justify-between gap-6 bg-[var(--shop-bg)] p-5 text-[var(--shop)]" style={shopVars(reseller.theme)}>
            {reseller.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reseller.logo} alt={reseller.name} className="h-8 w-auto max-w-[200px] object-contain object-left" />
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
              {reseller.products.length} produkter · påslag {reseller.markup} % · {fromShop.length} {fromShop.length === 1 ? "förfrågan" : "förfrågningar"} senaste 30 dagarna
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--nw-muted)]">Uppdaterad {fmtDay(reseller.updatedAt)}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              {live ? (
                <Link href={shopUrl(reseller)} className="nw-btn nw-club-btn">
                  Öppna butiken
                </Link>
              ) : null}
              <Link href="/newwave/shop/butiken/redigera" className="nw-btn nw-btn-ghost">
                Redigera
              </Link>
              {live ? (
                <>
                  <Link href="/newwave/shop/butiken/redigera?flik=publicera" className="nw-btn nw-btn-ghost">
                    Dela
                  </Link>
                  <TestAsCustomer slug={reseller.slug} />
                </>
              ) : (
                <Link href="/newwave/shop/butiken/redigera?flik=publicera" className="nw-btn nw-btn-ghost">
                  Publicera
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-9">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--nw-muted)]">Kundbutiker ({shops.length})</h2>
        </div>
        {shops.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shops.map((c) => {
              const orders = quotes.filter((q) => q.customerShopId === c.id);
              return (
                <li key={c.id}>
                  <Link href={`/newwave/shop/butiken/kund/${c.id}`} className="flex items-center gap-4 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--nw-ink)]">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F4F4F2] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.logo} alt="" className="max-h-full max-w-full object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-[var(--nw-ink)]">{c.company.name}</span>
                      <span className="block truncate text-[12.5px] text-[var(--nw-muted)]">
                        {c.products.length} produkter · {orders.length} {orders.length === 1 ? "order" : "ordrar"}
                        {orders.length ? ` · ${sek(orders.reduce((s, q) => s + q.totalSek, 0))}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${c.open ? "bg-[#DFF5E7] text-[#17703A]" : "bg-[var(--nw-soft-2)] text-[var(--nw-muted)]"}`}>{c.open ? "Öppen" : "Stängd"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className={`${shops.length ? "mt-4" : ""} rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-5`}>
          <p className="text-[15px] font-semibold text-[var(--nw-ink)]">En egen butik för varje stor kund</p>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {HOW.map((h, i) => (
              <li key={h.title} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--club)] text-[11.5px] font-bold text-white">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-[var(--nw-ink)]">{h.title}</span>
                  <span className="block text-[12.5px] text-[var(--nw-muted)]">{h.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <Link href="/newwave/shop/butiken/kund/ny" className="nw-btn nw-club-btn mt-4">
            Skapa en kundbutik
          </Link>
        </div>
      </section>
    </div>
  );
}
