import { readJson } from "@/lib/demoLimit";
import { errorResponse, producerAccess, setJobStatus } from "@/lib/poc/orders";
import type { JobStatus } from "@/lib/poc/types";

/** Producentens statusrapport: `{ status, note?, tracking? }`. Spårningsnummer krävs när jobbet skickas. */
export async function POST(req: Request, ctx: { params: Promise<{ producer: string; id: string }> }) {
  const { producer: p, id } = await ctx.params;
  const producer = await producerAccess(req, p);
  if (producer instanceof Response) return producer;
  const body = await readJson(req, 20_000);
  if (body === undefined) return Response.json({ error: "Kroppen är för stor" }, { status: 413 });
  if (body === null) return Response.json({ error: "Kroppen är inte giltig JSON" }, { status: 400 });
  try {
    const { job, order } = await setJobStatus(producer, id, body as { status: JobStatus; note?: string; tracking?: string });
    return Response.json({ job, order: { id: order.id, number: order.number, status: order.status } });
  } catch (e) {
    return errorResponse(e);
  }
}
