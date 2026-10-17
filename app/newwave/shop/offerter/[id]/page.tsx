import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SendQuote } from "@/components/newwave/shop/QuoteActions";
import { QuoteFlow, QuoteLines, StatusPill, Timeline } from "@/components/newwave/shop/QuoteParts";
import { fmtDay, shopUrl } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller, quotesFor } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `Offert ${(await params).id} · Återförsäljarens dashboard` };
}

export default async function OffertDetalj({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [reseller, quotes] = await Promise.all([getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER)]);
  const quote = quotes.find((q) => q.id === id);
  if (!reseller || !quote) notFound();
  const link = `${shopUrl(reseller)}/offert/${quote.token}`;

  return (
    <div className="nw-page">
      <p className="text-[13px] text-[var(--nw-muted)]">
        <Link href={quote.direct ? "/newwave/shop/ordrar" : "/newwave/shop/offerter"} className="hover:text-[var(--nw-ink)]">
          {quote.direct ? "← Ordrar" : "← Offerter"}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={quote.lines[0]?.logo} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-[var(--nw-soft)] object-contain p-2" />
        <div className="min-w-0 flex-1">
          <h1 className="nw-club-heading text-[24px] leading-tight text-[var(--club)] sm:text-[28px]">{quote.company.name}</h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">
            {quote.id} · inkom {fmtDay(quote.createdAt)}
            {quote.needBy ? ` · behövs ${fmtDay(quote.needBy)}` : ""}
          </p>
        </div>
        <StatusPill status={quote.status} direct={quote.direct} />
      </div>

      <div className="mt-6">
        <QuoteFlow status={quote.status} direct={quote.direct} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {quote.message ? (
            <blockquote className="mb-5 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 text-[14px] leading-relaxed text-[var(--nw-ink)]">
              <p className="mb-1 text-[12px] font-semibold text-[var(--nw-muted)]">Från {quote.company.contact}</p>”{quote.message}”
            </blockquote>
          ) : null}
          <QuoteLines quote={quote} cost edit={quote.status === "ny" || quote.status === "skickad" ? { quoteId: quote.id, markup: reseller.markup } : undefined} />
          <div className="mt-6">
            {quote.status === "ny" ? <SendQuote id={quote.id} contact={quote.company.contact} /> : null}
            {quote.status === "skickad" ? (
              <div className="rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 text-[14px] sm:p-5">
                <p className="font-semibold text-[var(--nw-ink)]">Skickad – väntar på kunden</p>
                {quote.reply ? <p className="mt-1 text-[13.5px] text-[var(--nw-muted)]">”{quote.reply}”</p> : null}
                <p className="mt-1 text-[13px] text-[var(--nw-muted)]">Giltig till {quote.validUntil ? fmtDay(quote.validUntil) : "–"}.</p>
                <Link href={link} className="nw-btn nw-btn-ghost mt-3 inline-flex">
                  Öppna kundens vy
                </Link>
              </div>
            ) : null}
            {quote.status === "godkänd" || quote.status === "produktion" || quote.status === "levererad" ? (
              <div className="rounded-[var(--nw-radius)] bg-[#DFF5E7] p-4 text-[14px] text-[#17703A] sm:p-5">
                <p className="font-semibold">Ordern ligger hos New Wave</p>
                <p className="mt-1 text-[13.5px]">Tryckfiler, storlekar och leveransadress gick över automatiskt. Ni ser var ordern är under Ordrar.</p>
                <Link href="/newwave/new-wave/ordrar" className="mt-3 inline-block text-[13.5px] font-semibold underline underline-offset-4">
                  Så ser New Wave ordern →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
        <aside className="flex flex-col gap-6">
          <div className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 text-[14px]">
            <p className="text-[12px] font-semibold text-[var(--nw-muted)]">Kund</p>
            <p className="mt-1 font-semibold text-[var(--nw-ink)]">{quote.company.contact}</p>
            <p className="text-[var(--nw-muted)]">{quote.company.email}</p>
            {quote.company.phone ? <p className="text-[var(--nw-muted)]">{quote.company.phone}</p> : null}
            {quote.status !== "ny" ? (
              <Link href={link} className="mt-3 inline-block text-[13px] font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4">
                {quote.direct ? "Kundens ordersida" : "Kundens offertsida"}
              </Link>
            ) : null}
          </div>
          <div>
            <p className="mb-3 text-[12px] font-semibold text-[var(--nw-muted)]">Händelser</p>
            <Timeline events={quote.events} />
          </div>
        </aside>
      </div>
    </div>
  );
}
