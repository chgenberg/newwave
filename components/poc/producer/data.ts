import { intersportClub } from "@/lib/intersport";
import { ensureJobFiles } from "@/lib/poc/orders";
import { getJob, getOrderView, type JobView, listJobs } from "@/lib/poc/store";
import type { Order, Producer } from "@/lib/poc/types";

/**
 * Det kön visar per jobb: jobbet med kunden, raderna och orderns status (kärnans JobView), och från ordern
 * leveranssättet, Crafts ordernummer och varför den avbröts.
 */

export type QueueOrder = Pick<Order, "shipping" | "cancelReason" | "erpRef">;
export type QueueJob = JobView & { order: QueueOrder; clubName: string };
export type QueueView = { todo: QueueJob[]; cancelled: QueueJob[]; done: QueueJob[] };

/** Avbrutna och skickade jobb visas bara de senaste av. */
const RECENT = 20;

async function withOrders(jobs: JobView[]): Promise<QueueJob[]> {
  const orderIds = [...new Set(jobs.map((j) => j.orderId))];
  const clubIds = [...new Set(jobs.map((j) => j.clubId))];
  const [orders, clubs] = await Promise.all([Promise.all(orderIds.map((id) => getOrderView(id))), Promise.all(clubIds.map((id) => intersportClub(id)))]);
  const orderById = new Map(orders.filter((o) => !!o).map((o) => [o.id, { shipping: o.shipping, cancelReason: o.cancelReason, erpRef: o.erpRef }]));
  const clubName = new Map(clubIds.map((id, i) => [id, clubs[i]?.name ?? id]));
  return jobs.map((j) => ({ ...j, order: orderById.get(j.orderId) ?? {}, clubName: clubName.get(j.clubId) ?? j.clubId }));
}

/** Är jobbets order avbruten, så att jobbet inte ska tillverkas? Kärnan ger då jobbet status "fel". */
export const isCancelled = (j: Pick<JobView, "orderStatus" | "status">) => j.orderStatus === "avbruten" && j.status !== "skickad";

const latest = (jobs: JobView[]) => [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT);

/** Producentens kö: att göra (äldst först), de senaste avbrutna och de senaste skickade. */
export async function queueView(producer: Producer): Promise<QueueView> {
  const listed = await listJobs(producer);
  const todo = listed.filter((j) => j.status !== "skickad" && !isCancelled(j));
  // Fillistan fylls i efter ordern; saknas den fortfarande (t.ex. om byggaren inte fanns då) tas den fram här.
  const ready = await Promise.all(todo.map((j) => (j.files.length ? j : ensureJobFiles(j.id).then((x) => x ?? j, () => j))));
  const cancelled = latest(listed.filter(isCancelled));
  const done = latest(listed.filter((j) => j.status === "skickad"));
  const all = await withOrders([...ready, ...cancelled, ...done]);
  const byId = new Map(all.map((j) => [j.id, j]));
  const pick = (list: JobView[]) => list.map((j) => byId.get(j.id)!);
  return { todo: pick(ready), cancelled: pick(cancelled), done: pick(done) };
}

/** Ett jobb i producentens kö, eller null om det inte finns eller hör till den andra producenten. */
export async function queueJob(producer: Producer, jobId: string): Promise<QueueJob | null> {
  const job = await getJob(jobId);
  if (!job || job.producer !== producer) return null;
  return (await withOrders([job]))[0];
}

/** Mottagaren på rader: namn, gatuadress, postnummer och ort. Kassan sparar adressen som "Gata 1, 123 45 Ort". */
export function addressLines(j: Pick<JobView, "customer">): string[] {
  const c = j.customer;
  const address = (c.address ?? "")
    .split(/\s*,\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [c.name, ...address];
}
