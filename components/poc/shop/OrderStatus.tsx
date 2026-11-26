import Link from "next/link";
import { kr } from "@/components/newwave/clubshop/pricing";
import type { OrderLine, OrderStatus as Status, OrderView } from "@/lib/poc/types";

/** Kundens statussida: ordern, raderna och var den är på väg, med kundvänliga texter. */

const STEPS = ["Mottagen", "Bekräftad", "I produktion", "Skickad"] as const;

/** Hur långt ordern kommit i tidslinjen; "delvis skickad" har nått sista steget men är inte klar. */
const REACHED: Record<Status, number> = { mottagen: 0, bekräftad: 1, "i produktion": 2, "delvis skickad": 3, skickad: 3, avbruten: -1 };

const LABEL: Record<Status, string> = {
  mottagen: "Mottagen",
  bekräftad: "Bekräftad",
  "i produktion": "I produktion",
  "delvis skickad": "Delvis skickad",
  skickad: "Skickad",
  avbruten: "Avbruten",
};

const when = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
const day = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" });

/** Vad som tillverkas, i kundens ord: "Halsduken stickas och plaggen trycks". */
function makingText(lines: OrderLine[]) {
  const scarf = lines.some((l) => l.kind === "halsduk");
  const garment = lines.some((l) => l.kind === "plagg");
  const parts = [scarf ? (lines.filter((l) => l.kind === "halsduk").reduce((n, l) => n + l.qty, 0) > 1 ? "halsdukarna stickas" : "halsduken stickas") : "", garment ? "plaggen trycks" : ""].filter(Boolean);
  const text = parts.join(" och ") || "varorna tillverkas";
  return `${text[0].toUpperCase()}${text.slice(1)} just nu, på beställning för dig.`;
}

/** Vart paketet ska, i kundens ord, efter leveranssättet. Äldre ordrar utan leveranssätt visar bara adressen. */
function deliveryText(o: OrderView) {
  const { name, address } = o.customer;
  const method = o.shipping?.method;
  if (method === "butik") return `Hämtas i närmaste Intersport-butik av ${name}.`;
  if (!address) return null;
  if (method === "hem") return `Hemleverans till ${name}, ${address}.`;
  if (method === "ombud") return `Skickas till närmaste ombud för ${name}, ${address}.`;
  return `Levereras till ${name}, ${address}.`;
}

/**
 * När varje steg nåddes: bekräftad när affärssystemet svarade, i produktion när en producent först tog i jobbet (så
 * räknar kärnan orderns status), skickad när sista jobbet skickades. Saknas en tidpunkt visas steget utan.
 */
function stepTimes(o: OrderView): (string | undefined)[] {
  const confirmed = o.events.find((e) => e.actor === "affärssystem")?.at;
  const making = o.events.find((e) => e.actor === "tryckeri" || e.actor === "stickeri")?.at;
  const shipped = o.jobs.filter((j) => j.status === "skickad").map((j) => j.updatedAt).sort().at(-1);
  return [o.createdAt, REACHED[o.status] >= 1 ? confirmed : undefined, REACHED[o.status] >= 2 ? making : undefined, o.status === "skickad" ? shipped : undefined];
}

export function OrderStatusView({ order, clubName, home }: { order: OrderView; clubName: string; home: string }) {
  const o = order;
  const reached = REACHED[o.status];
  const times = stepTimes(o);
  const lineById = new Map(o.lines.map((l) => [l.id, l]));
  const shipped = o.jobs.filter((j) => j.status === "skickad");
  const waiting = o.jobs.filter((j) => j.status !== "skickad");
  // Ett jobb med problem visas bara som en försening; producentens anteckning är intern.
  const delayed = o.status === "avbruten" ? [] : o.jobs.filter((j) => j.status === "fel");
  const delayedTitles = delayed.flatMap((j) => j.lineIds.map((id) => lineById.get(id)?.title)).filter(Boolean);
  const where = deliveryText(o);
  const texts = [
    "Vi har tagit emot din beställning.",
    "Craft har bekräftat ordern och lämnat den till tillverkningen.",
    delayed.length ? "Tillverkas på beställning för dig – en del är försenad." : reached > 2 ? "Tillverkat på beställning för dig." : makingText(o.lines),
    o.status === "delvis skickad" ? "En del av ordern är på väg – resten skickas så snart den är klar." : "Paketet är på väg till dig.",
  ];

  return (
    <div className="mx-auto max-w-[760px] px-4 pt-10 sm:px-6">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#6F6B63]">Order {o.number}</p>
      <h1 className="mt-1 text-[34px] font-black leading-[1.05] tracking-[-0.02em] sm:text-[44px]">{LABEL[o.status]}</h1>
      <p className="mt-2 text-[15px] text-[#4A4740]">
        Beställd {day.format(new Date(o.createdAt))} i {clubName} klubbshop · Craft × {clubName}
      </p>

      {delayed.length ? (
        <div role="status" className="mt-8 rounded-2xl bg-[#FFF4E5] p-4 text-[14.5px] text-[#8A4B00]">
          <p className="font-semibold">Försenad – vi återkommer</p>
          <p className="mt-1">
            Tillverkningen {delayedTitles.length ? `av ${delayedTitles.join(", ")} ` : ""}har stött på ett hinder. Vi hör av oss så snart vi vet mer – du behöver inte göra något.
          </p>
        </div>
      ) : null}

      {o.status === "avbruten" ? (
        <div className="mt-8 rounded-2xl bg-[#FDECEA] p-4 text-[14.5px] text-[#7A1A12]">
          <p className="text-[16px] font-bold text-[#B42318]">Ordern är avbruten och tillverkas inte</p>
          {o.cancelReason ? (
            <p className="mt-1">
              <span className="font-semibold">Orsak:</span> {o.cancelReason}
            </p>
          ) : null}
          <p className="mt-1">Avbruten {when.format(new Date(o.updatedAt))}. Hör av dig till kundservice@intersport.se om du har frågor.</p>
        </div>
      ) : (
        <ol className="mt-8 grid gap-0" aria-label="Orderns väg">
          {STEPS.map((title, i) => {
            const done = i <= reached;
            const current = i === reached;
            return (
              <li key={title} className="relative grid grid-cols-[28px_1fr] gap-3 pb-7 last:pb-0">
                {i < STEPS.length - 1 ? <span aria-hidden className={`absolute left-[13px] top-7 h-[calc(100%-24px)] w-0.5 ${i < reached ? "bg-[var(--shop)]" : "bg-[#E5E3DE]"}`} /> : null}
                <span aria-hidden className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${done ? "bg-[var(--shop)] text-[var(--shop-on)]" : "border-2 border-[#DCDAD4] bg-white text-[#9A968D]"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-[16px] ${current ? "font-bold" : done ? "font-semibold" : "font-semibold text-[#9A968D]"}`}>
                    {title}
                    {times[i] && done ? <span className="ml-2 text-[13px] font-normal text-[#6F6B63]">{when.format(new Date(times[i]!))}</span> : null}
                  </p>
                  {done ? <p className="mt-0.5 text-[14px] text-[#4A4740]">{texts[i]}</p> : null}
                  {i === 3 && shipped.length ? (
                    <ul className="mt-2 grid gap-2">
                      {shipped.map((j) => (
                        <li key={j.id} className="rounded-xl bg-[var(--shop-bg)] px-4 py-3 text-[14px]">
                          <span className="block font-semibold">{j.lineIds.map((id) => lineById.get(id)?.title).filter(Boolean).join(", ") || "Paket"}</span>
                          {j.tracking ? (
                            <span className="block text-[#4A4740]">
                              Spårningsnummer <span className="font-mono font-semibold tracking-wide text-[#111]">{j.tracking}</span>
                            </span>
                          ) : null}
                        </li>
                      ))}
                      {o.status === "delvis skickad" && waiting.length ? (
                        <li className="px-1 text-[13.5px] text-[#6F6B63]">Tillverkas fortfarande: {waiting.flatMap((j) => j.lineIds.map((id) => lineById.get(id)?.title)).filter(Boolean).join(", ")}</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <h2 className="mt-12 text-[18px] font-bold">Din beställning</h2>
      <ul className="mt-3 divide-y divide-[#ECEAE5] border-y border-[#ECEAE5]">
        {o.lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{l.title}</p>
              <p className="mt-0.5 text-[13px] text-[#6F6B63]">
                {l.size ? `Storlek ${l.size} · ` : ""}
                {l.qty} st{l.qty > 1 ? ` à ${kr(l.unitSek)}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-[15px] font-semibold">{kr(l.unitSek * l.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-1.5">
        {o.shipping ? (
          <div className="flex justify-between text-[14.5px]">
            <dt>Frakt · {o.shipping.label}</dt>
            <dd>{kr(o.shipping.priceSek)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between text-[18px] font-bold">
          <dt>Summa</dt>
          <dd>{kr(o.totalSek)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[12.5px] text-[#6F6B63]">{o.shipping ? "Inklusive moms och frakt." : "Inklusive moms, exklusive frakt."}</p>

      {where && o.status !== "avbruten" ? <p className="mt-6 text-[14px] text-[#4A4740]">{where}</p> : null}
      <Link href={home} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)]">
        Till klubbshoppen
      </Link>
    </div>
  );
}
