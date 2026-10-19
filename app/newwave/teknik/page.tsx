import type { Metadata } from "next";
import Link from "next/link";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";
import { PAYLOADS } from "@/lib/newwave/hub";
import { apiPayload, deliveryStats, listDeliveries } from "@/lib/newwave/hubDelivery";
import { fmtBytes, FORMATS } from "@/lib/newwave/hubFormats";
import { API_POINTS, AWS_REGION, FAQ, FLOW, LAYERS, MODULES, type Point, PRINCIPLES, PRINT_CHECKS, PROMISES, RUN, TECH_LEAD, TECH_TITLE } from "@/lib/newwave/tech";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: `${TECH_TITLE} · Next Wave` };

const PDF = "/api/v1/newwave/teknik/pdf";
const TABS = [
  { id: "integrationer", label: "Integrationer" },
  { id: "tryckfiler", label: "Tryckfiler" },
  { id: "arkitektur", label: "Arkitektur" },
  { id: "sakerhet", label: "Säkerhet" },
  { id: "fragor", label: "Frågor" },
] as const;
const ANCHOR: Record<(typeof PROMISES)[number]["id"], string> = { integration: "integrationer", tryckfiler: "tryckfiler", sakerhet: "sakerhet" };

function Section({ id, kicker, title, lead, children }: { id: string; kicker: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-[var(--nw-line)] py-12 sm:py-16">
      <p className="nw-kicker">{kicker}</p>
      <h2 className="nw-h2 mt-2">{title}</h2>
      <p className="nw-lead mt-3 max-w-[760px]">{lead}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

const Prod = () => <span className="nw-mono ml-2 inline-block rounded-full bg-[#FEF3C7] px-2 py-0.5 align-[2px] text-[10.5px] font-normal text-[#92400E]">I produktion</span>;

function Points({ list, cols = "flex flex-col" }: { list: Point[]; cols?: string }) {
  return (
    <ul className={`gap-3 ${cols}`}>
      {list.map((p) => (
        <li key={p.title} className="rounded-[var(--nw-radius-sm)] bg-[var(--nw-soft)] p-4">
          <p className="text-[15px] font-semibold text-[var(--nw-ink)]">
            {p.title}
            {p.prod ? <Prod /> : null}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--nw-muted)]">{p.text}</p>
        </li>
      ))}
    </ul>
  );
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

/** För New Waves IT: integrationerna, tryckfilerna, arkitekturen och driften – med en riktig leverans som bevis. */
export default async function TechPage() {
  const deliveries = await listDeliveries();
  const d = [...deliveries].sort((a, b) => new Set(b.jobs.map((j) => j.method)).size - new Set(a.jobs.map((j) => j.method)).size)[0];
  const payload = d ? apiPayload(d) : null;
  const sample = payload ? { ...payload, jobs: payload.jobs.slice(0, 1).map((j) => ({ ...j, files: j.files.slice(0, 2) })) } : null;
  const stats = d ? deliveryStats(d) : null;
  const zip = d ? `/api/v1/newwave/hub/leveranser/${d.id}?zip=1` : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 border-b border-[rgba(17,17,17,0.07)] bg-white/90 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 min-[900px]:gap-5 min-[900px]:px-6">
            <Link href="/newwave/start" className="flex min-h-9 min-w-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – till ingångarna">
              <LogoMark size={28} />
              <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
            </Link>
            <span className="truncate text-[14px] text-[#6F6B63]">{TECH_TITLE}</span>
            <a href={PDF} download className="nw-btn ml-auto h-9 shrink-0 px-4 text-[13px]">
              Ladda ner PDF
            </a>
          </div>
          <nav aria-label="Avsnitt" className="flex gap-1 overflow-x-auto px-3 pb-2.5 min-[900px]:px-5">
            {TABS.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full px-3 py-1.5 text-[13px] text-[var(--nw-muted)] transition hover:bg-[var(--nw-soft)] hover:text-[var(--nw-ink)]">
                {t.label}
              </a>
            ))}
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 min-[900px]:px-10">
          <div className="mx-auto max-w-[1120px]">
            <div className="py-10 sm:py-14">
              <p className="nw-kicker">För IT · Next Wave Commerce Hub</p>
              <h1 className="nw-h1 mt-2">{TECH_TITLE}</h1>
              <p className="nw-lead mt-4 max-w-[720px]">{TECH_LEAD}</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                {PROMISES.map((p, i) => (
                  <li key={p.id}>
                    <a href={`#${ANCHOR[p.id]}`} className="group flex h-full flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-5 transition hover:border-[var(--nw-ink)]">
                      <span className="nw-mono text-[12px] text-[var(--nw-muted)]">0{i + 1}</span>
                      <span className="mt-3 text-[19px] font-semibold tracking-[-0.02em] text-[var(--nw-ink)]">{p.title}</span>
                      <span className="mt-1.5 flex-1 text-[14px] leading-relaxed text-[var(--nw-muted)]">{p.text}</span>
                      <span className="mt-4 text-[var(--nw-ink)] transition-transform group-hover:translate-y-0.5">
                        <Arrow />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <Section id="integrationer" kicker="01 · Integrationer" title="Ett API in i ert system" lead="När en klubb godkänner material bygger hubben ett anrop med allt som behövs för att producera – i produktion skickas det till ert system, samma anrop för tryck, lager, frakt och ekonomi.">
              <ol className="grid gap-3 md:grid-cols-4">
                {FLOW.map((s, i) => (
                  <li key={s.title} className="relative rounded-[var(--nw-radius-sm)] border border-[var(--nw-line)] p-4">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--nw-ink)] text-[12px] font-semibold text-white">{i + 1}</span>
                    <p className={`mt-3 text-[15px] font-semibold text-[var(--nw-ink)] ${s.title.startsWith("POST") ? "nw-mono text-[13.5px]" : ""}`}>
                      {s.title}
                      {s.prod ? <Prod /> : null}
                    </p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--nw-muted)]">{s.text}</p>
                  </li>
                ))}
              </ol>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="min-w-0">
                  <Points list={API_POINTS} />
                  <p className="nw-kicker mt-6">Det som går till era system</p>
                  <ul className="mt-3 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
                    {PAYLOADS.map((p) => (
                      <li key={p.id} className="py-2.5">
                        <p className="text-[14px] font-medium text-[var(--nw-ink)]">{p.label}</p>
                        <p className="text-[13px] leading-relaxed text-[var(--nw-muted)]">{p.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {sample && d ? (
                  <div className="min-w-0 rounded-[var(--nw-radius)] bg-[#141416] p-5 text-white">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="nw-mono text-[13px]">
                        <span className="text-white/55">POST</span> /v1/print-jobs
                      </p>
                      <p className="nw-mono text-[12px] text-white/55">Byggt av demot · skickas i produktion</p>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                      Anropet som demot byggde när {d.club} godkände {d.title.toLowerCase()} – {d.jobs.length} jobb, exakt som det skickas i produktion. Här visas första jobbet och två av dess filer.
                    </p>
                    <pre className="nw-mono mt-4 max-h-[460px] overflow-auto rounded-xl bg-black/35 p-4 text-[11.5px] leading-relaxed text-white/90">{JSON.stringify(sample, null, 2)}</pre>
                    <a href={`/api/v1/newwave/hub/leveranser/${d.id}`} target="_blank" rel="noreferrer" className="nw-btn mt-4 border border-white/25 !bg-transparent">
                      Hela API-anropet (JSON)
                    </a>
                  </div>
                ) : null}
              </div>
            </Section>

            <Section id="tryckfiler" kicker="02 · Tryckfiler" title="Filer som tryckeriet kör direkt" lead="Hubben gör det format varje metod kräver – samma krav som tryckerierna ställer på inskickade original – med specifikationen bredvid varje fil.">
              <Points list={PRINT_CHECKS} cols="grid sm:grid-cols-3" />

              <div className="mt-6 overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
                <div className="hidden grid-cols-[180px_200px_minmax(0,1fr)] gap-4 bg-[var(--nw-soft)] px-5 py-2.5 md:grid">
                  <p className="nw-kicker">Metod</p>
                  <p className="nw-kicker">Filer</p>
                  <p className="nw-kicker">Regler</p>
                </div>
                <ul className="divide-y divide-[var(--nw-line)]">
                  {FORMATS.map((f) => (
                    <li key={f.method} className="grid gap-1 px-5 py-3.5 md:grid-cols-[180px_200px_minmax(0,1fr)] md:gap-4">
                      <p className="text-[14.5px] font-semibold text-[var(--nw-ink)]">{f.label}</p>
                      <p className="nw-mono text-[12.5px] text-[var(--nw-ink)] md:pt-0.5">{f.files}</p>
                      <ul className="flex flex-col gap-0.5 text-[13.5px] text-[var(--nw-muted)]">
                        {f.rules.map((r) => (
                          <li key={r}>· {r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>

              {zip && stats && d ? (
                <div className="mt-6 flex flex-col gap-4 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold text-[var(--nw-ink)]">Ladda ner ett riktigt filpaket</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--nw-muted)]">
                      {d.club} · {d.title}: {stats.files} produktionsfiler för {stats.products} produkter i {stats.methods.length} metoder ({stats.methods.join(", ")}), {fmtBytes(stats.bytes)}. Med API-anropet som leverans.json.
                    </p>
                  </div>
                  <a href={zip} className="nw-btn shrink-0">
                    Ladda ner (zip)
                  </a>
                </div>
              ) : null}
            </Section>

            <Section id="arkitektur" kicker="03 · Arkitektur" title="Så är plattformen byggd" lead="En motor med sju ben. Ytorna ovanpå är olika ingångar till samma kod, och allt som lämnar hubben går över ett API.">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <ol className="flex flex-col items-stretch">
                  {LAYERS.map((l, i) => (
                    <li key={l.title} className="flex flex-col items-center">
                      {i ? (
                        <span className="py-1.5 text-[var(--nw-faint)]">
                          <Arrow />
                        </span>
                      ) : null}
                      <div className={`w-full rounded-[var(--nw-radius-sm)] p-4 ${i === 1 ? "bg-[#141416] text-white" : i === 3 ? "bg-[#1D4ED8] text-white" : "border border-[var(--nw-line)]"}`}>
                        <p className={`text-[14.5px] font-semibold ${i === 1 || i === 3 ? "text-white" : "text-[var(--nw-ink)]"}`}>{l.title}</p>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {l.items.map((x) => (
                            <li key={x} className={`rounded-full px-2.5 py-1 text-[12px] ${i === 1 || i === 3 ? "bg-white/12 text-white/90" : "bg-[var(--nw-soft)] text-[var(--nw-ink)]"}`}>
                              {x}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="min-w-0">
                  <Points list={PRINCIPLES} />
                </div>
              </div>

              <p className="nw-kicker mt-8">Så är koden uppdelad · Next.js och TypeScript</p>
              <ul className="mt-3 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
                {MODULES.map((m) => (
                  <li key={m.path} className="grid gap-0.5 py-2.5 sm:grid-cols-[300px_minmax(0,1fr)] sm:gap-4">
                    <p className="nw-mono text-[12.5px] text-[var(--nw-ink)] [overflow-wrap:anywhere]">{m.path}</p>
                    <p className="text-[13.5px] text-[var(--nw-muted)]">{m.text}</p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="sakerhet" kicker="04 · Säkerhet och drift" title="AWS i Stockholm" lead="Demon körs på en enkel server. I produktion körs hubben i AWS, med data som stannar i Sverige. Här är skillnaden, rad för rad.">
              <p className="nw-mono inline-flex items-center gap-2 rounded-full bg-[var(--nw-soft)] px-3 py-1.5 text-[12.5px] text-[var(--nw-ink)]">
                <span className="h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden />
                AWS · {AWS_REGION}
              </p>
              <div className="mt-5 overflow-hidden rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
                <div className="hidden grid-cols-[150px_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 bg-[var(--nw-soft)] px-5 py-2.5 md:grid">
                  <p className="nw-kicker">Område</p>
                  <p className="nw-kicker">Demo i dag</p>
                  <p className="nw-kicker">Produktion i AWS</p>
                </div>
                <ul className="divide-y divide-[var(--nw-line)]">
                  {RUN.map((r) => (
                    <li key={r.area} className="grid gap-1 px-5 py-3.5 md:grid-cols-[150px_minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-4">
                      <p className="text-[14.5px] font-semibold text-[var(--nw-ink)]">{r.area}</p>
                      <p className="text-[13.5px] text-[var(--nw-muted)]">
                        <span className="md:hidden">Demo: </span>
                        {r.demo}
                      </p>
                      <p className="text-[13.5px] font-medium text-[var(--nw-ink)]">
                        <span className="font-normal text-[var(--nw-muted)] md:hidden">AWS: </span>
                        {r.prod}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            <Section id="fragor" kicker="05 · Frågor och svar" title="Det IT brukar fråga" lead="Korta svar på det som brukar avgöra om en integration blir av.">
              <dl className="grid gap-3 md:grid-cols-2">
                {FAQ.map((f) => (
                  <div key={f.q} className="rounded-[var(--nw-radius-sm)] border border-[var(--nw-line)] p-4">
                    <dt className="text-[15px] font-semibold text-[var(--nw-ink)]">{f.q}</dt>
                    <dd className="mt-1 text-[13.5px] leading-relaxed text-[var(--nw-muted)]">{f.a}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-10 flex flex-col items-start gap-4 rounded-[var(--nw-radius)] bg-[#141416] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[18px] font-semibold">Teknisk översikt som PDF</p>
                  <p className="mt-1 text-[13.5px] text-white/65">Samma innehåll på två sidor – att skicka vidare eller ta med till nästa möte.</p>
                </div>
                <a href={PDF} download className="inline-flex h-[42px] shrink-0 items-center rounded-full bg-white px-[18px] text-[14px] font-medium text-[#141416] transition hover:bg-white/85">
                  Ladda ner PDF
                </a>
              </div>
            </Section>
          </div>
        </main>
      </div>
      <HubFooterSlim />
    </div>
  );
}
