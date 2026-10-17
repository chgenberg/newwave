import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/newwave/Panel";
import { StatusPill } from "@/components/newwave/shop/QuoteParts";
import { BUILDER_STEPS, fmtDay, fmtWhen, ordersSince, sek, shopUrl, stepsDone } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { CountUp } from "@/components/newwave/motion/Motion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Återförsäljarens dashboard" };

export default async function ResellerHome() {
  const [reseller, quotes] = await Promise.all([getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER)]);
  if (!reseller) return null;
  const fresh = quotes.filter((q) => q.status === "ny");
  const out = quotes.filter((q) => q.status === "skickad");
  const atNw = quotes.filter((q) => q.status === "godkänd" || q.status === "produktion");
  const sold = ordersSince(quotes, 30);
  const revenue = sold.reduce((s, q) => s + q.totalSek, 0);
  const margin = sold.reduce((s, q) => s + q.totalSek - q.costSek, 0);
  const done = stepsDone(reseller);
  const live = reseller.status === "publicerad";
  const events = quotes
    .flatMap((q) => q.events.map((e) => ({ ...e, quote: q })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const stats = [
    { label: "Nya förfrågningar", value: String(fresh.length), href: "/newwave/shop/offerter" },
    { label: "Offerter ute", value: out.length ? sek(out.reduce((s, q) => s + q.totalSek, 0)) : "0", href: "/newwave/shop/offerter" },
    { label: "Hos New Wave", value: String(atNw.length), href: "/newwave/shop/ordrar" },
    { label: "Sålt 30 dagar", value: sek(revenue), sub: `Marginal ${sek(margin)}`, href: "/newwave/shop/ordrar" },
  ];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Hej, {reseller.name}</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">
        {!live
          ? "Butiken är inte publicerad än. Bygg klart den så kan era kunder börja beställa."
          : fresh.length
            ? `${fresh.length} ${fresh.length === 1 ? "ny förfrågan väntar" : "nya förfrågningar väntar"} på offert.`
            : "Inga förfrågningar väntar. Butiken är öppen."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="block min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4 transition-colors hover:bg-[var(--nw-soft-2)] sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[22px] leading-none text-[var(--club)] sm:text-[26px]"><CountUp value={s.value} /></p>
            {s.sub ? <p className="mt-1.5 truncate text-[12px] text-[var(--nw-muted)]">{s.sub}</p> : null}
          </Link>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white">
          <div className="flex items-center gap-3">
            {reseller.logoDark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reseller.logoDark} alt="" className="h-7 w-auto max-w-[180px] object-contain object-left" />
            ) : (
              <p className="nw-club-heading text-[18px]">{reseller.texts.shopName || reseller.name}</p>
            )}
            <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${live ? "bg-[var(--club-accent)] text-[var(--club-on-accent)]" : "bg-white/15"}`}>{live ? "Live" : "Utkast"}</span>
          </div>
          {live ? (
            <>
              <p className="nw-club-heading mt-5 line-clamp-2 text-[20px] leading-tight">{reseller.texts.heroTitle}</p>
              <p className="mt-1.5 text-[13px] text-white/65">
                {reseller.products.length} produkter · påslag {reseller.markup} % · uppdaterad {fmtDay(reseller.updatedAt)}
              </p>
            </>
          ) : (
            <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Butiksbyggaren">
              {BUILDER_STEPS.map((s) => (
                <li key={s.id} className="min-w-0">
                  <span className={`block h-1.5 rounded-full ${done[s.id] ? "bg-[var(--club-accent)]" : "bg-white/20"}`} />
                  <span className="mt-1.5 block truncate text-[11.5px] text-white/70">{s.label}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <Link href="/newwave/shop/butiken/redigera" className="inline-flex h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-semibold text-[var(--club)]">
              {live ? "Redigera butiken" : "Fortsätt bygga"}
            </Link>
            {live ? (
              <Link href={shopUrl(reseller)} className="inline-flex h-10 items-center rounded-full border border-white/30 px-4 text-[13.5px] font-semibold">
                Öppna butiken
              </Link>
            ) : null}
          </div>
        </div>
        <Link href="/newwave/shop/offerter" className="flex min-w-0 flex-col justify-center rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-5 transition-colors hover:border-[var(--nw-ink)]">
          <p className="text-[12px] text-[var(--nw-muted)]">Så funkar det</p>
          <p className="nw-club-heading mt-0.5 text-[19px] leading-tight text-[var(--club)]">Kunden designar, ni skickar offerten</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--nw-muted)]">
            Företagskunden laddar upp sin logga i er butik och begär offert. Ni granskar och skickar. När kunden godkänner går ordern till New Wave, som trycker och levererar.
          </p>
        </Link>
      </div>

      <div className="mt-8 border-t border-[var(--nw-line)]">
        <Panel title="Att göra" badge={fresh.length} summary={fresh.length ? fresh.map((q) => q.company.name).join(" · ") : "Inga nya förfrågningar"} open={fresh.length > 0}>
          <ul className="flex flex-col gap-2">
            {(fresh.length ? fresh : out).slice(0, 6).map((q) => (
              <li key={q.id}>
                <Link href={`/newwave/shop/offerter/${q.id}`} className="flex items-center gap-4 rounded-2xl bg-[var(--nw-soft)] p-3 pl-4 transition-colors hover:bg-[var(--nw-soft-2)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[var(--nw-muted)]">
                      {q.id} · {q.lines.reduce((s, l) => s + l.qty, 0)} st · {q.needBy ? `behövs ${fmtDay(q.needBy)}` : fmtDay(q.createdAt)}
                    </p>
                    <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{q.company.name}</p>
                  </div>
                  <p className="hidden shrink-0 text-[13.5px] font-semibold text-[var(--nw-ink)] sm:block">{sek(q.totalSek)}</p>
                  <StatusPill status={q.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Senaste händelser" summary={events[0] ? `${events[0].who}: ${events[0].text}` : "Inget har hänt än"}>
          <ul className="divide-y divide-[var(--nw-line)]">
            {events.map((e) => (
              <li key={`${e.quote.id}-${e.at}`}>
                <Link href={`/newwave/shop/offerter/${e.quote.id}`} className="group/row flex items-center gap-4 py-3">
                  <p className="w-24 shrink-0 text-[12.5px] text-[var(--nw-muted)]">{fmtWhen(e.at)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-[var(--nw-ink)] group-hover/row:underline">
                      <span className="font-medium">{e.who}</span> · {e.text}
                    </p>
                    <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
                      {e.quote.company.name} · {e.quote.id}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
