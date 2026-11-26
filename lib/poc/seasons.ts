import { craftCalendar, SEASON_OF, seasonProducts, TEMPLATES } from "@/lib/newwave/craftCalendar";
import { allTemplates } from "@/lib/newwave/wordmark/store";
import type { Season } from "@/lib/scarfScene";
import { clubProductDrafts } from "./build";
import { catalogProduct, POC_CATALOG } from "./catalog";
import { ContentError, type ContentSeason, createDrafts } from "./content";
import { iso, newId, query, tx } from "./db";
import { getDesign, listClubProducts, listDesigns, upsertClubProducts } from "./store";
import type { Design } from "./types";

/**
 * Säsongerna kopplade till klubbkollektionen (del E i steg 3, se docs/poc-flode.md). Stefan i mötet: "nu är det höst…
 * regnperiod… nu är det maj… och då vill vi snabbt replikera den".
 *
 * - Raderna: kampanjkalenderns tillfällen (lib/newwave/craftCalendar.ts) och Crafts egna säsonger – säsongsstart,
 *   cupsäsong, sommarlov, regnperiod och jul. Varje rad föreslår produkter ur POC-katalogen och en ordmall, och
 *   länkar till klubbkollektionen med förvalen.
 * - Planerna: en design, klubbarna, produkterna och dagen den ska publiceras. `runDuePlans` publicerar planerna vars
 *   dag kommit (routen POST /api/v1/craft/sasong/kor), `runPlan` en plan direkt ("Publicera nu").
 */

// ── Säsongerna ──────────────────────────────────────────────────────────────

/** `products` är plaggen säsongen gärna lyfter, som basplagg i New Waves katalog (samma som kampanjmallarnas). */
type Own = { key: string; label: string; month: number; day: number; nature: Season; hook: string; line: string; brief: string; template: string; products?: string[] };

/** Crafts egna säsonger: när kollektionen ska ligga ute, och orden som följer med i klubbarnas texter. */
const OWN: Own[] = [
  {
    key: "sasongsstart-ute",
    label: "Säsongsstart utomhus",
    month: 3,
    day: 15,
    nature: "vår",
    hook: "Ny säsong, samma hjärta",
    line: "Lagom till vårens första träningar och matcher utomhus.",
    brief: "Fotboll, friidrott och de andra utomhussporterna drar igång. Träningsjacka och t-shirt till spelare, ledare och föräldrar.",
    template: "stadion",
    products: ["p006", "p001"],
  },
  {
    key: "cupsasong",
    label: "Cupsäsong",
    month: 5,
    day: 15,
    nature: "sommar",
    hook: "Cupsäsongen är här",
    line: "Samma tröja på hela laget – och på föräldrarna och syskonen vid sidlinjen.",
    brief: "Maj och juni är cupernas tid. T-shirt till hela laget och något varmt till de tidiga morgnarna.",
    template: "college-bage",
    products: ["p001", "p004"],
  },
  {
    key: "sommarlov",
    label: "Sommarlov",
    month: 6,
    day: 12,
    nature: "sommar",
    hook: "Sommarlov i klubbens färger",
    line: "Till lägret, cuperna och de långa kvällarna vid planen.",
    brief: "Läger och sommarträning. Lätta plagg, och något till de svala kvällarna.",
    template: "solnedgang",
    products: ["p001", "p010"],
  },
  {
    key: "sasongsstart-inne",
    label: "Säsongsstart inomhus",
    month: 8,
    day: 20,
    nature: "höst",
    hook: "Hallen öppnar igen",
    line: "Lagom till säsongsstarten i hallen och de första matcherna.",
    brief: "Innebandy, handboll, basket och ishockey drar igång. Hoodie och t-shirt till träningen och läktaren.",
    template: "kapsel",
    products: ["p004", "p001"],
  },
  {
    key: "regnperiod",
    label: "Regnperiod",
    month: 9,
    day: 20,
    nature: "höst",
    hook: "Regnet kommer – klubbkänslan stannar",
    line: "Varma lager för regniga kvällar på läktaren och vägen till träningen.",
    brief: "Hösten blir blöt. Träningsjacka, väst och hoodie som håller värmen, och halsduken till läktaren.",
    template: "hjalmen",
    products: ["p006", "p010", "p004"],
  },
  {
    key: "jul",
    label: "Jul",
    month: 12,
    day: 1,
    nature: "vinter",
    hook: "En julklapp i klubbens färger",
    line: "Till spelaren, ledaren och den som står på läktaren varje helg.",
    brief: "Julklapparna säljer i december: halsduk, mössa och hoodie i klubbens färger.",
    template: "lagerkrans",
    products: ["p012", "p004"],
  },
];

/** Kalenderns tillfällen som Crafts egna säsonger redan täcker. */
const COVERED = new Set(["Säsongsstart", "Jul", "Julafton"]);

/** Ordmallen per tillfälle i kalendern, annars per årstid. */
const OCCASION_TEMPLATE: Record<string, string> = {
  "Fars dag": "skuggserif",
  Julmarknad: "lagerkrans",
  Sommarcup: "college-bage",
  Skolstart: "akademi",
  Medlemsvärvning: "campus",
  Höstlovscupen: "hjalmen",
  "Black Friday": "tvaradig",
  Lucia: "stjarnbage",
  Halloween: "sjuttiotal",
  Avslutning: "jubileum",
};
const NATURE_TEMPLATE: Record<Season, string> = { vinter: "emblem", vår: "retro-skript", sommar: "solskript", höst: "valvet" };
const NATURE_LINE: Record<Season, string> = {
  vinter: "Varma plagg för kalla kvällar på läktaren och vägen till träningen.",
  vår: "Lagom till vårens träningar och de första matcherna utomhus.",
  sommar: "För cuperna, lägren och sommarkvällarna vid planen.",
  höst: "För höstens träningar, matcher och kvällar på läktaren.",
};

export type SeasonRow = ContentSeason & {
  key: string;
  date: string;
  year: number;
  kind: "egen" | "kalender";
  brief: string;
  /** Föreslagna produkter ur POC-katalogen. */
  skus: string[];
  /** Föreslagen ordmall och dess namn. */
  template: string;
  templateName: string;
  /** Designens namn: säsongen och året. */
  name: string;
  /** Klubbkollektionen med förvalen. */
  href: string;
};

const slug = (s: string) =>
  s
    .toLocaleLowerCase("sv-SE")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Produkterna för säsongen: kampanjmallens produkter som finns i POC-katalogen, sedan säsongens plagg ur
 * `seasonProducts` (katalogens årstider via plaggets basplagg), och halsduken när det är kallt. Högst fyra.
 */
export function suggestSkus(nature: Season, templateProducts: string[] = []): string[] {
  const garments = POC_CATALOG.filter((p) => p.kind === "plagg" && p.baseId);
  const skuOf = (baseId: string) => garments.filter((p) => p.baseId === baseId).map((p) => p.sku);
  const fromTemplate = templateProducts.flatMap(skuOf);
  const seasonal = seasonProducts(
    nature,
    garments.map((p) => p.baseId!),
    4,
  ).flatMap(skuOf);
  const scarf = nature === "vinter" || nature === "höst" ? POC_CATALOG.filter((p) => p.kind === "halsduk").map((p) => p.sku) : [];
  const list = [...new Set([...fromTemplate, ...seasonal])].slice(0, scarf.length ? 3 : 4);
  return [...list, ...scarf];
}

type Base = Omit<SeasonRow, "templateName" | "href" | "template"> & { wanted: string };

function ownRow(o: Own, year: number): Base {
  return { id: `${o.key}-${year}`, key: o.key, label: o.label, nature: o.nature, hook: o.hook, line: o.line, brief: o.brief, date: ymd(year, o.month, o.day), year, kind: "egen", skus: suggestSkus(o.nature, o.products), name: `${o.label} ${year}`, wanted: o.template };
}

function calendarRow(occasion: string, date: string): Base {
  const year = Number(date.slice(0, 4));
  const nature = SEASON_OF(Number(date.slice(5, 7)));
  const t = TEMPLATES.find((x) => x.occasion === occasion);
  return {
    id: `${slug(occasion)}-${year}`,
    key: slug(occasion),
    label: occasion,
    nature,
    hook: t?.title ?? occasion,
    line: NATURE_LINE[nature],
    brief: t?.brief ?? "",
    date,
    year,
    kind: "kalender",
    skus: suggestSkus(nature, t?.products),
    name: `${occasion} ${year}`,
    wanted: OCCASION_TEMPLATE[occasion] ?? NATURE_TEMPLATE[nature],
  };
}

/** Länken till klubbkollektionen med säsongens förval (klubbkollektionen läser dem ur adressen). */
export const collectionHref = (r: { id: string; skus: string[]; template: string; name: string }) =>
  `/newwave/craft/klubbkollektion?sasong=${encodeURIComponent(r.id)}&produkter=${r.skus.map(encodeURIComponent).join(",")}&mall=${encodeURIComponent(r.template)}&namn=${encodeURIComponent(r.name)}`;

async function withTemplates(rows: Base[]): Promise<SeasonRow[]> {
  const templates = (await allTemplates()).filter((t) => !t.hidden && t.style !== "Rygg");
  return rows.map(({ wanted, ...r }) => {
    const t = templates.find((x) => x.id === wanted) ?? templates[0];
    const row = { ...r, template: t?.id ?? wanted, templateName: t?.name ?? wanted };
    return { ...row, href: collectionHref(row) };
  });
}

/** Kommande säsonger och tillfällen, närmast först: Crafts egna och kampanjkalenderns, ett år framåt. */
export async function seasonRows(now = new Date(), days = 365): Promise<SeasonRow[]> {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const own = OWN.flatMap((o) => [now.getUTCFullYear(), now.getUTCFullYear() + 1].map((y) => ownRow(o, y))).filter((r) => r.date >= today && r.date <= until);
  const calendar = craftCalendar(now, days)
    .filter((c) => !COVERED.has(c.occasion) && c.date >= today)
    .map((c) => calendarRow(c.occasion, c.date));
  const rows = new Map<string, Base>();
  for (const r of [...own, ...calendar].sort((a, b) => a.date.localeCompare(b.date))) if (!rows.has(r.id)) rows.set(r.id, r);
  return withTemplates([...rows.values()]);
}

/** En säsong på sitt id, t.ex. "regnperiod-2027" eller "fars-dag-2026". */
export async function seasonById(id: string): Promise<SeasonRow | null> {
  const m = /^([a-z0-9-]+)-(\d{4})$/.exec(id ?? "");
  if (!m) return null;
  const [key, year] = [m[1], Number(m[2])];
  const own = OWN.find((o) => o.key === key);
  if (own) return (await withTemplates([ownRow(own, year)]))[0];
  const hit = craftCalendar(new Date(Date.UTC(year, 0, 1)), 366).find((c) => slug(c.occasion) === key && c.date.startsWith(`${year}-`));
  return hit ? (await withTemplates([calendarRow(hit.occasion, hit.date)]))[0] : null;
}

/** Det innehållet behöver av säsongen. */
export const contentSeason = (r: SeasonRow): ContentSeason => ({ id: r.id, label: r.label, nature: r.nature, hook: r.hook, line: r.line });

// ── Planerna ────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS poc_season_plans (
  id text PRIMARY KEY,
  season text,
  season_label text,
  design_id text NOT NULL,
  design_name text NOT NULL,
  source_design_id text,
  club_ids text[] NOT NULL,
  skus text[] NOT NULL,
  run_at timestamptz NOT NULL,
  content boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'planerad',
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS poc_season_plans_due ON poc_season_plans (status, run_at);
CREATE INDEX IF NOT EXISTS poc_season_plans_design ON poc_season_plans (design_id);
`;

const g = globalThis as unknown as { pocSeasonSchema?: { sql: string; ready: Promise<void> } };

function ready(): Promise<void> {
  if (g.pocSeasonSchema?.sql !== SCHEMA) {
    const run = tx(async (db) => {
      await query("SELECT pg_advisory_xact_lock(4711006)", [], db);
      await query(SCHEMA, [], db);
    });
    g.pocSeasonSchema = { sql: SCHEMA, ready: run };
    run.catch(() => {
      if (g.pocSeasonSchema?.ready === run) g.pocSeasonSchema = undefined;
    });
  }
  return g.pocSeasonSchema!.ready;
}

type Row = Record<string, unknown>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  await ready();
  return query(sql, params);
}

export type PlanStatus = "planerad" | "pågår" | "publicerad" | "fel";
export type PlanResult = { published: number; clubs: number; drafts: number; done: number };

export type SeasonPlan = {
  id: string;
  season?: string;
  seasonLabel?: string;
  designId: string;
  designName: string;
  /** Designen som replikerades, om planen kommer från förra säsongen. */
  sourceDesignId?: string;
  clubIds: string[];
  skus: string[];
  runAt: string;
  /** Skapa innehåll och mejlutkast till klubbarna när planen publiceras. */
  content: boolean;
  status: PlanStatus;
  result?: PlanResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  doneAt?: string;
};

const toPlan = (r: Row): SeasonPlan => ({
  id: r.id as string,
  season: (r.season as string | null) ?? undefined,
  seasonLabel: (r.season_label as string | null) ?? undefined,
  designId: r.design_id as string,
  designName: r.design_name as string,
  sourceDesignId: (r.source_design_id as string | null) ?? undefined,
  clubIds: (r.club_ids as string[]) ?? [],
  skus: (r.skus as string[]) ?? [],
  runAt: iso(r.run_at as Date)!,
  content: Boolean(r.content),
  status: r.status as PlanStatus,
  result: (r.result as PlanResult | null) ?? undefined,
  error: (r.error as string | null) ?? undefined,
  createdAt: iso(r.created_at as Date)!,
  updatedAt: iso(r.updated_at as Date)!,
  doneAt: iso(r.done_at as Date | null),
});

export type NewPlan = {
  season?: string;
  designId: string;
  sourceDesignId?: string;
  clubIds: string[];
  skus: string[];
  runAt: string;
  content: boolean;
  /** Redan publicerad via klubbkollektionens route (replikeringen "Publicera nu"): sparas med resultatet, för listan. */
  done?: Omit<PlanResult, "done">;
};

export async function createPlan(p: NewPlan): Promise<SeasonPlan> {
  const design = await getDesign(p.designId);
  if (!design) throw new ContentError("Designen finns inte.", 404);
  const unknown = p.skus.filter((s) => !catalogProduct(s));
  if (unknown.length) throw new ContentError(`Okända artikelnummer: ${unknown.join(", ")}.`, 400);
  const runAt = new Date(p.runAt);
  if (Number.isNaN(runAt.getTime())) throw new ContentError("Ogiltigt datum.", 400);
  const season = p.season ? await seasonById(p.season) : null;
  const [r] = await q(
    `INSERT INTO poc_season_plans (id, season, season_label, design_id, design_name, source_design_id, club_ids, skus, run_at, content, status, result, done_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [
      newId("plan"),
      season?.id ?? null,
      season?.label ?? null,
      design.id,
      design.name,
      p.sourceDesignId ?? null,
      [...new Set(p.clubIds)],
      [...new Set(p.skus)],
      runAt,
      p.content,
      p.done ? "publicerad" : "planerad",
      p.done ? JSON.stringify({ ...p.done, done: p.clubIds.length }) : null,
      p.done ? new Date() : null,
    ],
  );
  return toPlan(r);
}

export async function listPlans(limit = 100): Promise<SeasonPlan[]> {
  return (await q("SELECT * FROM poc_season_plans ORDER BY (status IN ('planerad', 'pågår', 'fel')) DESC, run_at DESC LIMIT $1", [limit])).map(toPlan);
}

export async function getPlan(id: string): Promise<SeasonPlan | null> {
  const [r] = await q("SELECT * FROM poc_season_plans WHERE id = $1", [id]);
  return r ? toPlan(r) : null;
}

/** Tar bort en plan som inte publicerats. */
export async function deletePlan(id: string): Promise<boolean> {
  const rows = await q("DELETE FROM poc_season_plans WHERE id = $1 AND status IN ('planerad', 'fel') RETURNING id", [id]);
  return rows.length > 0;
}

/** Säsongen för en design: planens säsong, annars ett namn som "Regnperiod 2027" (klubbkollektionens förval). */
export async function seasonOfDesign(design: Pick<Design, "id" | "name">): Promise<ContentSeason | null> {
  const [r] = await q("SELECT season FROM poc_season_plans WHERE design_id = $1 AND season IS NOT NULL ORDER BY created_at DESC LIMIT 1", [design.id]).catch(() => []);
  const byPlan = r?.season ? await seasonById(r.season as string) : null;
  if (byPlan) return contentSeason(byPlan);
  const m = /^(.+?)\s+(\d{4})$/.exec(design.name.trim());
  const byName = m ? await seasonById(`${slug(m[1])}-${m[2]}`) : null;
  return byName ? contentSeason(byName) : null;
}

/** Klubbar per omgång, som klubbkollektionen. */
const BATCH = 250;

/**
 * Publicerar planen: designen blir klubbarnas egen, i omgångar om 250, med samma steg som klubbkollektionens
 * publiceringsroute (`clubProductDrafts` och `upsertClubProducts` med status "publicerad"). Med `content` skapas
 * innehållspaket och mejlutkast för varje omgång. En plan som är publicerad körs inte igen; en som fastnat i "pågår"
 * i mer än en kvart (servern startades om) går att köra igen.
 */
export async function runPlan(id: string, origin: string): Promise<SeasonPlan> {
  const [claimed] = await q(
    `UPDATE poc_season_plans SET status = 'pågår', error = NULL, updated_at = now()
     WHERE id = $1 AND (status IN ('planerad', 'fel') OR (status = 'pågår' AND updated_at < now() - interval '15 minutes'))
     RETURNING *`,
    [id],
  );
  if (!claimed) {
    const plan = await getPlan(id);
    if (!plan) throw new ContentError("Planen finns inte.", 404);
    throw new ContentError(plan.status === "publicerad" ? "Planen är redan publicerad." : "Planen publiceras redan.", 409);
  }
  const plan = toPlan(claimed);
  const result: PlanResult = { published: 0, clubs: 0, drafts: 0, done: 0 };
  try {
    const design = await getDesign(plan.designId);
    if (!design) throw new Error("Designen finns inte längre.");
    const unknown = plan.skus.filter((s) => !catalogProduct(s));
    if (unknown.length) throw new Error(`Okända artikelnummer: ${unknown.join(", ")}.`);
    const season = plan.season ? await seasonById(plan.season) : null;
    for (let i = 0; i < plan.clubIds.length; i += BATCH) {
      const part = plan.clubIds.slice(i, i + BATCH);
      const drafts = await clubProductDrafts(design, part, plan.skus);
      const rows = drafts.length ? await upsertClubProducts(drafts.map((d) => ({ ...d, status: "publicerad" as const }))) : [];
      const clubs = [...new Set(rows.map((r) => r.clubId))];
      result.published += rows.length;
      result.clubs += clubs.length;
      if (plan.content && clubs.length) result.drafts += (await createDrafts(design.id, clubs, { origin, season: season ? contentSeason(season) : null })).drafts;
      result.done = Math.min(plan.clubIds.length, i + BATCH);
      await q("UPDATE poc_season_plans SET result = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify(result)]);
    }
    if (!result.published) throw new Error("Inga av klubbarna eller produkterna finns.");
    const [r] = await q("UPDATE poc_season_plans SET status = 'publicerad', result = $2, done_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [id, JSON.stringify(result)]);
    return toPlan(r);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    console.error("poc/seasons plan", id, why);
    const [r] = await q("UPDATE poc_season_plans SET status = 'fel', error = $2, result = $3, updated_at = now() WHERE id = $1 RETURNING *", [id, why.slice(0, 300), JSON.stringify(result)]);
    return toPlan(r);
  }
}

/** Publicerar planerna vars dag har kommit, äldst först. Högst `max` per körning. */
export async function runDuePlans(origin: string, max = 20): Promise<SeasonPlan[]> {
  const due = await q("SELECT id FROM poc_season_plans WHERE status = 'planerad' AND run_at <= now() ORDER BY run_at LIMIT $1", [max]);
  const out: SeasonPlan[] = [];
  for (const r of due) {
    try {
      out.push(await runPlan(r.id as string, origin));
    } catch (e) {
      // En annan körning hann före; den publicerar planen.
      if (!(e instanceof ContentError && e.status === 409)) throw e;
    }
  }
  return out;
}

// ── Tidigare designer, för "Replikera förra säsongen" ───────────────────────

export type PastDesign = { id: string; name: string; type: "ordmall" | "fil"; template?: string; clubIds: string[]; skus: string[]; published: number; createdAt: string; season?: string };

/** Designerna som är publicerade i någon klubbshop, nyast först, med sina klubbar och produkter. */
export async function pastDesigns(): Promise<PastDesign[]> {
  const [designs, products] = await Promise.all([listDesigns(), listClubProducts({ status: "publicerad" })]);
  const by = new Map<string, { clubs: Set<string>; skus: Set<string>; n: number }>();
  for (const p of products) {
    const e = by.get(p.designId) ?? { clubs: new Set(), skus: new Set(), n: 0 };
    e.clubs.add(p.clubId);
    e.skus.add(p.sku);
    e.n++;
    by.set(p.designId, e);
  }
  const out: PastDesign[] = [];
  for (const d of designs) {
    const e = by.get(d.id);
    if (!e) continue;
    const season = await seasonOfDesign(d).catch(() => null);
    out.push({
      id: d.id,
      name: d.name,
      type: d.source.type,
      template: d.source.type === "ordmall" ? d.source.template : undefined,
      clubIds: [...e.clubs].slice(0, 6000),
      skus: POC_CATALOG.map((p) => p.sku).filter((s) => e.skus.has(s)),
      published: e.n,
      createdAt: d.createdAt,
      season: season?.id,
    });
  }
  return out;
}
