import { ensureJobFiles, errorResponse, producerAccess } from "@/lib/poc/orders";

/** Ett jobb med raderna, kunden och produktionsfilerna. */
export async function GET(req: Request, ctx: { params: Promise<{ producer: string; id: string }> }) {
  const { producer: p, id } = await ctx.params;
  const producer = await producerAccess(req, p);
  if (producer instanceof Response) return producer;
  try {
    const job = await ensureJobFiles(id);
    if (!job || job.producer !== producer) return Response.json({ error: "Jobbet finns inte" }, { status: 404 });
    return Response.json({ job });
  } catch (e) {
    return errorResponse(e);
  }
}
