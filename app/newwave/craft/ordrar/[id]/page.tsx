import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crest, fmtKr } from "@/components/newwave/craft/parts";
import { OrderActions } from "@/components/poc/craft/OrderActions";
import { AutoRefresh } from "@/components/poc/craft/OrderControls";
import { ACTOR_NAME, fmtDay, fmtTime, fmtWhen, HubPill, hubLine, JobPill, OrderPill, PRODUCER_NAME } from "@/components/poc/craft/orderParts";
import { requireRole } from "@/lib/poc/auth";
import { pocClub } from "@/lib/poc/build";
import { hubConfig } from "@/lib/poc/hub/config";
import { MAX_ATTEMPTS, outboxForOrder } from "@/lib/poc/hub/outbox";
import type { OutboxItem } from "@/lib/poc/hub/types";
import { customerRemoved } from "@/lib/poc/privacy";
import { getOrderView } from "@/lib/poc/store";
import type { EventActor } from "@/lib/poc/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Craft · Order ${decodeURIComponent(id)}` };
}

/** Prickens färg i tidslinjen: vem som gjorde något. */
const DOT: Record<EventActor, string> = { butik: "#0A3D91", affärssystem: "#111111", tryckeri: "#B4570B", stickeri: "#7A1FA2", craft: "#111111", plattform: "#8A8A8E" };

export default async function CraftOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("craft", `/newwave/craft/ordrar/${id}`);
  const order = await getOrderView(decodeURIComponent(id)).catch(() => null);
  if (!order) notFound();
  const [club, hubItems] = await Promise.all([pocClub(order.clubId).catch(() => null), outboxForOrder(order.id).catch((): OutboxItem[] => [])]);
  const hub = hubConfig();
  const submit = hubItems.find((i) => i.kind === "order.submit");
  const removed = customerRemoved(order.customer) ? order.customer : null;
  const lineNo = new Map(order.lines.map((l, i) => [l.id, i + 1]));
  const jobs = new Map(order.jobs.map((j) => [j.id, j]));
  /** Jobbet en händelse gäller, när det inte redan framgår av vem som gjorde den. */
  const jobFor = (e: (typeof order.events)[number]) => {
    const job = e.jobId ? jobs.get(e.jobId) : undefined;
    return job && job.producer !== e.actor ? job : undefined;
  };
  const days = order.events.reduce<{ day: string; events: typeof order.events }[]>((acc, e) => {
    const day = fmtDay(e.at);
    const last = acc[acc.length - 1];
    if (last?.day === day) last.events.push(e);
    else acc.push({ day, events: [e] });
    return acc;
  }, []);
  // Samma regel som cancelOrder: inget jobb får ha börjat tillverkas eller skickats.
  const canCancel = order.status !== "avbruten" && !order.jobs.some((j) => j.status === "i produktion" || j.status === "skickad" || j.tracking);
  // Samma regel som resendToHub: ordern väntar på bekräftelse och skickas inte just nu.
  const canRetry = order.status === "mottagen" && !submit?.sending;
  const facts = [
    { label: "Summa", value: fmtKr(order.totalSek) },
    { label: "Crafts affärssystem", value: order.erpRef ?? (submit?.status === "misslyckad" ? "Kom inte fram" : order.status === "avbruten" ? "–" : "Väntar på bekräftelse") },
    { label: "Kanal", value: `${order.channel === "intersport" ? "Intersport" : order.channel}${order.externalRef ? ` · ${order.externalRef}` : ""}` },
    { label: "Lagd", value: fmtWhen(order.createdAt) },
  ];

  return (
    <div className="nw-page">
      <AutoRefresh />
      <Link href="/newwave/craft/ordrar" className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
        ← Ordrar
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Order {order.number}</h1>
        <OrderPill status={order.status} />
      </div>
      {order.status === "avbruten" ? (
        <p className="mt-3 max-w-[640px] rounded-2xl bg-[#FDECEC] px-4 py-3 text-[13.5px] text-[#9B1C1C]">
          <span className="font-semibold">Avbruten.</span> {order.cancelReason ? `Orsak: ${order.cancelReason}` : "Ingen orsak angavs."}
        </p>
      ) : null}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-[var(--nw-muted)]">
        <Crest name={club?.name ?? order.clubId} logo={club?.logo} colors={[club?.colors[0] ?? "#111111", club?.colors[1] ?? "#FFFFFF"]} size={24} />
        <span className="font-medium text-[var(--nw-ink)]">{club?.name ?? order.clubId}</span>
        <span>·</span>
        <a href={`/intersport/${order.clubId}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-[var(--nw-ink)]">
          Klubbens Intersport-shop
        </a>
      </p>
      <OrderActions orderId={order.id} canCancel={canCancel} canRetry={canRetry} />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] px-4 py-3.5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{f.label}</p>
            <p className="mt-1 truncate text-[17px] font-semibold text-[var(--nw-ink)]">{f.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Rader</h2>
            <ul className="mt-3 divide-y divide-[var(--nw-line)] rounded-[22px] border border-[var(--nw-line)]">
              {order.lines.map((l, i) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
                  <span className="w-5 shrink-0 text-[12px] tabular-nums text-[var(--nw-faint)]">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[var(--nw-ink)]">{l.title}</span>
                    <span className="block truncate text-[12px] text-[var(--nw-muted)]">
                      {l.sku} · {l.size ?? "One size"} · {l.kind === "halsduk" ? "stickas" : "trycks"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-[var(--nw-muted)]">
                    {l.qty} × {fmtKr(l.unitSek)}
                  </span>
                  <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-[var(--nw-ink)]">{fmtKr(l.qty * l.unitSek)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between px-4 py-3 text-[13.5px]">
                <span className="text-[var(--nw-muted)]">Totalt</span>
                <span className="font-semibold tabular-nums text-[var(--nw-ink)]">{fmtKr(order.totalSek)}</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Jobben</h2>
            {order.jobs.length ? (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {order.jobs.map((j) => (
                  <li key={j.id} className="min-w-0 rounded-[22px] border border-[var(--nw-line)] p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-semibold text-[var(--nw-ink)]">{PRODUCER_NAME[j.producer]}</span>
                      <JobPill status={j.status} />
                    </div>
                    <p className="mt-1 text-[12.5px] text-[var(--nw-muted)]">
                      Rad {j.lineIds.map((lid) => lineNo.get(lid)).filter(Boolean).join(", ")} · uppdaterad {fmtWhen(j.updatedAt)}
                    </p>
                    {j.note ? (
                      <p className={`mt-3 rounded-xl px-3 py-2 text-[12.5px] ${j.status === "fel" ? "bg-[#FDECEC] text-[#9B1C1C]" : "bg-[var(--nw-soft)] text-[var(--nw-ink)]"}`}>
                        <span className={j.status === "fel" ? "" : "text-[var(--nw-muted)]"}>Anteckning från {PRODUCER_NAME[j.producer].toLowerCase()}</span>
                        <span className="block">{j.note}</span>
                      </p>
                    ) : null}
                    <p className="mt-3 rounded-xl bg-[var(--nw-soft)] px-3 py-2 text-[12.5px]">
                      <span className="text-[var(--nw-muted)]">Spårningsnummer</span>
                      <span className="block truncate font-semibold tabular-nums text-[var(--nw-ink)]">{j.tracking ?? "–"}</span>
                    </p>
                    {j.files.length ? (
                      <details className="mt-3 text-[12.5px]">
                        <summary className="cursor-pointer font-medium text-[var(--nw-ink)]">{j.files.length} produktionsfiler</summary>
                        <ul className="mt-1.5 flex flex-col gap-0.5 text-[var(--nw-muted)]">
                          {j.files.map((f) => (
                            <li key={f.name} className="truncate" title={f.name}>
                              {f.label}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="mt-3 text-[12.5px] text-[var(--nw-muted)]">Produktionsfilerna byggs när producenten hämtar jobbet.</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">Inga jobb än – affärssystemet delar upp ordern i jobb till tryckeriet och stickeriet.</p>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">New Waves hubb</h2>
              <span className="text-[12px] text-[var(--nw-muted)]">{hub.mode === "simulerad" ? "Simulerad – affärssystemet svarar själv" : "Riktig hubb"}</span>
            </div>
            {hub.mode === "http" && !hub.ready ? (
              <p className="mt-3 rounded-2xl bg-[#FDECEC] px-4 py-3 text-[13px] text-[#9B1C1C]">
                Hubben är inte inställd ({hub.missing.join(", ")} saknas eller är fel). Ordrarna väntar i utkorgen tills det är rättat.
              </p>
            ) : null}
            {hubItems.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {hubItems.map((i) => (
                  <li key={i.id} className="min-w-0 rounded-[22px] border border-[var(--nw-line)] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-[var(--nw-ink)]">{i.kind === "order.submit" ? "Ordern" : "Avbokningen"}</span>
                      <HubPill item={i} />
                    </div>
                    <p className="mt-1 text-[12.5px] text-[var(--nw-muted)]">{hubLine(i, order.erpRef, MAX_ATTEMPTS)}</p>
                    {i.lastError && (i.status === "väntar" || i.status === "misslyckad") ? (
                      <p className="mt-2 rounded-xl bg-[#FDECEC] px-3 py-2 text-[12.5px] text-[#9B1C1C]">
                        <span>Senaste fel{i.lastErrorAt ? ` ${fmtWhen(i.lastErrorAt)}` : ""}</span>
                        <span className="block break-words">{i.lastError}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">
                {order.erpRef ? "Ordern skickades till affärssystemet innan utkorgen mot hubben fanns." : "Ordern ligger inte i utkorgen. Skicka den till affärssystemet igen för att lägga den där."}
              </p>
            )}
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Kunden</h2>
            <div className="mt-3 rounded-[22px] border border-[var(--nw-line)] px-4 py-3 text-[13.5px] leading-relaxed">
              {removed ? (
                <p className="text-[var(--nw-muted)]">Kunduppgifterna är borttagna ({fmtWhen(removed.removedAt)}).</p>
              ) : (
                <>
                  <p className="font-medium text-[var(--nw-ink)]">{order.customer.name}</p>
                  <p className="text-[var(--nw-muted)]">{[order.customer.email, order.customer.phone].filter(Boolean).join(" · ")}</p>
                  {order.customer.address ? <p className="text-[var(--nw-muted)]">{order.customer.address}</p> : null}
                </>
              )}
            </div>
          </section>
        </div>

        <section className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Tidslinje</h2>
          {days.length ? (
            <div className="mt-3 flex flex-col gap-5">
              {days.map((d) => (
                <div key={d.day}>
                  <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-[var(--nw-faint)]">{d.day}</p>
                  <ol className="mt-2 border-l border-[var(--nw-line)] pl-0">
                    {d.events.map((e) => (
                      <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                        <span className="absolute -left-[5px] top-[5px] h-[9px] w-[9px] rounded-full ring-2 ring-white" style={{ background: DOT[e.actor] ?? "#8A8A8E" }} aria-hidden />
                        <p className="text-[12px] text-[var(--nw-muted)]">
                          <span className="tabular-nums">{fmtTime(e.at)}</span> · <span className="font-medium text-[var(--nw-ink)]">{ACTOR_NAME[e.actor] ?? e.actor}</span>
                          {jobFor(e) ? ` · ${PRODUCER_NAME[jobFor(e)!.producer].toLowerCase()}s jobb` : ""}
                        </p>
                        <p className="mt-0.5 text-[13.5px] leading-snug text-[var(--nw-ink)]">{e.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">Inga händelser än.</p>
          )}
        </section>
      </div>
    </div>
  );
}
