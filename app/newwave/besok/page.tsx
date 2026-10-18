import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { LoginScreen } from "@/components/newwave/LoginScreen";
import { ADMIN_COOKIE, isAdmin, STATS_PATH } from "@/lib/access";
import { type Place, type Visitor, visitReport } from "@/lib/visits";

export const metadata: Metadata = { title: "Besök · Next Wave Production", robots: { index: false } };

const when = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const at = (iso: string) => when.format(new Date(iso));

function duration(sec: number) {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const LOC = /^-?\d{1,3}\.\d+,-?\d{1,3}\.\d+$/;
const placeText = (p?: Place) => (p ? [p.city, p.region, p.country].filter(Boolean).join(", ") || "Okänd plats" : "Platsen slås upp…");

export default async function StatsPage() {
  const admin = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!process.env.ADMIN_PASSWORD) notFound();
  if (!(await isAdmin(admin))) {
    return <LoginScreen title="Besök" text="Statistiken över vilka som öppnat demot. Ange adminlösenordet." next={STATS_PATH} scope="admin" />;
  }

  const { visitors, totals } = await visitReport();
  const tiles = [
    ["Besökare", totals.visitors],
    ["Loggade in", totals.loggedIn],
    ["Besök", totals.sessions],
    ["Aktiv tid totalt", duration(totals.sec)],
    ["Startade filmen", totals.film],
    ["Fel lösenord", totals.fails],
  ] as const;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nw-mono text-[12px] uppercase tracking-[0.08em] text-[var(--nw-muted)]">Next Wave · intern</p>
          <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.04em] sm:text-[44px]">Besök</h1>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--nw-muted)]">Vem som öppnat demot, varifrån och hur länge. Ladda om sidan för senaste läget. Besök från den här webbläsaren räknas inte.</p>
        </div>
        <a href={STATS_PATH} className="rounded-full border border-[var(--nw-line)] px-4 py-2 text-[14px] font-medium hover:bg-[var(--nw-soft)]">
          Uppdatera
        </a>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--nw-line)] bg-white p-4">
            <dt className="text-[13px] text-[var(--nw-muted)]">{label}</dt>
            <dd className="mt-1 text-[24px] font-semibold tracking-[-0.03em]">{value}</dd>
          </div>
        ))}
      </dl>

      {visitors.length ? (
        <ul className="mt-8 flex flex-col gap-3">
          {visitors.map((v) => (
            <VisitorCard key={v.vid} v={v} />
          ))}
        </ul>
      ) : (
        <p className="mt-10 rounded-2xl border border-dashed border-[var(--nw-line)] p-8 text-center text-[15px] text-[var(--nw-muted)]">Inga besök än. De dyker upp här så snart någon öppnar sajten.</p>
      )}
    </main>
  );
}

function VisitorCard({ v }: { v: Visitor }) {
  const main = v.ips.at(-1);
  const status = v.logins ? "Loggade in" : v.fails ? `Kom inte in · ${v.fails} fel lösenord` : "Bara inloggningssidan";
  const tone = v.logins ? "bg-[#E7F6EC] text-[#1D6B3A]" : v.fails ? "bg-[#FDECEA] text-[#B42318]" : "bg-[var(--nw-soft)] text-[var(--nw-muted)]";
  return (
    <li className="rounded-[22px] border border-[var(--nw-line)] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[18px] font-semibold tracking-[-0.02em]">{placeText(main?.place)}</p>
          <p className="mt-0.5 text-[14px] text-[var(--nw-muted)]">{main?.place?.org ?? "Okänt nätverk"}</p>
        </div>
        <p className="text-right text-[13px] text-[var(--nw-muted)]">
          Senast {at(v.last)}
          <br />
          Första gången {at(v.first)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
        <span className={`rounded-full px-3 py-1 font-medium ${tone}`}>{status}</span>
        <span className="rounded-full bg-[var(--nw-soft)] px-3 py-1">{v.device}</span>
        {v.ips.map((i) => (
          <span key={i.ip} className="nw-mono rounded-full bg-[var(--nw-soft)] px-3 py-1">
            {i.ip}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
        <Fact label="Besök" value={v.sessions.length} />
        <Fact label="Aktiv tid" value={duration(v.sec)} />
        <Fact label="Sidvisningar" value={v.views} />
        <Fact label="Filmen" value={v.film ? `${v.film} %` : "Inte startad"} />
      </dl>

      <details className="group mt-4 border-t border-[var(--nw-line)] pt-3">
        <summary className="cursor-pointer text-[14px] font-medium text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">Visa besöken och detaljer</summary>
        {v.sessions.length ? (
          <ol className="mt-3 flex flex-col gap-2">
            {v.sessions.map((s) => (
              <li key={s.sid} className="rounded-xl bg-[var(--nw-soft)] p-3 text-[13.5px]">
                <p className="font-medium">
                  {at(s.start)} · {duration(s.sec)} aktiv{s.film ? ` · filmen ${s.film} %` : ""}
                </p>
                <p className="nw-mono mt-1 break-words text-[12px] text-[var(--nw-muted)]">{s.pages.join("  →  ") || "Inga sidvisningar"}</p>
              </li>
            ))}
          </ol>
        ) : null}
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          {v.ips.map((i) => (
            <Detail key={i.ip} label={i.ip} value={[placeText(i.place), i.place?.org, i.place?.hostname].filter(Boolean).join(" · ")} href={i.place?.loc && LOC.test(i.place.loc) ? `https://www.google.com/maps?q=${i.place.loc}` : undefined} />
          ))}
          <Detail label="Språk" value={v.lang} />
          <Detail label="Skärm" value={v.screen} />
          <Detail label="Tidszon" value={v.tz} />
          <Detail label="Kom från" value={v.ref} />
          <Detail label="Webbläsare" value={v.ua} />
          <Detail label="Besökar-id" value={v.vid} />
        </dl>
      </details>
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[12.5px] text-[var(--nw-muted)]">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Detail({ label, value, href }: { label: string; value?: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="nw-mono shrink-0 text-[var(--nw-muted)]">{label}</dt>
      <dd className="min-w-0 break-words">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-[var(--nw-line)] underline-offset-2 hover:decoration-current">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
