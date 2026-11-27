import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { toFile } from "openai";
import type { Font, PathCommand } from "opentype.js";
import QRCode from "qrcode";
import sharp from "sharp";
import { envInt } from "@/lib/demoLimit";
import { intersportPath } from "@/lib/intersport";
import { readAsset } from "@/lib/newwave/asset";
import { CLUBS_DIR } from "@/lib/newwave/clubRegistry";
import { costSek, usageOf } from "@/lib/newwave/derby";
import { IMAGE_USAGE_TYPICAL, imageCostSek, type ImageUsage } from "@/lib/newwave/derbyData";
import { genitive, newsletterHtml } from "@/lib/newwave/newsletterHtml";
import { errorMessage, hasOpenAIKey, IMAGE_MODEL, IMAGE_QUALITY, openai } from "@/lib/openai";
import { SITE } from "@/lib/newwave/site";
import { internalOrigin, publicOrigin } from "@/lib/origin";
import { hexToRgb } from "@/lib/scarf";
import { loadFontFile } from "@/lib/scarfEngine";
import { FAITHFUL, references, scarfReferences, SNAPSHOT, UPRIGHT, worn } from "@/lib/scarfPhoto";
import { people, type Season, settingOf } from "@/lib/scarfScene";
import { loadFile, saveFile } from "@/lib/store";
import { pocClub, type PocClub } from "./build";
import { catalogProduct, pocCatalog } from "./catalog";
import { roleAddresses } from "./clubEmail";
import { iso, newId, query, tx } from "./db";
import { getClubProduct, getDesign, listClubProducts } from "./store";
import type { ClubProduct, ProductKind } from "./types";

/**
 * Innehållet till klubbarna när Craft publicerat en design (del E i steg 3, se docs/poc-flode.md):
 *
 * - Miljöbilden: ett foto där en person i klubbens miljö (sporten, årstiden) bär plagget med klubbens tryck, gjort av
 *   bildmodellen utifrån klubbproduktens mockup. Görs bara när Craft ber om den, en per produkt, och sparas som fil
 *   (samma lagring som scenerna i lib/newwave/occasionScene.ts) med en rad i `poc_scene_photos`.
 * - Innehållspaketet: texter till Instagram, Facebook och nyhetsbrevet (mallar, inga modellanrop), en story, en
 *   A4-affisch med QR-kod till klubbshoppen och produkternas bilder – och ett mejlutkast till klubbens e-post ur
 *   klubbregistret. Sparas som utkast i `poc_content_drafts`. Mejlen skickas aldrig härifrån: Craft laddar ner
 *   paketet, kopierar mejlet och markerar utkastet som skickat.
 * - Varje modellanrop loggas med sin kostnad i `poc_model_calls`, räknad ur svarets tokens med listpriserna
 *   (PRICES i lib/newwave/derby.ts för text, IMAGE_PRICES i lib/newwave/derbyData.ts för bilder).
 *
 * Tabellerna skapas här, idempotent, med `query` ur lib/poc/db.ts. Inga främmande nycklar mot klubbprodukterna: den
 * delen av schemat ägs av kärnan och får ändras utan att innehållet står i vägen.
 */

// ── Tabellerna ──────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS poc_scene_photos (
  club_product_id text PRIMARY KEY,
  club_id text NOT NULL,
  design_id text NOT NULL,
  url text NOT NULL,
  season text NOT NULL,
  place text NOT NULL,
  model text NOT NULL,
  cost_sek numeric(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poc_scene_photos_club ON poc_scene_photos (club_id);

CREATE TABLE IF NOT EXISTS poc_content_drafts (
  id text PRIMARY KEY,
  design_id text NOT NULL,
  design_name text NOT NULL,
  club_id text NOT NULL,
  club_name text NOT NULL,
  season jsonb,
  shop_url text NOT NULL,
  products jsonb NOT NULL,
  texts jsonb NOT NULL,
  mail jsonb NOT NULL,
  status text NOT NULL DEFAULT 'utkast',
  sent_at timestamptz,
  ai jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, club_id)
);
CREATE INDEX IF NOT EXISTS poc_content_drafts_updated ON poc_content_drafts (updated_at DESC);

CREATE TABLE IF NOT EXISTS poc_model_calls (
  id bigserial PRIMARY KEY,
  what text NOT NULL,
  model text NOT NULL,
  ref text,
  ok boolean NOT NULL,
  cost_sek numeric(10, 4) NOT NULL DEFAULT 0,
  usage jsonb,
  error text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poc_model_calls_what ON poc_model_calls (what, at DESC);

CREATE TABLE IF NOT EXISTS poc_club_emails (
  club_id text PRIMARY KEY,
  emails jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const g = globalThis as unknown as { pocContentSchema?: { sql: string; ready: Promise<void> } };

/** Skapar tabellerna en gång per process, med ett eget lås i databasen. Ändras schemat i dev körs det igen. */
function ready(): Promise<void> {
  if (g.pocContentSchema?.sql !== SCHEMA) {
    const run = tx(async (db) => {
      await query("SELECT pg_advisory_xact_lock(4711005)", [], db);
      await query(SCHEMA, [], db);
    });
    g.pocContentSchema = { sql: SCHEMA, ready: run };
    run.catch(() => {
      if (g.pocContentSchema?.ready === run) g.pocContentSchema = undefined;
    });
  }
  return g.pocContentSchema!.ready;
}

type Row = Record<string, unknown>;

async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  await ready();
  return query(sql, params);
}

/** Ett fel med svaret som routen ska ge. */
export class ContentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ── Kostnaderna ─────────────────────────────────────────────────────────────

/**
 * Typiska tokens för en miljöbild i 1024 × 1536, uppmätta: plagget ger bildmodellen en referensbild (mockupen),
 * halsduken två (ändarna som de hänger och hela halsduken). Utdata är lika stor för båda.
 */
const SCENE_USAGE: Record<ProductKind, ImageUsage> = {
  plagg: IMAGE_USAGE_TYPICAL,
  halsduk: { input_tokens: 2829, output_tokens: 343, input_tokens_details: { text_tokens: 781, image_tokens: 2048 } },
};

/** Uppskattat pris för en miljöbild med listpriset: cirka 0,21 kr för ett plagg och 0,31 kr för halsduken. */
export const sceneSek = (kind: ProductKind) => imageCostSek(SCENE_USAGE[kind] ?? SCENE_USAGE.plagg)!;

/** Vad en miljöbild brukar kosta, per slag. */
export type SceneEstimates = Record<ProductKind, number>;
export const SCENE_ESTIMATES: SceneEstimates = { plagg: sceneSek("plagg"), halsduk: sceneSek("halsduk") };

/**
 * Vad en miljöbild brukar kosta, per slag: snittet av de senaste tio bilderna (räknat ur deras tokens), annars
 * uppskattningen med listpriset. Följer med om bildmodellen eller kvaliteten byts (OPENAI_IMAGE_MODEL,
 * OPENAI_IMAGE_QUALITY).
 */
export async function sceneEstimates(): Promise<SceneEstimates> {
  const rows = await q(
    `SELECT kind, usage, cost_sek FROM (
       SELECT cp.kind, m.usage, m.cost_sek, row_number() OVER (PARTITION BY cp.kind ORDER BY m.at DESC) AS n
       FROM poc_model_calls m JOIN club_products cp ON cp.id = m.ref WHERE m.what = 'miljobild' AND m.ok
     ) t WHERE n <= 10`,
  );
  const out = { ...SCENE_ESTIMATES };
  for (const kind of Object.keys(out) as ProductKind[]) {
    const costs = rows.filter((r) => r.kind === kind).map((r) => imageCostSek(r.usage as ImageUsage) ?? Number(r.cost_sek));
    if (costs.length) out[kind] = costs.reduce((a, b) => a + b, 0) / costs.length;
  }
  return out;
}

/** Den ungefärliga kostnaden för produkten (artikelnumret avgör om det är ett plagg eller halsduken). */
export const sceneSekFor = (estimates: SceneEstimates, sku: string) => estimates[catalogProduct(sku)?.kind ?? "plagg"] ?? estimates.plagg;

/** Snittet för flera produkter, för "Skapa för alla". */
export const sceneSekForAll = (estimates: SceneEstimates, skus: string[]) => (skus.length ? skus.reduce((s, sku) => s + sceneSekFor(estimates, sku), 0) / skus.length : estimates.plagg);

/** Textmodellen för "Skriv om med AI". */
export const REWRITE_MODEL = "gpt-5-mini";
/** Ungefärligt pris för en omskrivning: cirka 1 500 tokens in och 1 500 ut med gpt-5-mini. */
export const REWRITE_SEK_ESTIMATE = costSek(REWRITE_MODEL, { calls: 1, input: 1500, cached: 0, output: 1500 });

type CallKind = "miljobild" | "text";

async function logCall(c: { what: CallKind; model: string; ref: string; ok: boolean; costSek: number; usage?: unknown; error?: string }) {
  console.info(`poc/content ${c.what} ${c.model} ${c.ref}: ${c.ok ? `${c.costSek.toFixed(2)} kr` : `misslyckades (${c.error})`}`);
  await q("INSERT INTO poc_model_calls (what, model, ref, ok, cost_sek, usage, error) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    c.what,
    c.model,
    c.ref,
    c.ok,
    c.costSek,
    c.usage == null ? null : JSON.stringify(c.usage),
    c.error ?? null,
  ]).catch((e) => console.error("poc/content kostnadsloggen", e instanceof Error ? e.message : e));
}

/** Ett tal ur `usage` i SQL, eller NULL om det saknas eller inte är ett tal. */
const usageNum = (path: string) => `CASE WHEN jsonb_typeof(usage${path}) = 'number' THEN (usage${path})::text::numeric END`;

/**
 * Modellanropen hittills: antal och kostnad per slag. Miljöbildernas kostnad räknas ur deras tokens, även för de
 * första bilderna, som sparades med en fast uppskattning på 4 kr styck. Priset är linjärt i tokens, så summan av
 * tokens ger samma kostnad som summan av bilderna.
 */
export async function modelCosts(): Promise<Record<CallKind, { calls: number; costSek: number }>> {
  const [rows, [img]] = await Promise.all([
    q("SELECT what, count(*)::int AS n, coalesce(sum(cost_sek), 0)::float AS sek FROM poc_model_calls WHERE ok GROUP BY what"),
    q(
      `SELECT coalesce(sum(${usageNum("->'input_tokens'")}), 0)::float AS input,
         coalesce(sum(${usageNum("->'input_tokens_details'->'text_tokens'")}), 0)::float AS text,
         coalesce(sum(${usageNum("->'output_tokens'")}), 0)::float AS output,
         count(*) FILTER (WHERE ${usageNum("->'input_tokens'")} IS NOT NULL OR ${usageNum("->'output_tokens'")} IS NOT NULL)::int AS counted,
         coalesce(sum(cost_sek) FILTER (WHERE ${usageNum("->'input_tokens'")} IS NULL AND ${usageNum("->'output_tokens'")} IS NULL), 0)::float AS sek_rest
       FROM poc_model_calls WHERE ok AND what = 'miljobild'`,
    ),
  ]);
  const of = (w: CallKind) => {
    const r = rows.find((x) => x.what === w);
    return { calls: Number(r?.n ?? 0), costSek: Number(r?.sek ?? 0) };
  };
  const scenes = of("miljobild");
  if (img && Number(img.counted)) {
    const counted = imageCostSek({ input_tokens: Number(img.input), output_tokens: Number(img.output), input_tokens_details: { text_tokens: Number(img.text) } }) ?? 0;
    scenes.costSek = counted + Number(img.sek_rest);
  }
  return { miljobild: scenes, text: of("text") };
}

async function callsLastHour(what: CallKind) {
  const [r] = await q("SELECT count(*)::int AS n FROM poc_model_calls WHERE what = $1 AND at > now() - interval '1 hour'", [what]);
  return Number(r?.n ?? 0);
}

// ── Bilder från sajten själv ────────────────────────────────────────────────

/** Varifrån mockuperna hämtas: serverns egen adress och anropets cookies (demots lösenord och Crafts session). */
export type FetchCtx = { origin: string; cookie: string };
export const fetchCtx = (req: Request): FetchCtx => ({ origin: internalOrigin(req), cookie: req.headers.get("cookie") ?? "" });

/** Sajtens publika adress för länkarna till klubbshoppen: den fasta domänen i produktion, annars adressen anropet kom till. */
export const shopOrigin = (req: Request) => (process.env.NODE_ENV === "production" ? SITE : publicOrigin(req));

const FILE_URL = /^\/api\/v1\/files\/([0-9a-f-]{36}\.(?:png|jpg))$/;

/** En bild som sajten själv serverar: sparade filer läses från disk, mockuperna hämtas från sin route. */
export async function fetchImage(url: string, ctx: FetchCtx): Promise<Buffer | null> {
  const file = FILE_URL.exec(url);
  if (file) return (await loadFile(file[1]))?.data ?? null;
  if (!url.startsWith("/api/") || url.startsWith("//")) return null;
  try {
    const res = await fetch(`${ctx.origin}${url}`, { headers: ctx.cookie ? { cookie: ctx.cookie } : {}, signal: AbortSignal.timeout(90_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("poc/content bild", url.slice(0, 120), e instanceof Error ? e.message : e);
    return null;
  }
}

const fileExists = async (url: string) => {
  const file = FILE_URL.exec(url);
  return Boolean(file && (await loadFile(file[1])));
};

// ── Säsongen ────────────────────────────────────────────────────────────────

/** Säsongen innehållet görs för (se lib/poc/seasons.ts): årstiden styr miljöbilden, texterna får säsongens ord. */
export type ContentSeason = { id: string; label: string; nature: Season; hook: string; line: string };

/** Ett datum mitt i årstiden, för fotots ljus, mark och kläder. */
const NATURE_DATE: Record<Season, string> = { vinter: "2026-01-20", vår: "2026-04-20", sommar: "2026-07-01", höst: "2026-10-15" };

// ── Miljöbilden ─────────────────────────────────────────────────────────────

/** Så många miljöbilder får göras per timme, för alla tillsammans (POC_MILJOBILD_PER_HOUR). */
export const scenesPerHour = () => envInt("POC_MILJOBILD_PER_HOUR", 30);

/** Miljöbilderna som finns, per klubbprodukt. */
export async function scenePhotos(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await q("SELECT club_product_id, url FROM poc_scene_photos WHERE club_product_id = ANY($1)", [ids]);
  return new Map(rows.map((r) => [r.club_product_id as string, r.url as string]));
}

/** Hur många miljöbilder som går att göra den här timmen. */
export async function scenesLeft() {
  return Math.max(0, scenesPerHour() - (await callsLastHour("miljobild")) - making.size);
}

/** Plaggets namn på engelska, som bildmodellen beställs på. */
function garmentWord(name: string) {
  const n = name.toLocaleLowerCase("sv-SE");
  const pairs: [RegExp, string][] = [
    [/t-?shirt|tee/, "T-shirt"],
    [/hoodie|luvtröja/, "hoodie"],
    [/sweat|college/, "sweatshirt"],
    [/träningsjacka/, "training jacket"],
    [/jacka/, "jacket"],
    [/väst/, "vest"],
    [/mössa/, "beanie"],
    [/keps/, "cap"],
    [/jogging|byxor/, "jogging trousers"],
    [/piké/, "polo shirt"],
  ];
  return pairs.find(([re]) => re.test(n))?.[1] ?? "garment";
}

/** Hur personen bär plagget, så att trycket syns. `cold` när det är kallt där fotot tas. */
function wearing(word: string, cold: boolean, winter: boolean) {
  const open = "with a plain dark jacket hanging open over it so that the whole print stays visible";
  if (word === "beanie" || word === "cap") return `wears the ${word} from Image 1 on the head, with a plain dark jacket`;
  if (word === "jacket" || word === "training jacket" || word === "vest") return `wears the ${word} from Image 1 zipped up as the outer layer, over ordinary plain clothes`;
  if (word === "jogging trousers") return "wears the jogging trousers from Image 1 with a plain dark top; the photo shows the whole person from head to shoes";
  if (word === "hoodie" || word === "sweatshirt") return `wears the ${word} from Image 1 as the outer layer${winter ? `, ${open}` : ""}`;
  return `wears the ${word} from Image 1${cold ? `, ${open}` : ""}`;
}

/** Fotostilen från halsdukens fotostudio (lib/scarfPhoto.ts), med plagget i stället för halsduken. */
const GARMENT_SNAPSHOT = SNAPSHOT.replace(/It must look like a real photograph of a real knitted jacquard scarf[^.]*\./, "It must look like a real photograph of a real printed garment, with real fabric texture and natural folds.");

/** Halsdukens förhandsbild ligger snett (32 grader) på ljus botten; rätad och beskuren blir den underlaget som halsdukens fotostudio vill ha. */
async function flatScarf(preview: Buffer) {
  const straight = await sharp(preview).rotate(32, { background: "#F2F2F0" }).png().toBuffer();
  return sharp(straight).trim({ background: "#F2F2F0", threshold: 14 }).png().toBuffer();
}

type Shot = { files: { buf: Buffer; name: string; type: string }[]; prompt: string; place: string };

async function shotFor(product: ClubProduct, club: PocClub, mockup: Buffer, nature: Season | null): Promise<Shot> {
  const scene = settingOf({ sport: club.sport, date: nature ? new Date(NATURE_DATE[nature]) : new Date() });
  if (product.kind === "halsduk") {
    // Samma beställning som halsdukens fotostudio: ändarna som de hänger, hela halsduken liggande och hur den bärs.
    const near = scene.at("entrance");
    const { hanging, flat } = await scarfReferences(await flatScarf(mockup));
    const [who] = people([near.wear]);
    return {
      files: [
        { buf: hanging, name: "hanging-ends.png", type: "image/png" },
        { buf: flat, name: "scarf.png", type: "image/png" },
      ],
      prompt: [SNAPSHOT, references(club.name), `Photo from the hips up, facing the camera: ${who}, ${near.where} The person wears the exact knitted supporter scarf from the reference images.`, worn(), FAITHFUL, UPRIGHT].join("\n"),
      place: `${scene.place}/${scene.season}`,
    };
  }
  const at = scene.at("stand");
  const word = garmentWord(catalogProduct(product.sku)?.name ?? product.title);
  // Ansiktet ur fotostudions personer; kläderna står plagget för.
  const face = people([at.wear])[0].split(", in ")[0];
  const cold = at.wear === "vinter" || at.wear === "höst" || at.wear === "vår";
  return {
    files: [{ buf: await sharp(mockup).jpeg({ quality: 92 }).toBuffer(), name: "garment.jpg", type: "image/jpeg" }],
    prompt: [
      GARMENT_SNAPSHOT,
      `Image 1 is the product photo of a custom ${word} for the sports club ${club.name}: the garment's colour and its print exactly as they are made.`,
      `Photo from the hips up, facing the camera: ${face}, ${at.where} The person ${wearing(word, cold, at.wear === "vinter")}.`,
      "The print (strict): exactly the same print as in Image 1 – the same letters in the same order, the same crest, the same colours, the same size and the same place on the garment. Do NOT add, move, repeat or remove any text, crest or logo, and the garment carries no other text or logos. The garment has the same colour and cut as in Image 1.",
      "Realistic fabric texture. Fictional generic person, no other brand logos.",
      "Vertical picture; the whole print is clearly visible, sharp and readable.",
    ].join("\n"),
    place: `${scene.place}/${scene.season}`,
  };
}

const making = new Map<string, Promise<{ url: string; cached: boolean; costSek: number }>>();

/**
 * Miljöbilden för en klubbprodukt. Finns den redan ges den sparade, utan nytt anrop. Annars gör bildmodellen den
 * utifrån produktens mockup – en bild, utan granskning eller omtagning, så att den kostar så lite som möjligt.
 * Kastar ContentError med status 404, 429, 502 eller 503.
 */
export async function scenePhoto(clubProductId: string, opts: { ctx: FetchCtx; season?: ContentSeason | null }): Promise<{ url: string; cached: boolean; costSek: number }> {
  const [hit] = await q("SELECT url FROM poc_scene_photos WHERE club_product_id = $1", [clubProductId]);
  if (hit && (await fileExists(hit.url as string))) return { url: hit.url as string, cached: true, costSek: 0 };
  const busy = making.get(clubProductId);
  if (busy) return busy;
  if (!hasOpenAIKey()) throw new ContentError("OpenAI-nyckel saknas på servern.", 503);
  const product = await getClubProduct(clubProductId);
  if (!product) throw new ContentError("Produkten finns inte.", 404);
  if ((await scenesLeft()) <= 0) throw new ContentError(`Gränsen på ${scenesPerHour()} miljöbilder i timmen är nådd. Försök igen om en stund.`, 429);

  const job = (async () => {
    const club = await pocClub(product.clubId);
    if (!club) throw new ContentError("Klubben finns inte i registret.", 404);
    const mockup = await fetchImage(product.mockupUrl, opts.ctx);
    if (!mockup) throw new ContentError("Produktens mockup gick inte att hämta.", 502);
    const shot = await shotFor(product, club, mockup, opts.season?.nature ?? null);
    let b64: string | undefined;
    let usage: unknown;
    try {
      const res = await openai().images.edit({
        model: IMAGE_MODEL,
        image: await Promise.all(shot.files.map((f) => toFile(f.buf, f.name, { type: f.type }))),
        prompt: shot.prompt,
        size: "1024x1536",
        quality: IMAGE_QUALITY,
        output_format: "jpeg",
      });
      b64 = res.data?.[0]?.b64_json;
      usage = res.usage;
      if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
    } catch (e) {
      // Ett svar utan bild kan ändå ha kostat: då finns tokens i svaret.
      await logCall({ what: "miljobild", model: IMAGE_MODEL, ref: clubProductId, ok: false, costSek: imageCostSek(usage as ImageUsage) ?? 0, usage, error: errorMessage(e) });
      throw new ContentError("Bildmodellen kunde inte göra miljöbilden just nu.", 502);
    }
    // Kostnaden ur svarets tokens; saknas de används uppskattningen.
    const cost = imageCostSek(usage as ImageUsage) ?? sceneSek(product.kind);
    const jpg = await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const { url } = await saveFile(jpg, "jpg");
    await q(
      `INSERT INTO poc_scene_photos (club_product_id, club_id, design_id, url, season, place, model, cost_sek) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (club_product_id) DO UPDATE SET url = EXCLUDED.url, season = EXCLUDED.season, place = EXCLUDED.place, model = EXCLUDED.model, cost_sek = EXCLUDED.cost_sek, created_at = now()`,
      [product.id, product.clubId, product.designId, url, opts.season?.id ?? "", shot.place, `${IMAGE_MODEL}/${IMAGE_QUALITY}`, cost],
    );
    await logCall({ what: "miljobild", model: `${IMAGE_MODEL}/${IMAGE_QUALITY}`, ref: clubProductId, ok: true, costSek: cost, usage });
    return { url, cached: false, costSek: cost };
  })();
  making.set(clubProductId, job);
  try {
    return await job;
  } finally {
    making.delete(clubProductId);
  }
}

// ── Texterna ────────────────────────────────────────────────────────────────

export type DraftProduct = { id: string; sku: string; title: string; name: string; priceSek: number; mockupUrl: string };
export type ContentTexts = { instagram: string; facebook: string; newsletter: { subject: string; body: string } };
export type ContentMail = { to: string[]; subject: string; body: string };
export type DraftStatus = "utkast" | "skickat";

export type ContentDraft = {
  id: string;
  designId: string;
  designName: string;
  clubId: string;
  clubName: string;
  season: ContentSeason | null;
  shopUrl: string;
  products: DraftProduct[];
  texts: ContentTexts;
  mail: ContentMail;
  status: DraftStatus;
  sentAt?: string;
  /** Satt när texterna skrivits om av språkmodellen. */
  ai?: { model: string; costSek: number; at: string };
  createdAt: string;
  updatedAt: string;
};

/** Produktens namn i löptext: "t-shirt", "hoodie", "stickad klubbhalsduk". */
const inText = (name: string) => {
  const n = name.replace(/^Craft\s+/i, "").trim();
  return n.charAt(0).toLocaleLowerCase("sv-SE") + n.slice(1);
};
const capital = (s: string) => s.charAt(0).toLocaleUpperCase("sv-SE") + s.slice(1);
const and = (list: string[]) => (list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} och ${list.at(-1)}`);
const kr = (n: number) => `${new Intl.NumberFormat("sv-SE").format(n)} kr`;
const priced = (products: DraftProduct[]) => and(products.map((p) => `${p.name} (${kr(p.priceSek)})`));
const tag = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("sv-SE");

/**
 * Föreningens egna adresser (info@, kansli@ … på klubbens domän, se lib/poc/clubEmail.ts), som mejlutkasten går till.
 * Visas bara för Craft. I produktionen ligger de i databasen (`poc_club_emails`, POST /api/v1/craft/klubbmejl), eftersom
 * registrets paket är publikt och saknar kontaktuppgifter; på datorn finns de också i skrapningens filer.
 */
export async function clubEmails(club: { id: string; name: string }): Promise<string[]> {
  if (!/^[a-z0-9-]{1,80}$/.test(club.id)) return [];
  const [stored] = await q("SELECT emails FROM poc_club_emails WHERE club_id = $1", [club.id]);
  if (stored && Array.isArray(stored.emails)) return stored.emails as string[];
  const site = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${club.id}.json`), "utf8").catch(() => "null")) as { emails?: unknown; host?: string } | null;
  return roleAddresses({ name: club.name, host: site?.host }, Array.isArray(site?.emails) ? site.emails : []);
}

/**
 * Sparar föreningsadresserna (redan valda med roleAddresses) och lägger dem i de utkast till klubben som saknar
 * mottagare. En klubb utan adresser tas bort ur tabellen.
 */
export async function saveClubEmails(entries: { clubId: string; emails: string[] }[]): Promise<{ saved: number; removed: number; draftsUpdated: number }> {
  const keep = entries.filter((e) => e.emails.length);
  const drop = entries.filter((e) => !e.emails.length).map((e) => e.clubId);
  if (keep.length)
    await q(
      `INSERT INTO poc_club_emails (club_id, emails) SELECT club_id, emails::jsonb FROM unnest($1::text[], $2::text[]) AS t(club_id, emails)
       ON CONFLICT (club_id) DO UPDATE SET emails = EXCLUDED.emails, updated_at = now()`,
      [keep.map((e) => e.clubId), keep.map((e) => JSON.stringify(e.emails))],
    );
  if (drop.length) await q("DELETE FROM poc_club_emails WHERE club_id = ANY($1::text[])", [drop]);
  const updated = keep.length
    ? await q(
        `UPDATE poc_content_drafts d SET mail = jsonb_set(d.mail, '{to}', e.emails), updated_at = now()
         FROM poc_club_emails e
         WHERE d.club_id = e.club_id AND e.club_id = ANY($1::text[]) AND d.status = 'utkast' AND jsonb_array_length(d.mail->'to') = 0
         RETURNING d.id`,
        [keep.map((e) => e.clubId)],
      )
    : [];
  return { saved: keep.length, removed: drop.length, draftsUpdated: updated.length };
}

/** Hur många klubbar som har föreningsadresser i databasen. */
export async function clubEmailCount(): Promise<number> {
  const [r] = await q("SELECT count(*)::int AS n FROM poc_club_emails");
  return Number(r?.n ?? 0);
}

async function clubWebsite(clubId: string): Promise<string> {
  const site = JSON.parse(await readFile(path.join(CLUBS_DIR, "sites", `${clubId}.json`), "utf8").catch(() => "null")) as { url?: unknown } | null;
  return typeof site?.url === "string" && /^https?:\/\/[^\s"<>]+$/i.test(site.url) ? site.url : "";
}

/** Texterna till klubbens kanaler, ur mallar – samma indata ger samma texter, utan modellanrop. */
export function contentTexts(input: { club: string; sport: string; products: DraftProduct[]; shopUrl: string; season: ContentSeason | null }): ContentTexts {
  const { club, products, shopUrl, season } = input;
  const names = and(products.map((p) => p.name));
  const line = season?.line ?? "Gjorda för läktaren, träningen och vardagen.";
  const sport = tag(input.sport.split(/[\s,/]+/)[0] ?? "");
  const tags = [`#${tag(club)}`, "#craft", ...(sport ? [`#${sport}`] : []), "#klubbkänsla", "#intersport"].join(" ");
  const instagram = [
    `${season ? `${season.hook}. ` : ""}Craft × ${club} är här!`,
    `${capital(names)} i klubbens färger och med vårt märke. ${line}`,
    `Allt görs på beställning, och varje köp stöttar ${club}. Handla i klubbshoppen – länken finns i bion.`,
    tags,
  ].join("\n\n");
  const facebook = [
    `${season ? `${season.hook}! ` : ""}Nu finns ${genitive(club)} egna kläder från Craft i vår klubbshop hos Intersport: ${names}.`,
    `${line} Allt görs på beställning i klubbens färger och med klubbens märke, och varje köp stöttar föreningen.`,
    `Handla här: ${shopUrl}`,
  ].join("\n\n");
  const subject = `${season ? `${season.label}: ` : ""}Craft × ${club} finns i klubbshoppen`;
  const body = [
    "Hej!",
    `Nu finns ${genitive(club)} egna kläder från Craft i klubbshoppen hos Intersport: ${priced(products)}.`,
    `${line} Allt trycks eller stickas när du beställer, i klubbens färger och med klubbens märke – och varje köp stöttar ${club}.`,
    `Handla här: ${shopUrl}`,
    `Hälsningar\n${club}`,
  ].join("\n\n");
  return { instagram, facebook, newsletter: { subject, body } };
}

/** Mejlet från Craft till klubben. Det skickas aldrig härifrån – Craft kopierar det och bifogar innehållspaketet. */
export function contentMail(input: { club: string; to: string[]; products: DraftProduct[]; shopUrl: string; season: ContentSeason | null; design: string }): ContentMail {
  const { club, products, shopUrl, season } = input;
  return {
    to: input.to,
    subject: `Craft × ${club}: er kollektion finns nu i klubbshoppen hos Intersport`,
    body: [
      `Hej ${club}!`,
      `Nu finns Craft × ${club} i er klubbshop hos Intersport: ${priced(products)}. Allt har ert namn, era färger och ert märke, och görs först när någon beställer – ni behöver inte hålla något lager.`,
      `Er klubbshop: ${shopUrl}`,
      `Vi har gjort ett innehållspaket som ni gärna får använda${season ? ` nu inför ${season.label.toLocaleLowerCase("sv-SE")}` : ""}: texter till Instagram, Facebook och nyhetsbrevet, en story i rätt format, en affisch med QR-kod till shoppen att sätta upp i klubbstugan och bilder på produkterna. Det ligger som bilaga.`,
      "Hör av er om ni vill ändra något.",
      "Hälsningar\nCraft",
    ].join("\n\n"),
  };
}

// ── Utkasten ────────────────────────────────────────────────────────────────

const toDraft = (r: Row): ContentDraft => ({
  id: r.id as string,
  designId: r.design_id as string,
  designName: r.design_name as string,
  clubId: r.club_id as string,
  clubName: r.club_name as string,
  season: (r.season as ContentSeason | null) ?? null,
  shopUrl: r.shop_url as string,
  products: r.products as DraftProduct[],
  texts: r.texts as ContentTexts,
  mail: r.mail as ContentMail,
  status: r.status as DraftStatus,
  sentAt: iso(r.sent_at as Date | null),
  ai: (r.ai as ContentDraft["ai"] | null) ?? undefined,
  createdAt: iso(r.created_at as Date)!,
  updatedAt: iso(r.updated_at as Date)!,
});

/** Högst så här många klubbar per anrop – samma omgångar som klubbkollektionen publicerar i. */
export const DRAFTS_MAX_CLUBS = 250;

/**
 * Ett innehållspaket med mejlutkast per klubb, för designens publicerade produkter. `origin` är sajtens publika adress
 * (länken till klubbshoppen). Finns utkastet redan uppdateras det: produkterna och länken alltid, mejlet bara om det
 * inte är skickat, texterna bara om de inte skrivits om med AI. Klubbar utan publicerade produkter hoppas över.
 */
export async function createDrafts(designId: string, clubIds: string[], opts: { origin: string; season?: ContentSeason | null }) {
  const ids = [...new Set(clubIds)].slice(0, DRAFTS_MAX_CLUBS);
  const design = await getDesign(designId);
  if (!design) throw new ContentError("Designen finns inte.", 404);
  const wanted = new Set(ids);
  const byClub = new Map<string, ClubProduct[]>();
  for (const p of await listClubProducts({ designId, status: "publicerad" })) {
    if (wanted.has(p.clubId)) byClub.set(p.clubId, [...(byClub.get(p.clubId) ?? []), p]);
  }
  const season = opts.season ?? null;
  const rows: { club: PocClub; products: DraftProduct[]; texts: ContentTexts; mail: ContentMail; shopUrl: string }[] = [];
  for (let i = 0; i < ids.length; i += 25) {
    const part = await Promise.all(
      ids.slice(i, i + 25).map(async (clubId) => {
        const list = byClub.get(clubId);
        const club = list?.length ? await pocClub(clubId) : null;
        if (!club || !list) return null;
        // I katalogens ordning: plaggen först och halsduken sist.
        const order = (sku: string) => (pocCatalog().findIndex((c) => c.sku === sku) + 1 || 99) + (catalogProduct(sku)?.kind === "halsduk" ? 100 : 0);
        const products: DraftProduct[] = [...list]
          .sort((a, b) => order(a.sku) - order(b.sku) || a.title.localeCompare(b.title, "sv"))
          .map((p) => ({ id: p.id, sku: p.sku, title: p.title, name: inText(catalogProduct(p.sku)?.name ?? p.title), priceSek: p.priceSek, mockupUrl: p.mockupUrl }));
        const shopUrl = `${opts.origin}${intersportPath(clubId)}`;
        const to = await clubEmails(club);
        return {
          club,
          products,
          shopUrl,
          texts: contentTexts({ club: club.name, sport: club.sport, products, shopUrl, season }),
          mail: contentMail({ club: club.name, to, products, shopUrl, season, design: design.name }),
        };
      }),
    );
    rows.push(...part.filter((r): r is NonNullable<typeof r> => !!r));
  }
  if (!rows.length) return { drafts: 0, clubIds: [] as string[], skipped: ids, missingEmail: 0 };
  await q(
    `INSERT INTO poc_content_drafts (id, design_id, design_name, club_id, club_name, season, shop_url, products, texts, mail)
     SELECT id, $2, $3, club_id, club_name, $4::jsonb, shop_url, products::jsonb, texts::jsonb, mail::jsonb
     FROM unnest($1::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[]) AS t(id, club_id, club_name, shop_url, products, texts, mail)
     ON CONFLICT (design_id, club_id) DO UPDATE SET
       design_name = EXCLUDED.design_name, club_name = EXCLUDED.club_name, season = EXCLUDED.season, shop_url = EXCLUDED.shop_url,
       products = EXCLUDED.products,
       texts = CASE WHEN poc_content_drafts.ai IS NULL THEN EXCLUDED.texts ELSE poc_content_drafts.texts END,
       mail = CASE WHEN poc_content_drafts.status = 'utkast' THEN EXCLUDED.mail ELSE poc_content_drafts.mail END,
       updated_at = now()`,
    [
      rows.map(() => newId("ut")),
      design.id,
      design.name,
      season ? JSON.stringify(season) : null,
      rows.map((r) => r.club.id),
      rows.map((r) => r.club.name),
      rows.map((r) => r.shopUrl),
      rows.map((r) => JSON.stringify(r.products)),
      rows.map((r) => JSON.stringify(r.texts)),
      rows.map((r) => JSON.stringify(r.mail)),
    ],
  );
  const done = new Set(rows.map((r) => r.club.id));
  return { drafts: rows.length, clubIds: [...done], skipped: ids.filter((id) => !done.has(id)), missingEmail: rows.filter((r) => !r.mail.to.length).length };
}

export async function listDrafts(f: { designId?: string; status?: DraftStatus; limit?: number } = {}): Promise<ContentDraft[]> {
  const rows = await q(
    `SELECT * FROM poc_content_drafts WHERE ($1::text IS NULL OR design_id = $1) AND ($2::text IS NULL OR status = $2)
     ORDER BY updated_at DESC, club_name LIMIT $3`,
    [f.designId ?? null, f.status ?? null, Math.min(Math.max(f.limit ?? 500, 1), 5000)],
  );
  return rows.map(toDraft);
}

/** Utkasten per design: hur många, hur många skickade och hur många utan e-post. */
export async function draftDesigns(): Promise<{ designId: string; designName: string; drafts: number; sent: number; noEmail: number; updatedAt: string }[]> {
  const rows = await q(
    `SELECT design_id, max(design_name) AS design_name, count(*)::int AS n, count(*) FILTER (WHERE status = 'skickat')::int AS sent,
       count(*) FILTER (WHERE jsonb_array_length(mail->'to') = 0)::int AS no_email, max(updated_at) AS updated_at
     FROM poc_content_drafts GROUP BY design_id ORDER BY max(updated_at) DESC`,
  );
  return rows.map((r) => ({ designId: r.design_id as string, designName: r.design_name as string, drafts: Number(r.n), sent: Number(r.sent), noEmail: Number(r.no_email), updatedAt: iso(r.updated_at as Date)! }));
}

export async function getDraft(id: string): Promise<ContentDraft | null> {
  const [r] = await q("SELECT * FROM poc_content_drafts WHERE id = $1", [id]);
  return r ? toDraft(r) : null;
}

/** Markerar utkastet som skickat (Craft har skickat mejlet själv), eller som utkast igen. */
export async function setDraftStatus(id: string, status: DraftStatus): Promise<ContentDraft | null> {
  const [r] = await q(`UPDATE poc_content_drafts SET status = $2, sent_at = CASE WHEN $2 = 'skickat' THEN now() ELSE NULL END, updated_at = now() WHERE id = $1 RETURNING *`, [id, status]);
  return r ? toDraft(r) : null;
}

// ── Skriv om med AI (bara på knapptryck) ────────────────────────────────────

const REWRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["instagram", "facebook", "newsletterSubject", "newsletterBody"],
  properties: { instagram: { type: "string" }, facebook: { type: "string" }, newsletterSubject: { type: "string" }, newsletterBody: { type: "string" } },
};

const REWRITER = `Du skriver om texter som en svensk idrottsförening publicerar när föreningens egna kläder från Craft finns i klubbshoppen hos Intersport.
Behåll alla fakta: föreningens namn, produkterna, priserna och länken (exakt som den står). Hitta inte på något nytt – inga rabatter, datum, spelare eller erbjudanden.
Skriv naturlig, varm och kort svenska som en förening skriver själv. Inga emojis. Instagram: högst 600 tecken plus hashtaggarna, utan länk (länken ligger i bion). Facebook: högst 500 tecken, med länken. Nyhetsbrev: en ämnesrad på högst 70 tecken och en kort text med länken.`;

const rewriteLimit = new Map<string, number[]>();

/** Skriver om utkastets texter med gpt-5-mini och loggar kostnaden. Mejlet till klubben rörs inte. */
export async function rewriteDraft(id: string): Promise<{ draft: ContentDraft; costSek: number }> {
  if (!hasOpenAIKey()) throw new ContentError("OpenAI-nyckel saknas på servern.", 503);
  const draft = await getDraft(id);
  if (!draft) throw new ContentError("Utkastet finns inte.", 404);
  const now = Date.now();
  const recent = (rewriteLimit.get("alla") ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= envInt("POC_SKRIV_OM_PER_HOUR", 30)) throw new ContentError("Många texter har skrivits om den senaste timmen. Försök igen om en stund.", 429);
  rewriteLimit.set("alla", [...recent, now]);
  const facts = [
    `Förening: ${draft.clubName}`,
    `Produkter: ${draft.products.map((p) => `${p.name} (${kr(p.priceSek)})`).join(", ")}`,
    `Länk till klubbshoppen: ${draft.shopUrl}`,
    draft.season ? `Säsong: ${draft.season.label} – ${draft.season.line}` : "",
    "",
    `Instagram:\n${draft.texts.instagram}`,
    `Facebook:\n${draft.texts.facebook}`,
    `Nyhetsbrevets ämnesrad: ${draft.texts.newsletter.subject}`,
    `Nyhetsbrevet:\n${draft.texts.newsletter.body}`,
  ].join("\n");
  let out: { instagram: string; facebook: string; newsletterSubject: string; newsletterBody: string };
  let cost = 0;
  try {
    const res = await openai().responses.create({
      model: REWRITE_MODEL,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: REWRITER },
        { role: "user", content: facts },
      ],
      text: { format: { type: "json_schema", name: "klubbtexter", schema: REWRITE_SCHEMA, strict: true } },
    });
    const usage = usageOf(res.usage);
    cost = costSek(REWRITE_MODEL, usage);
    out = JSON.parse(res.output_text);
    await logCall({ what: "text", model: REWRITE_MODEL, ref: id, ok: true, costSek: cost, usage });
  } catch (e) {
    await logCall({ what: "text", model: REWRITE_MODEL, ref: id, ok: false, costSek: cost, error: errorMessage(e) });
    throw new ContentError("Språkmodellen kunde inte skriva om texterna just nu.", 502);
  }
  // Länken till shoppen ska alltid finnas kvar där den stod.
  const withLink = (text: string) => (text.includes(draft.shopUrl) ? text.trim() : `${text.trim()}\n\nHandla här: ${draft.shopUrl}`);
  const texts: ContentTexts = {
    instagram: out.instagram.trim() || draft.texts.instagram,
    facebook: withLink(out.facebook || draft.texts.facebook),
    newsletter: { subject: out.newsletterSubject.trim().slice(0, 120) || draft.texts.newsletter.subject, body: withLink(out.newsletterBody || draft.texts.newsletter.body) },
  };
  const ai = { model: REWRITE_MODEL, costSek: Math.round(cost * 10000) / 10000, at: new Date().toISOString() };
  const [r] = await q("UPDATE poc_content_drafts SET texts = $2, ai = $3, updated_at = now() WHERE id = $1 RETURNING *", [id, JSON.stringify(texts), JSON.stringify(ai)]);
  return { draft: toDraft(r), costSek: cost };
}

// ── Bilderna: story och affisch ─────────────────────────────────────────────

const HEAD_FONT = "anton.ttf";
const LABEL_FONT = "jockey-one.ttf";
const INK = "#1D1D1F";
const SOFT = "#F3F2EF";

type Line = { d: string; w: number };
type Block = { rows: Line[]; cap: number; step: number; w: number; h: number };

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
const up = (s: string) => s.toLocaleUpperCase("sv-SE");
const uri = (buf: Buffer, type: "png" | "jpeg") => `data:image/${type};base64,${buf.toString("base64")}`;

/** Konturen som SVG-bana (som i lib/scarfMedia.ts): texten ritas ur typsnittsfilen och blir likadan på alla datorer. */
function pathData(commands: PathCommand[]) {
  const r = (v: number) => (Math.round(v * 100) / 100).toString();
  return commands
    .map((c) => {
      if (c.type === "M" || c.type === "L") return `${c.type}${r(c.x)} ${r(c.y)}`;
      if (c.type === "C") return `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
      if (c.type === "Q") return `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`;
      return "Z";
    })
    .join("");
}

function line(font: Font, text: string, size: number, spacing = 0): Line {
  const opts = { letterSpacing: spacing };
  return { d: pathData(font.getPath(text, 0, 0, size, opts).commands), w: Math.max(0, font.getAdvanceWidth(text, size, opts) - spacing * size) };
}

const capOf = (font: Font, size: number) => -font.getPath("H", 0, 0, size).getBoundingBox().y1 || size * 0.7;

/** Texten så stor som får plats på högst `lines` rader inom bredden. */
function fit(font: Font, text: string, o: { width: number; max: number; min: number; lines: number; spacing?: number; leading?: number }): Block {
  const words = text.split(/\s+/).filter(Boolean);
  const build = (size: number) => {
    const rows: string[] = [];
    for (const word of words) {
      const last = rows.at(-1);
      if (last !== undefined && line(font, `${last} ${word}`, size, o.spacing).w <= o.width) rows[rows.length - 1] = `${last} ${word}`;
      else rows.push(word);
    }
    return rows.map((r) => line(font, r, size, o.spacing));
  };
  let size = o.max;
  let rows = build(size);
  while (size > o.min && (rows.length > o.lines || rows.some((r) => r.w > o.width))) {
    size = Math.max(o.min, size - Math.max(2, Math.round(size * 0.04)));
    rows = build(size);
  }
  const cap = capOf(font, size);
  const step = cap * (o.leading ?? 1.32);
  return { rows, cap, step, w: Math.max(...rows.map((r) => r.w), 0), h: cap + step * (rows.length - 1) };
}

function draw(b: Block, x: number, y: number, fill: string, align: "left" | "center" = "left", opacity = 1) {
  return b.rows
    .map((r, i) => `<path d="${r.d}" transform="translate(${n1(align === "center" ? x - r.w / 2 : x)} ${n1(y + b.cap + i * b.step)})" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`)
    .join("");
}

const lum = (hex: string) => {
  const [r, g2, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g2 + 0.114 * b;
};
const onColor = (hex: string) => (lum(hex) < 150 ? "#FFFFFF" : "#111111");

/** Bilden sätts i klubbens mörkaste färg; accenten är en klubbfärg som syns mot den. */
function lookOf(colors: string[]) {
  const sorted = [...colors].sort((a, b) => lum(a) - lum(b));
  const stage = sorted[0] && lum(sorted[0]) < 170 ? sorted[0] : "#111111";
  const accent = colors.find((c) => Math.abs(lum(c) - lum(stage)) > 70) ?? onColor(stage);
  return { stage, onStage: onColor(stage), accent, onAccent: onColor(accent) };
}

async function crestOf(club: PocClub): Promise<Buffer | null> {
  for (const dir of ["logos-hd", "logos"]) {
    const f = await readFile(path.join(CLUBS_DIR, dir, `${club.id}.png`)).catch(() => null);
    if (f) return f;
  }
  return readAsset(club.logo);
}

/** Märket i en ruta som är `h` hög, med klubbens namn bredvid om märket inte redan är brett. */
async function mark(crest: Buffer | null, name: string, label: Font, x: number, y: number, h: number, color: string) {
  let svg = "";
  let w = 0;
  if (crest) {
    const meta = await sharp(crest).metadata();
    const ar = (meta.width || 1) / (meta.height || 1);
    const [cw, ch] = ar > 2.6 ? [h * 2.6, (h * 2.6) / ar] : [h * ar, h];
    const img = uri(await sharp(crest).resize({ width: Math.round(cw * 2), height: Math.round(ch * 2), fit: "inside" }).png().toBuffer(), "png");
    svg += `<image xlink:href="${img}" x="${n1(x)}" y="${n1(y + (h - ch) / 2)}" width="${n1(cw)}" height="${n1(ch)}"/>`;
    w = cw;
    if (ar > 1.7) return svg;
  }
  const size = h * 0.36;
  const r = line(label, up(name), size, 0.06);
  svg += `<path d="${r.d}" transform="translate(${n1(x + w + (w ? h * 0.24 : 0))} ${n1(y + (h + capOf(label, size)) / 2)})" fill="${color}"/>`;
  return svg;
}

/** En bild beskuren till rutan. `top` är hur stor del av överskottet på höjden som skärs bort upptill. */
async function cover(img: Buffer, w: number, h: number, top = 0.5) {
  const [W, H] = [Math.round(w), Math.round(h)];
  const meta = await sharp(img).metadata();
  const scale = Math.max(W / (meta.width || W), H / (meta.height || H));
  const [sw, sh] = [Math.max(W, Math.round((meta.width || W) * scale)), Math.max(H, Math.round((meta.height || H) * scale))];
  const fitted = await sharp(img).resize(sw, sh, { fit: "fill" }).toBuffer();
  return uri(await sharp(fitted).extract({ left: Math.floor((sw - W) / 2), top: Math.round((sh - H) * top), width: W, height: H }).jpeg({ quality: 88 }).toBuffer(), "jpeg");
}

/** Produkterna i rundade kort, centrerade i rutan: en, två i bredd eller två gånger två. */
async function cards(images: Buffer[], box: { x: number; y: number; w: number; h: number }, gap: number, scale: number, id: string) {
  const list = images.slice(0, 4);
  if (!list.length) return "";
  const cols = list.length === 1 ? 1 : 2;
  const rows = list.length <= 2 ? 1 : 2;
  const size = Math.floor(Math.min((box.w - gap * (cols - 1)) / cols, (box.h - gap * (rows - 1)) / rows, list.length === 1 ? box.w * 0.82 : Infinity));
  const total = { w: size * cols + gap * (cols - 1), h: size * rows + gap * (rows - 1) };
  const x0 = box.x + (box.w - total.w) / 2;
  const y0 = box.y + (box.h - total.h) / 2;
  let svg = "";
  for (const [i, img] of list.entries()) {
    // En ensam produkt på sista raden står i mitten.
    const alone = list.length % cols !== 0 && i === list.length - 1;
    const [cx, cy] = [x0 + (i % cols) * (size + gap) + (alone ? (size + gap) / 2 : 0), y0 + Math.floor(i / cols) * (size + gap)];
    const rx = n1(size * 0.07);
    svg += `<clipPath id="${id}${i}"><rect x="${n1(cx)}" y="${n1(cy)}" width="${size}" height="${size}" rx="${rx}"/></clipPath>`;
    svg += `<rect x="${n1(cx)}" y="${n1(cy)}" width="${size}" height="${size}" rx="${rx}" fill="${SOFT}"/>`;
    svg += `<image xlink:href="${await cover(img, size * scale, size * scale)}" x="${n1(cx)}" y="${n1(cy)}" width="${size}" height="${size}" clip-path="url(#${id}${i})"/>`;
    svg += `<rect x="${n1(cx + 0.5)}" y="${n1(cy + 0.5)}" width="${size - 1}" height="${size - 1}" rx="${rx}" fill="none" stroke="#000000" stroke-opacity="0.08"/>`;
  }
  return svg;
}

function qr(link: string, x: number, y: number, size: number) {
  const code = QRCode.create(link, { errorCorrectionLevel: "M" });
  const count = code.modules.size;
  const cell = Math.floor((size * 2) / count) / 2;
  const pad = (size - cell * count) / 2;
  let d = "";
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (code.modules.get(r, c)) d += `M${x + pad + c * cell} ${y + pad + r * cell}h${cell}v${cell}h${-cell}z`;
  return `<path d="${d}" fill="#111111" shape-rendering="crispEdges"/>`;
}

const open = (w: number, h: number, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">`;
const toJpg = (svg: string) => sharp(Buffer.from(svg), { unlimited: true }).flatten({ background: "#FFFFFF" }).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();

/** Adressen som den skrivs ut: utan protokoll och www. */
const linkLabel = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

type MediaAssets = { club: PocClub; crest: Buffer | null; mockups: Buffer[]; scenes: Buffer[]; head: Font; label: Font };

async function mediaAssets(draft: ContentDraft, ctx: FetchCtx): Promise<MediaAssets> {
  const club = (await pocClub(draft.clubId)) ?? { id: draft.clubId, name: draft.clubName, colors: ["#111111", "#FFFFFF"], logo: "", county: "", municipality: "", sport: "", registry: false };
  const scenes = await scenePhotos(draft.products.map((p) => p.id)).catch(() => new Map<string, string>());
  const [crest, mockups, photos, head, label] = await Promise.all([
    crestOf(club).catch(() => null),
    Promise.all(draft.products.map((p) => fetchImage(p.mockupUrl, ctx))),
    Promise.all(draft.products.flatMap((p) => (scenes.get(p.id) ? [fetchImage(scenes.get(p.id)!, ctx)] : []))),
    loadFontFile(HEAD_FONT),
    loadFontFile(LABEL_FONT),
  ]);
  return { club, crest, mockups: mockups.filter((m): m is Buffer => !!m), scenes: photos.filter((m): m is Buffer => !!m), head, label };
}

const STORY = { w: 1080, h: 1920, p: 80, top: 250, bottom: 340 };

/** Storyn, 1080 × 1920: miljöbilden i hela bilden om den finns, annars produkterna på klubbens färg. Inget viktigt i appens knappytor upptill och nedtill. */
async function storyImage(draft: ContentDraft, a: MediaAssets) {
  const { w: W, h: H, p: P, top, bottom } = STORY;
  const look = lookOf(a.club.colors);
  const head = fit(a.head, up(`Craft × ${draft.clubName}`), { width: W - P * 2, max: 132, min: 64, lines: 2 });
  const sub = fit(a.label, draft.season?.hook ?? "Nytt i klubbshoppen hos Intersport", { width: W - P * 2, max: 46, min: 30, lines: 2, leading: 1.45 });
  const cta = fit(a.label, up("Handla i klubbshoppen"), { width: W - P * 2 - 80, max: 34, min: 24, lines: 1, spacing: 0.06 });
  const ctaH = 34 * 1.9;
  const ctaY = H - bottom - ctaH;
  let svg = open(W, H) + `<rect width="${W}" height="${H}" fill="${look.stage}"/>`;
  if (a.scenes[0]) {
    const subY = ctaY - 44 - sub.h;
    const headY = subY - 26 - head.h;
    svg += `<image xlink:href="${await cover(a.scenes[0], W, H, 0.35)}" width="${W}" height="${H}"/>`;
    svg += `<defs><linearGradient id="ner" x1="0" y1="0" x2="0" y2="1"><stop offset="${n1(Math.max(0.3, (headY - 360) / H))}" stop-color="${look.stage}" stop-opacity="0"/><stop offset="${n1((headY - 30) / H)}" stop-color="${look.stage}" stop-opacity="0.92"/><stop offset="1" stop-color="${look.stage}"/></linearGradient><linearGradient id="upp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0.5"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient></defs>`;
    svg += `<rect width="${W}" height="520" fill="url(#upp)"/><rect width="${W}" height="${H}" fill="url(#ner)"/>`;
    svg += await mark(a.crest, draft.clubName, a.label, P, top, 104, "#FFFFFF");
    svg += draw(head, P, headY, look.onStage) + draw(sub, P, subY, look.onStage, "left", 0.9);
  } else {
    svg += await mark(a.crest, draft.clubName, a.label, P, top, 104, look.onStage);
    const headY = top + 104 + 56;
    svg += draw(head, P, headY, look.onStage);
    const subY = headY + head.h + 28;
    svg += draw(sub, P, subY, look.onStage, "left", 0.9);
    const gridY = subY + sub.h + 56;
    svg += await cards(a.mockups, { x: P, y: gridY, w: W - P * 2, h: ctaY - 48 - gridY }, 32, 1.5, "s");
  }
  const pillW = cta.w + 80;
  svg += `<rect x="${P}" y="${ctaY}" width="${n1(pillW)}" height="${n1(ctaH)}" rx="${n1(ctaH / 2)}" fill="${look.accent}"/>` + draw(cta, P + pillW / 2, ctaY + (ctaH - cta.cap) / 2, look.onAccent, "center");
  return toJpg(`${svg}</svg>`);
}

/**
 * Affischen i A4 till klubbstugan: rubriken, produkterna (och miljöbilden om den finns) och en QR-kod till
 * klubbshoppen. Vit botten för en vanlig skrivare. Ritas i halv storlek och görs dubbelt så stor – 2480 × 3508 punkter.
 */
async function posterImage(draft: ContentDraft, a: MediaAssets) {
  const [W, H, P] = [1240, 1754, 84];
  const look = lookOf(a.club.colors);
  const width = W - P * 2;
  let svg = open(W, H, 2) + `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  svg += await mark(a.crest, draft.clubName, a.label, P, 72, 84, INK);
  const head = fit(a.head, up(`Craft × ${draft.clubName}`), { width, max: 132, min: 64, lines: 2 });
  const sub = fit(a.label, draft.season?.line ?? `Klubbens egna kläder från Craft – i klubbens färger och med klubbens märke.`, { width, max: 40, min: 28, lines: 2, leading: 1.45 });
  const headY = 72 + 84 + 56;
  svg += draw(head, P, headY, INK) + draw(sub, P, headY + head.h + 26, "#55555A");
  const textEnd = headY + head.h + 26 + sub.h;

  // Nederst: uppmaningen och adressen till vänster, QR-koden i klubbens färg till höger.
  const zoneH = 420;
  const zoneY = H - P - zoneH;
  const side = 332;
  const left = width - side - 40;
  const call = fit(a.head, up("Handla i klubbshoppen"), { width: left, max: 84, min: 44, lines: 2 });
  const address = linkLabel(draft.shopUrl);
  const where = fit(a.label, address.length <= 44 ? address : "Klubbshoppen hos Intersport", { width: left, max: 34, min: 22, lines: 1 });
  const note = fit(a.label, `Trycks på beställning – varje köp stöttar ${draft.clubName}.`, { width: left, max: 28, min: 20, lines: 2, leading: 1.45 });
  const textH = call.h + 22 + where.h + 18 + note.h;
  const ty = zoneY + (zoneH - textH) / 2;
  svg += draw(call, P, ty, INK) + draw(where, P, ty + call.h + 22, look.stage === "#111111" ? INK : look.stage) + draw(note, P, ty + call.h + 22 + where.h + 18, "#6E6E73");
  const x = W - P - side;
  const box = side - 72;
  const scan = fit(a.label, up("Skanna koden"), { width: box, max: 36, min: 24, lines: 1, spacing: 0.06 });
  svg += `<rect x="${x}" y="${zoneY}" width="${side}" height="${zoneH}" rx="40" fill="${look.stage}"/><rect x="${x + 36}" y="${zoneY + 36}" width="${box}" height="${box}" rx="18" fill="#FFFFFF"/>`;
  svg += qr(draft.shopUrl, x + 36 + 14, zoneY + 36 + 14, box - 28);
  svg += draw(scan, x + side / 2, zoneY + 36 + box + (zoneH - 36 - box - scan.cap) / 2, look.onStage, "center");

  // Mitten: miljöbilden till vänster och produkterna till höger, eller bara produkterna.
  const area = { x: P, y: textEnd + 48, w: width, h: zoneY - 48 - (textEnd + 48) };
  if (a.scenes[0]) {
    const photoW = Math.round(area.w * 0.56);
    svg += `<clipPath id="foto"><rect x="${area.x}" y="${area.y}" width="${photoW}" height="${area.h}" rx="28"/></clipPath>`;
    svg += `<image xlink:href="${await cover(a.scenes[0], photoW * 2, area.h * 2, 0.3)}" x="${area.x}" y="${area.y}" width="${photoW}" height="${area.h}" clip-path="url(#foto)"/>`;
    const rest = { x: area.x + photoW + 28, y: area.y, w: area.w - photoW - 28, h: area.h };
    const list = a.mockups.slice(0, 2);
    const size = Math.min(rest.w, (rest.h - 28 * (list.length - 1)) / Math.max(1, list.length));
    for (const [i, img] of list.entries()) {
      const cy = rest.y + i * (size + 28);
      svg += `<clipPath id="p${i}"><rect x="${n1(rest.x)}" y="${n1(cy)}" width="${n1(size)}" height="${n1(size)}" rx="24"/></clipPath><rect x="${n1(rest.x)}" y="${n1(cy)}" width="${n1(size)}" height="${n1(size)}" rx="24" fill="${SOFT}"/>`;
      svg += `<image xlink:href="${await cover(img, size * 2, size * 2)}" x="${n1(rest.x)}" y="${n1(cy)}" width="${n1(size)}" height="${n1(size)}" clip-path="url(#p${i})"/>`;
    }
  } else {
    svg += await cards(a.mockups, area, 28, 2, "p");
  }
  return toJpg(`${svg}</svg>`);
}

const MEDIA_VERSION = 2;
const MEDIA_DIR = path.join(process.cwd(), ".data", "poc", "innehall");

/** Ritar en bild en gång per innehåll och sparar den på disk. */
async function cached(kind: string, draft: ContentDraft, scenes: string[], make: () => Promise<Buffer>) {
  const key = createHash("sha256")
    .update(JSON.stringify([MEDIA_VERSION, kind, draft.clubId, draft.clubName, draft.season?.id ?? "", draft.shopUrl, draft.products.map((p) => p.mockupUrl), scenes]))
    .digest("hex")
    .slice(0, 40);
  const file = path.join(MEDIA_DIR, `${key}.jpg`);
  const hit = await readFile(file).catch(() => null);
  if (hit) return hit;
  const made = await make();
  await mkdir(MEDIA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}`;
  await writeFile(tmp, made);
  await rename(tmp, file);
  return made;
}

export type MediaKind = "story" | "affisch";

/** Storyn eller affischen för utkastet, som JPG. */
export async function draftImage(draft: ContentDraft, kind: MediaKind, ctx: FetchCtx): Promise<Buffer> {
  const scenes = [...(await scenePhotos(draft.products.map((p) => p.id)).catch(() => new Map<string, string>())).values()];
  return cached(kind, draft, scenes, async () => {
    const a = await mediaAssets(draft, ctx);
    return kind === "story" ? storyImage(draft, a) : posterImage(draft, a);
  });
}

/** Nyhetsbrevet som e-postmall (lib/newwave/newsletterHtml.ts). */
export async function draftNewsletter(draft: ContentDraft): Promise<string> {
  const club = await pocClub(draft.clubId);
  const look = lookOf(club?.colors ?? ["#111111", "#FFFFFF"]);
  return newsletterHtml({
    origin: new URL(draft.shopUrl).origin,
    club: { name: draft.clubName, logo: club?.logo ?? "", website: (await clubWebsite(draft.clubId)) || draft.shopUrl },
    colors: { primary: look.stage, accent: look.accent, onAccent: look.onAccent },
    subject: draft.texts.newsletter.subject,
    body: draft.texts.newsletter.body,
    slogan: draft.season?.hook ?? `Craft × ${draft.clubName}`,
    products: draft.products.map((p) => ({ name: p.title, priceSek: p.priceSek, mockupUrl: p.mockupUrl })),
    shopUrl: draft.shopUrl,
  });
}

/** Mejlet som text att klistra in i e-postprogrammet. */
export const mailText = (m: ContentMail) => `Till: ${m.to.join(", ") || "(e-post saknas i klubbregistret)"}\nÄmne: ${m.subject}\n\n${m.body}\n`;

const slug = (s: string) =>
  s
    .toLocaleLowerCase("sv-SE")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "klubb";

export const zipName = (draft: ContentDraft) => `${slug(draft.clubName)}-craft-${slug(draft.designName)}.zip`;

/** Innehållspaketet som zip: texterna, mejlet, nyhetsbrevet, storyn, affischen och produkternas bilder. */
export async function draftZip(draft: ContentDraft, ctx: FetchCtx): Promise<Buffer> {
  const zip = new JSZip();
  const scenes = await scenePhotos(draft.products.map((p) => p.id)).catch(() => new Map<string, string>());
  const [story, poster, newsletter, mockups, photos] = await Promise.all([
    draftImage(draft, "story", ctx),
    draftImage(draft, "affisch", ctx),
    draftNewsletter(draft),
    Promise.all(draft.products.map((p) => fetchImage(p.mockupUrl, ctx))),
    Promise.all(draft.products.map((p) => (scenes.get(p.id) ? fetchImage(scenes.get(p.id)!, ctx) : null))),
  ]);
  const names = draft.products.map((p) => slug(p.title));
  // Filnamnen utan å, ä och ö: alla zipprogram packar inte upp dem rätt.
  zip.file(
    "las-mig.txt",
    [
      `Innehållspaket: Craft × ${draft.clubName}`,
      "",
      "Texter och bilder att använda när ni berättar om klubbens kläder från Craft. Ändra gärna texterna så att de låter som er.",
      "",
      "instagram.txt – inlägget, med hashtaggar. Lägg upp med bilderna i mappen bilder.",
      "facebook.txt – inlägget, med länken till klubbshoppen.",
      "nyhetsbrev.txt och nyhetsbrev.html – ämnesrad och text, och samma brev som e-postmall.",
      "bilder/story-1080x1920.jpg – till Instagram och Facebook som story. Lägg till en länk till klubbshoppen.",
      "bilder/affisch-A4.jpg – skriv ut i A4 och sätt upp i klubbstugan. QR-koden går till klubbshoppen.",
      "bilder/produkter – produkterna i klubbens färger.",
      ...(photos.some(Boolean) ? ["bilder/miljobilder – produkterna på en person i klubbens miljö."] : []),
      "",
      `Klubbshoppen: ${draft.shopUrl}`,
    ].join("\n"),
  );
  zip.file("instagram.txt", `${draft.texts.instagram}\n`);
  zip.file("facebook.txt", `${draft.texts.facebook}\n`);
  zip.file("nyhetsbrev.txt", `ÄMNESRAD:\n${draft.texts.newsletter.subject}\n\nTEXT:\n${draft.texts.newsletter.body}\n`);
  zip.file("nyhetsbrev.html", newsletter);
  zip.file("mejl-till-klubben.txt", mailText(draft.mail));
  zip.file("bilder/story-1080x1920.jpg", story);
  zip.file("bilder/affisch-A4.jpg", poster);
  mockups.forEach((m, i) => m && zip.file(`bilder/produkter/${String(i + 1).padStart(2, "0")}-${names[i]}.jpg`, m));
  photos.forEach((m, i) => m && zip.file(`bilder/miljobilder/${String(i + 1).padStart(2, "0")}-${names[i]}.jpg`, m));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/** Ett utkast som sidan visar det: med bildernas adresser. */
export const draftUrls = (id: string) => ({
  story: `/api/v1/craft/innehall/${id}/filer/story.jpg`,
  poster: `/api/v1/craft/innehall/${id}/filer/affisch.jpg`,
  zip: `/api/v1/craft/innehall/${id}/filer/paket.zip`,
  newsletter: `/api/v1/craft/innehall/${id}/filer/nyhetsbrev.html`,
});

