/**
 * Den guidade demon (/newwave/demo): kärnan i flödet på en sida, med tre klubbar och tre designer. Craft väljer – eller
 * laddar upp – en design, plattformen gör den till varje klubbs egen och publicerar den i klubbarnas shoppar, en kund
 * handlar, och ordern går till tryckeriet och stickeriet. Allt går genom samma funktioner som de riktiga sidorna och
 * API:erna. Demons ordrar märks "Guidad demo".
 */
import { clubProductDrafts, pocClub } from "./build";
import { catalogProduct, SCARF_SKU, sellable } from "./catalog";
import { runHub } from "./hub/outbox";
import { createOrder, customerStatusPath, ensureJobFiles, setJobStatus } from "./orders";
import { getDesign, getOrderView, insertDesign, listClubProducts, listDesigns, upsertClubProducts } from "./store";
import type { JobStatus, Producer } from "./types";

/** Tre klubbar i samma kommun (Linköping, där Stefan nämnde Linghem). */
export const DEMO_CLUB_IDS = ["linghems-sportklubb", "stangebro-united", "ik-ostria-lambohov"] as const;

/** Tre av ordmallarna: klubbens namn sätts in, i klubbens färger och med klubbens märke. */
export const DEMO_TEMPLATES = [
  { id: "retro-skript", name: "Retroskript" },
  { id: "kapsel", name: "Kapseln" },
  { id: "stadion", name: "Stadion" },
] as const;

/** Stefans provorder: t-shirt, hoodie och jacka till tryckeriet, och halsduken till stickeriet. */
export const DEMO_SKUS = ["craft-t-shirt", "craft-hoodie", "craft-softshelljacka", SCARF_SKU];
export const demoSkus = () => DEMO_SKUS.filter((s) => sellable(s));

const DESIGN_PREFIX = "Guidad demo · ";
const CUSTOMER = { name: "Guidad demo", email: "demo@example.com", phone: "0700000000" };

export class DemoError extends Error {}

export async function demoClubs() {
  const clubs = await Promise.all(DEMO_CLUB_IDS.map((id) => pocClub(id)));
  return clubs.filter((c): c is NonNullable<typeof c> => Boolean(c)).map((c) => ({ id: c.id, name: c.name, municipality: c.municipality, sport: c.sport, colors: c.colors, logo: c.logo }));
}

const isDemoClub = (id: string) => (DEMO_CLUB_IDS as readonly string[]).includes(id);

/** Designen som publiceras: en av demons ordmallar (samma design varje gång), eller en uppladdad fil. */
async function designFor(choice: { template?: string; designId?: string }) {
  if (choice.designId) {
    const d = await getDesign(choice.designId);
    if (!d || d.source.type !== "fil") throw new DemoError("Designen finns inte.");
    return d;
  }
  const t = DEMO_TEMPLATES.find((x) => x.id === choice.template);
  if (!t) throw new DemoError("Välj en av designerna.");
  const name = `${DESIGN_PREFIX}${t.name}`;
  const found = (await listDesigns()).find((d) => d.name === name && d.source.type === "ordmall" && d.source.template === t.id);
  return found ?? (await insertDesign({ name, source: { type: "ordmall", template: t.id } }));
}

/** Publicerar designen i de valda klubbarnas shoppar: samma design, gjord till varje klubbs egen. */
export async function publishDemo(choice: { template?: string; designId?: string }, clubIds: string[]) {
  const ids = clubIds.filter(isDemoClub);
  if (!ids.length) throw new DemoError("Välj minst en klubb.");
  const design = await designFor(choice);
  const drafts = await clubProductDrafts(design, ids, demoSkus());
  const rows = await upsertClubProducts(drafts.map((d) => ({ ...d, status: "publicerad" as const })));
  return {
    designId: design.id,
    clubs: ids.map((id) => ({ clubId: id, products: rows.filter((r) => r.clubId === id).map((r) => ({ id: r.id, title: r.title, sku: r.sku, priceSek: r.priceSek, mockupUrl: r.mockupUrl })) })),
  };
}

/** Lägger provordern i klubbens shop (hämtas i butik) med designens produkter, och låter hubben bekräfta den. */
export async function orderDemo(clubId: string, designId: string) {
  if (!isDemoClub(clubId)) throw new DemoError("Välj en av demons klubbar.");
  const products = (await listClubProducts({ clubId, designId, status: "publicerad" })).filter((p) => DEMO_SKUS.includes(p.sku));
  const lines = DEMO_SKUS.flatMap((sku) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return [];
    const sizes = catalogProduct(sku)?.sizes ?? [];
    const size = sizes.includes("M") ? "M" : sizes.length > 1 ? sizes[0] : undefined;
    return [{ clubProductId: p.id, ...(size ? { size } : {}), qty: 1 }];
  });
  if (!lines.length) throw new DemoError("Publicera designen i klubbens shop först.");
  const { order, token } = await createOrder({ clubId, externalRef: `DEMO-${Date.now()}`, delivery: "butik", customer: CUSTOMER, lines });
  await runHub({ all: true }).catch(() => null);
  return { orderId: order.id, number: order.number, statusPath: customerStatusPath(order, token), ...(await demoStatus(order.id)) };
}

const NEXT: Partial<Record<JobStatus, JobStatus>> = { ny: "accepterad", accepterad: "i produktion", "i produktion": "skickad" };

/** För producentens jobb i ordern ett steg framåt: accepterad, i produktion, skickad (med ett spårningsnummer). */
export async function advanceDemo(orderId: string, producer: Producer) {
  const order = await getOrderView(orderId);
  if (!order) throw new DemoError("Ordern finns inte.");
  const job = order.jobs.find((j) => j.producer === producer);
  if (!job) throw new DemoError("Affärssystemet har inte bekräftat ordern än – vänta någon sekund.");
  const next = NEXT[job.status];
  if (next) await setJobStatus(producer, job.id, { status: next, ...(next === "skickad" ? { tracking: `DEMO${order.number.replace(/\D/g, "")}${producer === "tryckeri" ? "T" : "S"}` } : {}) });
  return demoStatus(orderId);
}

/** Orderns status, affärssystemets ordernummer och varje producents jobb med filerna (som byggs första gången). */
export async function demoStatus(orderId: string) {
  const order = await getOrderView(orderId);
  if (!order) throw new DemoError("Ordern finns inte.");
  const jobs = await Promise.all(order.jobs.map(async (j) => (j.files.length ? j : { ...j, files: (await ensureJobFiles(j.id))?.files ?? [] })));
  return {
    status: order.status,
    erpRef: order.erpRef ?? null,
    lines: order.lines.map((l) => ({ title: l.title, size: l.size ?? null, qty: l.qty, unitSek: l.unitSek, kind: l.kind })),
    totalSek: order.totalSek,
    jobs: jobs.map((j) => ({ producer: j.producer, status: j.status, tracking: j.tracking ?? null, files: j.files.map((f) => ({ name: f.name, label: f.label, url: f.url })) })),
  };
}
