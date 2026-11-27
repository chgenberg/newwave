/**
 * Den guidade demon (/newwave/demo): hela flödet steg för steg på de riktiga sidorna, med en knapp som gör det som
 * annars görs för hand – publicera en kollektion, handla i shoppen och föra producenternas jobb framåt. Allt går genom
 * samma funktioner som sidorna och API:erna, så demon visar flödet som det är. Ordrarna märks "Guidad demo".
 */
import { clubProductDrafts } from "./build";
import { catalogProduct, SCARF_SKU, sellable } from "./catalog";
import { createDrafts } from "./content";
import { runHub } from "./hub/outbox";
import { createOrder, customerStatusPath, setJobStatus } from "./orders";
import { getOrderView, insertDesign, listClubProducts, listDesigns, upsertClubProducts } from "./store";
import type { JobStatus, Producer } from "./types";

/** Tre klubbar i samma kommun (Linköping, där Stefan nämnde Linghem) med var sin ordmall: grannklubbar får olika tryck. */
export const DEMO_CLUBS = [
  { id: "linghems-sportklubb", template: "retro-skript", templateName: "Retroskript" },
  { id: "stangebro-united", template: "kapsel", templateName: "Kapseln" },
  { id: "ik-ostria-lambohov", template: "stadion", templateName: "Stadion" },
] as const;

/** Stefans provorder: t-shirt, hoodie och jacka till tryckeriet, och halsduken till stickeriet. */
const DEMO_SKUS = ["craft-t-shirt", "craft-hoodie", "craft-softshelljacka", SCARF_SKU];

const DESIGN_PREFIX = "Guidad demo · ";
export const DEMO_CUSTOMER = { name: "Guidad demo", email: "demo@example.com" };

/** Ordmallsdesignerna för demon; samma designer återanvänds varje gång, så att Crafts lista inte fylls på. */
async function demoDesigns() {
  const existing = await listDesigns();
  const out = [];
  for (const c of DEMO_CLUBS) {
    const name = `${DESIGN_PREFIX}${c.templateName}`;
    const found = existing.find((d) => d.name === name && d.source.type === "ordmall" && d.source.template === c.template);
    out.push({ club: c.id, design: found ?? (await insertDesign({ name, source: { type: "ordmall", template: c.template } })) });
  }
  return out;
}

/** Publicerar provkollektionen i de tre klubbarnas shoppar, med innehållspaket och mejlutkast till varje klubb. */
export async function publishDemo(origin: string) {
  const skus = DEMO_SKUS.filter((s) => sellable(s));
  const pairs = await demoDesigns();
  let published = 0;
  for (const { club, design } of pairs) {
    const drafts = await clubProductDrafts(design, [club], skus);
    published += (await upsertClubProducts(drafts.map((d) => ({ ...d, status: "publicerad" as const })))).length;
    await createDrafts(design.id, [club], { origin, season: null }).catch(() => null);
  }
  return { published, clubIds: pairs.map((p) => p.club), designs: pairs.map((p) => ({ clubId: p.club, designId: p.design.id, name: p.design.name })) };
}

/** Lägger provordern i den första klubbens shop (hämtas i butik) och låter hubben bekräfta den. */
export async function orderDemo() {
  const { id: clubId } = DEMO_CLUBS[0];
  const designs = (await demoDesigns()).filter((p) => p.club === clubId).map((p) => p.design.id);
  const products = (await listClubProducts({ clubId, status: "publicerad" })).filter((p) => designs.includes(p.designId));
  const lines = DEMO_SKUS.flatMap((sku) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return [];
    const sizes = catalogProduct(sku)?.sizes ?? [];
    const size = sizes.includes("M") ? "M" : sizes.length > 1 ? sizes[0] : undefined;
    return [{ clubProductId: p.id, ...(size ? { size } : {}), qty: 1 }];
  });
  if (!lines.length) throw new Error("Publicera provkollektionen först.");
  const { order, token } = await createOrder({ clubId, externalRef: `DEMO-${Date.now()}`, delivery: "butik", customer: { ...DEMO_CUSTOMER, phone: "0700000000" }, lines });
  const hub = await runHub({ all: true }).catch(() => null);
  const view = (await getOrderView(order.id)) ?? order;
  return { orderId: order.id, number: order.number, statusPath: customerStatusPath(order, token), status: view.status, mode: hub?.mode ?? null, jobs: view.jobs.map((j) => ({ producer: j.producer, status: j.status })) };
}

const NEXT: Partial<Record<JobStatus, JobStatus>> = { ny: "accepterad", accepterad: "i produktion", "i produktion": "skickad" };

/** För producentens jobb i ordern ett steg framåt: accepterad, i produktion, skickad (med ett spårningsnummer). */
export async function advanceDemo(orderId: string, producer: Producer) {
  const order = await getOrderView(orderId);
  if (!order) throw new Error("Ordern finns inte.");
  const job = order.jobs.find((j) => j.producer === producer);
  if (!job) throw new Error(`Ordern har inget jobb till ${producer === "tryckeri" ? "tryckeriet" : "stickeriet"} än – hubben har inte bekräftat den.`);
  const next = NEXT[job.status];
  if (!next) return { status: job.status, orderStatus: order.status };
  const tracking = next === "skickad" ? `DEMO${order.number.replace(/\D/g, "")}${producer === "tryckeri" ? "T" : "S"}` : undefined;
  const { job: done, order: after } = await setJobStatus(producer, job.id, { status: next, ...(tracking ? { tracking } : {}) });
  return { status: done.status, orderStatus: after.status };
}

/** Var demons order står: orderns status och varje producents jobb. */
export async function demoStatus(orderId: string) {
  const order = await getOrderView(orderId);
  if (!order) return null;
  return { status: order.status, number: order.number, jobs: order.jobs.map((j) => ({ producer: j.producer, status: j.status })) };
}
