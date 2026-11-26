import type { JobStatus, Producer } from "@/lib/poc/types";
import { leaveQueue } from "./actions";
import { CopyText } from "./CopyText";
import { addressLines, isCancelled, type QueueJob, type QueueView } from "./data";
import { JobActions } from "./JobActions";
import { JOB_LABEL } from "./steps";

/** Stickeriets eller tryckeriets kö: ett enkelt arbetsverktyg, jobben att göra överst, sedan avbrutna och skickade. */

const TONE: Record<JobStatus | "avbruten", string> = {
  ny: "bg-[#FFF4E5] text-[#8A4B00]",
  accepterad: "bg-[#EEF2FF] text-[#2B3A8C]",
  "i produktion": "bg-[#E8F3FF] text-[#0B5CAD]",
  skickad: "bg-[#EAF7EE] text-[#1E6B37]",
  fel: "bg-[#FDECEA] text-[#B42318]",
  avbruten: "bg-[#EFEFEF] text-[#555]",
};

/** Hur länge sedan jobbet kom in: "nyss", "12 min", "3 h", "2 dagar". */
function age(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "nyss";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dag" : "dagar"}`;
}

const stamp = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-[12px] uppercase tracking-wide text-[#777]">{children}</p>;

/** Vart paketet ska: leveranssättet och mottagaren, med knappar för att kopiera adressen och skriva ut fraktsedeln. */
function Delivery({ job, producer }: { job: QueueJob; producer: Producer }) {
  const c = job.customer;
  const lines = addressLines(job);
  const hasAddress = lines.length > 1;
  const copy = [...lines, c.phone, c.email].filter(Boolean).join("\n");
  return (
    <div className="min-w-0 text-[13.5px]">
      <Label>Leverans{job.order.shipping ? ` · ${job.order.shipping.label}` : ""}</Label>
      <address className="mt-1 not-italic leading-snug">
        {lines.map((l, i) => (
          <span key={i} className={`block ${i === 0 ? "font-semibold" : ""}`}>
            {l}
          </span>
        ))}
        {!hasAddress ? <span className="block text-[#777]">{job.order.shipping?.method === "butik" ? "Hämtas i butik – ingen hemadress." : "Ingen adress i ordern."}</span> : null}
        <span className="mt-1 block text-[#555]">
          {c.phone ? (
            <>
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="hover:text-[#111] hover:underline">
                {c.phone}
              </a>
              {" · "}
            </>
          ) : null}
          <a href={`mailto:${c.email}`} className="break-all hover:text-[#111] hover:underline">
            {c.email}
          </a>
        </span>
      </address>
      <div className="mt-2 flex flex-wrap gap-2">
        {hasAddress ? <CopyText text={copy} /> : null}
        <a href={`/producent/${producer}/fraktsedel/${encodeURIComponent(job.id)}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-md border border-[#CFCFCF] px-2.5 text-[13px] hover:border-[#111]">
          Fraktsedel ↗
        </a>
      </div>
    </div>
  );
}

function Files({ job, producer }: { job: QueueJob; producer: Producer }) {
  return (
    <div className="min-w-0 text-[13.5px]">
      <Label>Filer</Label>
      {job.files.length ? (
        <ul className="mt-1 grid gap-y-0.5">
          {job.files.map((f) => (
            <li key={f.name} className="min-w-0 truncate">
              <a href={`/producent/${producer}/filer/${encodeURIComponent(job.id)}/${encodeURIComponent(f.name)}`} download={f.name} title={f.name} className="font-medium text-[#0B5CAD] underline-offset-2 hover:text-[#111] hover:underline">
                ↓ {f.label}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[#777]">Tas fram – uppdatera om en stund.</p>
      )}
    </div>
  );
}

function JobCard({ job, producer, now }: { job: QueueJob; producer: Producer; now: number }) {
  const units = job.lines.reduce((n, l) => n + l.qty, 0);
  const cancelled = isCancelled(job);
  const tone = cancelled ? "avbruten" : job.status;
  return (
    <li className={`rounded-lg border bg-white ${job.status === "fel" && !cancelled ? "border-[#F3C5C0]" : "border-[#E2E2E2]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-[#EFEFEF] px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[15px] font-semibold">{job.orderNumber}</p>
          <p className="text-[13px] text-[#555]">
            {job.clubName} · {units} st{job.order.erpRef ? ` · Craft ${job.order.erpRef}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          <span className={`rounded px-2 py-0.5 font-semibold ${TONE[tone]}`}>{cancelled ? "Avbruten" : JOB_LABEL[job.status]}</span>
          <span className="text-[#555]" title={`Inkommet ${stamp.format(new Date(job.createdAt))}`}>
            {age(job.createdAt, now)}
          </span>
        </div>
      </div>

      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-wide text-[#777]">
            <th className="w-16 px-4 pb-1 pt-3 font-medium">Antal</th>
            <th className="px-2 pb-1 pt-3 font-medium">Artikel</th>
            <th className="w-28 px-4 pb-1 pt-3 font-medium">Storlek</th>
          </tr>
        </thead>
        <tbody>
          {job.lines.map((l) => (
            <tr key={l.id} className={`align-top ${cancelled ? "text-[#777] line-through decoration-[#BBB]" : ""}`}>
              <td className="px-4 py-1.5 font-semibold tabular-nums">{l.qty}</td>
              <td className="px-2 py-1.5">
                {l.title}
                <span className="ml-2 font-mono text-[12px] text-[#888]">{l.sku}</span>
              </td>
              <td className="px-4 py-1.5">{l.size ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {cancelled ? (
        <div className="px-4 pb-4 pt-3 text-[13.5px]">
          <p className="rounded-md bg-[#F5F5F5] px-3 py-2 text-[#333]">
            <span className="font-semibold">Ordern är avbruten – tillverka inte.</span>
            {job.order.cancelReason ? ` Orsak: ${job.order.cancelReason}` : ""}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 px-4 pb-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Files job={job} producer={producer} />
            <Delivery job={job} producer={producer} />
          </div>
          {job.note ? (
            job.status === "fel" ? (
              <p className="rounded-md bg-[#FDECEA] px-3 py-2 text-[13.5px] text-[#7A1A12]">
                <span className="font-semibold">Problem:</span> {job.note}
                <span className="ml-2 text-[12.5px] text-[#B42318]">{stamp.format(new Date(job.updatedAt))}</span>
              </p>
            ) : (
              <p className="text-[13px] text-[#555]">
                <span className="font-semibold">Senaste anteckning:</span> {job.note}
              </p>
            )
          ) : null}
          {job.status === "skickad" ? (
            <p className="text-[13.5px] text-[#555]">
              Skickad {stamp.format(new Date(job.updatedAt))}
              {job.tracking ? (
                <>
                  {" "}
                  · spårningsnummer <span className="font-mono text-[#111]">{job.tracking}</span>
                </>
              ) : null}
            </p>
          ) : (
            <JobActions key={job.status} producer={producer} jobId={job.id} status={job.status} />
          )}
        </div>
      )}
    </li>
  );
}

function Section({ id, title, jobs, producer, now }: { id: string; title: string; jobs: QueueJob[]; producer: Producer; now: number }) {
  if (!jobs.length) return null;
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-[13px] font-semibold uppercase tracking-wide text-[#777]">
        {title}
      </h2>
      <ul className="mt-3 grid gap-3">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} producer={producer} now={now} />
        ))}
      </ul>
    </section>
  );
}

export function Queue({ producer, name, queue, now }: { producer: Producer; name: string; queue: QueueView; now: number }) {
  const { todo, cancelled, done } = queue;
  const problems = todo.filter((j) => j.status === "fel").length;
  return (
    <div className="mx-auto max-w-[960px] px-4 pb-16 pt-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2E2E2] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.01em]">{name}</h1>
          <p className="text-[14px] text-[#555]">
            Produktionskö · {todo.length} jobb att göra
            {problems ? <span className="text-[#B42318]"> · {problems} med problem</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[13.5px]">
          <a href={`/producent/${producer}`} className="inline-flex h-9 items-center rounded-md border border-[#CFCFCF] px-3 hover:border-[#111]">
            Uppdatera
          </a>
          <form action={leaveQueue}>
            <input type="hidden" name="producer" value={producer} />
            <button type="submit" className="h-9 rounded-md px-3 text-[#555] hover:text-[#111]">
              Logga ut
            </button>
          </form>
        </div>
      </header>

      <section aria-labelledby="att-gora" className="mt-6">
        <h2 id="att-gora" className="text-[13px] font-semibold uppercase tracking-wide text-[#777]">
          Att göra
        </h2>
        {todo.length ? (
          <ul className="mt-3 grid gap-3">
            {todo.map((j) => (
              <JobCard key={j.id} job={j} producer={producer} now={now} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-[#D5D5D5] p-6 text-center text-[14px] text-[#777]">Inga jobb i kön just nu.</p>
        )}
      </section>

      <Section id="avbrutna" title="Avbrutna" jobs={cancelled} producer={producer} now={now} />
      <Section id="skickade" title="Skickade" jobs={done} producer={producer} now={now} />
    </div>
  );
}
