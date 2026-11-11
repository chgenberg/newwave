import { loadFile } from "@/lib/store";

const CACHE = "public, max-age=31536000, immutable";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const file = await loadFile(id);
  if (!file) return new Response("Hittades inte", { status: 404 });
  const size = file.data.length;
  const headers = { "Content-Type": file.type, "Cache-Control": CACHE, "Accept-Ranges": "bytes" };

  // Safari spelar bara film som går att hämta i delar.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(new Uint8Array(file.data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(file.data), { headers: { ...headers, "Content-Length": String(size) } });
}
