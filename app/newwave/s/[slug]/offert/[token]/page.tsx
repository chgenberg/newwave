import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDecision } from "@/components/newwave/shop/QuoteActions";
import { QuoteFlow, QuoteLines } from "@/components/newwave/shop/QuoteParts";
import { TesterBanner } from "@/components/newwave/shop/ShopClient";
import { answersTo, fmtDay } from "@/lib/newwave/reseller";
import { quoteByToken } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Er beställning", robots: { index: false } };

export default async function KundOffert({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ svar?: string }> }) {
  const [{ slug, token }, { svar }] = await Promise.all([params, searchParams]);
  const found = await quoteByToken(token);
  if (!found || !answersTo(found.reseller, slug)) notFound();
  const { quote, reseller } = found;
  const shop = reseller.texts.shopName || reseller.name;

  const head =
    quote.status === "ny"
      ? { title: "Tack! Förfrågan är skickad", text: `${shop} går igenom den och skickar en offert, oftast inom en arbetsdag. Spara länken till den här sidan.` }
      : quote.status === "skickad"
        ? { title: `Offert från ${shop}`, text: quote.validUntil ? `Giltig till ${fmtDay(quote.validUntil)}` : "" }
        : quote.status === "nekad"
          ? { title: "Ni tackade nej", text: `${shop} har fått besked och hör av sig om något kan ändras.` }
          : quote.status === "levererad"
            ? { title: "Levererad", text: "Tack för ordern! Hör av er när ni vill beställa igen." }
            : { title: "Tack för ordern!", text: `${quote.direct ? `${shop} har fått beställningen. ` : ""}Vi tar fram ett provtryck och börjar trycka. Ni ser här hur det går. Spara länken till den här sidan.` };

  return (
    <>
    <TesterBanner slug={slug} quoteId={quote.id} order={quote.direct} />
    <div className="mx-auto max-w-[920px] px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-[13px] opacity-60">
        {quote.id} · {quote.company.name}
      </p>
      <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight sm:text-[40px]">{head.title}</h1>
      {head.text ? <p className="mt-2 max-w-[620px] text-[15px] opacity-70">{head.text}</p> : null}

      <div className="mt-8">
        <QuoteFlow status={quote.status} direct={quote.direct} />
      </div>

      {quote.reply && quote.status === "skickad" ? (
        <blockquote className="mt-8 rounded-[24px] bg-[var(--shop-bg)] p-5 text-[15px] leading-relaxed">
          <p className="mb-1 text-[12.5px] font-semibold opacity-60">Från {shop}</p>
          {quote.reply}
        </blockquote>
      ) : null}

      <div className="mt-8">
        <QuoteLines quote={quote} />
      </div>

      {quote.status === "skickad" ? (
        <div id="svar" className="mt-8 scroll-mt-24">
          <CustomerDecision token={token} ask={svar === "godkann" || svar === "neka" ? svar : undefined} />
          <p className="mt-3 text-[12.5px] opacity-55">När ni godkänner går ordern direkt till tryck. Ni får ett provtryck att godkänna först.</p>
        </div>
      ) : null}
      {quote.needBy ? <p className="mt-8 text-[13px] opacity-60">Önskat leveransdatum: {fmtDay(quote.needBy)}</p> : null}
      {quote.status !== "ny" ? (
        <a href={`/api/v1/newwave/quotes/pdf?t=${token}`} className="mt-4 inline-block text-[13.5px] font-semibold underline underline-offset-4">
          Ladda ner som PDF
        </a>
      ) : null}
    </div>
    </>
  );
}
