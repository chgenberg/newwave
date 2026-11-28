/* eslint-disable @next/next/no-img-element -- storyn och affischen ritas per klubb */
import type { Metadata } from "next";
import Link from "next/link";
import { Crest, fmtN } from "@/components/newwave/craft/parts";
import { DraftActions, CreateDrafts } from "@/components/poc/craft/content/DraftActions";
import { SceneBulk, SceneCard } from "@/components/poc/craft/content/SceneButtons";
import { fmtWhen } from "@/components/poc/craft/orderParts";
import { requireRole } from "@/lib/poc/auth";
import { pocClub } from "@/lib/poc/build";
import {
  type ContentDraft,
  draftDesigns,
  draftUrls,
  listDrafts,
  mailText,
  modelCosts,
  scenePhotos,
  scenesLeft,
} from "@/lib/poc/content";
import { pastDesigns } from "@/lib/poc/seasons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Utskick" };

const chip = (on: boolean) => `nw-chip h-8 px-3 ${on ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "hover:border-[var(--nw-ink)]"}`;
const SHOWN = 200;

function StatusPill({ draft }: { draft: Pick<ContentDraft, "status" | "sentAt"> }) {
  return draft.status === "skickat" ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[11.5px] font-medium text-[#1E6B34]">Skickat{draft.sentAt ? ` ${fmtWhen(draft.sentAt)}` : ""}</span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--nw-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--nw-muted)]">Utkast</span>
  );
}

function TextCard({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[22px] bg-[var(--nw-soft)] p-4">
      <p className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-[var(--nw-muted)]">{title}</p>
      {sub ? <p className="mt-1.5 text-[13.5px] font-semibold text-[var(--nw-ink)]">{sub}</p> : null}
      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--nw-ink)] [overflow-wrap:anywhere]">{children}</p>
    </div>
  );
}

export default async function CraftOutbox({ searchParams }: { searchParams: Promise<{ design?: string; status?: string; utkast?: string }> }) {
  const p = await searchParams;
  const keep = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ design: p.design, status: p.status, ...extra }).filter((e): e is [string, string] => !!e[1]));
    return `/newwave/craft/utskick${q.size ? `?${q}` : ""}`;
  };
  await requireRole("craft", keep({ utkast: p.utkast }));
  const status = (["utkast", "skickat"] as const).find((s) => s === p.status);

  let failed = false;
  let designs: Awaited<ReturnType<typeof draftDesigns>> = [];
  let drafts: ContentDraft[] = [];
  let costs: Awaited<ReturnType<typeof modelCosts>> = { miljobild: { calls: 0, costSek: 0 }, text: { calls: 0, costSek: 0 } };
  let published: Awaited<ReturnType<typeof pastDesigns>> = [];
  let left = 0;
  try {
    [designs, drafts, costs, published, left] = await Promise.all([
      draftDesigns(),
      listDrafts({ designId: p.design, status, limit: 5000 }),
      modelCosts(),
      pastDesigns(),
      scenesLeft(),
    ]);
  } catch (e) {
    console.error("craft/utskick", e instanceof Error ? e.message : e);
    failed = true;
  }
  const design = designs.find((d) => d.designId === p.design);
  const selected = drafts.find((d) => d.id === p.utkast) ?? drafts[0] ?? null;
  const shown = drafts.slice(0, SHOWN);
  const [clubs, scenes] = await Promise.all([
    Promise.all(shown.map((d) => pocClub(d.clubId).catch(() => null))).then((list) => new Map(list.flatMap((c) => (c ? [[c.id, c] as const] : [])))),
    scenePhotos(drafts.flatMap((d) => d.products.map((x) => x.id))).catch(() => new Map<string, string>()),
  ]);
  const missing = [...new Set(drafts.flatMap((d) => d.products.map((x) => x.id)))].filter((id) => !scenes.get(id));
  const club = selected ? (clubs.get(selected.clubId) ?? (await pocClub(selected.clubId).catch(() => null))) : null;
  const files = selected ? draftUrls(selected.id) : null;
  const total = designs.reduce((n, d) => n + d.drafts, 0);
  const stats = [
    { label: "Utkast", value: fmtN(total - designs.reduce((n, d) => n + d.sent, 0)) },
    { label: "Skickade", value: fmtN(designs.reduce((n, d) => n + d.sent, 0)) },
    { label: "Saknar e-post", value: fmtN(designs.reduce((n, d) => n + d.noEmail, 0)) },
    { label: "Miljöbilder", value: fmtN(costs.miljobild.calls) },
  ];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Utskick</h1>
      <p className="mt-1 max-w-[64ch] text-[14.5px] text-[var(--nw-muted)]">
        När en design publiceras får varje klubb ett innehållspaket till sina sociala medier och ett mejlutkast från Craft. Inget skickas av sig självt: ladda ner paketet, kopiera mejlet till ditt e-postprogram och markera det som skickat.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-[var(--nw-radius)] border border-[var(--nw-line)] px-4 py-4 sm:px-5">
            <p className="truncate text-[12.5px] text-[var(--nw-muted)]">{s.label}</p>
            <p className="nw-club-heading mt-1.5 truncate text-[24px] leading-none text-[var(--club)] sm:text-[28px]">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Skapa utkast för en publicerad design</h2>
        <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Klubbkollektionen gör det själv när rutan för innehåll är ikryssad. Här går det att göra i efterhand.</p>
        <div className="mt-3">
          <CreateDrafts designs={published.map((d) => ({ id: d.id, name: d.name, clubIds: d.clubIds }))} />
        </div>
      </section>

      {failed ? (
        <p className="mt-6 rounded-2xl bg-[#FDECEC] p-4 text-[13.5px] text-[#9B1C1C]">Utkasten gick inte att läsa just nu.</p>
      ) : !total ? (
        <p className="mt-6 rounded-2xl bg-[var(--nw-soft)] p-5 text-[14px] text-[var(--nw-muted)]">
          Inga utkast än. De skapas när en design publiceras i{" "}
          <Link href="/newwave/craft/klubbkollektion" className="font-medium text-[var(--nw-ink)] underline underline-offset-4">
            klubbkollektionen
          </Link>
          , eller med knappen ovan.
        </p>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap gap-1.5">
            <Link href={`/newwave/craft/utskick${status ? `?status=${status}` : ""}`} className={chip(!design)}>
              Alla designer
            </Link>
            {designs.map((d) => (
              <Link key={d.designId} href={keep({ design: d.designId, utkast: undefined })} className={chip(design?.designId === d.designId)}>
                {d.designName} <span className="ml-1 opacity-60">{fmtN(d.drafts)}</span>
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {([undefined, "utkast", "skickat"] as const).map((s) => (
                <Link key={s ?? "alla"} href={keep({ status: s, utkast: undefined })} className={chip(status === s)}>
                  {s === "utkast" ? "Utkast" : s === "skickat" ? "Skickade" : "Alla"}
                </Link>
              ))}
            </div>
            {design ? <SceneBulk ids={missing} left={left} label={`”${design.designName}”`} /> : null}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] lg:items-start">
            <ul className="flex flex-col gap-1.5">
              {shown.map((d) => {
                const c = clubs.get(d.clubId);
                const on = d.id === selected?.id;
                return (
                  <li key={d.id}>
                    <Link
                      href={keep({ utkast: d.id })}
                      scroll={false}
                      aria-current={on ? "true" : undefined}
                      className={`flex min-w-0 items-center gap-3 rounded-[18px] border p-3 transition-colors ${on ? "border-[var(--nw-ink)]" : "border-[var(--nw-line)] hover:border-[#cfcfca]"}`}
                    >
                      <Crest name={d.clubName} logo={c?.logo} colors={[c?.colors[0] ?? "#111111", c?.colors[1] ?? "#FFFFFF"]} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-[var(--nw-ink)]">{d.clubName}</span>
                        <span className="block truncate text-[12.5px] text-[var(--nw-muted)]">
                          {design ? "" : `${d.designName} · `}
                          {d.mail.to.length ? `${d.products.length} produkter` : <span className="text-[#9B1C1C]">e-post saknas</span>}
                        </span>
                      </span>
                      <StatusPill draft={d} />
                    </Link>
                  </li>
                );
              })}
              {drafts.length > shown.length ? <li className="px-1 text-[12.5px] text-[var(--nw-faint)]">Visar {SHOWN} av {fmtN(drafts.length)} – välj en design eller status för att se fler.</li> : null}
              {!drafts.length ? <li className="rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">Inga utkast matchar filtret.</li> : null}
            </ul>

            {selected && files ? (
              <section className="min-w-0 rounded-[28px] border border-[var(--nw-line)] p-4 sm:p-6" aria-label={`Utkastet till ${selected.clubName}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <Crest name={selected.clubName} logo={club?.logo} colors={[club?.colors[0] ?? "#111111", club?.colors[1] ?? "#FFFFFF"]} size={44} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[18px] font-semibold text-[var(--nw-ink)]">{selected.clubName}</h2>
                    <p className="truncate text-[13px] text-[var(--nw-muted)]">
                      ”{selected.designName}”{selected.season ? ` · ${selected.season.label}` : ""} · uppdaterat {fmtWhen(selected.updatedAt)}
                    </p>
                  </div>
                  <StatusPill draft={selected} />
                </div>

                <div className="mt-4">
                  <DraftActions id={selected.id} zip={files.zip} mail={mailText(selected.mail)} status={selected.status} rewritten={!!selected.ai} />
                </div>

                <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--nw-muted)]">Mejlet till klubben</h3>
                <div className="mt-2 overflow-hidden rounded-[22px] border border-[var(--nw-line)]">
                  <dl className="divide-y divide-[var(--nw-line)] text-[13.5px]">
                    <div className="grid grid-cols-[64px_1fr] gap-2 px-4 py-2.5">
                      <dt className="text-[var(--nw-muted)]">Till</dt>
                      <dd className="min-w-0 [overflow-wrap:anywhere]">{selected.mail.to.length ? selected.mail.to.join(", ") : <span className="text-[#9B1C1C]">E-post saknas i klubbregistret – lägg till mottagaren själv.</span>}</dd>
                    </div>
                    <div className="grid grid-cols-[64px_1fr] gap-2 px-4 py-2.5">
                      <dt className="text-[var(--nw-muted)]">Ämne</dt>
                      <dd className="min-w-0 font-medium">{selected.mail.subject}</dd>
                    </div>
                    <div className="grid grid-cols-[64px_1fr] gap-2 px-4 py-2.5">
                      <dt className="text-[var(--nw-muted)]">Bilaga</dt>
                      <dd className="min-w-0">
                        <a href={files.zip} download className="font-medium underline underline-offset-4">
                          Innehållspaketet (zip)
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <p className="whitespace-pre-wrap border-t border-[var(--nw-line)] px-4 py-4 text-[14px] leading-relaxed text-[var(--nw-ink)] [overflow-wrap:anywhere]">{selected.mail.body}</p>
                </div>

                <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--nw-muted)]">Innehållet</h3>
                <div className="mt-2 grid gap-2 xl:grid-cols-2">
                  <TextCard title="Instagram">{selected.texts.instagram}</TextCard>
                  <TextCard title="Facebook">{selected.texts.facebook}</TextCard>
                  <div className="xl:col-span-2">
                    <TextCard title="Nyhetsbrev" sub={selected.texts.newsletter.subject}>
                      {selected.texts.newsletter.body}
                    </TextCard>
                    <a href={files.newsletter} target="_blank" rel="noreferrer" className="mt-1.5 inline-block px-1 text-[12.5px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
                      Öppna nyhetsbrevet som e-postmall
                    </a>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] gap-3">
                  <a href={files.story} target="_blank" rel="noreferrer" className="block min-w-0">
                    <img src={files.story} alt={`Story till ${selected.clubName}`} loading="lazy" className="aspect-[9/16] w-full rounded-[18px] bg-[var(--nw-soft)] object-cover" />
                    <span className="mt-1 block text-[12.5px] text-[var(--nw-muted)]">Story 1080 × 1920</span>
                  </a>
                  <a href={files.poster} target="_blank" rel="noreferrer" className="block min-w-0">
                    <img src={files.poster} alt={`Affisch till ${selected.clubName}`} loading="lazy" className="aspect-[210/297] w-full rounded-[18px] border border-[var(--nw-line)] bg-white object-cover" />
                    <span className="mt-1 block text-[12.5px] text-[var(--nw-muted)]">Affisch A4 med QR-kod till klubbshoppen</span>
                  </a>
                </div>

                <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--nw-muted)]">Produkterna och miljöbilderna</h3>
                  <p className="text-[12.5px] text-[var(--nw-faint)]">{left} nya miljöbilder kvar den här timmen</p>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
                  {selected.products.map((x) => (
                    <SceneCard key={x.id} product={x} scene={scenes.get(x.id)} />
                  ))}
                </ul>
                <div className="mt-3">
                  <SceneBulk
                    ids={selected.products.map((x) => x.id).filter((id) => !scenes.get(id))}
                    left={left}
                    label={selected.clubName}
                  />
                </div>
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
