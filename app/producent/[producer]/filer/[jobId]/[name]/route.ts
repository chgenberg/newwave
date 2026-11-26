import { NextResponse } from "next/server";
import { loginPath, producerRequestOk } from "@/components/poc/producer/access";
import { buildJobFiles, isProducer } from "@/lib/poc/orders";
import { getJob } from "@/lib/poc/store";

type Ctx = { params: Promise<{ producer: string; jobId: string; name: string }> };

const TYPES: Record<string, string> = {
  bmp: "image/bmp",
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

/**
 * Jobbets produktionsfil för nedladdning i webbläsaren, från producentens kö. Samma filer som producent-API:t ger, men
 * med producentens inloggning i stället för API-nyckeln. Filerna byggs vid nedladdning ur klubbproduktens specifikation.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { producer, jobId, name } = await ctx.params;
  if (!isProducer(producer)) return new NextResponse("Finns inte.", { status: 404 });
  if (!(await producerRequestOk(req, producer))) return new NextResponse(`Logga in först: ${loginPath(producer)}`, { status: 401 });
  const job = await getJob(jobId);
  if (!job || job.producer !== producer) return new NextResponse("Jobbet finns inte.", { status: 404 });
  const file = (await buildJobFiles(job))?.find((f) => f.name === name);
  if (!file) return new NextResponse("Filen finns inte.", { status: 404 });
  const ascii = file.name.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
