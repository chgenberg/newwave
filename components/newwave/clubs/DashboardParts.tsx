/* eslint-disable @next/next/no-img-element -- mockups och kollektionens bilder */
import Link from "next/link";
import { kr } from "@/components/newwave/clubshop/pricing";
import type { ClubShopStats, Counts } from "@/lib/newwave/clubShopStats";

const DATE = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const WHEN = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

export const KPIS: { key: keyof Counts; label: string; money?: boolean }[] = [
  { key: "visits", label: "Besök" },
  { key: "views", label: "Visade varor" },
  { key: "clicks", label: "Klick till Intersport" },
  { key: "carts", label: "I varukorgen" },
  { key: "orders", label: "Beställningar" },
  { key: "sales", label: "Försäljning", money: true },
];

export const BOX = "rounded-[18px] border border-[rgba(17,17,17,0.08)] p-4";

function change(cur: number, prev: number) {
  if (!prev) return cur ? "ny" : "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct} %`;
}

export function Section({ id, title, text, children }: { id: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-rubrik`} className="mt-10 scroll-mt-24 first:mt-0">
      <h2 id={`${id}-rubrik`} className="text-[20px] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {text ? <p className="text-[13.5px] text-[#6F6B63]">{text}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Nyckeltalen för perioden, med ändringen mot perioden innan. */
export function KpiTiles({ stats, keys = KPIS.map((k) => k.key) }: { stats: ClubShopStats; keys?: (keyof Counts)[] }) {
  return (
    <ul className={`grid grid-cols-2 gap-2.5 ${keys.length > 3 ? "min-[700px]:grid-cols-3 min-[1100px]:grid-cols-6" : "min-[700px]:grid-cols-3 [&>li:last-child]:col-span-2 min-[700px]:[&>li:last-child]:col-span-1"}`}>
      {KPIS.filter((k) => keys.includes(k.key)).map((k) => {
        const delta = change(stats.totals[k.key], stats.prev[k.key]);
        return (
          <li key={k.key} className="rounded-[18px] bg-[#F7F6F3] px-4 py-3.5">
            <p className="text-[12.5px] text-[#6F6B63]">{k.label}</p>
            <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{k.money ? kr(stats.totals[k.key]) : stats.totals[k.key].toLocaleString("sv-SE")}</p>
            {delta ? <p className={`text-[12px] font-medium ${delta.startsWith("-") ? "text-[#B42318]" : "text-[#1F7A3A]"}`}>{delta}</p> : <p className="text-[12px] text-transparent">–</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function VisitsChart({ stats }: { stats: ClubShopStats }) {
  const { days, totals } = stats;
  const peak = Math.max(1, ...days.map((d) => d.visits));
  const conversion = totals.visits ? Math.round((totals.orders / totals.visits) * 1000) / 10 : 0;
  return (
    <div className={BOX}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold">Besök per dag</p>
        <p className="text-[12.5px] text-[#6F6B63]">{totals.visits ? `${conversion.toLocaleString("sv-SE")} % av besöken blev en beställning` : "Inga besök än – dela länken till butiken så börjar det räknas."}</p>
      </div>
      <div className="mt-3 flex h-32 items-end gap-[3px]" role="img" aria-label={`Besök per dag de senaste ${days.length} dagarna, högst ${peak} på en dag`}>
        {days.map((d) => (
          <span key={d.date} title={`${DATE.format(new Date(d.date))}: ${d.visits} besök, ${d.orders} beställningar`} className="relative flex-1 rounded-t-[3px] bg-[#111]/85" style={{ height: `${Math.max(2, (d.visits / peak) * 100)}%`, opacity: d.visits ? 1 : 0.12 }}>
            {d.orders ? <span className="absolute -top-2.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#1F7A3A]" /> : null}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] text-[#9A968C]">
        <span>{DATE.format(new Date(days[0].date))}</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#1F7A3A]" /> dag med beställning
        </span>
        <span>{DATE.format(new Date(days.at(-1)!.date))}</span>
      </div>
    </div>
  );
}

/** Varorna som visats, klickats och sålts mest. */
export function TopItems({ stats, items }: { stats: ClubShopStats; items: { id: string; name: string; image: string; href: string }[] }) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const score = (c: ClubShopStats["items"][string]) => c.orders * 5 + c.clicks * 2 + c.views;
  const top = Object.entries(stats.items)
    .flatMap(([id, c]) => {
      const it = byId.get(id);
      return it ? [{ it, c }] : [];
    })
    .sort((a, b) => score(b.c) - score(a.c))
    .slice(0, 6);
  return (
    <div className={BOX}>
      <p className="text-[14px] font-semibold">Populärast</p>
      {top.length ? (
        <ul className="mt-2 divide-y divide-[#ECEAE5]">
          {top.map(({ it, c }) => (
            <li key={it.id} className="flex items-center gap-3 py-2">
              <img src={it.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[10px] bg-[#F3F2EF] object-cover" />
              <Link href={it.href} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:underline">
                {it.name}
              </Link>
              <span className="shrink-0 text-right text-[12.5px] text-[#6F6B63]">
                {c.views} {c.views === 1 ? "visning" : "visningar"} · {c.clicks} klick · <b className="text-[#111]">{c.orders} sålda</b>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13.5px] text-[#6F6B63]">När supportrarna tittar på varorna syns de mest populära här.</p>
      )}
    </div>
  );
}

export function RecentOrders({ stats, max = 6 }: { stats: ClubShopStats; max?: number }) {
  return (
    <div className={BOX}>
      <p className="text-[14px] font-semibold">Senaste beställningarna</p>
      {stats.orders.length ? (
        <ul className="mt-2 divide-y divide-[#ECEAE5]">
          {stats.orders.slice(0, max).map((o) => (
            <li key={o.number} className="py-2">
              <p className="flex justify-between gap-3 text-[14px]">
                <span className="font-medium">{o.number}</span>
                <span className="font-semibold">{kr(o.total)}</span>
              </p>
              <p className="truncate text-[12.5px] text-[#6F6B63]">
                {WHEN.format(new Date(o.at))} · {o.lines.map((l) => `${l.qty} × ${l.name}${l.flock ? " med namn" : ""}`).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13.5px] text-[#6F6B63]">Inga beställningar än. Beställningarna läggs hos Intersport och syns här utan kundernas uppgifter.</p>
      )}
    </div>
  );
}
