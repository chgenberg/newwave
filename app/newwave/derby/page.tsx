import type { Metadata } from "next";
import Link from "next/link";
import { DerbyPoster } from "@/components/newwave/derby/DerbyPoster";
import { DerbySubmit } from "@/components/newwave/derby/DerbySubmit";
import { addUsage, costSek, DERBY, FLAGS, MODELS, NO_USAGE, PRICES, SEK_PER_USD } from "@/lib/newwave/derby";
import { DERBY_RUN as run, type DerbyStage, IMAGE_SEK } from "@/lib/newwave/derbyData";

const { club } = DERBY;
const MATCH = `${club.name} – ${DERBY.rival}`;

export const metadata: Metadata = {
  title: `Derbyt ${MATCH} · Next Wave`,
  description: `Vem som helst skickar in en idé till derbyts motiv. Agenten läser alla ${run.total.toLocaleString("sv-SE")} och den bästa blir affischen och tröjan.`,
};

const num = (n: number) => n.toLocaleString("sv-SE");
const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
/** Bidraget inom citattecken, utom när supportern redan skrivit dem. */
const quote = (t: string) => (/^["”''„]/.test(t) ? t : `”${t}”`);
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);
const stage = (s: DerbyStage) => run.usage.find((u) => u.stage === s)!;

const BY = { regler: "klubbens ordlista", moderering: "modereringen", agent: "agenten" } as const;
const CREST = `/api/v1/brand/${club.id}/skold-farg.png`;
const LOOK = { name: club.name, handle: "ifkgoteborg", site: "ifkgoteborg.se", crest: CREST, primary: "#234B9A", accent: "#FFFFFF", onAccent: "#234B9A" };
const IDEAS = ["Strålkastarna på Gamla Ullevi som blir två änglavingar", "Poseidon i blåvit halsduk", "En spårvagn i blåvitt med skylten 1904"];

function Eyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return <p className={`nw-mono text-[11.5px] uppercase tracking-[0.08em] ${light ? "text-white/60" : "text-[var(--nw-muted)]"}`}>{children}</p>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 font-[family-name:var(--font-club)] text-[clamp(28px,3.6vw,44px)] font-bold uppercase leading-[1.02] tracking-[0.01em] text-[#1A3770]">{children}</h2>;
}

export default function DerbyPage() {
  const [screen, review, semi, final] = (["screen", "review", "semi", "final"] as const).map(stage);
  const jury = [screen, review, semi, final].reduce(addUsage, NO_USAGE);
  const textSek = screen.sek + review.sek + semi.sek + final.sek;
  const imageSek = run.imageCount * IMAGE_SEK;
  const totalSek = textSek + imageSek;
  const toJury = run.total - run.stoppedBy.regler - run.stoppedBy.moderering;
  const removed = run.total - run.approved;
  const seconds = Object.values(run.seconds).reduce((a, b) => a + b, 0);
  const maxTheme = Math.max(...run.themes.map((t) => t.count));
  const compare = [
    { label: `Som här: ${PRICES[MODELS.screen].label} för grovjobbet`, sek: textSek, ours: true },
    ...(["gpt-5-mini", "claude-haiku-4.5", "gpt-5", "claude-sonnet-4.5"] as const).map((m) => ({ label: `Allt med ${PRICES[m].label}`, sek: costSek(m, jury), ours: false })),
  ];
  const funnel = [
    { n: run.total, label: "bidrag skickades in", note: "Vem som helst, utan konto. Här är de påhittade av AI, med vanliga, dåliga och regelbrytande bidrag.", who: null, time: null, sek: null },
    { n: toJury, label: "gick vidare till juryn", note: `${num(run.stoppedBy.regler)} stoppades av klubbens ordlista och ${num(run.stoppedBy.moderering)} av OpenAI:s moderering, som är gratis.`, who: "Ordlista och moderering", time: run.seconds.moderate, sek: 0 },
    { n: toJury, label: "fick betyg och tema", note: "Den billiga modellen läste alla i omgångar om 25, satte betyg 0–100 och tema, och flaggade det som såg ut att bryta mot klubbens regler.", who: PRICES[MODELS.screen].label, time: run.seconds.screen, sek: screen.sek },
    { n: run.approved, label: "godkända efter andra åsikten", note: `Allt den billiga modellen flaggade lästes om av en bättre. ${num(run.restored)} bra idéer räddades och ${num(run.stoppedBy.agent)} stoppades för gott.`, who: PRICES[MODELS.review].label, time: run.seconds.review, sek: review.sek },
    { n: run.semi.length, label: "gick till semifinal", note: "De högst betygsatta, utan dubbletter, lästes om noggrannare av en bättre modell.", who: PRICES[MODELS.semi].label, time: run.seconds.semi, sek: semi.sek },
    { n: run.final.length, label: "finalister", note: `${run.judges} domare rangordnade finalisterna var för sig och motiverade varje plats. Poängen lades ihop, och vinnarens idé blev ett koncept för affischen och tröjan.`, who: PRICES[MODELS.final].label, time: run.seconds.final, sek: final.sek },
    { n: 1, label: "vinnare", note: `Affischbilden och tröjtrycket, granskat mot ${club.shortName}:s regler före publicering.`, who: "Bildmodellen", time: run.seconds.images, sek: imageSek },
  ];
  const wide = (n: number) => `${Math.max(6, (Math.log10(n + 1) / Math.log10(run.total + 1)) * 100)}%`;
  const w = run.winner;

  return (
    <main className="flex-1 text-[var(--nw-ink)]">
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/newwave/start" className="text-[14px] font-semibold text-white/85 transition hover:text-white">
            ← Next Wave
          </Link>
          <span className="nw-mono rounded-full border border-white/25 px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-white/70">Demo · påhittade bidrag</span>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#1A3770] text-white">
        <div aria-hidden className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "repeating-linear-gradient(90deg, #fff 0 56px, transparent 56px 112px)" }} />
        <div className="relative mx-auto grid max-w-[1200px] gap-10 px-5 pb-16 pt-24 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-24 lg:pt-28">
          <div>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CREST} alt="" className="h-12 w-auto" />
              <Eyebrow light>Derbyt · {MATCH} · {DERBY.arena}</Eyebrow>
            </div>
            <h1 className="mt-6 font-[family-name:var(--font-club)] text-[clamp(44px,7vw,92px)] font-bold uppercase leading-[0.95] tracking-[0.005em]">Hela stan gör derbyt</h1>
            <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-white/80">
              Vem som helst skickar in en idé till derbyts motiv. Agenten läser alla, sållar bort hat och spam, och den bästa idén blir både affischen i sociala medier och derbytröjan i {club.shortName}-shoppen.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#skicka" className="rounded-full bg-white px-5 py-3 text-[14.5px] font-semibold text-[#1A3770] transition hover:bg-white/90">
                Skicka in en idé
              </a>
              <a href="#juryn" className="rounded-full border border-white/30 px-5 py-3 text-[14.5px] font-semibold text-white transition hover:bg-white/10">
                Så valdes vinnaren
              </a>
            </div>
            <dl className="mt-10 grid max-w-[560px] grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[
                [num(run.total), "bidrag lästa"],
                [String(run.themes.length), "teman"],
                [secs(seconds), "från bidrag till bild"],
                [kr(totalSek), "med bilderna"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-[26px] font-semibold tabular-nums leading-none tracking-[-0.02em]">{v}</dd>
                  <dd className="mt-1.5 text-[12.5px] text-white/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mx-auto w-full max-w-[400px]">
            <DerbyPoster art={run.images.poster} kicker="DERBY" title={w.slogan} detail={`${MATCH} · ${DERBY.arena}`} look={LOOK} file="derby-ifk-gais" controls={false} />
          </div>
        </div>
      </section>

      <section id="skicka" className="mx-auto grid max-w-[1200px] scroll-mt-6 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
        <div>
          <Eyebrow>Supporterns vy</Eyebrow>
          <Heading>Ett fält och en knapp</Heading>
          <p className="mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-[var(--nw-muted)]">
            Länken delas i klubbens kanaler veckan före derbyt. Bidraget går genom samma filter och samma jury som de {num(run.total)} andra, och placeras direkt bland dem. Prova själv – skriv en riktigt bra idé, eller något som borde stoppas.
          </p>
          <ul className="mt-6 space-y-2 text-[14px] text-[var(--nw-ink)]">
            {["Inget konto, inga namn – bara idén", "Hat, spam och spelarnamn stoppas innan någon på klubben ser dem", `Vinnaren får derbytröjan och nämns som "Bidrag #nummer"`].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#234B9A]" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <DerbySubmit maxChars={DERBY.maxChars} semiMin={Math.min(...run.semi.map((x) => x.score))} ideas={IDEAS} />
      </section>

      <section id="juryn" className="scroll-mt-6 bg-[var(--nw-soft)]">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
          <Eyebrow>Klubbens vy · körd på riktigt</Eyebrow>
          <Heading>
            Från {num(run.total)} idéer till en
          </Heading>
          <p className="mt-4 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--nw-muted)]">
            Den billiga modellen gör grovjobbet och läser allt; de dyrare får bara läsa det bästa. Tiderna och kostnaderna är uppmätta från körningen.
          </p>
          <ol className="mt-10 space-y-3">
            {funnel.map((f, i) => (
              <li key={f.label} className="rounded-[18px] bg-white p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <span className="nw-mono w-5 shrink-0 text-[12px] text-[var(--nw-muted)]">{i + 1}</span>
                      <span className="text-[24px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-[#1A3770]">{num(f.n)}</span>
                      <span className="text-[15px] font-medium">{f.label}</span>
                    </div>
                    <div className="ml-8 mt-3 h-2 rounded-full bg-[var(--nw-soft)]">
                      <div className="h-2 rounded-full bg-[#234B9A]" style={{ width: wide(f.n) }} />
                    </div>
                    <p className="ml-8 mt-2.5 max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--nw-muted)]">{f.note}</p>
                  </div>
                  {f.who && (
                    <dl className="ml-8 grid grid-cols-3 gap-2 text-[12.5px] sm:ml-0 sm:grid-cols-1 sm:gap-1 sm:text-right">
                      <dd className="font-medium">{f.who}</dd>
                      <dd className="tabular-nums text-[var(--nw-muted)]">{f.time !== null ? secs(f.time) : ""}</dd>
                      <dd className="font-semibold tabular-nums">{f.sek === 0 ? "0 kr" : f.n === 1 ? `≈ ${kr(f.sek ?? 0)}` : kr(f.sek ?? 0)}</dd>
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[18px] bg-white p-5 sm:p-6">
              <h3 className="text-[16px] font-semibold">Det filtret stoppade</h3>
              <p className="mt-1 text-[13px] text-[var(--nw-muted)]">
                {num(removed)} av {num(run.total)} bidrag, innan någon på klubben behövde läsa dem.
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {(Object.keys(run.removed) as (keyof typeof run.removed)[]).map((f) => (
                  <li key={f} className="rounded-full bg-[#FBEAEA] px-2.5 py-1 text-[12px] font-medium text-[#8A1C1C]">
                    {FLAGS[f]} · {num(run.removed[f])}
                  </li>
                ))}
              </ul>
              <ul className="mt-4 divide-y divide-[var(--nw-line)]">
                {run.examples.map((x) => (
                  <li key={x.text} className="py-2.5">
                    <p className="text-[13.5px] leading-snug">{quote(x.text)}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--nw-muted)]">
                      {FLAGS[x.flag]} · stoppat av {BY[x.by]}
                    </p>
                  </li>
                ))}
              </ul>
              {run.rescued.length > 0 && (
                <>
                  <h4 className="mt-5 text-[14px] font-semibold">Räddade av andra åsikten</h4>
                  <ul className="mt-2 divide-y divide-[var(--nw-line)]">
                    {run.rescued.map((x) => (
                      <li key={x.id} className="py-2.5">
                        <p className="text-[13.5px] leading-snug">{quote(x.text)}</p>
                        <p className="mt-0.5 text-[12px] text-[var(--nw-muted)]">
                          Flaggad som {FLAGS[x.was].toLowerCase()} · släppt igenom med betyg {x.score}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="rounded-[18px] bg-white p-5 sm:p-6">
              <h3 className="text-[16px] font-semibold">Vad stan pratar om</h3>
              <p className="mt-1 text-[13px] text-[var(--nw-muted)]">Agentens teman för de godkända bidragen, med antal och snittbetyg.</p>
              <ul className="mt-4 space-y-3">
                {run.themes.map((t) => (
                  <li key={t.theme}>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className="font-medium">{t.theme}</span>
                      <span className="tabular-nums text-[var(--nw-muted)]">
                        {num(t.count)} · snitt {t.avg}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--nw-soft)]">
                      <div className="h-1.5 rounded-full bg-[#197BC4]" style={{ width: `${(t.count / maxTheme) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="finalen" className="mx-auto max-w-[1200px] scroll-mt-6 px-5 py-16 sm:px-8 lg:py-24">
        <Eyebrow>Finalen · {run.judges} domare med {PRICES[MODELS.final].label}</Eyebrow>
        <Heading>{run.final.length} finalister</Heading>
        <ol className="mt-8 grid gap-3 md:grid-cols-2">
          {run.final.map((x) => (
            <li key={x.id} className={`flex gap-4 rounded-[18px] p-4 sm:p-5 ${x.rank === 1 ? "bg-[#1A3770] text-white md:col-span-2" : "border border-[var(--nw-line)]"}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold tabular-nums ${x.rank === 1 ? "bg-white text-[#1A3770]" : "bg-[var(--nw-soft)]"}`}>{x.rank}</span>
              <div className="min-w-0">
                <p className={`leading-snug ${x.rank === 1 ? "text-[18px] font-semibold" : "text-[14.5px] font-medium"}`}>{quote(x.text)}</p>
                <p className={`mt-1 text-[13px] leading-relaxed ${x.rank === 1 ? "text-white/75" : "text-[var(--nw-muted)]"}`}>{x.why}</p>
                <p className={`nw-mono mt-2 text-[11px] uppercase tracking-[0.06em] ${x.rank === 1 ? "text-white/55" : "text-[var(--nw-muted)]"}`}>
                  Bidrag #{x.id} · {x.area} · {x.points} av {run.judges * run.final.length} poäng
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="vinnaren" className="scroll-mt-6 bg-[#F4F6FB]">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
          <Eyebrow>Vinnaren · Bidrag #{w.id} från {w.area}</Eyebrow>
          <Heading>{w.title}</Heading>
          <p className="mt-4 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--nw-muted)]">{w.story}</p>
          <div className="mt-10 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h3 className="mb-3 text-[15px] font-semibold">Affischen</h3>
              <DerbyPoster art={run.images.poster} kicker="DERBY" title={w.slogan} detail={`${MATCH} · ${DERBY.arena}`} look={LOOK} file="derby-ifk-gais" />
            </div>
            <div>
              <h3 className="mb-3 text-[15px] font-semibold">Derbykollektionen i {club.shortName}-shoppen</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {run.images.products.map((p) => (
                  <a key={p.id} href={club.intersportShopUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[18px] bg-white transition hover:shadow-[0_18px_40px_-24px_rgba(10,20,50,0.45)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt={`${p.name} med derbymotivet`} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    <div className="p-3.5">
                      <p className="text-[13.5px] font-medium">Derbyt 2026 · {p.name}</p>
                      <p className="mt-0.5 text-[13px] tabular-nums text-[var(--nw-muted)]">{num(p.price)} kr</p>
                    </div>
                  </a>
                ))}
              </div>
              <div className="mt-5 grid gap-5 rounded-[18px] bg-white p-5 sm:grid-cols-[140px_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={run.images.print} alt="Tryckfilen" className="aspect-square w-full rounded-[12px] bg-[#1A3770] object-contain p-3" />
                <div>
                  <p className="text-[14px] font-semibold">Tryckfilen, granskad före publicering</p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--nw-muted)]">
                    Designagentens vanliga kontroller mot {club.shortName}:s regler{run.images.attempts > 1 ? `, ${run.images.attempts} försök` : ""}.
                  </p>
                  <ul className="mt-3 grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
                    {run.images.checks.map((c) => (
                      <li key={c.rule} className={c.ok ? "text-[var(--nw-ink)]" : "text-[#8A1C1C]"}>
                        {c.ok ? "✓" : "✕"} {c.rule}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="kostnad" className="mx-auto max-w-[1200px] scroll-mt-6 px-5 py-16 sm:px-8 lg:py-24">
        <Eyebrow>Kostnaden · uppmätt</Eyebrow>
        <Heading>
          {num(run.total)} bidrag för {kr(textSek)}
        </Heading>
        <p className="mt-4 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--nw-muted)]">
          Det är vad hela juryn kostade i tokens, {kr((textSek / run.total) * 1000)} per tusen bidrag. Med affischbilden och tröjtrycket blir det ungefär {kr(totalSek)} för hela derbyt.
        </p>
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-x-auto rounded-[18px] border border-[var(--nw-line)]">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead className="bg-[var(--nw-soft)] text-[12px] text-[var(--nw-muted)]">
                <tr>
                  {["Steg", "Modell", "Anrop", "Tokens in", "Tokens ut", "Kostnad"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 font-medium ${i > 1 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--nw-line)]">
                {[
                  ["Moderering", "OpenAI moderering", null, null, null, "0 kr"],
                  ["Betyg på alla", PRICES[screen.model].label, screen.calls, screen.input, screen.output, kr(screen.sek)],
                  ["Andra åsikten", PRICES[review.model].label, review.calls, review.input, review.output, kr(review.sek)],
                  ["Semifinal", PRICES[semi.model].label, semi.calls, semi.input, semi.output, kr(semi.sek)],
                  ["Final och koncept", PRICES[final.model].label, final.calls, final.input, final.output, kr(final.sek)],
                  ["Affisch och tryck", run.imageModel, run.imageCount, null, null, `≈ ${kr(imageSek)}`],
                ].map(([s, m, c, i, o, k]) => (
                  <tr key={String(s)}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{s}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--nw-muted)]">{m}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c === null ? "–" : num(Number(c))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i === null ? "–" : num(Number(i))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{o === null ? "–" : num(Number(o))}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{k}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-[18px] bg-[var(--nw-soft)] p-5 sm:p-6">
            <h3 className="text-[15px] font-semibold">Samma jury med andra modeller</h3>
            <p className="mt-1 text-[12.5px] text-[var(--nw-muted)]">Räknat på samma antal tokens som körningen, utan bilderna.</p>
            <ul className="mt-4 space-y-2.5">
              {compare.map((c) => (
                <li key={c.label} className="flex items-baseline justify-between gap-4 text-[13.5px]">
                  <span className={c.ours ? "font-semibold" : ""}>{c.label}</span>
                  <span className={`shrink-0 tabular-nums ${c.ours ? "font-semibold text-[#1A3770]" : ""}`}>{kr(c.sek)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 max-w-[80ch] text-[12.5px] leading-relaxed text-[var(--nw-muted)]">
          Listpriser i dollar, räknade till {SEK_PER_USD} kr per dollar. Bildmodellen redovisar inte tokens, så bilderna är uppskattade till {IMAGE_SEK} kr styck. Att skriva de {num(run.total)} påhittade bidragen kostade {kr(stage("generate").sek)} – i verkligheten skriver supportrarna dem själva.
        </p>
      </section>
    </main>
  );
}
