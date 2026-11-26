import { after } from "next/server";
import { z } from "zod";
import { DELIVERY, shipping, type DeliveryId } from "@/components/newwave/clubshop/pricing";
import { keyOk, loginPath, producerKeyOk, roleFromRequest } from "./auth";
import { catalogProduct } from "./catalog";
import { newId, newToken, query, tx, type Db } from "./db";
import type { BuiltFile } from "./build";
import { erp } from "./erp";
import { addEvent, getJob, getOrderView, listClubProducts, type JobView } from "./store";
import { PRODUCER_OF, type JobStatus, type NewOrder, type Order, type OrderLine, type OrderStatus, type OrderView, type Producer, type ProductionJob } from "./types";

export { producerKeyOk };

/**
 * Orderflödet: butikens order sparas, går till Crafts affärssystem och delas i ett produktionsjobb per producent.
 * Producenterna rapporterar status, och orderns status räknas ut ur jobben. Varje steg loggas i tidslinjen.
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

export const NewOrderSchema = z.object({
  clubId: z.string().trim().min(1).max(120),
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

/** Tar emot en order från butiken. Priser och titlar tas alltid från klubbprodukterna, aldrig från butiken. */
export async function createOrder(input: NewOrder): Promise<{ order: OrderView; token: string }> {
  const parsed = NewOrderSchema.safeParse(input);
  if (!parsed.success) throw new PocError("Ordern är ogiltig", 400, zodIssues(parsed.error));
  const n = parsed.data;

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

  const id = newId("ord");
  const token = newToken();
  const subtotal = cents(lines.reduce((s, l) => s + l.unitSek * l.qty, 0));
  // Frakten räknas här med butikens regler (fri frakt över en viss summa), aldrig av butiken.
  const delivery = DELIVERY.find((d) => d.id === (n.delivery ?? DEFAULT_DELIVERY))!;
  const ship: NonNullable<Order["shipping"]> = { method: delivery.id, label: delivery.label, priceSek: shipping(delivery.id, subtotal) };
  const totalSek = cents(subtotal + ship.priceSek);
  await tx(async (db) => {
    const [{ seq }] = await query<{ seq: string }>("SELECT nextval('order_number_seq') AS seq", [], db);
    await query(
      "INSERT INTO orders (id, number, channel, club_id, customer, total_sek, status, token, shipping) VALUES ($1, $2, 'intersport', $3, $4, $5, 'mottagen', $6, $7)",
      [id, `IS-${seq}`, n.clubId, JSON.stringify(n.customer), totalSek, token, JSON.stringify(ship)],
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
    await addEvent({ orderId: id, actor: "butik", text: "Ordern mottagen från Intersport" }, db);
  });

  await sendToErp(id).catch((e) => console.error("poc/orders affärssystemet", id, e));

  const order = (await getOrderView(id))!;
  console.log("poc/orders", order.number, order.clubId, order.erpRef ?? "-", `${order.totalSek} kr`, order.jobs.map((j) => j.producer).join("+"));
  filesLater(order);
  return { order, token };
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Filnamnen tas fram efter svaret, så att kassan inte väntar på produktionsfilerna. */
function filesLater(order: OrderView) {
  later(async () => {
    for (const job of order.jobs) await ensureJobFiles(job.id).catch((e) => console.error("poc/orders filer", job.id, e));
  });
}

/** Kör efter svaret när det finns ett anrop att hänga på, annars direkt i bakgrunden (t.ex. i skript). */
function later(fn: () => Promise<void>) {
  try {
    after(fn);
  } catch {
    void fn();
  }
}

// ── Crafts affärssystem ─────────────────────────────────────────────────────

/** Pauserna före de automatiska nya försöken: två nya försök om affärssystemet inte svarar. */
const ERP_PAUSES_MS = [300, 1000];

/** Ordrar som just nu skickas till affärssystemet i den här processen, så att ett nytt försök inte krockar med ett pågående. */
const sending = ((globalThis as unknown as { pocErpSending?: Set<string> }).pocErpSending ??= new Set<string>());

/**
 * Skickar en mottagen order till affärssystemet, med två automatiska nya försök. Bekräftas den sparas affärssystemets
 * ordernummer och ordern delas i ett jobb per producent. Annars stannar den på "mottagen" med en händelse i
 * tidslinjen. Den riktiga kopplingen ska vara idempotent på butikens ordernummer, så att ett nytt försök aldrig ger
 * två ordrar i affärssystemet.
 */
async function sendToErp(orderId: string): Promise<boolean> {
  if (sending.has(orderId)) throw new PocError("Ordern skickas redan till affärssystemet – vänta en stund", 409);
  sending.add(orderId);
  try {
    const order = await getOrderView(orderId);
    if (!order || order.status !== "mottagen") return false;
    const attempts = ERP_PAUSES_MS.length + 1;
    let erpRef: string | undefined;
    for (let i = 0; i < attempts && !erpRef; i++) {
      if (i) await new Promise((r) => setTimeout(r, ERP_PAUSES_MS[i - 1]));
      try {
        erpRef = (await erp().submitOrder(order)).erpRef;
      } catch (e) {
        console.error(`poc/orders affärssystemet, försök ${i + 1} av ${attempts}`, order.number, e instanceof Error ? e.message : e);
      }
    }
    if (!erpRef) {
      await addEvent({ orderId, actor: "plattform", text: `Crafts affärssystem svarade inte efter ${attempts} försök – ordern väntar på bekräftelse` });
      return false;
    }
    return await tx(async (db) => {
      // Avbröts ordern under tiden skapas inga jobb.
      const [o] = await query<{ status: OrderStatus }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [orderId], db);
      if (o?.status !== "mottagen") return false;
      await query("UPDATE orders SET erp_ref = $2, status = 'bekräftad', updated_at = now() WHERE id = $1", [orderId, erpRef], db);
      await addEvent({ orderId, actor: "affärssystem", text: `Bekräftad i Crafts affärssystem (${erpRef})` }, db);
      // Ett jobb per producent: halsdukar till stickeriet, plagg till tryckeriet.
      for (const producer of ["stickeri", "tryckeri"] as Producer[]) {
        const mine = order.lines.filter((l) => PRODUCER_OF[l.kind] === producer);
        if (!mine.length) continue;
        const jobId = newId("job");
        await query("INSERT INTO production_jobs (id, order_id, producer, status, line_ids) VALUES ($1, $2, $3, 'ny', $4)", [jobId, orderId, producer, mine.map((l) => l.id)], db);
        await addEvent({ orderId, jobId, actor: "affärssystem", text: `Skickad till ${PRODUCER_NAME[producer].the}` }, db);
      }
      return true;
    });
  } finally {
    sending.delete(orderId);
  }
}

/**
 * Craft försöker igen med en order som affärssystemet inte bekräftat (status "mottagen"), på id eller ordernummer.
 * Ger den bekräftade ordern. Svarar affärssystemet fortfarande inte blir det 502; 409 om ordern inte väntar.
 */
export async function retryErp(id: string): Promise<OrderView> {
  const order = await getOrderView(id);
  if (!order) throw new PocError("Ordern finns inte", 404);
  if (order.status === "avbruten") throw new PocError("Ordern är avbruten och skickas inte till affärssystemet", 409);
  if (order.status !== "mottagen") throw new PocError(`Ordern är redan bekräftad i Crafts affärssystem (${order.erpRef ?? "utan ordernummer"})`, 409);
  await addEvent({ orderId: order.id, actor: "craft", text: "Craft skickar ordern till affärssystemet igen" });
  const ok = await sendToErp(order.id);
  const now = (await getOrderView(order.id))!;
  if (!ok) {
    if (now.status === "avbruten") throw new PocError("Ordern avbröts medan den skickades", 409);
    throw new PocError("Crafts affärssystem svarar fortfarande inte. Försök igen om en stund.", 502);
  }
  filesLater(now);
  return now;
}

// ── Craft avbryter ──────────────────────────────────────────────────────────

/** Producentens anteckning på jobben när Craft avbryter ordern. */
export const CANCELLED_NOTE = "Ordern avbruten av Craft";

/**
 * Craft avbryter en order, på id eller ordernummer, så länge inget jobb har börjat tillverkas eller skickats (annars
 * 409). Jobben får status "fel" med anteckningen "Ordern avbruten av Craft", så att de inte ligger kvar som att göra
 * hos producenterna och inte kan tas upp igen. Ger den avbrutna ordern; en redan avbruten order ges som den är.
 */
export async function cancelOrder(id: string, reason?: string): Promise<OrderView> {
  const why = reason?.trim().slice(0, 300) || undefined;
  const orderId = await tx(async (db) => {
    const [o] = await query<{ id: string; status: OrderStatus }>("SELECT id, status FROM orders WHERE id = $1 OR number = $1 FOR UPDATE", [id], db);
    if (!o) throw new PocError("Ordern finns inte", 404);
    if (o.status === "avbruten") return o.id;
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
    return o.id;
  });
  return (await getOrderView(orderId))!;
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
    if (order.status === "avbruten") throw new PocError(`${CANCELLED_NOTE} – jobbet ska inte tillverkas`, 409);
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
