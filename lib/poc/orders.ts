import { createHash } from "node:crypto";
import { z } from "zod";
import { DELIVERY, shipping, type DeliveryId } from "@/components/newwave/clubshop/pricing";
import { keyOk, loginPath, producerKeyOk, roleFromRequest } from "./auth";
import { catalogProduct } from "./catalog";
import { newId, newToken, query, tx, type Db } from "./db";
import type { BuiltFile } from "./build";
import { alert } from "./hub/alert";
import { enqueue, later, lockItem, markSubmitDone, processOutboxItem, requeue, sendSoon, stopItem, type OutboxOutcome } from "./hub/outbox";
import { checkStock, releaseStock, reserveStock, type StockLine } from "./hub/stock";
import type { HubOrderStatusData } from "./hub/types";
import { addEvent, getJob, getOrderView, listClubProducts, type JobView } from "./store";
import { PRODUCER_OF, type ClubProduct, type JobStatus, type NewOrder, type Order, type OrderLine, type OrderStatus, type OrderView, type Producer, type ProductionJob } from "./types";

export { producerKeyOk };

/**
 * Orderflödet: butikens order sparas och läggs i utkorgen mot New Waves hubb (lib/poc/hub/outbox.ts) i samma
 * transaktion. Hubben (Crafts affärssystem) bekräftar ordern med sitt ordernummer – i svaret, eller senare med en
 * händelse – och då delas ordern i ett produktionsjobb per producent. Producenterna, eller hubben, rapporterar status,
 * och orderns status räknas ut ur jobben. Varje steg loggas i tidslinjen.
 */

/** Fel som anroparen kan visa: `status` är HTTP-koden, `issues` fälten som inte stämmer. */
export class PocError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

const zodIssues = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
const blankless = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const DELIVERY_IDS = DELIVERY.map((d) => d.id) as [DeliveryId, ...DeliveryId[]];

/** Utan leveranssätt används kassans förval. */
export const DEFAULT_DELIVERY: DeliveryId = "ombud";

/** Butikens ordernummer: synliga tecken utan mellanslag, t.ex. "INT-2026-000123" eller en UUID. */
const EXTERNAL_REF = /^[\x21-\x7E]{1,100}$/;

export const NewOrderSchema = z.object({
  clubId: z.string().trim().min(1).max(120),
  externalRef: z.string().trim().regex(EXTERNAL_REF, "Butikens ordernummer: 1–100 tecken utan mellanslag").nullish(),
  customer: z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(200), phone: blankless(40), address: blankless(400) }),
  delivery: z.enum(DELIVERY_IDS, { error: `Okänt leveranssätt. Välj ett av: ${DELIVERY_IDS.join(", ")}` }).nullish(),
  lines: z
    .array(z.object({ clubProductId: z.string().trim().min(1).max(80), size: blankless(20), qty: z.number().int().min(1).max(100) }))
    .min(1)
    .max(50),
});

export const PRODUCER_NAME: Record<Producer, { the: string; The: string; makes: string }> = {
  tryckeri: { the: "tryckeriet", The: "Tryckeriet", makes: "trycka" },
  stickeri: { the: "stickeriet", The: "Stickeriet", makes: "sticka" },
};

export const isProducer = (p: string): p is Producer => p === "tryckeri" || p === "stickeri";

/**
 * Producent-API:ts åtkomst: producenten ur sökvägen, och producentens inloggning (sessionen) eller nyckeln i
 * `x-api-key`. Med `query` duger även `?key=`, så att en fil kan laddas ner direkt via en länk. Ger producenten, eller
 * ett felsvar (404 okänd producent, 401 inte inloggad och fel nyckel).
 */
export async function producerAccess(req: Request, producer: string, opts: { query?: boolean } = {}): Promise<Producer | Response> {
  if (!isProducer(producer)) return Response.json({ error: `Okänd producent "${producer}" (tryckeri eller stickeri)` }, { status: 404 });
  if (await roleFromRequest(req, producer)) return producer;
  if (opts.query && producerKeyOk(producer, new URL(req.url).searchParams.get("key"))) return producer;
  return Response.json({ error: `Logga in som ${PRODUCER_NAME[producer].the} (${loginPath(producer)}) eller ange API-nyckeln (x-api-key)` }, { status: 401 });
}

/** Felsvar för routerna: PocError med sin kod och sina fält, allt annat som 500. */
export function errorResponse(e: unknown) {
  if (e instanceof PocError) return Response.json({ error: e.message, ...(e.issues ? { issues: e.issues } : {}) }, { status: e.status });
  console.error("poc", e);
  return Response.json({ error: "Något gick fel i plattformen" }, { status: 500 });
}

/** Kundens statussida i Intersports klubbshop. */
export const customerStatusPath = (o: Pick<OrderView, "id" | "clubId">, token: string) => `/intersport/${encodeURIComponent(o.clubId)}/order/${encodeURIComponent(o.id)}?t=${encodeURIComponent(token)}`;

export const jobFileUrl = (job: Pick<ProductionJob, "id" | "producer">, name: string) => `/api/v1/producers/${job.producer}/jobs/${encodeURIComponent(job.id)}/files/${encodeURIComponent(name)}`;

// ── Ny order ────────────────────────────────────────────────────────────────

type ParsedOrder = z.infer<typeof NewOrderSchema>;

/** Beställningens fingeravtryck: samma butiksordernummer med ett annat innehåll är en annan order (409), inte ett nytt försök. */
function fingerprint(n: ParsedOrder) {
  const c = n.customer;
  const body = [n.clubId, c.name, c.email.toLowerCase(), c.phone ?? null, c.address ?? null, n.delivery ?? DEFAULT_DELIVERY, n.lines.map((l) => [l.clubProductId, l.size?.toLowerCase() ?? null, l.qty])];
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

/** Ordern med butikens ordernummer, om den finns. Annat innehåll än förra gången ger 409. */
async function orderWithRef(ref: string, hash: string): Promise<{ order: OrderView; token: string; existing: true } | null> {
  const [r] = await query<{ id: string; token: string; request_hash: string | null }>("SELECT id, token, request_hash FROM orders WHERE channel = 'intersport' AND external_ref = $1", [ref]);
  if (!r) return null;
  if (r.request_hash !== hash) throw new PocError(`Butikens ordernummer ${ref} finns redan, med ett annat innehåll. Använd ett nytt nummer för en ny order.`, 409);
  return { order: (await getOrderView(r.id))!, token: r.token, existing: true };
}

const isUniqueViolation = (e: unknown, constraint: string) => (e as { code?: string; constraint?: string })?.code === "23505" && (e as { constraint?: string }).constraint === constraint;

/** Raderna som lagret ser dem: artikel, storlek, antal, kundens titel och klubbproduktens specifikation (plaggets färg). */
const stockLines = (lines: OrderLine[], products: Map<string, ClubProduct>): StockLine[] =>
  lines.map((l) => ({ sku: l.sku, size: l.size, qty: l.qty, title: l.title, spec: products.get(l.clubProductId)?.spec }));

/**
 * Tar emot en order från butiken. Priser och titlar tas alltid från klubbprodukterna, aldrig från butiken. Ordern och
 * dess post i utkorgen sparas i samma transaktion; första försöket mot hubben görs direkt efter svaret, så att kassan
 * aldrig väntar på hubben eller produktionsfilerna.
 *
 * Med `externalRef` (butikens ordernummer) ger samma nummer igen den befintliga ordern (`existing: true`) i stället för
 * en ny, och samma nummer med ett annat innehåll 409. Varor som är slut i lagret ger 409 med raderna i `issues`.
 */
export async function createOrder(input: NewOrder): Promise<{ order: OrderView; token: string; existing: boolean }> {
  const parsed = NewOrderSchema.safeParse(input);
  if (!parsed.success) throw new PocError("Ordern är ogiltig", 400, zodIssues(parsed.error));
  const n = parsed.data;
  const ref = n.externalRef ?? undefined;
  const hash = fingerprint(n);
  if (ref) {
    const old = await orderWithRef(ref, hash);
    if (old) return old;
  }

  const products = new Map((await listClubProducts({ ids: [...new Set(n.lines.map((l) => l.clubProductId))] })).map((p) => [p.id, p]));
  const issues: { path: string; message: string }[] = [];
  const lines: OrderLine[] = [];
  n.lines.forEach((l, i) => {
    const p = products.get(l.clubProductId);
    const path = `lines.${i}`;
    if (!p) return issues.push({ path: `${path}.clubProductId`, message: "Produkten finns inte" });
    if (p.clubId !== n.clubId) return issues.push({ path: `${path}.clubProductId`, message: "Produkten hör till en annan klubb" });
    if (p.status !== "publicerad") return issues.push({ path: `${path}.clubProductId`, message: "Produkten är inte publicerad" });
    const sizes = catalogProduct(p.sku)?.sizes ?? [];
    let size = l.size;
    if (sizes.length) {
      size = sizes.find((s) => s.toLowerCase() === l.size?.toLowerCase()) ?? (sizes.length === 1 && !l.size ? sizes[0] : undefined);
      if (!size) return issues.push({ path: `${path}.size`, message: `Välj en av storlekarna: ${sizes.join(", ")}` });
    }
    lines.push({ id: newId("ln"), clubProductId: p.id, sku: p.sku, kind: p.kind, title: p.title, size, qty: l.qty, unitSek: p.priceSek });
  });
  if (issues.length) throw new PocError("Ordern innehåller produkter som inte kan säljas", 400, issues);

  // Lagret från hubben: en artikel utan saldo säljs som förut (obegränsat).
  const stock = await checkStock(stockLines(lines, products));
  if (!stock.ok) throw new PocError(stock.problems.map((p) => p.message).join(" "), 409, stock.problems.map((p) => ({ path: `lines.${p.index}`, message: p.message })));

  const id = newId("ord");
  const token = newToken();
  const subtotal = cents(lines.reduce((s, l) => s + l.unitSek * l.qty, 0));
  // Frakten räknas här med butikens regler (fri frakt över en viss summa), aldrig av butiken.
  const delivery = DELIVERY.find((d) => d.id === (n.delivery ?? DEFAULT_DELIVERY))!;
  const ship: NonNullable<Order["shipping"]> = { method: delivery.id, label: delivery.label, priceSek: shipping(delivery.id, subtotal) };
  const totalSek = cents(subtotal + ship.priceSek);
  let outboxId: string;
  try {
    outboxId = await tx(async (db) => {
      const [{ seq }] = await query<{ seq: string }>("SELECT nextval('order_number_seq') AS seq", [], db);
      const number = `IS-${seq}`;
      await query(
        `INSERT INTO orders (id, number, channel, club_id, customer, total_sek, status, token, shipping, external_ref, request_hash)
         VALUES ($1, $2, 'intersport', $3, $4, $5, 'mottagen', $6, $7, $8, $9)`,
        [id, number, n.clubId, JSON.stringify(n.customer), totalSek, token, JSON.stringify(ship), ref ?? null, hash],
        db,
      );
      await query(
        `INSERT INTO order_lines (id, order_id, pos, club_product_id, sku, kind, title, size, qty, unit_sek)
         SELECT id, $1, pos, cp, sku, kind, title, size, qty, unit
         FROM unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::int[], $10::numeric[])
           AS t(id, pos, cp, sku, kind, title, size, qty, unit)`,
        [
          id,
          lines.map((l) => l.id),
          lines.map((_, i) => i),
          lines.map((l) => l.clubProductId),
          lines.map((l) => l.sku),
          lines.map((l) => l.kind),
          lines.map((l) => l.title),
          lines.map((l) => l.size ?? null),
          lines.map((l) => l.qty),
          lines.map((l) => l.unitSek),
        ],
        db,
      );
      await addEvent({ orderId: id, actor: "butik", text: ref ? `Ordern mottagen från Intersport (butikens ordernummer ${ref})` : "Ordern mottagen från Intersport" }, db);
      return enqueue(db, { id, number }, "order.submit");
    });
  } catch (e) {
    // Samma butiksordernummer från två anrop samtidigt: det andra får ordern som det första skapade.
    if (ref && isUniqueViolation(e, "orders_external_ref")) {
      const old = await orderWithRef(ref, hash);
      if (old) return old;
    }
    throw e;
  }

  sendSoon(outboxId);
  const order = (await getOrderView(id))!;
  console.log("poc/orders", order.number, order.clubId, ref ?? "-", `${order.totalSek} kr`, `${order.lines.length} rader`);
  return { order, token, existing: false };
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Filnamnen tas fram i bakgrunden, så att ingen väntar på produktionsfilerna. */
function filesLater(jobIds: string[]) {
  if (!jobIds.length) return;
  later(async () => {
    for (const id of jobIds) await ensureJobFiles(id).catch((e) => console.error("poc/orders filer", id, e));
  });
}

// ── Crafts affärssystem, genom New Waves hubb ───────────────────────────────

/**
 * Skapar jobben för en bekräftad order, i anroparens transaktion: ett jobb per producent, halsdukar till stickeriet och
 * plagg till tryckeriet. Ger jobbens id.
 */
async function createJobs(db: Db, orderId: string, lines: OrderLine[]): Promise<string[]> {
  const ids: string[] = [];
  for (const producer of ["stickeri", "tryckeri"] as Producer[]) {
    const mine = lines.filter((l) => PRODUCER_OF[l.kind] === producer);
    if (!mine.length) continue;
    const jobId = newId("job");
    await query("INSERT INTO production_jobs (id, order_id, producer, status, line_ids) VALUES ($1, $2, $3, 'ny', $4)", [jobId, orderId, producer, mine.map((l) => l.id)], db);
    await addEvent({ orderId, jobId, actor: "affärssystem", text: `Skickad till ${PRODUCER_NAME[producer].the}` }, db);
    ids.push(jobId);
  }
  return ids;
}

type LockedOrder = { id: string; number: string; status: OrderStatus; erp_ref: string | null };

/** Bekräftar en mottagen order i transaktionen: hubbens ordernummer, status "bekräftad" och jobben. */
async function confirmLocked(db: Db, o: LockedOrder, erpRef: string | undefined): Promise<{ jobIds: string[]; lines: OrderLine[] }> {
  await query("UPDATE orders SET erp_ref = COALESCE($2, erp_ref), status = 'bekräftad', updated_at = now() WHERE id = $1", [o.id, erpRef ?? null], db);
  await addEvent({ orderId: o.id, actor: "affärssystem", text: erpRef ? `Bekräftad i Crafts affärssystem (${erpRef})` : "Bekräftad i Crafts affärssystem" }, db);
  const view = (await getOrderView(o.id, db))!;
  return { jobIds: await createJobs(db, o.id, view.lines), lines: view.lines };
}

/** Efter bekräftelsen: lagret räknas av (en gång per order) och jobbens filnamn tas fram. */
async function afterConfirmed(number: string, jobIds: string[], lines: OrderLine[]) {
  filesLater(jobIds);
  try {
    const products = new Map((await listClubProducts({ ids: [...new Set(lines.map((l) => l.clubProductId))] })).map((p) => [p.id, p]));
    await reserveStock(stockLines(lines, products), number);
  } catch (e) {
    await alert(`lager-avrakning:${number}`, `Lagret kunde inte räknas av för ${number}: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Hubben har bekräftat ordern (i svaret på ordern, eller med händelsen `order.status` "bekräftad"). En mottagen order
 * får hubbens ordernummer, status "bekräftad" och ett jobb per producent, och lagret räknas av. Orderns post i utkorgen
 * markeras som skickad i samma transaktion. Samma bekräftelse två gånger ändrar inget. Bekräftar hubben en order som är
 * avbruten hos oss skickas avbokningen igen.
 */
export async function confirmOrder(orderId: string, erpRef?: string): Promise<{ ok: boolean; message: string }> {
  const r = await tx(async (db) => {
    const [o] = await query<LockedOrder>("SELECT id, number, status, erp_ref FROM orders WHERE id = $1 OR number = $1 FOR UPDATE", [orderId], db);
    if (!o) return { ok: false, message: "Ordern finns inte" };
    await markSubmitDone(db, o.id, erpRef);
    if (o.status === "avbruten") {
      const cancel = await lockItem(db, o.id, "order.cancel");
      const cancelId = !cancel || cancel.status !== "väntar" ? await requeue(db, o, "order.cancel") : null;
      await addEvent({ orderId: o.id, actor: "affärssystem", text: `Crafts affärssystem bekräftade ordern${erpRef ? ` (${erpRef})` : ""}, fast den är avbruten – avbokningen skickas igen` }, db);
      return { ok: true, message: `${o.number} är avbruten hos oss – avbokningen skickas till hubben`, cancelId };
    }
    if (o.status !== "mottagen") {
      if (erpRef && !o.erp_ref) await query("UPDATE orders SET erp_ref = $2, updated_at = now() WHERE id = $1", [o.id, erpRef], db);
      return { ok: true, message: `${o.number} är redan bekräftad (${o.erp_ref ?? erpRef ?? "utan ordernummer"})` };
    }
    const done = await confirmLocked(db, o, erpRef);
    return { ok: true, message: `${o.number} bekräftad${erpRef ? ` (${erpRef})` : ""}`, number: o.number, ...done };
  });
  if ("cancelId" in r && r.cancelId) sendSoon(r.cancelId);
  if ("jobIds" in r && r.jobIds) await afterConfirmed(r.number, r.jobIds, r.lines);
  return { ok: r.ok, message: r.message };
}

/**
 * Craft skickar en mottagen order till hubben igen (på id eller ordernummer): posten i utkorgen börjar om med nya
 * försök i ett dygn, och första försöket görs direkt. Ger ordern och utfallet. 409 om ordern inte väntar på
 * bekräftelse eller skickas just nu.
 */
export async function resendToHub(id: string): Promise<{ order: OrderView; outcome: OutboxOutcome }> {
  const itemId = await tx(async (db) => {
    const [o] = await query<LockedOrder>("SELECT id, number, status, erp_ref FROM orders WHERE id = $1 OR number = $1 FOR UPDATE", [id], db);
    if (!o) throw new PocError("Ordern finns inte", 404);
    if (o.status === "avbruten") throw new PocError("Ordern är avbruten och skickas inte till affärssystemet", 409);
    if (o.status !== "mottagen") throw new PocError(`Ordern är redan bekräftad i Crafts affärssystem (${o.erp_ref ?? "utan ordernummer"})`, 409);
    const item = await requeue(db, o, "order.submit");
    if (!item) throw new PocError("Ordern skickas till affärssystemet just nu – vänta en stund", 409);
    await addEvent({ orderId: o.id, actor: "craft", text: "Craft skickar ordern till affärssystemet igen" }, db);
    return { item, orderId: o.id };
  });
  const outcome = await processOutboxItem(itemId.item);
  return { order: (await getOrderView(itemId.orderId))!, outcome };
}

/**
 * Som `resendToHub`, men ger ordern bara när hubben tagit emot den (bekräftad, eller mottagen och väntar på
 * bekräftelse). Svarar hubben fortfarande inte blir det 502; ordern ligger då kvar i utkorgen och skickas igen av sig själv.
 */
export async function retryErp(id: string): Promise<OrderView> {
  const { order, outcome } = await resendToHub(id);
  if (outcome.result === "väntar") throw new PocError(`Crafts affärssystem svarar fortfarande inte (${outcome.error}). Ordern ligger kvar i utkorgen och skickas igen automatiskt.`, 502);
  if (outcome.result === "misslyckad") throw new PocError(`New Waves hubb tog inte emot ordern: ${outcome.error}`, 502);
  if (outcome.result === "stoppad") throw new PocError("Ordern avbröts medan den skickades", 409);
  return order;
}

// ── Craft avbryter ──────────────────────────────────────────────────────────

/** Producentens anteckning på jobben när Craft avbryter ordern. */
export const CANCELLED_NOTE = "Ordern avbruten av Craft";
/** Anteckningen när hubben (Crafts affärssystem) avbryter ordern. */
export const HUB_CANCELLED_NOTE = "Ordern avbruten i Crafts affärssystem";

/**
 * Hubbens del av en avbokning, i avbokningens transaktion. Väntar ordern fortfarande i utkorgen stoppas posten; har den
 * skickats (eller kan ett tidigare försök ha nått fram) läggs en avbokning i utkorgen. Ger avbokningens post, om en lades.
 */
async function cancelAtHub(db: Db, o: { id: string; number: string; status: OrderStatus }): Promise<string | null> {
  const submit = await lockItem(db, o.id, "order.submit");
  let cancel: boolean;
  if (!submit) cancel = o.status !== "mottagen";
  else if (submit.status === "stoppad") cancel = false;
  else if (submit.status === "skickad" || submit.sending) cancel = true;
  else {
    await stopItem(db, submit.id, "Ordern avbröts innan den skickades");
    // Ett tidigare försök som inte fick svar kan ha nått hubben: då avbokas den också (hubben svarar 404 om den inte har den).
    cancel = submit.attempts > 0;
    if (!cancel) await addEvent({ orderId: o.id, actor: "plattform", text: "Ordern skickas inte till Crafts affärssystem" }, db);
  }
  if (!cancel) return null;
  const id = await requeue(db, o, "order.cancel");
  await addEvent({ orderId: o.id, actor: "plattform", text: "Avbokningen skickas till Crafts affärssystem" }, db);
  return id;
}

/**
 * Craft avbryter en order, på id eller ordernummer, så länge inget jobb har börjat tillverkas eller skickats (annars
 * 409). Jobben får status "fel" med anteckningen "Ordern avbruten av Craft", så att de inte ligger kvar som att göra
 * hos producenterna och inte kan tas upp igen. Hubben får en avbokning om den redan har ordern; väntar ordern fortfarande
 * i utkorgen skickas den aldrig. Lagret lämnas tillbaka. Ger den avbrutna ordern; en redan avbruten order ges som den är.
 */
export async function cancelOrder(id: string, reason?: string): Promise<OrderView> {
  const why = reason?.trim().slice(0, 300) || undefined;
  const r = await tx(async (db) => {
    const [o] = await query<{ id: string; number: string; status: OrderStatus }>("SELECT id, number, status FROM orders WHERE id = $1 OR number = $1 FOR UPDATE", [id], db);
    if (!o) throw new PocError("Ordern finns inte", 404);
    if (o.status === "avbruten") return { orderId: o.id };
    const jobs = await query<{ id: string; producer: Producer; status: JobStatus; tracking: string | null }>(
      "SELECT id, producer, status, tracking FROM production_jobs WHERE order_id = $1 ORDER BY created_at, producer FOR UPDATE",
      [o.id],
      db,
    );
    const started = jobs.filter((j) => j.status === "i produktion" || j.status === "skickad" || j.tracking);
    if (started.length) {
      const what = started.map((j) => `${PRODUCER_NAME[j.producer].the} har redan ${j.status === "i produktion" ? `börjat ${PRODUCER_NAME[j.producer].makes}` : "skickat sin del"}`);
      throw new PocError(`Ordern kan inte avbrytas: ${what.join(" och ")}.`, 409);
    }
    await query("UPDATE orders SET status = 'avbruten', cancel_reason = $2, updated_at = now() WHERE id = $1", [o.id, why ?? null], db);
    await addEvent({ orderId: o.id, actor: "craft", text: `${CANCELLED_NOTE}${why ? `: ${why}` : ""}` }, db);
    for (const j of jobs) {
      await query("UPDATE production_jobs SET status = 'fel', note = $2, updated_at = now() WHERE id = $1", [j.id, CANCELLED_NOTE], db);
      await addEvent({ orderId: o.id, jobId: j.id, actor: "craft", text: `Jobbet hos ${PRODUCER_NAME[j.producer].the} är stoppat` }, db);
    }
    return { orderId: o.id, number: o.number, cancelId: await cancelAtHub(db, o) };
  });
  if (r.cancelId) sendSoon(r.cancelId);
  if (r.number) await releaseStock(r.number).catch((e) => console.error("poc/orders lagret tillbaka", r.number, e instanceof Error ? e.message : e));
  return (await getOrderView(r.orderId))!;
}

// ── Produktionsfilerna (del B bygger dem) ───────────────────────────────────

/** Bygger jobbets produktionsfiler ur klubbprodukternas specifikation, med del B:s `jobFiles`. Den laddas först när
 * filerna behövs, så att kassan och köerna slipper bildmotorerna. */
export async function buildJobFiles(job: JobView): Promise<BuiltFile[]> {
  const { jobFiles } = await import("./build");
  const products = await listClubProducts({ ids: [...new Set(job.lines.map((l) => l.clubProductId))] });
  return jobFiles(job, job.lines, products);
}

/** Fyller i jobbets fillista om den är tom. */
export async function ensureJobFiles(jobId: string): Promise<JobView | null> {
  const job = await getJob(jobId);
  if (!job || job.files.length) return job;
  const built = await buildJobFiles(job);
  if (!built.length) return job;
  const files = built.map((f) => ({ name: f.name, label: f.label, url: jobFileUrl(job, f.name) }));
  await query("UPDATE production_jobs SET files = $2 WHERE id = $1 AND files = '[]'::jsonb", [jobId, JSON.stringify(files)]);
  return { ...job, files };
}

// ── Status från producenterna ───────────────────────────────────────────────

/** Tillåtna steg. "fel" går från vilket läge som helst, och från "fel" kan jobbet tas upp igen. */
const NEXT: Record<JobStatus, JobStatus[]> = {
  ny: ["accepterad"],
  accepterad: ["i produktion"],
  "i produktion": ["skickad"],
  skickad: [],
  fel: ["accepterad", "i produktion"],
};

export const JobStatusSchema = z
  .object({
    status: z.enum(["ny", "accepterad", "i produktion", "skickad", "fel"]),
    note: blankless(500),
    tracking: blankless(100),
  })
  .refine((v) => v.status !== "skickad" || !!v.tracking, { message: "Spårningsnummer krävs när jobbet skickas", path: ["tracking"] });

/** Orderns status ur jobben: alla nya → bekräftad, något igång → i produktion, några skickade → delvis skickad. */
export function orderStatusOf(jobs: Pick<ProductionJob, "status">[]): OrderStatus {
  const shipped = jobs.filter((j) => j.status === "skickad").length;
  if (jobs.length && shipped === jobs.length) return "skickad";
  if (shipped) return "delvis skickad";
  if (jobs.some((j) => j.status !== "ny")) return "i produktion";
  return "bekräftad";
}

const ORDER_TEXT: Partial<Record<OrderStatus, string>> = {
  "i produktion": "Ordern är i produktion",
  "delvis skickad": "En del av ordern är skickad",
  skickad: "Hela ordern är skickad",
};

function jobText(producer: Producer, status: JobStatus, tracking?: string) {
  const p = PRODUCER_NAME[producer];
  if (status === "accepterad") return `${p.The} har accepterat jobbet`;
  if (status === "i produktion") return `${p.The} har börjat ${p.makes}`;
  if (status === "skickad") return `${p.The} har skickat (spårningsnummer ${tracking})`;
  if (status === "fel") return `${p.The} rapporterar ett fel`;
  return `${p.The}: ${status}`;
}

/** Producentens statusrapport. Ger det uppdaterade jobbet och ordern. */
export async function setJobStatus(producer: Producer, jobId: string, input: { status: JobStatus; note?: string; tracking?: string }): Promise<{ job: JobView; order: OrderView }> {
  const parsed = JobStatusSchema.safeParse(input);
  if (!parsed.success) throw new PocError("Ogiltig status", 400, zodIssues(parsed.error));
  const { status, note, tracking } = parsed.data;

  const orderId = await tx(async (db) => {
    const [ref] = await query<{ order_id: string }>("SELECT order_id FROM production_jobs WHERE id = $1 AND producer = $2", [jobId, producer], db);
    if (!ref) throw new PocError("Jobbet finns inte", 404);
    // Ordern låses först, så att två producenter som rapporterar samtidigt räknar ut orderns status i tur och ordning.
    const [order] = await query<{ status: OrderStatus }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [ref.order_id], db);
    const [job] = await query<{ status: JobStatus }>("SELECT status FROM production_jobs WHERE id = $1 FOR UPDATE", [jobId], db);
    if (order.status === "avbruten") throw new PocError("Ordern är avbruten – jobbet ska inte tillverkas", 409);
    if (job.status === status) return ref.order_id;
    if (!(status === "fel" || NEXT[job.status].includes(status))) throw new PocError(`Jobbet kan inte gå från "${job.status}" till "${status}"`, 409);

    // Anteckningen är producentens senaste kommentar: en ny status utan anteckning tömmer den.
    await query("UPDATE production_jobs SET status = $2, tracking = COALESCE($3, tracking), note = $4, updated_at = now() WHERE id = $1", [jobId, status, tracking ?? null, note ?? null], db);
    await addEvent({ orderId: ref.order_id, jobId, actor: producer, text: jobText(producer, status, tracking) + (note ? `: ${note}` : "") }, db);
    if (order.status !== "mottagen") await updateOrderStatus(ref.order_id, order.status, db);
    return ref.order_id;
  });
  return { job: (await getJob(jobId))!, order: (await getOrderView(orderId))! };
}

async function updateOrderStatus(orderId: string, current: OrderStatus, db: Db) {
  const jobs = await query<{ status: JobStatus }>("SELECT status FROM production_jobs WHERE order_id = $1", [orderId], db);
  const next = orderStatusOf(jobs);
  if (next === current) return;
  await query("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1", [orderId, next], db);
  const text = ORDER_TEXT[next];
  if (text) await addEvent({ orderId, actor: "plattform", text }, db);
}

// ── Status från hubben ──────────────────────────────────────────────────────

const HubStatusSchema = z.object({
  orderNumber: z.string().trim().min(1).max(80),
  erpRef: blankless(80),
  status: z.enum(["bekräftad", "i produktion", "skickad", "levererad", "avbruten", "fel"]),
  producer: z.enum(["tryckeri", "stickeri"]).optional(),
  lineIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  tracking: blankless(100),
  carrier: blankless(80),
  note: blankless(500),
});

type HubStatus = z.infer<typeof HubStatusSchema>;
export type ApplyResult = { ok: boolean; message?: string };

type JobRow = { id: string; producer: Producer; status: JobStatus; line_ids: string[]; shipped_line_ids: string[]; tracking: string | null; note: string | null };

/** Spårningsnumren i jobbet, ett nytt läggs till de gamla när hubben skickar en del i taget. */
const mergeTracking = (old: string | null, add?: string) => [...new Set([...(old ?? "").split(", "), add ?? ""].map((t) => t.trim()).filter(Boolean))].join(", ") || null;

/** Vilka jobb händelsen gäller: raderna, annars producenten, annars alla. Jobb som stoppats när ordern avbröts räknas inte. */
function targetJobs(jobs: JobRow[], d: HubStatus): JobRow[] {
  const live = jobs.filter((j) => !(j.status === "fel" && (j.note === CANCELLED_NOTE || j.note === HUB_CANCELLED_NOTE)));
  if (d.lineIds?.length) return live.filter((j) => j.line_ids.some((id) => d.lineIds!.includes(id)));
  if (d.producer) return live.filter((j) => j.producer === d.producer);
  return live;
}

/** "rad 2", "rad 1 och 3": orderns radnummer. */
const rowsText = (ids: string[], pos: Map<string, number>) => {
  const nr = ids.map((id) => pos.get(id)).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  return `rad ${nr.length > 1 ? `${nr.slice(0, -1).join(", ")} och ${nr.at(-1)}` : (nr[0] ?? "?")}`;
};

/**
 * Hubbens status för en order (händelsen `order.status`, lib/poc/hub/inbox.ts). Ger `{ ok, message }`; en okänd order
 * eller en status som inte går att använda ger `{ ok: false }` utan att kasta. Ett fel i databasen kastas, så att hubben
 * skickar händelsen igen.
 * - "bekräftad" (med hubbens ordernummer): som när hubben svarar på ordern – jobben skapas och lagret räknas av.
 * - "i produktion" och "skickad", för en producent, några rader eller hela ordern: jobben flyttas fram (hubben får hoppa
 *   över steg, men inget flyttas bakåt). Skickas bara några av jobbets rader blir jobbet skickat när alla är det.
 *   Spårningsnumret sparas på jobbet. Är ordern fortfarande mottagen bekräftas den först.
 * - "levererad": en händelse i tidslinjen, ingen ny status.
 * - "avbruten": ordern avbryts, med orsaken från hubben. Lagret lämnas tillbaka.
 * - "fel": en händelse, en anteckning på jobben det gäller och ett larm.
 */
export async function applyOrderStatus(data: HubOrderStatusData): Promise<ApplyResult> {
  const parsed = HubStatusSchema.safeParse(data);
  if (!parsed.success) return { ok: false, message: `Ogiltig status: ${zodIssues(parsed.error).map((i) => `${i.path || "data"}: ${i.message}`).join("; ")}` };
  const d = parsed.data;
  const [ref] = await query<{ id: string }>(
    "SELECT id FROM orders WHERE number = $1 OR ($2::text IS NOT NULL AND erp_ref = $2) ORDER BY (number = $1) DESC LIMIT 1",
    [d.orderNumber, d.erpRef ?? null],
  );
  if (!ref) return { ok: false, message: `Okänd order ${d.orderNumber}` };
  switch (d.status) {
    case "bekräftad":
      return confirmOrder(ref.id, d.erpRef);
    case "i produktion":
    case "skickad":
      return hubProgress(ref.id, d);
    case "levererad":
      return hubDelivered(ref.id, d);
    case "avbruten":
      return hubCancelled(ref.id, d);
    case "fel":
      return hubFailure(ref.id, d);
  }
}

async function hubProgress(orderId: string, d: HubStatus): Promise<ApplyResult> {
  const r = await tx(async (db) => {
    const [o] = await query<LockedOrder>("SELECT id, number, status, erp_ref FROM orders WHERE id = $1 FOR UPDATE", [orderId], db);
    if (o.status === "avbruten") return { ok: false, message: `${o.number} är avbruten hos oss men hubben rapporterar "${d.status}"`, alarm: o.number };
    // Hubben hoppade över bekräftelsen: ordern bekräftas först, så att det finns jobb att flytta.
    const confirmed = o.status === "mottagen" ? await confirmLocked(db, o, d.erpRef) : null;
    if (confirmed) await markSubmitDone(db, o.id, d.erpRef);
    const jobs = await query<JobRow>("SELECT id, producer, status, line_ids, shipped_line_ids, tracking, note FROM production_jobs WHERE order_id = $1 ORDER BY created_at, producer FOR UPDATE", [o.id], db);
    const targets = targetJobs(jobs, d);
    if (!targets.length) {
      if (confirmed) return { ok: true, message: `${o.number} bekräftad, men inget jobb matchar ${d.lineIds?.length ? "raderna" : "producenten"}`, number: o.number, ...confirmed };
      return { ok: false, message: `Inget jobb i ${o.number} matchar ${d.lineIds?.length ? "raderna" : d.producer ? `producenten ${d.producer}` : "händelsen"}` };
    }
    const pos = new Map((await query<{ id: string; pos: number }>("SELECT id, pos FROM order_lines WHERE order_id = $1", [o.id], db)).map((l) => [l.id, Number(l.pos) + 1]));
    const changed: string[] = [];
    for (const j of targets) {
      const p = PRODUCER_NAME[j.producer];
      const note = d.note ? `Crafts affärssystem: ${d.note}` : null;
      if (d.status === "i produktion") {
        if (j.status === "i produktion" || j.status === "skickad") continue;
        await query("UPDATE production_jobs SET status = 'i produktion', note = $2, updated_at = now() WHERE id = $1", [j.id, note], db);
        await addEvent({ orderId: o.id, jobId: j.id, actor: "affärssystem", text: `${p.The} har börjat ${p.makes}${d.note ? `: ${d.note}` : ""}` }, db);
        changed.push(j.producer);
        continue;
      }
      if (j.status === "skickad") continue;
      const covered = d.lineIds?.length ? j.line_ids.filter((id) => d.lineIds!.includes(id)) : j.line_ids;
      const shipped = [...new Set([...j.shipped_line_ids, ...covered])];
      const all = j.line_ids.every((id) => shipped.includes(id));
      const tracking = mergeTracking(j.tracking, d.tracking);
      const via = d.tracking ? ` (spårningsnummer ${d.tracking}${d.carrier ? `, ${d.carrier}` : ""})` : d.carrier ? ` (${d.carrier})` : "";
      await query("UPDATE production_jobs SET status = $2, shipped_line_ids = $3, tracking = $4, note = $5, updated_at = now() WHERE id = $1", [j.id, all ? "skickad" : "i produktion", shipped, tracking, note], db);
      const what = all ? `${p.The} har skickat` : `${p.The} har skickat ${rowsText(covered, pos)} (${shipped.length} av ${j.line_ids.length} rader i jobbet)`;
      await addEvent({ orderId: o.id, jobId: j.id, actor: "affärssystem", text: `${what}${via}${d.note ? `: ${d.note}` : ""}` }, db);
      changed.push(j.producer);
    }
    const [{ status }] = await query<{ status: OrderStatus }>("SELECT status FROM orders WHERE id = $1", [o.id], db);
    await updateOrderStatus(o.id, status, db);
    const message = changed.length ? `${o.number}: ${[...new Set(changed)].map((c) => PRODUCER_NAME[c as Producer].the).join(" och ")} ${d.status}` : `${o.number}: redan ${d.status}`;
    return confirmed ? { ok: true, message, number: o.number, ...confirmed } : { ok: true, message };
  });
  if ("alarm" in r && r.alarm) await alert(`hubb-avbruten-order:${r.alarm}`, `${r.message}. Kontrollera med New Wave att den inte tillverkas.`);
  if ("jobIds" in r && r.jobIds) await afterConfirmed(r.number, r.jobIds, r.lines);
  return { ok: r.ok, message: r.message };
}

async function hubDelivered(orderId: string, d: HubStatus): Promise<ApplyResult> {
  return tx(async (db) => {
    const [o] = await query<LockedOrder>("SELECT id, number, status, erp_ref FROM orders WHERE id = $1 FOR UPDATE", [orderId], db);
    const jobs = d.producer || d.lineIds?.length ? targetJobs(await query<JobRow>("SELECT id, producer, status, line_ids, shipped_line_ids, tracking, note FROM production_jobs WHERE order_id = $1", [o.id], db), d) : [];
    const who = jobs.length === 1 ? `${PRODUCER_NAME[jobs[0].producer].The.replace(/et$/, "ets")} paket är levererat` : "Ordern är levererad till kunden";
    const via = d.tracking ? ` (spårningsnummer ${d.tracking})` : "";
    await addEvent({ orderId: o.id, jobId: jobs.length === 1 ? jobs[0].id : undefined, actor: "affärssystem", text: `${who}${via}${d.note ? `: ${d.note}` : ""}` }, db);
    return { ok: true, message: `${o.number}: levererad` };
  });
}

async function hubCancelled(orderId: string, d: HubStatus): Promise<ApplyResult> {
  const r = await tx(async (db) => {
    const [o] = await query<LockedOrder>("SELECT id, number, status, erp_ref FROM orders WHERE id = $1 FOR UPDATE", [orderId], db);
    if (o.status === "avbruten") return { ok: true, message: `${o.number} är redan avbruten` };
    const why = d.note ?? HUB_CANCELLED_NOTE;
    await query("UPDATE orders SET status = 'avbruten', cancel_reason = $2, updated_at = now() WHERE id = $1", [o.id, why], db);
    await addEvent({ orderId: o.id, actor: "affärssystem", text: `${HUB_CANCELLED_NOTE}${d.note ? `: ${d.note}` : ""}` }, db);
    const jobs = await query<{ id: string; producer: Producer; status: JobStatus }>("SELECT id, producer, status FROM production_jobs WHERE order_id = $1 ORDER BY created_at, producer FOR UPDATE", [o.id], db);
    for (const j of jobs) {
      if (j.status === "skickad") continue;
      await query("UPDATE production_jobs SET status = 'fel', note = $2, updated_at = now() WHERE id = $1", [j.id, HUB_CANCELLED_NOTE], db);
      await addEvent({ orderId: o.id, jobId: j.id, actor: "affärssystem", text: `Jobbet hos ${PRODUCER_NAME[j.producer].the} är stoppat` }, db);
    }
    // Avbokningen kom från hubben: inget skickas tillbaka, och det som väntar i utkorgen stoppas.
    for (const kind of ["order.submit", "order.cancel"] as const) {
      const item = await lockItem(db, o.id, kind);
      if (item?.status === "väntar" && !item.sending) await stopItem(db, item.id, "Ordern avbröts i Crafts affärssystem");
    }
    return { ok: true, message: `${o.number} avbruten i hubben`, number: o.number };
  });
  if ("number" in r && r.number) await releaseStock(r.number).catch((e) => console.error("poc/orders lagret tillbaka", r.number, e instanceof Error ? e.message : e));
  return { ok: r.ok, message: r.message };
}

async function hubFailure(orderId: string, d: HubStatus): Promise<ApplyResult> {
  const r = await tx(async (db) => {
    const [o] = await query<LockedOrder>("SELECT id, number, status, erp_ref FROM orders WHERE id = $1 FOR UPDATE", [orderId], db);
    const text = d.note ?? "utan beskrivning";
    const jobs = d.producer || d.lineIds?.length ? targetJobs(await query<JobRow>("SELECT id, producer, status, line_ids, shipped_line_ids, tracking, note FROM production_jobs WHERE order_id = $1 FOR UPDATE", [o.id], db), d) : [];
    for (const j of jobs) await query("UPDATE production_jobs SET note = $2, updated_at = now() WHERE id = $1", [j.id, `Crafts affärssystem: ${text}`], db);
    const scope = jobs.length ? ` (${jobs.map((j) => `${PRODUCER_NAME[j.producer].the}s jobb`).join(" och ")})` : "";
    await addEvent({ orderId: o.id, jobId: jobs.length === 1 ? jobs[0].id : undefined, actor: "affärssystem", text: `Fel i Crafts affärssystem${scope}: ${text}` }, db);
    return { number: o.number, scope, text };
  });
  await alert(`hubb-fel:${r.number}`, `Hubben rapporterar ett fel för ${r.number}${r.scope}: ${r.text}`);
  return { ok: true, message: `${r.number}: fel registrerat` };
}

// ── Kundens statussida ──────────────────────────────────────────────────────

/** Ordern om nyckeln stämmer, annars null. */
export async function orderForCustomer(id: string, token: string | null | undefined): Promise<OrderView | null> {
  if (!token) return null;
  const [r] = await query<{ id: string; token: string }>("SELECT id, token FROM orders WHERE id = $1 OR number = $1", [id]);
  if (!r || !keyOk(token, r.token)) return null;
  return getOrderView(r.id);
}

/**
 * Kunden slår upp sin order med ordernummer ("IS-100001", "is 100001" eller "100001") och e-post. Ger statussidans
 * sökväg, eller null. E-posten jämförs utan hänsyn till stora och små bokstäver, och svaret är detsamma oavsett om
 * numret finns, så att det inte går att pröva sig fram till vilka ordrar som finns. Anroparen begränsar antalet försök.
 */
export async function findOrderForCustomer(number: string, email: string): Promise<string | null> {
  const digits = /^(?:IS)?[\s-]*(\d{1,12})$/i.exec(String(number ?? "").trim())?.[1];
  const [r] = digits
    ? await query<{ id: string; club_id: string; token: string; email: string | null }>("SELECT id, club_id, token, customer->>'email' AS email FROM orders WHERE number = $1", [`IS-${digits}`])
    : [];
  // Jämförelsen görs även när ordern saknas, så att svaret tar lika lång tid.
  const ok = keyOk(String(email ?? "").trim().toLowerCase(), (r?.email ?? "\u0000ingen order").trim().toLowerCase());
  return r && ok ? customerStatusPath({ id: r.id, clubId: r.club_id }, r.token) : null;
}
