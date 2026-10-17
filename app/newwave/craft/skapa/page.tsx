import type { Metadata } from "next";
import Link from "next/link";
import { type CalendarMonth, CampaignForm, type Draft } from "@/components/newwave/craft/CampaignForm";
import { CraftStudio, type StudioClub } from "@/components/newwave/craft/CraftStudio";
import { CLUBS } from "@/lib/club";
import { copyFor } from "@/lib/copy";
import { CRAFT_CLUBS, craftData, similarClubs } from "@/lib/newwave/craft";
import { createSuggestions } from "@/lib/newwave/craftAgent";
import { TEMPLATES, craftCalendar, templateFor } from "@/lib/newwave/craftCalendar";
import { clubOccasions } from "@/lib/newwave/club";
import { readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Skapa" };

const MODES = [
  { id: "kampanj", label: "Kampanj till flera klubbar", short: "Kampanj" },
  { id: "design", label: "Design åt en klubb", short: "Åt en klubb" },
] as const;

type Params = { klubb?: string; klubbar?: string; lage?: string; fran?: string; kampanj?: string; mall?: string; datum?: string; brief?: string };

export default async function CraftCreate({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const now = new Date();
  const data = await craftData(now.getTime());
  const allowed = data.rules.products;
  const live = CRAFT_CLUBS.filter((c) => c.live && CLUBS[c.id]);
  const mode = p.lage === "design" || (!p.lage && p.klubb && live.some((c) => c.id === p.klubb)) ? "design" : "kampanj";
  const qs = (m: string) => `?lage=${m}${p.klubb ? `&klubb=${p.klubb}` : ""}`;
  const name = (id: string) => CRAFT_CLUBS.find((c) => c.id === id)?.name ?? id;

  let initial: Draft = {};
  const source = p.fran ? data.rows.flatMap((r) => r.materials).find((m) => m.id === p.fran) : undefined;
  const copy = p.kampanj ? data.campaigns.find((c) => c.id === p.kampanj) : undefined;
  if (source) {
    const peers = similarClubs(source, data.rows);
    initial = {
      title: source.title.replace(new RegExp(name(source.clubId).replace(/\s+\S+$/, ""), "g"), "klubben"),
      occasion: source.occasion,
      products: source.products,
      brief: `Bygger på ”${source.title}” från ${name(source.clubId)}${source.sold ? `, som sålt ${source.sold} st` : ""}. Behåll idén men anpassa motiv, färger och ton till varje klubb.`,
      clubIds: peers.map((r) => r.id),
      sourceId: source.id,
      note: `Rullar ut ”${source.title}” från ${name(source.clubId)}. Agenten valde ${peers.length} klubbar med samma sport eller region som inte fått något liknande.`,
    };
  } else if (copy) {
    const others = data.rows.filter((r) => !copy.clubIds.includes(r.id)).map((r) => r.id);
    initial = { title: copy.title, occasion: copy.occasion, brief: copy.brief, products: copy.products, clubIds: others, note: `Skickar ”${copy.title}” till de ${others.length} klubbar som inte fick den förra gången.` };
  } else if (p.mall) {
    const t = templateFor(p.mall, p.datum, allowed);
    initial = { ...t, date: p.datum };
  }
  if (p.klubbar) initial.clubIds = p.klubbar.split(",").filter((id) => CRAFT_CLUBS.some((c) => c.id === id));
  else if (p.klubb && mode === "kampanj" && CRAFT_CLUBS.some((c) => c.id === p.klubb)) initial.clubIds = [p.klubb];

  const items = craftCalendar(now, 190);
  const months: CalendarMonth[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    return {
      label: new Intl.DateTimeFormat("sv-SE", { month: "long" }).format(d),
      items: items
        .filter((it) => it.date.startsWith(key))
        .map((it) => {
          const c = data.campaigns.find((x) => x.occasion === it.occasion && Math.abs(new Date(x.date ?? x.sendAt ?? x.createdAt).getTime() - new Date(it.date).getTime()) <= 45 * 86_400_000);
          return { ...it, planned: c ? { title: c.title, scheduled: c.scheduled, clubs: c.clubIds.length } : undefined };
        }),
    };
  });

  const studio: StudioClub[] =
    mode === "design"
      ? await Promise.all(
          live.map(async (c) => {
            const club = CLUBS[c.id];
            const text = copyFor(club);
            return {
              id: c.id,
              name: c.name,
              logo: c.logo,
              colors: c.colors,
              footer: `${club.name} · Sedan ${club.founded}`,
              website: club.sources.website ?? club.intersportShopUrl,
              handle: club.shortName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, ""),
              shopName: copyFor(club).shopName,
              theme: clubTheme((await readBrand(c.id)).palette ?? club.palette),
              occasions: clubOccasions(now, 365, Boolean(c.dashboard)).slice(0, 8),
              loaderLines: text.loaderLines,
              loaderDone: text.loaderDone,
              approveBase: c.dashboard ? `${c.dashboard}/godkann` : null,
            };
          }),
        )
      : [];

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Skapa och tilldela</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Skicka en kampanj som varje klubbs agent anpassar, eller designa färdigt material åt en enskild klubb.</p>

      <nav className="mt-5 inline-flex max-w-full rounded-full bg-[var(--nw-soft)] p-1" aria-label="Läge">
        {MODES.map((m) => (
          <Link
            key={m.id}
            href={qs(m.id)}
            aria-current={mode === m.id ? "page" : undefined}
            className={`truncate rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${mode === m.id ? "bg-white text-[var(--nw-ink)] shadow-sm" : "text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}
          >
            <span className="sm:hidden">{m.short}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {mode === "design" ? (
          <CraftStudio clubs={studio} preselect={p.klubb} />
        ) : (
          <CampaignForm
              key={JSON.stringify(p)}
              clubs={CRAFT_CLUBS.map((c) => ({ id: c.id, name: c.name, city: c.city, region: c.region, sports: c.sports, colors: c.colors, logo: c.logo, live: c.live }))}
              allowed={allowed}
              templates={TEMPLATES}
              calendar={months}
              today={now.toISOString().slice(0, 10)}
              initial={initial}
              autoBrief={p.brief}
              suggestions={createSuggestions(data, items, now.getTime())}
            />
        )}
      </div>
    </div>
  );
}
