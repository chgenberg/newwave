/* eslint-disable @next/next/no-img-element -- ordmallarna ritas per klubb */
import type { Metadata } from "next";
import Link from "next/link";
import { fmtN } from "@/components/newwave/craft/parts";
import { fmtWhen } from "@/components/poc/craft/orderParts";
import { PlanActions } from "@/components/poc/craft/season/PlanActions";
import { Replicate } from "@/components/poc/craft/season/Replicate";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { allTemplates } from "@/lib/newwave/wordmark/store";
import { requireRole } from "@/lib/poc/auth";
import { pocCatalog } from "@/lib/poc/catalog";
import { listPlans, type PastDesign, pastDesigns, type PlanStatus, type SeasonPlan, type SeasonRow, seasonRows } from "@/lib/poc/seasons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Säsonger" };

/** Klubben som ordmallarna visas med. */
const SAMPLE = "storvreta-ibk";
const TZ = "Europe/Stockholm";
const fmtDate = (ymd: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
const daysUntil = (ymd: string, today: string) => Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

const PILL: Record<PlanStatus, string> = {
  planerad: "bg-[var(--nw-soft)] text-[var(--nw-muted)]",
  pågår: "bg-[#FFF4D6] text-[#7A5A00]",
  publicerad: "bg-[#E6F4EA] text-[#1E6B34]",
  fel: "bg-[#FDECEC] text-[#9B1C1C]",
};
const NATURE: Record<SeasonRow["nature"], string> = { vinter: "Vinter", vår: "Vår", sommar: "Sommar", höst: "Höst" };

function PlanRow({ plan, names, today }: { plan: SeasonPlan; names: Map<string, string>; today: string }) {
  const due = plan.status === "planerad" && plan.runAt.slice(0, 10) <= today;
  return (
    <li className="rounded-[22px] border border-[var(--nw-line)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-[var(--nw-ink)]">{plan.designName}</span>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ${PILL[plan.status]}`}>{plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}</span>
            {plan.seasonLabel ? <span className="text-[12.5px] text-[var(--nw-muted)]">{plan.seasonLabel}</span> : null}
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--nw-muted)]">
            {plan.status === "publicerad" ? `Publicerad ${fmtWhen(plan.doneAt ?? plan.updatedAt)}` : `Publiceras ${fmtWhen(plan.runAt)}${due ? " – dagen har kommit" : ""}`} · {fmtN(plan.clubIds.length)} {plan.clubIds.length === 1 ? "klubb" : "klubbar"} ·{" "}
            {plan.skus.map((s) => names.get(s) ?? s).join(", ")}
            {plan.content ? " · med mejlutkast" : ""}
          </p>
          {plan.result && (plan.status === "publicerad" || plan.result.published) ? (
            <p className="mt-0.5 text-[13px] text-[var(--nw-ink)]">
              {fmtN(plan.result.published)} produkter i {fmtN(plan.result.clubs)} klubbshoppar
              {plan.content ? (
                <>
                  {" · "}
                  <Link href={`/newwave/craft/utskick?design=${encodeURIComponent(plan.designId)}`} className="underline underline-offset-4">
                    {fmtN(plan.result.drafts)} mejlutkast
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {plan.error ? <p className="mt-0.5 text-[13px] text-[#9B1C1C]">{plan.error}</p> : null}
        </div>
        <PlanActions id={plan.id} canRun={plan.status === "planerad" || plan.status === "fel"} canDelete={plan.status === "planerad" || plan.status === "fel"} />
      </div>
    </li>
  );
}

export default async function CraftSeasons() {
  await requireRole("craft", "/newwave/craft/sasonger");
  const now = new Date();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(now);
  let failed = false;
  let plans: SeasonPlan[] = [];
  let past: PastDesign[] = [];
  const [rows, templates] = await Promise.all([seasonRows(now), allTemplates()]);
  try {
    [plans, past] = await Promise.all([listPlans(), pastDesigns()]);
  } catch (e) {
    console.error("craft/sasonger", e instanceof Error ? e.message : e);
    failed = true;
  }
  const names = new Map(pocCatalog().map((p) => [p.sku, p.name.replace(/^Craft\s+/i, "")]));
  const shownTemplates = templates.filter((t) => !t.hidden && t.style !== "Rygg").map((t) => ({ id: t.id, name: t.name }));
  const sources = past.map((d) => ({ id: d.id, name: d.name, type: d.type, template: d.template, clubIds: d.clubIds, skus: d.skus, season: d.season }));
  const open = plans.filter((p) => p.status !== "publicerad");
  const doneList = plans.filter((p) => p.status === "publicerad").slice(0, 8);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Säsonger</h1>
      <p className="mt-1 max-w-[64ch] text-[14.5px] text-[var(--nw-muted)]">
        Kampanjkalenderns tillfällen och Crafts egna säsonger, kopplade till klubbkollektionen. Skapa en kollektion med säsongens förslag, för över förra säsongens design till den nya – eller planera publiceringen till rätt dag.
      </p>

      {failed ? <p className="mt-6 rounded-2xl bg-[#FDECEC] p-4 text-[13.5px] text-[#9B1C1C]">Planerna gick inte att läsa just nu.</p> : null}

      {open.length || doneList.length ? (
        <section className="mt-7">
          <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Planerad publicering</h2>
          <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Planer vars dag kommit publiceras när schemat kör – eller direkt med Publicera nu.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {[...open, ...doneList].map((plan) => (
              <PlanRow key={plan.id} plan={plan} names={names} today={today} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Kommande säsonger och tillfällen</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((r) => {
            const days = daysUntil(r.date, today);
            return (
              <li key={r.id} className="rounded-[24px] border border-[var(--nw-line)] p-4 sm:p-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_132px]">
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-[var(--nw-muted)]">
                      {fmtDate(r.date)} · {days <= 0 ? "nu" : days === 1 ? "i morgon" : `om ${days} dagar`} · {NATURE[r.nature]}
                    </p>
                    <h3 className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-[18px] font-semibold text-[var(--nw-ink)]">{r.label}</span>
                      <span className="inline-flex items-center rounded-full bg-[var(--nw-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--nw-muted)]">{r.kind === "egen" ? "Crafts säsong" : "Kampanjkalendern"}</span>
                    </h3>
                    <p className="mt-1 text-[14px] font-medium text-[var(--nw-ink)]">{r.hook}</p>
                    {r.brief ? <p className="mt-0.5 max-w-[62ch] text-[13.5px] text-[var(--nw-muted)]">{r.brief}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <span className="text-[var(--nw-muted)]">Förslag:</span>
                      {r.skus.map((s) => (
                        <span key={s} className="rounded-full bg-[var(--nw-soft)] px-2.5 py-1 font-medium text-[var(--nw-ink)]">
                          {names.get(s) ?? s}
                        </span>
                      ))}
                      <span className="rounded-full border border-[var(--nw-line)] px-2.5 py-1 text-[var(--nw-ink)]">Ordmall: {r.templateName}</span>
                    </div>
                  </div>
                  <span className="relative hidden aspect-square overflow-hidden rounded-[18px] bg-[var(--nw-soft)] md:block" aria-hidden>
                    <img src={wordmarkUrl({ template: r.template, icon: true, ornament: true }, SAMPLE, "light", 480)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[12%]" />
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  <Link href={r.href} className="nw-btn">
                    Skapa kollektion
                  </Link>
                  <Replicate season={{ id: r.id, key: r.key, label: r.label, date: r.date, name: r.name, template: r.template }} sources={sources} templates={shownTemplates} products={pocCatalog().map((p) => ({ sku: p.sku, name: names.get(p.sku) ?? p.name }))} today={today} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
