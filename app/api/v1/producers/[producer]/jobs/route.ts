import type { NextRequest } from "next/server";
import { errorResponse, producerAccess } from "@/lib/poc/orders";
import { listJobs } from "@/lib/poc/store";
import type { JobStatus } from "@/lib/poc/types";

const STATUSES: JobStatus[] = ["ny", "accepterad", "i produktion", "skickad", "fel"];

/** Producentens kö, äldst först: `?status=`. Producentens inloggning, eller huvud `x-api-key` med producentens nyckel. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ producer: string }> }) {
  const producer = await producerAccess(req, (await ctx.params).producer);
  if (producer instanceof Response) return producer;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  if (status && !STATUSES.includes(status as JobStatus)) return Response.json({ error: `Okänd status. Välj en av: ${STATUSES.join(", ")}` }, { status: 400 });
  try {
    return Response.json({ jobs: await listJobs(producer, status as JobStatus | undefined) });
  } catch (e) {
    return errorResponse(e);
  }
}
