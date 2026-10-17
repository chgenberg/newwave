import type { Metadata } from "next";
import Link from "next/link";
import { hubLive } from "@/lib/newwave/nwHub";
import { sek } from "@/lib/newwave/reseller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Klubbar · New Waves dashboard" };

const STATUS = { aktiv: "Aktiv", lugn: "Lugn", inaktiv: "Inaktiv" } as const;

export default async function NwClubs() {
  const { clubs } = await hubLive();
  const sorted = [...clubs].sort((a, b) => b.stats.sold - a.stats.sold);
  const sold = clubs.reduce((s, c) => s + c.stats.sold, 0);
  const inShop = clubs.reduce((s, c) => s + c.stats.inShop, 0);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Klubbar</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Craft styr klubbarna och materialet. Ni ser vad som säljer och ska tryckas – {sold} plagg sålda, {inShop} produkter i klubbutikerna.</p>

      <ul className="mt-6 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
        {sorted.map((c) => (
          <li key={c.id} className="flex items-center gap-4 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nw-soft)] p-1.5">
              {c.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logo} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[12px] font-bold">{c.name.slice(0, 2)}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{c.name}</p>
              <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
                {STATUS[c.status]} · {c.stats.inShop} i butiken · {c.stats.queue ? `${c.stats.queue} i granskning` : "inget i granskning"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[14px] font-semibold text-[var(--nw-ink)]">{c.stats.sold} st</p>
              <p className="text-[12px] text-[var(--nw-muted)]">{sek(c.stats.revenue)}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px] text-[var(--nw-muted)]">
        Materialet granskas och släpps i{" "}
        <Link href="/newwave/craft" className="font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4">
          Crafts dashboard
        </Link>
        .
      </p>
    </div>
  );
}
