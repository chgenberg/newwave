import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalActions } from "@/components/newwave/ApprovalActions";
import { MaterialTabs } from "@/components/newwave/MaterialTabs";
import { MerchGrid } from "@/components/newwave/MerchGrid";
import { PackView } from "@/components/newwave/PackView";
import { OfficeMail } from "@/components/newwave/PackZip";
import { WeekFlow, WeeklyPick } from "@/components/newwave/WeeklyParts";
import { WeeklyRunner } from "@/components/newwave/WeeklyRunner";
import { ASA_IF as CLUB } from "@/lib/club";
import { copyFor } from "@/lib/copy";
import { ASA_IF, isoWeek, packClub, weeklySignals } from "@/lib/newwave/club";
import { listApprovals, readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Varje vecka` };

const TZ = "Europe/Stockholm";
const fmtDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(d);

export default async function WeeklyPage() {
  const now = new Date();
  const [brand, approvals] = await Promise.all([readBrand(CLUB.id), listApprovals(CLUB.id)]);
  const theme = clubTheme(brand.palette ?? CLUB.palette);
  const text = copyFor(CLUB);
  const signals = weeklySignals(now);
  const weekly = approvals.filter((a) => a.weekly);
  const current = weekly[0];
  const earlier = weekly.slice(1, 7);
  const sunday = new Date(now.getTime() + ((7 - now.getDay()) % 7) * 86_400_000);
  const monday = new Date(sunday.getTime() + 86_400_000);
  const next = current?.weekly && current.status === "ändring" && current.weekly.picked + 1 < current.weekly.candidates.length ? current.weekly.picked + 1 : null;
  const pack = packClub(ASA_IF, theme);
  const runner = {
    clubId: CLUB.id,
    footer: `${CLUB.name} · Sedan ${CLUB.founded}`,
    primary: theme.primary,
    accent: theme.accent,
    shopName: text.shopName,
    signals,
    loaderLines: text.loaderLines,
    loaderDone: text.loaderDone,
  };

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Material</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">
        Varje söndag tar {CLUB.agent.name} fram veckans motiv med foton, inlägg, hemsidebanner och nyhetsbrev. På måndag morgon får kansliet allt i ett mejl med en zip-fil. Ingenting publiceras automatiskt – ni lägger upp det ni vill, när ni vill.
      </p>
      <div className="mt-5">
        <MaterialTabs active="veckan" pending={current?.status === "väntar"} />
      </div>

      <section className="mt-6">
        <WeekFlow status={current?.status ?? null} />
        <p className="mt-3 text-[13px] text-[var(--nw-muted)]">
          Nästa körning: {fmtDay(sunday)} natt · mejlet kommer {fmtDay(monday)} kl. 07.00 · Signaler just nu: {signals.map((s) => s.title.split(" – ")[0]).join(", ") || "säsongen"}
        </p>
      </section>

      {current?.weekly ? (
        <section className="mt-8 border-t border-[var(--nw-line)] pt-6">
          <p className="text-[12.5px] text-[var(--nw-muted)]">
            Vecka {current.weekly.week}
            {current.weekly.week === isoWeek(now) ? " · den här veckan" : ""} · {current.occasion}
          </p>
          <h2 className="nw-club-heading mt-1 text-[28px] leading-tight text-[var(--club)] [overflow-wrap:anywhere] sm:text-[34px]">{current.title}</h2>
          {current.story ? <p className="mt-2 text-[14.5px] text-[var(--nw-muted)]">{current.story}</p> : null}

          {current.content ? (
            <OfficeMail
              agent={CLUB.agent.name}
              sentAt={`Måndag vecka ${current.weekly.week} kl. 07.00`}
              pack={{
                club: pack,
                clubId: CLUB.id,
                slogan: current.title,
                story: current.story,
                occasion: current.occasion,
                week: current.weekly.week,
                content: current.content,
                assets: current.assets ?? null,
                photos: current.photos ?? [],
                products: current.products ?? [],
                printFiles: current.printFiles,
                shopUrl: current.shopUrl ?? pack.website,
              }}
            />
          ) : null}

          <WeeklyPick run={current.weekly} />

          <div className="mt-5">
            <MerchGrid title={current.title} printUrl={current.previewUrl} art={current.printFiles} products={current.products ?? []} target={{ kind: "approval", clubId: CLUB.id, approvalId: current.id }} />
          </div>

          {current.content ? (
            <PackView
              club={pack}
              slogan={current.title}
              content={current.content}
              assets={current.assets ?? null}
              photos={current.photos ?? []}
              products={current.products ?? []}
              shopUrl={current.shopUrl}
              printUrl={current.printFiles?.light ?? current.previewUrl}
            />
          ) : null}

          <ApprovalActions clubId={CLUB.id} id={current.id} status={current.status} note={current.note} shopCount={current.shopProducts?.length ?? 0} weekly />
          {next !== null ? (
            <div className="mt-4 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4">
              <p className="text-[14px] text-[var(--nw-ink)]">
                Näst bästa motivet: <span className="font-medium">{current.weekly.candidates[next].concept.slogan}</span>
              </p>
              <div className="mt-3">
                <WeeklyRunner {...runner} label="Ta fram det nu" retry={{ ...current.weekly, next }} />
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="mt-8 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-6">
          <p className="nw-club-heading text-[18px] text-[var(--club)]">Inget paket den här veckan än</p>
          <p className="mt-1 text-[14px] text-[var(--nw-muted)]">Körningen sker automatiskt på söndag natt. Vill ni se hur det blir kan ni köra den nu – det tar ett par minuter.</p>
          <div className="mt-4">
            <WeeklyRunner {...runner} label="Kör veckans körning nu" />
          </div>
        </section>
      )}

      {earlier.length ? (
        <section className="mt-10">
          <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Tidigare veckor</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {earlier.map((a) => (
              <li key={a.id}>
                <Link href={`/newwave/klubb/godkann/${a.id}`} className="flex items-center gap-4 rounded-2xl bg-[var(--nw-soft)] p-3 pl-4 transition-colors hover:bg-[var(--nw-soft-2)]">
                  {a.assets?.feed || a.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.assets?.feed ?? a.previewUrl} alt="" className="h-12 w-10 shrink-0 rounded-lg bg-white object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[var(--nw-muted)]">
                      Vecka {a.weekly?.week} · {a.occasion}
                    </p>
                    <p className="truncate text-[14.5px] font-medium text-[var(--nw-ink)]">{a.title}</p>
                  </div>
                  <span className="shrink-0 text-[12.5px] text-[var(--nw-muted)]">{a.status === "godkänd" ? "Godkänd" : a.status === "ändring" ? "Nekad" : "Väntar"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {current ? (
        <div className="mt-10 border-t border-[var(--nw-line)] pt-5">
          <p className="mb-3 text-[13px] text-[var(--nw-faint)]">Demo: kör söndagens körning igen för att se ett nytt paket.</p>
          <WeeklyRunner {...runner} label="Kör veckans körning nu" ghost />
        </div>
      ) : null}
    </div>
  );
}
