import { wordmarkFile } from "@/lib/newwave/wordmark/serve";
import { parseWordmarkQuery } from "@/lib/newwave/wordmark/spec";

/** Ett ordmärke för en klubb: ?t=mall&c=klubb[&n1=&n2=&i=0&o=0]&v=light|dark&s=storlek[&f=svg]. */
export async function GET(req: Request) {
  const q = parseWordmarkQuery(new URL(req.url).searchParams);
  if (!q) return new Response("Ogiltig förfrågan", { status: 400 });
  const file = await wordmarkFile(q);
  if (!file) return new Response("Hittades inte", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": file.type, "Cache-Control": "private, max-age=86400" };
  if (q.format === "svg") headers["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  return new Response(new Uint8Array(file.data), { headers });
}
