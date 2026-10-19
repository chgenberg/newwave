/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiPayload, deliveryStats, fileUrl, getDelivery, type HubJob } from "@/lib/newwave/hubDelivery";
import { fmtBytes } from "@/lib/newwave/hubFormats";
import { fmtWhen } from "@/lib/newwave/reseller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Leverans till New Waves hubb" };

const ROLE: Record<HubJob["files"][number]["role"], string> = { tryck: "Tryck", separation: "Separation", maskin: "Maskin", korrektur: "Korrektur", data: "Data" };
const IMAGE = /\.(png|jpg|svg)$/;
const mm = (v: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(v);

function Job({ j, n }: { j: HubJob; n: number }) {
  const thumbs = j.files.filter((f) => f.role === "separation" && f.format === "PNG");
  return (
    <section className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="nw-kicker">
            Jobb {n} · {j.methodLabel} → {j.receiver}
          </p>
          <h2 className="nw-club-heading mt-1 text-[19px] leading-tight text-[var(--club)]">
            {j.product}
            {j.position > 1 ? ` · tryck ${j.position}` : ""}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">
            {j.placement} · {mm(j.sizeMm[0] / 10)} × {mm(j.sizeMm[1] / 10)} cm
          </p>
        </div>
        <p className="nw-mono shrink-0 text-[12px] text-[var(--nw-muted)]">{j.sku}</p>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <a href={fileUrl(j.key, j.preview)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-[var(--nw-soft)]">
            <img src={fileUrl(j.key, j.preview)} alt={`Korrektur ${j.product}`} loading="lazy" className={`w-full object-contain ${j.method === "stickning" ? "" : "aspect-square"}`} />
          </a>
          <div className="mt-2 flex flex-wrap gap-2">
            <img src={j.mockup} alt={`${j.product} med trycket`} loading="lazy" className={`h-16 w-16 rounded-lg bg-[var(--nw-soft)] ${j.method === "stickning" ? "object-contain p-1" : "object-cover"}`} />
            {thumbs.map((f) => (
              <a key={f.name} href={fileUrl(j.key, f.name)} target="_blank" rel="noreferrer" title={f.label} className="block h-16 w-16 overflow-hidden rounded-lg border border-[var(--nw-line)] bg-white">
                <img src={fileUrl(j.key, f.name)} alt={f.label} loading="lazy" className="h-full w-full object-contain" />
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {j.facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[12px] text-[var(--nw-muted)]">{f.label}</dt>
                <dd className="text-[13.5px] text-[var(--nw-ink)] [overflow-wrap:anywhere]">{f.value}</dd>
              </div>
            ))}
          </dl>

          {j.inks.length ? (
            <ul className="mt-4 flex flex-col gap-1.5">
              {j.inks.map((c, i) => (
                <li key={`${c.hex}-${i}`} className="flex items-center gap-2.5 text-[13px]">
                  <span className="h-5 w-5 shrink-0 rounded-md border border-[var(--nw-line)]" style={{ background: c.hex }} aria-hidden />
                  <span className="font-medium text-[var(--nw-ink)]">{c.pantone}</span>
                  <span className="text-[var(--nw-muted)]">
                    {c.name} · {c.hex}
                    {c.detail ? ` · ${c.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="mt-4 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
            {j.files.map((f) => (
              <li key={f.name} className="flex items-center gap-3 py-2.5">
                <span className="nw-mono w-[74px] shrink-0 rounded-md bg-[var(--nw-soft)] px-1.5 py-0.5 text-center text-[11px] text-[var(--nw-ink)]">
                  {f.format} · {ROLE[f.role]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="nw-mono truncate text-[12.5px] text-[var(--nw-ink)]">{f.name}</p>
                  <p className="truncate text-[12px] text-[var(--nw-muted)]">
                    {f.spec} · {fmtBytes(f.bytes)}
                  </p>
                </div>
                {IMAGE.test(f.name) || f.format === "TXT" || f.format === "CSV" ? (
                  <a href={fileUrl(j.key, f.name)} target="_blank" rel="noreferrer" className="nw-hit shrink-0 text-[12.5px] text-[var(--nw-muted)] underline decoration-[var(--nw-line)] underline-offset-4 hover:text-[var(--nw-ink)]">
                    Öppna
                  </a>
                ) : null}
                <a href={`${fileUrl(j.key, f.name)}?dl=1`} download={f.name} className="nw-hit shrink-0 text-[12.5px] font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4">
                  Ladda ner
                </a>
              </li>
            ))}
          </ul>

          <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-[var(--nw-muted)]">
            {j.notes.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDelivery(id);
  if (!d) notFound();
  const s = deliveryStats(d);
  const payload = apiPayload(d);
  const sample = { ...payload, jobs: payload.jobs.slice(0, 1) };

  return (
    <div className="nw-page">
      <Link href="/newwave/new-wave/tryckfiler" className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
        ← Tryckfiler
      </Link>
      <p className="mt-4 text-[12.5px] text-[var(--nw-muted)]">
        {d.club} · {d.occasion}
        {d.from ? ` · från ${d.from}` : ""}
      </p>
      <h1 className="nw-club-heading mt-1 text-[28px] leading-tight text-[var(--club)] [overflow-wrap:anywhere] sm:text-[32px]">{d.title}</h1>
      <p className="mt-2 text-[14.5px] text-[var(--nw-muted)]">
        Godkänd av kansliet {fmtWhen(d.approvedAt)}. {s.files} produktionsfiler för {s.products} produkter, {fmtBytes(s.bytes)}.
      </p>

      <div className="mt-6 rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="nw-mono text-[13px]">
            <span className="text-white/60">POST</span> /v1/print-jobs
          </p>
          <p className="nw-mono flex items-center gap-2 text-[13px]">
            <span className="h-2 w-2 rounded-full bg-[#4ADE80]" aria-hidden />
            201 Created · {d.ms} ms
          </p>
        </div>
        <p className="mt-2 text-[13.5px] text-white/70">
          {d.jobs.length} jobb med fil-URL:er och SHA-256 per fil. New Waves hubb hämtar filerna och fördelar jobben till {[...new Set(d.jobs.map((j) => j.receiver.toLowerCase()))].join(", ")}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/v1/newwave/hub/leveranser/${d.id}?zip=1`} className="nw-btn nw-club-btn">
            Ladda ner allt (zip)
          </a>
          <a href={`/api/v1/newwave/hub/leveranser/${d.id}`} target="_blank" rel="noreferrer" className="nw-btn border border-white/25 !bg-transparent">
            Hela API-anropet
          </a>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] text-white/80">Visa första jobbet i anropet</summary>
          <pre className="nw-mono mt-3 max-h-[360px] overflow-auto rounded-xl bg-black/30 p-4 text-[11.5px] leading-relaxed text-white/90">{JSON.stringify(sample, null, 2)}</pre>
        </details>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {d.jobs.map((j, i) => (
          <Job key={`${j.key}-${i}`} j={j} n={i + 1} />
        ))}
      </div>
    </div>
  );
}
