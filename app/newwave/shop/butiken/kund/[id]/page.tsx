import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/newwave/shop/QuoteParts";
import { CustomerShopActions } from "@/components/newwave/shop/CustomerShopActions";
import { ProductMock } from "@/components/newwave/shop/ProductMock";
import { CustomerShopShare } from "@/components/newwave/shop/ShareShop";
import { nwProduct } from "@/lib/newwave/catalog";
import { fmtDay, fromPrice, sek } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, customerShop, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { workspaceId } from "@/lib/newwave/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kundbutik · Återförsäljarens dashboard" };

export default async function KundbutikSida({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ny?: string }> }) {
  const [{ id }, { ny }] = await Promise.all([params, searchParams]);
  const [shop, reseller, quotes, ws] = await Promise.all([customerShop(id), getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER), workspaceId()]);
  if (!shop || !reseller || shop.resellerId !== reseller.id) notFound();
  const orders = quotes.filter((q) => q.customerShopId === shop.id);
  const sold = orders.reduce((s, q) => s + q.totalSek, 0);
  const margin = orders.reduce((s, q) => s + q.totalSek - q.costSek, 0);

  return (
    <div className="nw-page">
      <p className="text-[13px] text-[var(--nw-muted)]">
        <Link href="/newwave/shop/butiken" className="hover:text-[var(--nw-ink)]">
          ← Butiker
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#F4F4F2] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.logo} alt="" className="max-h-full max-w-full object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="nw-club-heading truncate text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">{shop.company.name}</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">
            Kundbutik · {shop.products.length} produkter · påslag {shop.markup} % · skapad {fmtDay(shop.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${shop.open ? "bg-[#DFF5E7] text-[#17703A]" : "bg-[var(--nw-soft-2)] text-[var(--nw-muted)]"}`}>{shop.open ? "Öppen" : "Stängd"}</span>
      </div>

      {ny ? (
        <p className="nw-fade mt-5 rounded-xl bg-[#DFF5E7] px-4 py-3 text-[14px] text-[#17703A]">
          Kundbutiken är klar. Skicka länken till {shop.company.contact || shop.company.name}, så kan de beställa direkt.
        </p>
      ) : null}

      <section className="mt-6">
        <CustomerShopShare shop={shop} reseller={reseller.texts.shopName || reseller.name} ws={ws} />
      </section>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Ordrar", value: String(orders.length) },
          { label: "Sålt", value: sek(sold) },
          { label: "Er marginal", value: sek(margin) },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[20px] leading-none text-[var(--club)] sm:text-[24px]">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">Ordrar</h2>
        {orders.length ? (
          <ul className="mt-3 flex flex-col gap-2">
            {orders.map((q) => (
              <li key={q.id}>
                <Link href={`/newwave/shop/offerter/${q.id}`} className="flex items-center gap-4 rounded-2xl bg-[var(--nw-soft)] p-3 pl-4 transition-colors hover:bg-[var(--nw-soft-2)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[var(--nw-muted)]">
                      {q.id} · {fmtDay(q.createdAt)} · {q.lines.reduce((s, l) => s + l.qty, 0)} st
                    </p>
                    <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{q.company.contact}</p>
                  </div>
                  <p className="hidden shrink-0 text-[13.5px] font-semibold text-[var(--nw-ink)] sm:block">{sek(q.totalSek)}</p>
                  <StatusPill status={q.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13.5px] text-[var(--nw-muted)]">Inga ordrar än. De dyker upp här, och under Ordrar, så fort kunden beställer.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">Sortiment och avtalade priser</h2>
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {shop.products.map((pid) => {
            const p = nwProduct(pid);
            return p ? (
              <li key={pid} className="min-w-0">
                <ProductMock product={p} logo={shop.logo} logoDark={shop.logoDark} className="rounded-2xl" />
                <p className="mt-1.5 truncate text-[12.5px] font-medium text-[var(--nw-ink)]">{p.name}</p>
                <p className="text-[12px] text-[var(--nw-muted)]">{sek(fromPrice(p, shop.markup))}/st</p>
              </li>
            ) : null;
          })}
        </ul>
      </section>

      <div className="mt-8 border-t border-[var(--nw-line)] pt-5">
        <CustomerShopActions id={shop.id} open={shop.open} />
      </div>
    </div>
  );
}
