import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/newwave/Panel";
import { listProducts } from "@/lib/intersport";
import { ASA_IF, clubOccasions, occasionStatus } from "@/lib/newwave/club";
import { listApprovals } from "@/lib/newwave/store";
import { CountUp } from "@/components/newwave/motion/Motion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Klubbens dashboard` };

const TZ = "Europe/Stockholm";
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(`${iso}T12:00:00Z`));

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("sv-SE", { hour: "numeric", hour12: false, timeZone: TZ }).format(now));
  if (hour < 10) return "God morgon";
  if (hour < 17) return "Hej";
  return "God kväll";
}

const TONE: Record<"dark" | "mid" | "light", string> = {
  dark: "bg-[var(--club-accent)] text-[var(--club-on-accent)] border-[var(--club-accent)]",
  mid: "bg-[var(--nw-soft-2)] text-[var(--nw-ink)] border-[var(--nw-soft-2)]",
  light: "bg-white text-[var(--nw-muted)] border-[var(--nw-line)]",
};

const STATUS: Record<string, string> = {
  väntar: "bg-[var(--club-accent)] text-[var(--club-on-accent)]",
  godkänd: "bg-[var(--club)] text-white",
  ändring: "bg-[var(--nw-soft-2)] text-[var(--nw-ink)]",
};

export default async function ClubDashboard() {
  const now = new Date();
  const [approvals, products] = await Promise.all([listApprovals(ASA_IF.id), listProducts(ASA_IF.id)]);
  const pending = approvals.filter((a) => a.status === "väntar");
  const weekly = approvals.find((a) => a.weekly);
  const occasions = clubOccasions(now, 90);
  const next = occasions[0];

  const stats = [
    { label: "Väntar", value: String(pending.length), href: undefined },
    { label: "Nästa", value: next?.date ? fmtDay(next.date) : "–", href: undefined },
    { label: "I butiken", value: String(products.length), href: "/newwave/klubb/butik" },
  ];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">
        {greeting(now)}, {ASA_IF.name}
      </h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">
        {pending.length ? `${pending.length} ${pending.length === 1 ? "sak väntar" : "saker väntar"} på ert godkännande.` : "Allt är godkänt – hubben jobbar vidare."}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {stats.map((s) => {
          const body = (
            <>
              <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
              <p className="nw-club-heading mt-1.5 truncate text-[24px] leading-none text-[var(--club)] sm:text-[28px]">{s.label === "Nästa" ? s.value : <CountUp value={s.value} />}</p>
            </>
          );
          const cls = "block min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4 sm:px-5";
          return s.href ? (
            <Link key={s.label} href={s.href} className={`${cls} transition-colors hover:bg-[var(--nw-soft-2)]`}>
              {body}
            </Link>
          ) : (
            <div key={s.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Link
          href="/newwave/klubb/material/veckan"
          className="group flex min-w-0 items-center gap-4 rounded-[var(--nw-radius)] bg-[var(--club)] p-4 text-white transition-transform duration-300 hover:scale-[1.01] sm:p-5"
        >
          {weekly?.assets ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={weekly.assets.feed} alt="" className="h-[84px] w-[67px] shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-white/60">{weekly?.weekly ? `Vecka ${weekly.weekly.week} · automatiskt` : "Varje vecka · automatiskt"}</p>
            <p className="nw-club-heading mt-0.5 line-clamp-2 text-[19px] leading-tight [overflow-wrap:anywhere]">{weekly ? weekly.title : "Veckans paket"}</p>
            <p className="mt-1 line-clamp-2 text-[13px] text-white/70">
              {weekly?.status === "väntar"
                ? "Foton, inlägg, banner och nyhetsbrev – väntar på ert godkännande."
                : weekly?.status === "godkänd"
                  ? "Godkänt – produkterna ligger i butiken och materialet finns i zip-filen."
                  : "Söndag natt tar agenten fram foton, inlägg, banner och nyhetsbrev."}
            </p>
          </div>
          {weekly?.status === "väntar" ? (
            <span className="shrink-0 rounded-full bg-[var(--club-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--club-on-accent)]">Granska</span>
          ) : null}
        </Link>
        <Link
          href="/newwave/klubb/material"
          className="flex min-w-0 flex-col justify-center rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--nw-ink)] sm:p-5"
        >
          <p className="text-[12px] text-[var(--nw-muted)]">När ni vill</p>
          <p className="nw-club-heading mt-0.5 text-[19px] leading-tight text-[var(--club)]">Skapa eget</p>
          <p className="mt-1 text-[13px] text-[var(--nw-muted)]">Välj ett tillfälle – motiv, inlägg och mejl på några minuter.</p>
        </Link>
      </div>

      <div className="mt-8 border-t border-[var(--nw-line)]">
        <Panel
          title="Att godkänna"
          badge={pending.length}
          summary={pending.length ? pending.map((a) => a.title).join(" · ") : "Inget väntar just nu"}
        >
          <ul className="flex flex-col gap-2">
            {approvals.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/newwave/klubb/godkann/${a.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-[var(--nw-soft)] p-3 pl-4 transition-colors hover:bg-[var(--nw-soft-2)]"
                >
                  {a.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previewUrl} alt="" className="h-12 w-10 shrink-0 rounded-lg bg-white object-contain" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[var(--nw-muted)]">
                      {a.kind} · {a.occasion}
                    </p>
                    <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{a.title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${STATUS[a.status]}`}>
                    {a.status === "väntar" ? "Granska" : a.status === "godkänd" ? "Godkänd" : "Ändras"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Kalender"
          summary={
            next
              ? `Nästa: ${next.title}${next.date ? `, ${fmtDay(next.date)}` : ""} · ${occasions.length} tillfällen närmaste 90 dagarna`
              : "Inga tillfällen de närmaste 90 dagarna"
          }
        >
          <ul className="divide-y divide-[var(--nw-line)]">
            {occasions.map((o) => {
              const status = occasionStatus(o);
              return (
                <li key={o.id}>
                  <Link href={`/newwave/klubb/material?tillfalle=${encodeURIComponent(o.id)}`} className="group/row flex items-center gap-4 py-3">
                    <p className="w-14 shrink-0 text-[13.5px] font-semibold text-[var(--nw-ink)]">{o.date ? fmtDay(o.date) : ""}</p>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)] group-hover/row:underline">{o.title}</p>
                      <p className="truncate text-[13px] text-[var(--nw-muted)]">{o.detail}</p>
                    </div>
                    <span className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-medium sm:inline ${TONE[status.tone]}`}>
                      {status.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
