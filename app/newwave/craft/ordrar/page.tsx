import type { Metadata } from "next";
import Link from "next/link";
import { Crest, fmtKr, fmtN } from "@/components/newwave/craft/parts";
import { AutoRefresh, ClubFilter } from "@/components/poc/craft/OrderControls";
import { fmtTime, fmtWhen, JobPill, ORDER_STATUSES, OrderPill, PRODUCER_NAME } from "@/components/poc/craft/orderParts";
import { requireRole } from "@/lib/poc/auth";
import { pocClub } from "@/lib/poc/build";
import { submitStates } from "@/lib/poc/hub/outbox";
import type { OutboxItem } from "@/lib/poc/hub/types";
import { customerRemoved } from "@/lib/poc/privacy";
import { listOrders } from "@/lib/poc/store";
import type { OrderStatus, OrderView } from "@/lib/poc/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Ordrar" };

const chip = (on: boolean) => `nw-chip h-8 px-3 ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "hover:border-[var(--nw-ink)]"}`;
const ACTIVE: OrderStatus[] = ["mottagen", "bekräftad", "i produktion", "delvis skickad"];

/** Affärssystemets ordernummer, eller var ordern är på väg dit (utkorgen mot New Waves hubb). */
function erpText(o: OrderView, item: OutboxItem | undefined): { text: string; bad?: boolean } {
  if (o.erpRef) return { text: o.erpRef };
  if (o.status === "avbruten") return { text: "–" };
  if (!item) return { text: "väntar" };
  if (item.sending) return { text: "skickas" };
  if (item.status === "misslyckad") return { text: "kom inte fram", bad: true };
  if (item.status === "skickad") return { text: "mottagen, obekräftad" };
  if (item.lastError) return { text: `nytt försök ${fmtTime(item.nextAttemptAt).slice(0, 5)}`, bad: true };
  return { text: "väntar" };
}

export default async function CraftOrders({ searchParams }: { searchParams: Promise<{ status?: string; klubb?: string }> }) {
  const p = await searchParams;
  const here = new URLSearchParams({ ...(p.status ? { status: p.status } : {}), ...(p.klubb ? { klubb: p.klubb } : {}) });
  await requireRole("craft", `/newwave/craft/ordrar${here.size ? `?${here}` : ""}`);
  const status = ORDER_STATUSES.find((s) => s === p.status);
  let orders: OrderView[] = [];
  let failed = false;
  try {
    orders = await listOrders({ limit: 1000 });
  } catch (e) {
    console.error("craft/ordrar", e instanceof Error ? e.message : e);
    failed = true;
  }
  const hubStates = await submitStates(orders.map((o) => o.id)).catch(() => new Map<string, OutboxItem>());
  const clubIds = [...new Set(orders.map((o) => o.clubId))];
  const clubs = new Map((await Promise.all(clubIds.map((id) => pocClub(id).catch(() => null)))).flatMap((c) => (c ? [[c.id, c] as const] : [])));
  const klubb = p.klubb && clubIds.includes(p.klubb) ? p.klubb : "";
  const shown = orders.filter((o) => (!status || o.status === status) && (!klubb || o.clubId === klubb));
  const qs = (s?: string) => {
    const q = new URLSearchParams({ ...(s ? { status: s } : {}), ...(klubb ? { klubb } : {}) });
    return `/newwave/craft/ordrar${q.size ? `?${q}` : ""}`;
  };
  const stats = [
    { label: "Ordrar", value: fmtN(orders.length) },
    { label: "Försäljning", value: fmtKr(orders.filter((o) => o.status !== "avbruten").reduce((s, o) => s + o.totalSek, 0)) },
    { label: "Pågår", value: fmtN(orders.filter((o) => ACTIVE.includes(o.status)).length) },
    { label: "Skickade", value: fmtN(orders.filter((o) => o.status === "skickad").length) },
  ];

  return (
    <div className="nw-page">
      <AutoRefresh />
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Ordrar</h1>
      <p className="mt-1 max-w-[64ch] text-[14.5px] text-[var(--nw-muted)]">
        Ordrarna från klubbarnas Intersport-shoppar: bekräftade av Crafts affärssystem, uppdelade i jobb till tryckeriet och stickeriet, och var de är nu.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[24px] leading-none text-[var(--club)] sm:text-[28px]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-wrap gap-1.5">
          <Link href={qs()} className={chip(!status)}>
            Alla
          </Link>
          {ORDER_STATUSES.map((s) => (
            <Link key={s} href={qs(s)} className={chip(status === s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </div>
        <ClubFilter clubs={clubIds.map((id) => ({ id, name: clubs.get(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name, "sv"))} value={klubb} status={status} />
      </div>

      {failed ? (
        <p className="mt-6 rounded-2xl bg-[#FDECEC] p-4 text-[13.5px] text-[#9B1C1C]">Ordrarna gick inte att läsa just nu.</p>
      ) : !shown.length ? (
        <p className="mt-6 rounded-2xl bg-[var(--nw-soft)] p-5 text-[14px] text-[var(--nw-muted)]">
          {orders.length ? "Inga ordrar matchar filtret." : "Inga ordrar än. De dyker upp här när kunder handlar i klubbarnas Intersport-shoppar."}{" "}
          {orders.length ? null : (
            <Link href="/newwave/craft/klubbkollektion" className="font-medium text-[var(--nw-ink)] underline underline-offset-4">
              Publicera en klubbkollektion
            </Link>
          )}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((o) => {
            const club = clubs.get(o.clubId);
            const qty = o.lines.reduce((n, l) => n + l.qty, 0);
            const erp = erpText(o, hubStates.get(o.id));
            return (
              <li key={o.id}>
                <Link href={`/newwave/craft/ordrar/${encodeURIComponent(o.number)}`} className="block rounded-[22px] border border-[var(--nw-line)] p-4 transition-colors hover:border-[#cfcfca] hover:shadow-[0_8px_22px_-16px_rgba(17,17,17,0.45)]">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <Crest name={club?.name ?? o.clubId} logo={club?.logo} colors={[club?.colors[0] ?? "#111111", club?.colors[1] ?? "#FFFFFF"]} size={38} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold tabular-nums text-[var(--nw-ink)]">{o.number}</span>
                          <OrderPill status={o.status} />
                        </p>
                        <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
                          {club?.name ?? o.clubId} · {fmtWhen(o.createdAt)}
                          {customerRemoved(o.customer) ? " · kunduppgifterna borttagna" : ""}
                        </p>
                        {o.status === "avbruten" ? <p className="truncate text-[12.5px] text-[#9B1C1C]">Avbruten{o.cancelReason ? `: ${o.cancelReason}` : ""}</p> : null}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-4 text-[13px] lg:block">
                      <p className="text-[15px] font-semibold tabular-nums text-[var(--nw-ink)]">{fmtKr(o.totalSek)}</p>
                      <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
                        {qty} st · Affärssystem: <span className={`font-medium ${erp.bad ? "text-[#9B1C1C]" : "text-[var(--nw-ink)]"}`}>{erp.text}</span>
                      </p>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {o.jobs.length ? (
                        o.jobs.map((j) => (
                          <li key={j.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--nw-soft)] px-3 py-2 text-[12.5px]">
                            <span className="font-medium text-[var(--nw-ink)]">{PRODUCER_NAME[j.producer]}</span>
                            <JobPill status={j.status} />
                            <span className="text-[var(--nw-muted)]">{j.lineIds.length} {j.lineIds.length === 1 ? "rad" : "rader"}</span>
                            {j.tracking ? <span className="ml-auto truncate font-medium tabular-nums text-[var(--nw-ink)]">Spårning {j.tracking}</span> : null}
                            {j.note ? <span className={`w-full truncate ${j.status === "fel" ? "text-[#9B1C1C]" : "text-[var(--nw-muted)]"}`}>{j.note}</span> : null}
                          </li>
                        ))
                      ) : (
                        <li className="rounded-xl bg-[var(--nw-soft)] px-3 py-2 text-[12.5px] text-[var(--nw-muted)]">Inga jobb än – affärssystemet delar upp ordern.</li>
                      )}
                    </ul>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length ? (
        <p className="mt-4 text-[12.5px] text-[var(--nw-faint)]">
          Visar {fmtN(shown.length)} av {fmtN(orders.length)} ordrar · uppdateras av sig själv
        </p>
      ) : null}
    </div>
  );
}
