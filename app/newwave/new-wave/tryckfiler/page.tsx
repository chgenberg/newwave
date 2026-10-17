/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { deliveryStats, fileUrl, listDeliveries } from "@/lib/newwave/hubDelivery";
import { fmtBytes, FORMATS } from "@/lib/newwave/hubFormats";
import { fmtWhen } from "@/lib/newwave/reseller";
import { getApproval } from "@/lib/newwave/store";
import { ASA_IF } from "@/lib/newwave/club";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Tryckfiler från navet" };

const STEPS = [
  { title: "Klubben godkänner", text: "Kansliet säger ja till materialet i sin dashboard." },
  { title: "Navet gör filerna", text: "Rätt format per metod, i exakt tryckstorlek, med färger och specifikation." },
  { title: "API-anrop till New Wave", text: "Ett jobb per tryckposition med filer, kontrollsummor och SKU." },
  { title: "New Wave fördelar", text: "Till tryck, brodyr, laser, sublimering och stickeri." },
];

export default async function HubFilesPage() {
  const [deliveries, cup] = await Promise.all([listDeliveries(), getApproval(ASA_IF.id, "a3")]);
  const all = deliveries.map((d) => ({ d, s: deliveryStats(d) }));
  const totals = {
    deliveries: all.length,
    jobs: all.reduce((n, x) => n + x.d.jobs.length, 0),
    files: all.reduce((n, x) => n + x.s.files, 0),
    bytes: all.reduce((n, x) => n + x.s.bytes, 0),
  };
  const stats = [
    { label: "Leveranser", value: String(totals.deliveries) },
    { label: "Tryckjobb", value: String(totals.jobs) },
    { label: "Produktionsfiler", value: String(totals.files) },
    { label: "Totalt", value: fmtBytes(totals.bytes) },
  ];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Tryckfiler från navet</h1>
      <p className="mt-1 max-w-[680px] text-[14.5px] text-[var(--nw-muted)]">
        När en klubb godkänner nytt material gör navet produktionsfilerna – i det format varje tryckeri, brodyr, laser och stickeri läser – och skickar dem till er hub via API. Här är allt som kommit in.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[22px] leading-none text-[var(--club)] sm:text-[26px]">{s.value}</p>
          </div>
        ))}
      </div>

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--club)] text-[11.5px] font-semibold text-[var(--club)]">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-tight text-[var(--nw-ink)]">{s.title}</p>
              <p className="mt-1 text-[12.5px] text-[var(--nw-muted)]">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {cup?.status === "väntar" ? (
        <div className="mt-6 flex flex-col gap-3 rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="nw-club-heading text-[17px]">{cup.title} väntar hos {ASA_IF.name}</p>
            <p className="mt-1 text-[13.5px] text-white/70">Godkänn den i klubbens dashboard, så landar tryckfiler, brodyrfil och stickfil här.</p>
          </div>
          <Link href={`/newwave/klubb/godkann/${cup.id}`} className="nw-btn nw-club-btn shrink-0">
            Öppna hos klubben
          </Link>
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Leveranser</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {all.map(({ d, s }) => (
            <li key={d.id}>
              <Link href={`/newwave/new-wave/tryckfiler/${d.id}`} className="group block rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 transition-colors hover:border-[var(--club)] sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-[var(--nw-muted)]">
                      {d.club} · {d.occasion}
                      {d.from ? ` · från ${d.from}` : ""}
                    </p>
                    <p className="nw-club-heading mt-0.5 text-[18px] leading-tight text-[var(--club)] [overflow-wrap:anywhere]">{d.title}</p>
                  </div>
                  <p className="nw-mono shrink-0 text-[12px] text-[var(--nw-muted)]">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#1F9D55]" aria-hidden />
                    201 Created · {d.ms} ms
                  </p>
                </div>
                <div className="mt-4 flex gap-2 overflow-hidden">
                  {d.jobs.map((j) => (
                    <img key={j.key} src={j.mockup || fileUrl(j.key, j.preview)} alt={j.product} loading="lazy" className={`h-16 w-16 shrink-0 rounded-xl bg-[var(--nw-soft)] sm:h-20 sm:w-20 ${j.method === "stickning" ? "object-contain p-1" : "object-cover"}`} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[var(--nw-muted)]">
                  <span>Skickad {fmtWhen(d.sentAt)}</span>
                  <span>
                    {s.products} produkter · {s.files} filer · {fmtBytes(s.bytes)}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {s.methods.map((m) => (
                      <span key={m} className="rounded-full bg-[var(--nw-soft)] px-2.5 py-0.5 text-[12px] text-[var(--nw-ink)]">
                        {m}
                      </span>
                    ))}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Filformat per metod</h2>
        <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Det varje mottagare får – samma krav som tryckerierna ställer på inskickade original.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FORMATS.map((f) => (
            <li key={f.method} className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4">
              <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">{f.label}</p>
              <p className="nw-mono mt-1 text-[12px] text-[var(--club)]">{f.files}</p>
              <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-[var(--nw-muted)]">
                {f.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
