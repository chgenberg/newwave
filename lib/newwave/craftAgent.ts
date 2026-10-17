import { nwProduct } from "./catalog";
import { type CraftData, ONBOARD_STEPS, similarClubs } from "./craft";
import { type CalendarItem, SEASON_OF } from "./craftCalendar";

export type AgentAction = { label: string; kind: "remind" | "onboard" | "autopilot" | "href"; clubIds?: string[]; href?: string };
export type Suggestion = { key: string; tone: "warn" | "tip" | "good"; title: string; detail: string; action?: AgentAction };

const DAY = 86_400_000;
const ageDays = (date: string, now: number) => (now - new Date(`${date.slice(0, 10)}T12:00:00Z`).getTime()) / DAY;
const list = (names: string[]) => (names.length <= 2 ? names.join(" och ") : `${names.slice(0, 2).join(", ")} och ${names.length - 2} till`);
const week = (now: number) => Math.floor(now / (7 * DAY));
const fmt = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));
const skapa = (params: Record<string, string>) => `/newwave/craft/skapa?${new URLSearchParams(params)}`;

function keep(data: CraftData, items: (Suggestion | null | undefined | false)[], max = 3) {
  return items.filter((s): s is Suggestion => Boolean(s) && !data.dismissed.includes((s as Suggestion).key)).slice(0, max);
}

export function clubSuggestions(data: CraftData, now: number): Suggestion[] {
  const { rows } = data;
  const recentlyReminded = (at?: string) => at && ageDays(at, now) <= 7;

  const waiting = rows.filter((r) => r.stats.oldestPending >= 21 && !recentlyReminded(r.remindedAt));
  const setup = rows.filter((r) => r.onboarding.done < ONBOARD_STEPS.length && !r.onboarding.linkSent);
  const manual = rows.filter((r) => !r.dashboard && !r.settings.autopilot && r.stats.avgScore >= 7.2);
  const idle = rows.filter((r) => r.status === "inaktiv");
  const star = [...rows].sort((a, b) => b.stats.sold - a.stats.sold)[0];
  const starProduct = star && Object.entries(star.materials.filter((m) => m.status === "godkänd").flatMap((m) => m.products).reduce<Record<string, number>>((a, id) => ({ ...a, [id]: (a[id] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
  const season = SEASON_OF(new Date(now).getMonth() + 1);
  const peers = star ? rows.filter((r) => r.id !== star.id && r.sports.some((s) => star.sports.includes(s))) : [];

  return keep(data, [
    waiting.length > 0 && {
      key: `remind:${waiting.map((r) => r.id).join(",")}:${week(now)}`,
      tone: "warn",
      title: `${waiting.length === 1 ? waiting[0].name : `${waiting.length} klubbar`} har material som väntat i över tre veckor`,
      detail: `${list(waiting.map((r) => r.name))} har inte svarat. En påminnelse brukar räcka.`,
      action: { label: waiting.length === 1 ? "Påminn klubben" : `Påminn alla ${waiting.length}`, kind: "remind", clubIds: waiting.map((r) => r.id) },
    },
    setup.length > 0 && {
      key: `onboard:${setup.map((r) => r.id).join(",")}`,
      tone: "tip",
      title: setup.length === 1 ? `${setup[0].name} är ${setup[0].onboarding.done} av ${ONBOARD_STEPS.length} steg in i uppstarten` : `${setup.length} klubbar har inte slutfört uppstarten`,
      detail: setup.length === 1 ? `Saknar ${ONBOARD_STEPS.filter((_, i) => !setup[0].onboarding.steps[i]).join(" och ").toLowerCase()}.` : `${list(setup.map((r) => r.name))} saknar tonalitet eller butik.`,
      action: { label: "Skicka uppstartslänk", kind: "onboard", clubIds: setup.map((r) => r.id) },
    },
    star && starProduct && star.stats.sold > 0 && {
      key: `star:${star.id}:${week(now)}`,
      tone: "good",
      title: `${star.name} säljer mest – ${nwProduct(starProduct[0])?.name.toLowerCase()} går bäst`,
      detail: `${star.stats.sold} sålda hittills. Föreslå en ${season}kampanj till ${peers.length} klubbar med samma sport.`,
      action: { label: "Skapa kampanj", kind: "href", href: skapa({ brief: `${season[0].toUpperCase()}${season.slice(1)}merch med ${nwProduct(starProduct[0])?.name.toLowerCase()} till ${star.sports[0].toLowerCase()}sklubbarna` }) },
    },
    manual.length > 0 && {
      key: `auto:${manual.map((r) => r.id).join(",")}`,
      tone: "tip",
      title: `${manual.length} klubbar har höga betyg men godkänner allt för hand`,
      detail: `${list(manual.map((r) => r.name))} får i snitt över 7. Med autopilot publiceras det som klarar gränsen direkt.`,
      action: { label: "Slå på autopilot", kind: "autopilot", clubIds: manual.map((r) => r.id) },
    },
    idle.length > 0 && {
      key: `idle:${idle.map((r) => r.id).join(",")}:${week(now)}`,
      tone: "warn",
      title: `${idle.length === 1 ? idle[0].name : `${idle.length} klubbar`} har inte skapat något på 45 dagar`,
      detail: "En färdig kampanj från Craft brukar få igång dem igen.",
      action: { label: "Skicka en kampanj", kind: "href", href: skapa({ klubbar: idle.map((r) => r.id).join(",") }) },
    },
  ]);
}

export function materialSuggestions(data: CraftData, now: number): Suggestion[] {
  const all = data.rows.flatMap((r) => r.materials);
  const queue = all.filter((m) => m.gate === "granskas");
  const flagged = all.filter((m) => m.review.flags.length && ageDays(m.createdAt, now) <= 30);
  const best = all
    .filter((m) => m.from === "Klubbens agent" && m.status === "godkänd" && m.sold > 0 && ageDays(m.createdAt, now) <= 90)
    .sort((a, b) => b.sold - a.sold)[0];
  const bestClub = best && data.rows.find((r) => r.id === best.clubId);
  const peers = best ? similarClubs(best, data.rows) : [];

  return keep(data, [
    queue.length > 0 && {
      key: `queue:${queue.length}:${queue[0].id}`,
      tone: "warn",
      title: `${queue.length} material väntar på Craft`,
      detail: "Betyget hamnade under klubbens gräns, så klubben har inte sett dem än. Släpp eller stoppa.",
      action: { label: "Granska nu", kind: "href", href: "/newwave/craft/material?q=hos%20craft" },
    },
    best && bestClub && peers.length > 0 && {
      key: `rollout:${best.id}`,
      tone: "good",
      title: `”${best.title}” från ${bestClub.name} har sålt ${best.sold} st`,
      detail: `Passar ${list(peers.map((r) => r.name))}. Rulla ut den som Craft-kampanj.`,
      action: { label: "Rulla ut", kind: "href", href: skapa({ fran: best.id }) },
    },
    flagged.length > 0 && {
      key: `flags:${flagged.length}:${week(now)}`,
      tone: "tip",
      title: `${flagged.length} material bröt mot Crafts regler senaste månaden`,
      detail: `Vanligast: ${Object.entries(flagged.flatMap((m) => m.review.flags).reduce<Record<string, number>>((a, f) => ({ ...a, [f]: (a[f] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0][0].replace(/\.$/, "").toLowerCase()}.`,
      action: { label: "Visa dem", kind: "href", href: "/newwave/craft/material?q=varningar" },
    },
  ]);
}

export function createSuggestions(data: CraftData, calendar: CalendarItem[], now: number): Suggestion[] {
  const planned = (c: CalendarItem) => data.campaigns.some((x) => x.occasion === c.occasion && Math.abs(ageDays(x.sendAt ?? x.createdAt, new Date(`${c.date}T12:00:00Z`).getTime())) <= 45);
  const gaps = calendar.filter((c) => ageDays(c.date, now) <= -10 && ageDays(c.date, now) >= -75 && !planned(c));
  const soon = data.campaigns.filter((c) => c.scheduled && c.sendAt && ageDays(c.sendAt, now) >= -14);
  const active = data.rows.filter((r) => r.status !== "inaktiv").length;

  return keep(data, [
    ...gaps.slice(0, 2).map((g) => ({
      key: `gap:${g.occasion}:${g.date}`,
      tone: "tip" as const,
      title: `Inget planerat för ${g.occasion.toLowerCase()} (${fmt(g.date)})`,
      detail: `${active} aktiva klubbar kan få material. Skicka gärna tre veckor innan.`,
      action: { label: "Planera kampanj", kind: "href" as const, href: skapa({ mall: g.occasion, datum: g.date }) },
    })),
    ...soon.slice(0, 1).map((c) => ({
      key: `soon:${c.id}`,
      tone: "good" as const,
      title: `”${c.title}” skickas ${fmt(c.sendAt!)}`,
      detail: `Till ${c.clubIds.length} klubbar${c.deadline ? `, godkänn senast ${fmt(c.deadline)}` : ""}${c.remind ? " med automatisk påminnelse" : ""}.`,
    })),
  ]);
}

export function weeklySummary(data: CraftData, now: number) {
  const all = data.rows.flatMap((r) => r.materials);
  const thisWeek = all.filter((m) => ageDays(m.createdAt, now) <= 7);
  const lastWeek = all.filter((m) => ageDays(m.createdAt, now) > 7 && ageDays(m.createdAt, now) <= 14);
  const craft = thisWeek.filter((m) => m.from === "Craft").length;
  const decided = all.filter((m) => m.gate === "släppt" && m.status !== "väntar" && ageDays(m.createdAt, now) <= 30);
  const rate = decided.length ? Math.round((decided.filter((m) => m.status === "godkänd").length / decided.length) * 100) : 0;
  const delta = thisWeek.length - lastWeek.length;
  const riser = [...data.rows].sort((a, b) => b.weekly[11] - b.weekly[10] - (a.weekly[11] - a.weekly[10]))[0];
  const campaign = data.campaigns.filter((c) => !c.scheduled).sort((a, b) => b.sold - a.sold)[0];
  const weak = data.rows.filter((r) => r.stats.approvalRate > 0 && r.stats.approvalRate < 70).sort((a, b) => a.stats.approvalRate - b.stats.approvalRate)[0];

  const text = [
    `Den här veckan skapades ${thisWeek.length} material${craft ? `, varav ${craft} från Craft` : ""} – ${delta === 0 ? "lika många som förra veckan" : `${Math.abs(delta)} ${delta > 0 ? "fler" : "färre"} än förra veckan`}.`,
    `${rate} % av det klubbarna svarat på senaste månaden godkändes.`,
    riser && riser.weekly[11] > riser.weekly[10] ? `${riser.name} ökade mest.` : "",
    campaign && campaign.sold ? `Bästa kampanjen är ”${campaign.title}” med ${campaign.sold} sålda.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tips = keep(data, [
    campaign && campaign.sold > 0 && {
      key: `more:${campaign.id}`,
      tone: "good",
      title: `Skicka ”${campaign.title}” till fler`,
      detail: `${campaign.approved} av ${campaign.clubs.length} klubbar godkände. ${data.rows.length - campaign.clubs.length} klubbar har inte fått den.`,
      action: { label: "Skapa kampanj", kind: "href", href: skapa({ kampanj: campaign.id }) },
    },
    weak && {
      key: `weak:${weak.id}:${week(now)}`,
      tone: "tip",
      title: `${weak.name} godkänner bara ${weak.stats.approvalRate} %`,
      detail: "Ofta är tonaliteten fel. Se över klubbens material och ändringsönskemål.",
      action: { label: "Visa material", kind: "href", href: `/newwave/craft/material?klubb=${weak.id}` },
    },
  ], 2);

  return { text, tips };
}
