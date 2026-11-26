import { buildJobFiles, ensureJobFiles, errorResponse, producerAccess } from "@/lib/poc/orders";
import { getJob } from "@/lib/poc/store";

const TYPES: Record<string, string> = {
  bmp: "image/bmp",
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
};

/**
 * En produktionsfil, byggd vid nedladdning ur klubbproduktens specifikation (lib/poc/build.ts). Nyckeln kan också
 * ges som `?key=`, så att filen går att ladda ner direkt via en länk.
 */
export async function GET(req: Request, ctx: { params: Promise<{ producer: string; id: string; name: string }> }) {
  const { producer: p, id, name } = await ctx.params;
  const producer = await producerAccess(req, p, { query: true });
  if (producer instanceof Response) return producer;
  try {
    const job = await getJob(id);
    if (!job || job.producer !== producer) return Response.json({ error: "Jobbet finns inte" }, { status: 404 });
    const files = await buildJobFiles(job);
    const file = files.find((f) => f.name === name);
    if (!file) return Response.json({ error: `Filen finns inte i jobbet. Filerna: ${files.map((f) => f.name).join(", ") || "inga"}` }, { status: 404 });
    if (!job.files.length) await ensureJobFiles(id);
    const ascii = name.replace(/[^\w.-]/g, "_");
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
