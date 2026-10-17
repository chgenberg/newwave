import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDecision } from "@/components/newwave/shop/QuoteActions";
import { QuoteFlow, QuoteLines } from "@/components/newwave/shop/QuoteParts";
import { TesterBanner } from "@/components/newwave/shop/ShopClient";
import { fmtDay } from "@/lib/newwave/reseller";
import { quoteByToken } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Er offert", robots: { index: false } };

export default async function KundOffert({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const found = await quoteByToken(token);
  if (!found || found.reseller.slug !== slug) notFound();
  const { quote, reseller } = found;
  const shop = reseller.texts.shopName || reseller.name;

  const head =
    quote.status === "ny"
      ? { title: "Tack! Förfrågan är skickad", text: `${shop} går igenom den och skickar en offert, oftast inom en arbetsdag. Spara länken till den här sidan.` }
      : quote.status === "skickad"
        ? { title: `Offert från ${shop}`, text: quote.validUntil ? `Giltig till ${fmtDay(quote.validUntil)}.` : "" }
        : quote.status === "nekad"
          ? { title: "Ni tackade nej", text: `${shop} har fått besked och hör av sig om något kan ändras.` }
          : quote.status === "levererad"
            ? { title: "Levererad", text: "Tack för ordern! Hör av er när ni vill beställa igen." }
            : { title: "Tack för ordern!", text: "Vi tar fram ett provtryck och börjar trycka. Ni ser här hur det går." };

  return (
    <>
    <TesterBanner slug={slug} quoteId={quote.id} />
    <div className="mx-auto max-w-[920px] px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-[13px] opacity-60">
        {quote.id} · {quote.company.name}
      </p>
      <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight sm:text-[40px]">{head.title}</h1>
      {head.text ? <p className="mt-2 max-w-[620px] text-[15px] opacity-70">{head.text}</p> : null}

      <div className="mt-8">
        <QuoteFlow status={quote.status} />
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
        <div className="mt-8">
          <CustomerDecision token={token} />
          <p className="mt-3 text-[12.5px] opacity-55">När ni godkänner går ordern direkt till tryck. Ni får ett provtryck att godkänna först.</p>
        </div>
      ) : null}
      {quote.needBy ? <p className="mt-8 text-[13px] opacity-60">Önskat leveransdatum: {fmtDay(quote.needBy)}</p> : null}
    </div>
    </>
  );
}
