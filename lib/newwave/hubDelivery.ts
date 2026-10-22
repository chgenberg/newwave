import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLUBS } from "@/lib/club";
import { nearestPantone } from "@/lib/pantone";
import { clubScarfPalette } from "@/lib/scarf";
import { readAsset } from "./asset";
import { nwProduct } from "./catalog";
import { CLUB_CASE } from "./clubCase";
import { colorName } from "./colors";
import { knitScarf } from "./knitFile";
import { defaultDesign, type Design, fitDesign, type Placement } from "./marking";
import { fileSlug, isDarkHex, makeJob, type MadeJob, type OutFile } from "./printFiles";
import { mockupJpeg } from "./serverMockup";
import { SITE } from "./site";
import { type Approval, type ApprovalProduct, type Knit, readBrand } from "./store";
import { wordmarkUrl } from "./wordmark/spec";
import { track } from "./wordmark/stats";
import { readData, writeData } from "./workspace";

/**
 * Leveransen till New Waves hubb: när en klubb godkänner material gör vår hubb produktionsfilerna för varje produkt
 * och skickar dem med ett API-anrop. Filerna sparas en gång per innehåll och delas mellan besökarna; listan över
 * leveranser ligger i besökarens arbetsyta.
 */

const ROOT = path.join(process.cwd(), ".data", "hub");
const LIST = "newwave/hub/leveranser.json";
const VERSION = 1;

export type HubFile = Omit<OutFile, "data"> & { bytes: number; sha256: string };
export type HubJob = Omit<MadeJob, "files"> & {
  key: string;
  productId: string;
  product: string;
  color: { hex: string; name: string };
  sku: string;
  position: number;
  priceSek: number;
  mockup: string;
  files: HubFile[];
};
export type HubDelivery = {
  id: string;
  clubId: string;
  club: string;
  approvalId: string;
  title: string;
  occasion: string;
  from?: string;
  approvedAt: string;
  sentAt: string;
  jobs: HubJob[];
};

export const fileUrl = (key: string, name: string) => `/api/v1/newwave/hub/filer/${key}/${encodeURIComponent(name)}`;
export const KEY = /^[0-9a-f]{20}$/;
export const NAME = /^[a-z0-9][a-z0-9._-]*\.(png|svg|dst|bmp|csv|txt|jpg)$/;

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

type Stored = Omit<HubJob, "productId" | "product" | "color" | "sku" | "position" | "priceSek" | "mockup"> & { mockup?: string };

const pending = new Map<string, Promise<Stored>>();

/** Gör filerna en gång per innehåll: samma produkt, design och motiv ger samma mapp. */
function stored(key: string, make: () => Promise<MadeJob & { mockup?: Buffer }>): Promise<Stored> {
  const dir = path.join(ROOT, key);
  const run = async (): Promise<Stored> => {
    const cached = await readFile(path.join(dir, "jobb.json"), "utf8").catch(() => null);
    if (cached) return JSON.parse(cached) as Stored;
    const made = await make();
    await mkdir(dir, { recursive: true });
    const files: HubFile[] = [];
    for (const f of made.files) {
      await writeFile(path.join(dir, f.name), f.data);
      files.push({ name: f.name, label: f.label, role: f.role, format: f.format, spec: f.spec, bytes: f.data.length, sha256: sha(f.data) });
    }
    if (made.mockup) await writeFile(path.join(dir, "mockup.jpg"), made.mockup);
    const job: Stored = { ...made, key, files, mockup: made.mockup ? "mockup.jpg" : undefined };
    await writeFile(path.join(dir, "jobb.json"), JSON.stringify(job, null, 2));
    return job;
  };
  const p = pending.get(key) ?? run().finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

export async function readHubFile(key: string, name: string) {
  if (!KEY.test(key) || !NAME.test(name)) return null;
  return readFile(path.join(ROOT, key, name)).catch(() => null);
}

// --- Från godkännande till jobb ---------------------------------------------------

type Club = { id: string; name: string; palette: string[]; crestColors: string[]; crest: string };

async function clubOf(clubId: string): Promise<Club | null> {
  const c = CLUBS[clubId];
  if (!c) return null;
  const own = (await readBrand(clubId)).palette;
  return { id: c.id, name: c.name, palette: (own ?? c.palette).map((p) => p.hex.toUpperCase()), crestColors: c.crestColors, crest: `/api/v1/brand/${c.id}/${c.brand.crest.farg}` };
}

const sku = (clubId: string, productId: string, approvalId: string, n: number) =>
  ["NW", clubId.replace(/-/g, ""), productId, approvalId, n > 1 ? `T${n}` : ""].filter(Boolean).join("-").toUpperCase();

/** Ett jobb per tryckposition: huvudtrycket, varje extra position och namnen följer med huvudtrycket. */
async function productJobs(club: Club, a: Pick<Approval, "id" | "printFiles" | "previewUrl">, item: ApprovalProduct): Promise<HubJob[]> {
  const p = nwProduct(item.id);
  if (!p) return [];
  const design: Design = item.custom ? fitDesign(p, item.custom.design) : defaultDesign(p);
  const color = item.custom?.color ?? p.garmentHex;
  const dark = isDarkHex(color);
  const logoUrl = design.logo ? (dark ? (design.logoDark ?? design.logo) : design.logo) : a.printFiles ? (dark ? a.printFiles.dark : a.printFiles.light) : (item.printUrl ?? a.previewUrl);
  // Ett ordmärke ritas per tryckposition, så att små tryck (bröst, ärm) får mallens lilla version.
  const artUrlFor = (sizeCm: number) => (design.wordmark ? wordmarkUrl(design.wordmark, club.id, dark ? "dark" : "light", 3543, "png", sizeCm) : logoUrl);
  const spots: Placement[] = [design, ...(design.extra ?? [])].map(({ method, colors, shape, zone, sizeCm }) => ({ method, colors, shape, zone, sizeCm }));
  const arts = await Promise.all(spots.map(async (s) => {
    const url = artUrlFor(s.sizeCm);
    const art = url ? await readAsset(url) : null;
    return art && url ? { url, art } : null;
  }));
  if (arts.some((x) => !x)) return [];
  return Promise.all(
    spots.map(async (placement, i) => {
      const { url: artUrl, art } = arts[i]!;
      const artSha = sha(art);
      const names = i === 0 ? design.names : undefined;
      const base = `${fileSlug(p.name)}${spots.length > 1 ? `-tryck${i + 1}` : ""}`;
      const key = sha(JSON.stringify({ v: VERSION, p: p.id, color, placement, names, artSha, club: club.name, palette: club.palette })).slice(0, 20);
      const job = await stored(key, async () => ({
        ...(await makeJob({ club: club.name, palette: club.palette, product: p, color, placement, names, art, slug: base })),
        mockup: (await mockupJpeg({ ...p, dark }, artUrl, 900, placement.zone)) ?? undefined,
      }));
      return {
        ...job,
        productId: p.id,
        product: `${p.name} ${colorName(color).toLowerCase()}`,
        color: { hex: color, name: colorName(color) },
        sku: sku(club.id, p.id, a.id, i + 1),
        position: i + 1,
        priceSek: item.priceSek,
        mockup: item.mockupUrl || fileUrl(key, job.mockup ?? job.preview),
      };
    }),
  );
}

async function knitJob(club: Club, approvalId: string, knit: Knit, date: string): Promise<HubJob> {
  const yarns = clubScarfPalette({ palette: club.palette.map((hex) => ({ hex })), crestColors: club.crestColors }, []);
  const key = sha(JSON.stringify({ v: VERSION, knit, yarns, crest: club.crest, club: club.name })).slice(0, 20);
  const job = await stored(key, async () => {
    const k = await knitScarf({ club: club.name, front: knit.front, back: knit.back, yarns, crest: await readAsset(club.crest), date });
    const describe: Record<string, Pick<OutFile, "label" | "role" | "format" | "spec">> = {
      "halsduk.bmp": { label: "Stickfil", role: "maskin", format: "BMP", spec: "240 × 1 210 maskor · 8 bitar indexerad · paletten är garnerna" },
      "halsduk.png": { label: "Stickfil, PNG", role: "maskin", format: "PNG", spec: "Samma mönster med palett, förlustfritt" },
      "halsduk-forhandsvisning.png": { label: "Korrektur", role: "korrektur", format: "PNG", spec: "Fram- och baksida i verkliga proportioner" },
      "farger.csv": { label: "Garnlista", role: "data", format: "CSV", spec: "Hex, närmaste Pantone och maskor per garn" },
      "readme.txt": { label: "Läs mig", role: "data", format: "TXT", spec: "Maskin, storlek och hur filen läses" },
    };
    const total = k.counts.reduce((s, n) => s + n, 0);
    return {
      method: "stickning" as const,
      methodLabel: "Jacquardstickning",
      receiver: "Stickeri",
      placement: "Hela halsduken, fram och bak",
      sizeMm: [1350, 180] as [number, number],
      inks: k.palette.map((hex, i) => ({ hex, name: colorName(hex), pantone: nearestPantone(hex).code, detail: `${Math.round(((k.counts[i] ?? 0) / total) * 100)} % av maskorna` })),
      facts: [
        { label: "Storlek", value: "135 × 18 cm utan fransar" },
        { label: "Maskor", value: "240 nålar × 1 210 rader" },
        { label: "Garner", value: `${k.palette.length} av högst 7` },
        { label: "Minsta text", value: `${Math.round(k.minTextMm)} mm hög` },
      ],
      notes: [
        "En pixel är en maska och varje palettfärg är ett garn – filen skalas aldrig.",
        "Kolumn 1–120 är framsidan, 121–240 baksidan, stickad spegelvänd så att texten läses rätt.",
        "Stickeriet skickar en provstickning för godkännande innan produktion.",
      ],
      preview: "halsduk-forhandsvisning.png",
      files: k.files.map((f) => ({ name: f.name, data: f.data, ...describe[f.name] })),
    };
  });
  return {
    ...job,
    productId: "halsduk",
    product: "Halsduk jacquard",
    color: { hex: yarns[0], name: colorName(yarns[0]) },
    sku: sku(club.id, "HALSDUK", approvalId, 1),
    position: 1,
    priceSek: knit.priceSek,
    mockup: fileUrl(key, job.preview),
  };
}

// --- Leveranserna ---------------------------------------------------------------

type Source = Pick<Approval, "id" | "title" | "occasion" | "from" | "printFiles" | "previewUrl" | "products" | "knit"> & { approvedAt: string };

async function build(clubId: string, src: Source): Promise<HubDelivery | null> {
  const club = await clubOf(clubId);
  if (!club) return null;
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(src.approvedAt));
  const jobs = (await Promise.all((src.products ?? []).map((item) => productJobs(club, src, item)))).flat();
  if (src.knit) jobs.push(await knitJob(club, src.id, src.knit, date));
  if (!jobs.length) return null;
  const id = `HUB-${date.replace(/-/g, "")}-${src.id.toUpperCase()}`;
  return { id, clubId, club: club.name, approvalId: src.id, title: src.title, occasion: src.occasion, from: src.from, approvedAt: src.approvedAt, sentAt: src.approvedAt, jobs };
}

const CREST = "/api/v1/brand/asa-if/skold-farg.png";
const screen1 = (zone: string, sizeCm: number): Design => ({ method: "screentryck", colors: 1, shape: "original", zone, sizeCm });

/** Det Åsa IF godkände tidigare i höst, så att New Wave har något att titta på innan nästa godkännande. */
const HISTORY: Source = {
  id: "jul26",
  title: "Julklappar i svart och gult",
  occasion: "Black Friday",
  approvedAt: "2026-10-09T13:20:00+02:00",
  printFiles: { light: CREST, dark: CREST },
  products: [
    { id: "p004", name: "Hoodie svart", priceSek: 599, mockupUrl: "", custom: { design: screen1("brost", 24), color: "#111111" } },
    { id: "p005", name: "Sweatshirt grå", priceSek: 499, mockupUrl: "", custom: { design: { method: "brodyr", colors: 2, shape: "original", zone: "vanster", sizeCm: 9 }, color: "#9A9CA1" } },
    { id: "p021", name: "Termosmugg svart", priceSek: 279, mockupUrl: "" },
    { id: "p022", name: "Mugg vit", priceSek: 179, mockupUrl: "", custom: { design: { method: "sublimering", colors: 4, shape: "original", zone: "front", sizeCm: 8 }, color: "#F4F3EF" } },
    { id: "p038", name: "Presentask svart", priceSek: 599, mockupUrl: "" },
  ],
  knit: { front: "ÅSA IF", back: "SEDAN 1919", priceSek: 199 },
};

/** Veckopaketet som klubbens visning spelar upp. */
const CASE: Source = {
  id: CLUB_CASE.id,
  title: CLUB_CASE.title,
  occasion: CLUB_CASE.occasion,
  approvedAt: CLUB_CASE.approvedAt,
  printFiles: CLUB_CASE.printFiles,
  products: CLUB_CASE.products,
};

export const caseDelivery = () => build("asa-if", CASE);

const seeds = async () => (await Promise.all([CASE, HISTORY].map((s) => build("asa-if", s)))).filter((d): d is HubDelivery => d !== null);

export async function listDeliveries(): Promise<HubDelivery[]> {
  const raw = await readData(LIST).catch(() => null);
  if (raw) {
    try {
      return JSON.parse(raw) as HubDelivery[];
    } catch {}
  }
  return seeds();
}

export const getDelivery = async (id: string) => (await listDeliveries()).find((d) => d.id === id) ?? null;
export const deliveryFor = async (clubId: string, approvalId: string) => (await listDeliveries()).find((d) => d.clubId === clubId && d.approvalId === approvalId) ?? null;

async function save(d: HubDelivery) {
  const list = await listDeliveries();
  await writeData(LIST, JSON.stringify([d, ...list.filter((x) => x.id !== d.id)], null, 2));
  return d;
}

/** Kallas när klubben godkänt: gör filerna och lägger leveransen överst hos New Wave. */
export async function deliverApproval(clubId: string, a: Approval): Promise<HubDelivery | null> {
  const first = !(await deliveryFor(clubId, a.id));
  const d = await build(clubId, { ...a, approvedAt: a.decidedAt ?? new Date().toISOString() });
  if (!d) return null;
  // Ett nytt godkännande bygger om filerna men är ingen ny beställning.
  if (first) for (const p of a.products ?? []) if (p.custom?.design.wordmark) await track(p.custom.design.wordmark.template, "orders");
  return save(d);
}
export const deliveryStats = (d: HubDelivery) => ({
  products: new Set(d.jobs.map((j) => j.productId)).size,
  files: d.jobs.reduce((s, j) => s + j.files.length, 0),
  bytes: d.jobs.reduce((s, j) => s + j.files.reduce((t, f) => t + f.bytes, 0), 0),
  methods: [...new Set(d.jobs.map((j) => j.methodLabel))],
});

/** Anropet som New Waves hubb tar emot: ett jobb per tryckposition med filerna, deras kontrollsummor och specifikationen. */
export function apiPayload(d: HubDelivery) {
  return {
    event: "material.approved",
    delivery: d.id,
    sentAt: d.sentAt,
    source: {
      hub: "Next Wave",
      club: { id: d.clubId, name: d.club },
      approval: { id: d.approvalId, title: d.title, occasion: d.occasion, approvedAt: d.approvedAt, approvedBy: "Kansliet", from: d.from ?? null },
    },
    jobs: d.jobs.map((j, i) => ({
      job: `${d.id}-${String(i + 1).padStart(2, "0")}`,
      sku: j.sku,
      product: { id: j.productId.toUpperCase(), name: j.product, color: j.color, priceSek: j.priceSek },
      decoration: {
        method: j.method,
        position: j.position,
        placement: j.placement,
        widthMm: Math.round(j.sizeMm[0] * 10) / 10,
        heightMm: Math.round(j.sizeMm[1] * 10) / 10,
        colors: j.inks.map((c) => ({ hex: c.hex, pantone: c.pantone })),
      },
      route: j.receiver,
      files: j.files.map((f) => ({ name: f.name, role: f.role, format: f.format, bytes: f.bytes, sha256: f.sha256, url: `${SITE}${fileUrl(j.key, f.name)}` })),
      notes: j.notes,
    })),
  };
}
