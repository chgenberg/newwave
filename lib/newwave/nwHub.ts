import { listProducts } from "@/lib/intersport";
import { ASA_IF } from "./club";
import { craftData } from "./craft";
import type { Payload } from "./hub";
import { isOrder, ordersSince, sek, type Quote, type Reseller } from "./reseller";
import { readShop } from "./shopState";
import { listApprovals, listFeed } from "./store";

/** New Waves bild av navet: vad som händer i varje ben och vad som väntar hos varje aktör. */

const DAY = 86_400_000;
const TZ = "Europe/Stockholm";

export type LegLive = { value: string; label: string; detail: string; href: string };
export type ActorLive = { value: string; detail: string };
export type FeedEntry = { at: string; source: "Återförsäljare" | "Craft" | "Klubb" | "New Wave"; who: string; text: string; href?: string };
export type ResellerRow = Reseller & { quotes: number; open: number; orders: number; revenue: number; nwRevenue: number; lastAt: string | null };

/** Klubbflödet har lokal tid utan zon ("2026-10-17 15:21"). */
function stockholm(at: string) {
  const guess = new Date(`${at.replace(" ", "T")}:00Z`);
  if (Number.isNaN(guess.getTime())) return new Date(0).toISOString();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(guess));
  const diff = (hour - guess.getUTCHours() + 24) % 24;
  return new Date(guess.getTime() - diff * 3_600_000).toISOString();
}

const lastEvent = (q: Quote) => q.events[q.events.length - 1]?.at ?? q.createdAt;
const units = (qs: Quote[]) => qs.reduce((s, q) => s + q.lines.reduce((n, l) => n + l.qty, 0), 0);

export async function hubLive(now = Date.now()) {
  const [shop, craft, asaApprovals, asaFeed, asaProducts] = await Promise.all([readShop(), craftData(now), listApprovals(ASA_IF.id), listFeed(ASA_IF.id), listProducts(ASA_IF.id)]);
  const { resellers, quotes } = shop;
  const nameOf = (id: string) => resellers.find((r) => r.id === id)?.name ?? id;

  const toStart = quotes.filter((q) => q.status === "godkänd");
  const inProd = quotes.filter((q) => q.status === "produktion");
  const delivered30 = quotes.filter((q) => q.status === "levererad" && now - Date.parse(lastEvent(q)) < 30 * DAY);
  const open = quotes.filter((q) => q.status === "ny" || q.status === "skickad");
  const recent = ordersSince(quotes, 30, now);
  const dueSoon = inProd.filter((q) => q.needBy && Date.parse(`${q.needBy}T23:59:00Z`) - now < 7 * DAY);
  const live = resellers.filter((r) => r.status === "publicerad");

  const rows = craft.rows;
  const clubsLive = rows.filter((r) => r.onboarding.steps[3]);
  const queue = rows.reduce((s, r) => s + r.stats.queue, 0) + asaApprovals.filter((a) => a.status === "väntar").length;
  const created30 = rows.reduce((s, r) => s + r.stats.created30, 0);
  const clubSold = rows.reduce((s, r) => s + r.stats.sold, 0);
  const clubInShop = rows.reduce((s, r) => s + r.stats.inShop, 0) + asaProducts.length;
  const brands = resellers.filter((r) => r.logo).length + rows.filter((r) => r.logo).length;
  const shopProducts = new Set([...live.flatMap((r) => r.products), ...craft.rules.products]);
  const customers = new Set(quotes.map((q) => q.company.name.toLowerCase()));
  const stale = quotes.filter((q) => q.status === "skickad" && now - Date.parse(lastEvent(q)) > 3 * DAY);
  const quiet = rows.filter((r) => r.status === "inaktiv");

  const legs: Record<string, LegLive> = {
    brand: { value: String(brands), label: "varumärken i brand bucket", detail: `${resellers.filter((r) => r.logo).length} återförsäljare och ${rows.filter((r) => r.logo).length} klubbar`, href: "/newwave/new-wave/aterforsaljare" },
    content: { value: String(created30), label: "material senaste 30 dagarna", detail: `${craft.campaigns.filter((c) => c.delivered).length} Craft-kampanjer utskickade`, href: "/newwave/craft/material" },
    produkt: { value: String(shopProducts.size), label: "produkter ute i butikerna", detail: `${live.length} webbshoppar och Crafts klubbsortiment`, href: "/newwave/new-wave/aterforsaljare" },
    offert: { value: sek(open.reduce((s, q) => s + q.totalSek, 0)), label: `i ${open.length} öppna offerter`, detail: `${quotes.filter((q) => q.status === "ny").length} väntar på återförsäljaren`, href: "/newwave/new-wave/ordrar" },
    kvalitet: { value: String(queue), label: "väntar på granskning", detail: "Craft-material och klubbens godkännanden", href: "/newwave/craft/material" },
    ytor: { value: String(live.length + clubsLive.length + 2), label: "ytor i drift", detail: `${live.length} webbshoppar, ${clubsLive.length} klubbutiker, Craft och New Wave`, href: "/newwave" },
    insikt: {
      value: String(stale.length + quiet.length),
      label: "förslag på nästa affär",
      detail: stale.length ? `${stale[0].company.name} har inte svarat på offerten från ${nameOf(stale[0].resellerId)}` : quiet.length ? `${quiet[0].name} har inte varit aktiv på länge` : "Inget som sticker ut just nu",
      href: stale.length ? "/newwave/new-wave/ordrar" : "/newwave/craft",
    },
  };

  const files = [...toStart, ...inProd].reduce((s, q) => s + q.lines.length, 0);
  const payloads: Record<Payload, number> = {
    tryckfiler: files,
    ordrar: toStart.length + inProd.length,
    offerter: open.length,
    produktdata: shopProducts.size,
    kunddata: customers.size + rows.length,
    material: created30 + asaApprovals.length,
  };

  const actors: Record<string, ActorLive> = {
    produktion: { value: `${files} tryckjobb`, detail: `${units([...toStart, ...inProd])} st att trycka` },
    leverantorer: { value: `${units(toStart)} plagg`, detail: "att beställa till nya ordrar" },
    orderflode: { value: `${toStart.length + inProd.length} ordrar`, detail: `${toStart.length} att starta, ${inProd.length} i produktion` },
    frakt: { value: `${dueSoon.length} leveranser`, detail: "inom sju dagar" },
    erp: { value: sek(delivered30.reduce((s, q) => s + q.costSek, 0)), detail: "att fakturera återförsäljarna" },
    intersport: { value: `${clubInShop} produkter`, detail: `${clubSold} sålda klubbplagg` },
    webb: { value: `${live.length} butiker`, detail: "återförsäljarnas webbshoppar" },
  };

  const feed: FeedEntry[] = [
    ...quotes.flatMap((q) =>
      q.events.map((e) => ({
        at: e.at,
        source: e.who === "New Wave" ? ("New Wave" as const) : ("Återförsäljare" as const),
        who: e.who === q.company.contact ? `${q.company.name}` : e.who,
        text: `${e.text} (${q.id}, ${nameOf(q.resellerId)})`,
        href: "/newwave/new-wave/ordrar",
      })),
    ),
    ...craft.log.map((l) => ({ at: l.at, source: "Craft" as const, who: "Craft", text: l.text, href: "/newwave/craft" })),
    ...asaFeed.map((f) => ({ at: stockholm(f.at), source: "Klubb" as const, who: `${ASA_IF.name} · ${f.who}`, text: f.text, href: "/newwave/klubb" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 14);

  const resellerRows: ResellerRow[] = resellers.map((r) => {
    const own = quotes.filter((q) => q.resellerId === r.id);
    const orders = own.filter(isOrder);
    const last = own.flatMap((q) => q.events.map((e) => e.at)).sort().pop() ?? null;
    return {
      ...r,
      quotes: own.length,
      open: own.filter((q) => q.status === "ny" || q.status === "skickad").length,
      orders: orders.length,
      revenue: orders.reduce((s, q) => s + q.totalSek, 0),
      nwRevenue: orders.reduce((s, q) => s + q.costSek, 0),
      lastAt: last,
    };
  });

  return {
    stats: {
      toStart: toStart.length,
      inProd: inProd.length,
      delivered30: delivered30.length,
      revenue30: recent.reduce((s, q) => s + q.costSek, 0),
      shops: live.length,
      clubsLive: clubsLive.length,
      clubSold,
    },
    legs,
    payloads,
    actors,
    feed,
    resellers: resellerRows,
    orders: quotes.filter(isOrder).map((q) => ({ ...q, reseller: nameOf(q.resellerId) })),
    clubs: rows,
  };
}
