import type { Metadata } from "next";
import Link from "next/link";
import { hubLive } from "@/lib/newwave/nwHub";
import { BUILDER_STEPS, fmtDay, sek, shopUrl, stepsDone } from "@/lib/newwave/reseller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Återförsäljare · New Waves dashboard" };

export default async function NwResellers() {
  const { resellers } = await hubLive();
  const total = resellers.reduce((s, r) => s + r.nwRevenue, 0);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Återförsäljare</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">
        {resellers.length} återförsäljare säljer New Waves sortiment i egna webbshoppar. Hittills {sek(total)} i ordrar till er.
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {resellers.map((r) => {
          const done = stepsDone(r);
          const live = r.status === "publicerad";
          return (
            <li key={r.id} className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid h-12 w-28 shrink-0 place-items-center rounded-xl bg-[var(--nw-soft)] px-2">
                  {r.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo} alt="" className="max-h-8 max-w-full object-contain" />
                  ) : (
                    <span className="text-[13px] font-semibold">{r.name}</span>
                  )}
                </span>
                <div className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
                  <p className="truncate text-[15.5px] font-semibold text-[var(--nw-ink)]">{r.name}</p>
                  <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
                    {r.city} · {r.products.length} produkter · påslag {r.markup} %{r.lastAt ? ` · senast aktiv ${fmtDay(r.lastAt)}` : ""}
                  </p>
                </div>
                <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium sm:ml-0 ${live ? "bg-[#DFF5E7] text-[#17703A]" : "bg-[#FFF1CC] text-[#7A4F00]"}`}>{live ? "Butiken är live" : "Bygger butiken"}</span>
              </div>
              {live ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Offerter", value: String(r.quotes) },
                    { label: "Öppna", value: String(r.open) },
                    { label: "Ordrar", value: String(r.orders) },
                    { label: "Till New Wave", value: sek(r.nwRevenue) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-[var(--nw-soft)] px-3 py-2.5">
                      <p className="text-[11.5px] text-[var(--nw-muted)]">{s.label}</p>
                      <p className="mt-0.5 truncate text-[16px] font-semibold text-[var(--nw-ink)]">{s.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label={`${r.name}s butiksbyggare`}>
                  {BUILDER_STEPS.map((s) => (
                    <li key={s.id} className="min-w-0">
                      <span className={`block h-1.5 rounded-full ${done[s.id] ? "bg-[var(--club)]" : "bg-[var(--nw-soft-2)]"}`} />
                      <span className="mt-1.5 block truncate text-[11.5px] text-[var(--nw-muted)]">{s.label}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-4 flex flex-wrap gap-3 text-[13px] font-medium">
                {live ? (
                  <Link href={shopUrl(r)} className="nw-hit text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 hover:decoration-[var(--nw-ink)]">
                    Öppna webbshoppen
                  </Link>
                ) : null}
                {r.website ? <span className="text-[var(--nw-muted)]">{r.website}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-[13px] text-[var(--nw-muted)]">
        Demon är inloggad som{" "}
        <Link href="/newwave/shop" className="font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4">
          Västkust Profil
        </Link>
        .
      </p>
    </div>
  );
}
