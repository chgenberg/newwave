import type { Metadata } from "next";
import Link from "next/link";
import { RunHubButton } from "@/components/poc/craft/integration/RunHubButton";
import { Empty, Failed, Pill, relative, Section, Stats, type Tone, when } from "@/components/poc/craft/integration/parts";
import { AutoRefresh } from "@/components/poc/craft/OrderControls";
import { requireRole } from "@/lib/poc/auth";
import { DEFAULT_FILE_TTL_H, DEFAULT_PUBLIC_BASE_URL, hubConfig } from "@/lib/poc/hub/config";
import { eventSummary, type InboxStatus, type NoticeKey } from "@/lib/poc/hub/inbox";
import { outboxSummary } from "@/lib/poc/hub/outbox";
import { productSummary } from "@/lib/poc/hub/products";
import { stockSummary } from "@/lib/poc/hub/stock";
import type { OutboxKind, OutboxStatus } from "@/lib/poc/hub/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Integration" };

/** Varje del läses för sig, så att ett fel i en av dem inte tar ner hela sidan. */
async function safe<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`craft/integration ${what}`, e instanceof Error ? e.message : e);
    return null;
  }
}

const OUTBOX_TONE: Record<OutboxStatus, Tone> = { väntar: "gul", skickad: "grön", misslyckad: "röd", stoppad: "grå" };
const KIND: Record<OutboxKind, string> = { "order.submit": "Order", "order.cancel": "Avbokning" };
const INBOX_TONE: Record<InboxStatus, Tone> = { behandlas: "blå", behandlad: "grön", avvisad: "röd", ogiltig: "röd", misslyckad: "gul" };
const EVENT_NAME: Record<string, string> = { "order.status": "Orderstatus", "stock.updated": "Lager", "product.upsert": "Produkter", "product.delete": "Borttagna produkter" };
const NOTICE_NAME: Record<NoticeKey, string> = {
  "anrop.signatur": "Fel signatur",
  "anrop.storlek": "För stort anrop",
  "anrop.format": "Fel format",
  "anrop.stängd": "Webhooken stängd",
  "händelse.avvisad": "Avvisade händelser",
  "händelse.ogiltig": "Ogiltiga händelser",
  "händelse.misslyckad": "Tillfälliga fel",
};
const SOURCE_NAME = { hubb: "New Waves hubb", import: "Crafts importerade produktdata", platshållare: "Platshållarna" } as const;

const orderHref = (number: string) => `/newwave/craft/ordrar/${encodeURIComponent(number)}`;

export default async function CraftIntegration() {
  await requireRole("craft", "/newwave/craft/integration");
  const cfg = hubConfig();
  const [outbox, events, stock, products] = await Promise.all([
    safe("utkorgen", () => outboxSummary(15)),
    safe("händelserna", () => eventSummary(20)),
    safe("lagret", () => stockSummary()),
    safe("produkterna", () => productSummary()),
  ]);
  const http = cfg.mode === "http";
  const webhookUrl = `${cfg.publicBaseUrl}/api/v1/hub/webhook`;
  const prod = process.env.NODE_ENV === "production";

  // Inställningarna: bara om de är satta, aldrig deras värden.
  const settings: { name: string; state: string; tone: Tone; text: string }[] = [
    { name: "HUB_MODE", state: http ? "http" : "simulerad", tone: http ? "blå" : "grå", text: http ? "Ordrarna går till New Waves hubb över HTTP." : "Hubben simuleras: ordrarna bekräftas direkt, som i demot." },
    { name: "HUB_API_URL", state: cfg.url ? "satt" : cfg.missing.includes("HUB_API_URL") ? "saknas" : "–", tone: cfg.url ? "grön" : http ? "röd" : "grå", text: "Hubbens adress." },
    { name: "HUB_API_KEY", state: cfg.hasKey ? "satt" : http ? "saknas" : "–", tone: cfg.hasKey ? "grön" : http ? "röd" : "grå", text: "Nyckeln till hubben." },
    {
      name: "HUB_AUTH_HEADER",
      state: cfg.missing.includes("HUB_AUTH_HEADER") ? "ogiltig" : cfg.authHeader.toLowerCase() === "authorization" ? "standard" : "satt",
      tone: cfg.missing.includes("HUB_AUTH_HEADER") ? "röd" : "grå",
      text: cfg.bearer ? "Nyckeln skickas som Authorization: Bearer." : "Nyckeln skickas i en egen rubrik.",
    },
    {
      name: "HUB_WEBHOOK_SECRET",
      state: cfg.webhookSecret ? "satt" : "saknas",
      tone: cfg.webhookSecret ? "grön" : prod ? "röd" : "gul",
      text: cfg.webhookSecret ? "Hubbens händelser till oss måste vara signerade." : prod ? "Webhooken är stängd tills hemligheten är satt." : "Webhooken tar emot osignerade händelser (bara vid utveckling).",
    },
    { name: "HUB_CRON_KEY", state: cfg.cronKey ? "satt" : "saknas", tone: cfg.cronKey ? "grön" : "grå", text: "Nyckeln för ett externt schema. Servern kör utkorgen själv varje minut ändå." },
    { name: "HUB_PULL", state: cfg.pull ? "på" : "av", tone: cfg.pull ? "blå" : "grå", text: cfg.pull ? "Vi hämtar lager och produkter från hubben själva." : "Lager och produkter kommer som händelser från hubben." },
    {
      name: "HUB_FILE_TTL_H",
      state: cfg.fileTtlHours === DEFAULT_FILE_TTL_H ? "standard" : "satt",
      tone: "grå",
      text: `Fillänkarna i ordrarna gäller i ${cfg.fileTtlHours % 24 === 0 ? `${cfg.fileTtlHours / 24} dygn` : `${cfg.fileTtlHours} timmar`}.`,
    },
    { name: "PUBLIC_BASE_URL", state: cfg.publicBaseUrl === DEFAULT_PUBLIC_BASE_URL ? "standard" : "satt", tone: "grå", text: "Sajtens adress i fillänkarna och webhookadressen." },
    { name: "ALERT_WEBHOOK_URL", state: cfg.alertWebhook ? "satt" : "saknas", tone: cfg.alertWebhook ? "grön" : "gul", text: cfg.alertWebhook ? "Larmen går till kanalen." : "Larmen skrivs bara i serverns logg." },
  ];

  return (
    <div className="nw-page">
      <AutoRefresh seconds={15} />
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Integration</h1>
      <p className="mt-1 max-w-[64ch] text-[14.5px] text-[var(--nw-muted)]">
        Kopplingen mot New Waves hubb: ordrar och avbokningar ut till Crafts affärssystem, och orderstatus, lager och produkter tillbaka in.
      </p>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[22px] border border-[var(--nw-line)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-[var(--nw-ink)]">{http ? "New Waves hubb" : "Simulerad hubb"}</p>
            <Pill tone={cfg.ready ? "grön" : "röd"}>{cfg.ready ? "Klar" : "Inställningar saknas"}</Pill>
          </div>
          <p className="mt-1 text-[13.5px] text-[var(--nw-muted)]">
            {http
              ? cfg.ready
                ? "Ordrar och avbokningar skickas till hubben, med nya försök tills den tagit emot dem."
                : "Inget skickas till hubben förrän inställningarna är på plats. Ordrarna väntar i utkorgen under tiden."
              : "Ordrarna bekräftas av den simulerade hubben. Sätt HUB_MODE=http med adressen och nyckeln för att koppla in New Waves hubb."}
          </p>
          {cfg.problems.length ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {cfg.problems.map((p) => (
                <li key={p} className="rounded-xl bg-[#FDECEC] px-3 py-2 text-[12.5px] text-[#9B1C1C]">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="min-w-0 rounded-[22px] border border-[var(--nw-line)] p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-[var(--nw-ink)]">Till New Wave</p>
          <p className="mt-1 text-[13.5px] text-[var(--nw-muted)]">Adressen som hubben skickar sina händelser till, och beskrivningen av hela kopplingen åt båda hållen.</p>
          <p className="mt-3 break-all rounded-xl bg-[var(--nw-soft)] px-3 py-2 font-mono text-[12.5px] text-[var(--nw-ink)]">POST {webhookUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/v1/hub/openapi" target="_blank" rel="noreferrer" className="nw-btn nw-btn-ghost">
              API-dokumentationen
            </a>
            <a href="/api/v1/hub/openapi?ladda=1" className="nw-btn nw-btn-ghost">
              Ladda ner (OpenAPI)
            </a>
          </div>
        </div>
      </div>

      <Section title="Inställningar">
        <p className="mt-1 text-[12.5px] text-[var(--nw-muted)]">Bara om varje variabel är satt i miljön – aldrig värdena.</p>
        <ul className="mt-3 divide-y divide-[var(--nw-line)] rounded-[22px] border border-[var(--nw-line)]">
          {settings.map((s) => (
            <li key={s.name} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:gap-3">
              <span className="w-44 shrink-0 font-mono text-[12.5px] text-[var(--nw-ink)]">{s.name}</span>
              <span className="w-24 shrink-0">
                <Pill tone={s.tone}>{s.state}</Pill>
              </span>
              <span className="min-w-0 flex-1 text-[var(--nw-muted)]">{s.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Utkorgen" aside={<RunHubButton disabled={!outbox} />}>
        <p className="mt-1 max-w-[70ch] text-[12.5px] text-[var(--nw-muted)]">
          Allt vi skickar till hubben: nya ordrar och avbokningar. Nya försök efter 1, 5, 15, 30 och 60 minuter, sedan varje timme i ett dygn. En misslyckad post skickas igen från ordern.
        </p>
        {!outbox ? (
          <Failed what="Utkorgen" />
        ) : (
          <>
            <Stats
              items={[
                { label: "Väntar", value: outbox.counts.väntar, tone: outbox.counts.väntar ? "gul" : undefined, hint: outbox.oldestWaiting ? `äldsta ${relative(outbox.oldestWaiting.createdAt)}` : undefined },
                { label: "Misslyckade", value: outbox.counts.misslyckad, tone: outbox.counts.misslyckad ? "röd" : undefined },
                { label: "Skickade", value: outbox.counts.skickad },
                {
                  label: "Ej bekräftade",
                  value: outbox.unconfirmed,
                  tone: outbox.unconfirmedOverAnHour ? "röd" : undefined,
                  hint: outbox.unconfirmedOverAnHour ? `${outbox.unconfirmedOverAnHour} över en timme` : "mottagna, väntar på hubben",
                },
              ]}
            />
            {outbox.lastError ? (
              <p className="mt-3 rounded-xl bg-[#FDECEC] px-3 py-2 text-[12.5px] text-[#9B1C1C]">
                Senaste felet ({KIND[outbox.lastError.kind].toLowerCase()} för{" "}
                <Link href={orderHref(outbox.lastError.orderNumber)} className="font-medium underline underline-offset-2">
                  {outbox.lastError.orderNumber}
                </Link>
                , {when(outbox.lastError.at)}): {outbox.lastError.text}
              </p>
            ) : null}
            {outbox.recent.length ? (
              <ul className="mt-3 divide-y divide-[var(--nw-line)] rounded-[22px] border border-[var(--nw-line)]">
                {outbox.recent.map((i) => (
                  <li key={i.id} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
                      <Link href={orderHref(i.orderNumber)} className="font-semibold tabular-nums text-[var(--nw-ink)] hover:underline">
                        {i.orderNumber}
                      </Link>
                      <span className="text-[12.5px] text-[var(--nw-muted)]">{KIND[i.kind]}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 sm:w-40">
                      <Pill tone={i.sending ? "blå" : OUTBOX_TONE[i.status]}>{i.sending ? "skickas" : i.status}</Pill>
                      <span className="text-[12px] tabular-nums text-[var(--nw-faint)]">{i.attempts} försök</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--nw-muted)]" title={i.lastError}>
                      {i.status === "skickad"
                        ? `${i.erpRef ? `${i.erpRef} · ` : ""}${when(i.sentAt)}`
                        : i.status === "väntar"
                          ? `nästa försök ${relative(i.nextAttemptAt)}${i.lastError ? ` · ${i.lastError}` : ""}`
                          : (i.lastError ?? when(i.updatedAt))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Utkorgen är tom. Ordrarna hamnar här när kunderna handlar.</Empty>
            )}
          </>
        )}
      </Section>

      <Section title="Händelser från hubben">
        <p className="mt-1 max-w-[70ch] text-[12.5px] text-[var(--nw-muted)]">
          Orderstatus, lager och produkter som hubben skickar till webhooken. Samma händelse två gånger behandlas bara en gång.
        </p>
        {!events ? (
          <Failed what="Händelserna" />
        ) : (
          <>
            <Stats
              items={[
                { label: "Senaste dygnet", value: events.last24h },
                { label: "Totalt (30 dygn)", value: events.total },
                { label: "Fel", value: events.byStatus.avvisad + events.byStatus.ogiltig + events.byStatus.misslyckad, tone: events.problems.length ? "röd" : undefined },
                { label: "Senaste", value: events.lastReceivedAt ? relative(events.lastReceivedAt) : "aldrig", hint: events.lastReceivedAt ? when(events.lastReceivedAt) : undefined },
              ]}
            />
            {events.byType.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {events.byType.map((t) => (
                  <span key={t.type} className="nw-chip h-8 gap-1.5 px-3 text-[12.5px]">
                    <span className="font-medium text-[var(--nw-ink)]">{EVENT_NAME[t.type] ?? t.type}</span>
                    <span className="tabular-nums text-[var(--nw-muted)]">
                      {t.count}
                      {t.problems ? ` · ${t.problems} fel` : ""} · {when(t.lastAt)}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            {events.notices.length ? (
              <ul className="mt-3 flex flex-col gap-1.5">
                {events.notices.map((n) => (
                  <li key={n.key} className={`rounded-xl px-3 py-2 text-[12.5px] ${n.key === "händelse.misslyckad" ? "bg-[#FFF4D6] text-[#7A5A00]" : "bg-[#FDECEC] text-[#9B1C1C]"}`}>
                    <span className="font-semibold">{NOTICE_NAME[n.key] ?? n.key}</span> · {n.count} {n.count === 1 ? "gång" : "gånger"}, senast {when(n.lastAt)}: {n.lastText}
                  </li>
                ))}
              </ul>
            ) : null}
            {events.recent.length ? (
              <ul className="mt-3 divide-y divide-[var(--nw-line)] rounded-[22px] border border-[var(--nw-line)]">
                {events.recent.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex shrink-0 items-center gap-2 sm:w-52">
                      <span className="text-[12px] tabular-nums text-[var(--nw-faint)]">{when(e.lastReceivedAt)}</span>
                      <span className="font-medium text-[var(--nw-ink)]">{EVENT_NAME[e.type] ?? e.type}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 sm:w-36">
                      <Pill tone={INBOX_TONE[e.status]}>{e.status}</Pill>
                      {e.deliveries > 1 ? <span className="text-[12px] tabular-nums text-[var(--nw-faint)]">{e.deliveries} ggr</span> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--nw-ink)]">{e.summary}</span>
                      {e.message && e.status !== "behandlad" ? <span className={`block truncate text-[12px] ${e.status === "misslyckad" ? "text-[#7A5A00]" : "text-[#9B1C1C]"}`}>{e.message}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Inga händelser än. De kommer när hubben skickar orderstatus, lager eller produkter till webhooken.</Empty>
            )}
            {events.problems.some((p) => !events.recent.some((r) => r.id === p.id)) ? (
              <details className="mt-3 text-[12.5px]">
                <summary className="cursor-pointer text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">Äldre fel</summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {events.problems
                    .filter((p) => !events.recent.some((r) => r.id === p.id))
                    .map((p) => (
                      <li key={p.id} className="rounded-xl bg-[var(--nw-soft)] px-3 py-2">
                        <span className="font-medium text-[var(--nw-ink)]">{EVENT_NAME[p.type] ?? p.type}</span> · {p.status} · {when(p.lastReceivedAt)} · {p.summary}
                        {p.message ? <span className="block text-[#9B1C1C]">{p.message}</span> : null}
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </Section>

      <div className="grid gap-x-3 lg:grid-cols-2">
        <Section title="Lagret">
          {!stock ? (
            <Failed what="Lagret" />
          ) : !stock.tracked ? (
            <Empty>Hubben har inte skickat något lager än. Allt säljs som i dag, utan gräns.</Empty>
          ) : (
            <div className="mt-3 rounded-[22px] border border-[var(--nw-line)] p-4 text-[13px]">
              <p className="text-[var(--nw-muted)]">
                Senast uppdaterat <span className="font-medium text-[var(--nw-ink)]">{when(stock.updatedAt)}</span>
                {stock.lastFullAt ? ` · helt lager ${when(stock.lastFullAt)}` : " · inget helt lager än"}
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone="grå">{stock.tracked} artiklar</Pill>
                <Pill tone="grå">{stock.rows} rader</Pill>
                {stock.out ? <Pill tone="röd">{stock.out} slut</Pill> : null}
                {stock.few ? <Pill tone="gul">{stock.few} få kvar</Pill> : null}
                {stock.reserved ? <Pill tone="blå">{stock.reserved} reserverade</Pill> : null}
              </p>
              {stock.updates.length ? (
                <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-[var(--nw-muted)]">
                  {stock.updates.slice(0, 4).map((u) => (
                    <li key={`${u.at}-${u.rows}`} className="truncate">
                      <span className="tabular-nums text-[var(--nw-faint)]">{when(u.at)}</span> · {u.full ? "helt lager" : "ändring"} · {u.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="Produkterna">
          {!products ? (
            <Failed what="Produkterna" />
          ) : (
            <div className="mt-3 rounded-[22px] border border-[var(--nw-line)] p-4 text-[13px]">
              <p className="text-[var(--nw-muted)]">
                Katalogen kommer från <span className="font-medium text-[var(--nw-ink)]">{SOURCE_NAME[products.source] ?? products.source}</span>
                {products.updatedAt ? ` · ändrad ${when(products.updatedAt)}` : ""}
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone="grå">{products.catalog} i katalogen</Pill>
                {products.count ? <Pill tone="grön">{products.count} från hubben</Pill> : null}
                {products.inactive ? <Pill tone="grå">{products.inactive} säljs inte längre</Pill> : null}
                {products.retired.length ? <Pill tone="grå">{products.retired.length} borttagna</Pill> : null}
                {products.rejected.length ? <Pill tone="röd">{products.rejected.length} avvisade</Pill> : null}
              </p>
              {products.rejected.length ? (
                <ul className="mt-3 flex flex-col gap-1 text-[12.5px]">
                  {products.rejected.slice(0, 4).map((r) => (
                    <li key={`${r.sku}-${r.at}`} className="truncate text-[#9B1C1C]" title={r.reasons.join("; ")}>
                      <span className="font-medium">{r.name ?? r.sku}</span> ({r.sku}): {r.reasons.join("; ")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {products.source !== "hubb" ? <p className="mt-3 text-[12.5px] text-[var(--nw-muted)]">När hubben skickar sina produkter blir de katalogen, utan omstart.</p> : null}
            </div>
          )}
        </Section>
      </div>

      <p className="mt-6 text-[12.5px] text-[var(--nw-faint)]">Uppdateras av sig själv · tider i svensk tid</p>
    </div>
  );
}
