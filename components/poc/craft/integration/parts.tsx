import { fmtN } from "@/components/newwave/craft/parts";
import { fmtWhen } from "@/components/poc/craft/orderParts";

/** Delarna på Crafts integrationssida: rubriker, siffror, statusetiketter och tider. Samma färger som ordervyn. */

export type Tone = "grå" | "blå" | "gul" | "grön" | "röd";

const TONE: Record<Tone, string> = {
  grå: "bg-[var(--nw-soft)] text-[var(--nw-muted)]",
  blå: "bg-[#EAF1FE] text-[#1D4ED8]",
  gul: "bg-[#FFF4D6] text-[#7A5A00]",
  grön: "bg-[#E6F4EA] text-[#1E6B34]",
  röd: "bg-[#FDECEC] text-[#9B1C1C]",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONE[tone]}`}>{children}</span>;
}

export function Section({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mt-8 min-w-0 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stats({ items }: { items: { label: string; value: string | number; tone?: Tone; hint?: string }[] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] px-4 py-3.5">
          <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
          <p className={`mt-1 truncate text-[20px] font-semibold tabular-nums ${s.tone === "röd" ? "text-[#9B1C1C]" : s.tone === "gul" ? "text-[#7A5A00]" : "text-[var(--nw-ink)]"}`}>
            {typeof s.value === "number" ? fmtN(s.value) : s.value}
          </p>
          {s.hint ? <p className="mt-0.5 truncate text-[12px] text-[var(--nw-faint)]">{s.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">{children}</p>;
}

export function Failed({ what }: { what: string }) {
  return <p className="mt-3 rounded-2xl bg-[#FDECEC] p-4 text-[13.5px] text-[#9B1C1C]">{what} gick inte att läsa just nu.</p>;
}

/** "26 nov. 14:05", eller "aldrig". */
export const when = (iso?: string) => (iso ? fmtWhen(iso) : "aldrig");

/** "för 3 min sedan", "om 5 min". */
export function relative(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  const t = a < 60 ? `${a} s` : a < 3600 ? `${Math.round(a / 60)} min` : a < 86_400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86_400)} d`;
  return s >= 0 ? `om ${t}` : `för ${t} sedan`;
}
