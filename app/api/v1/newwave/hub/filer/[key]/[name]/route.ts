import { readHubFile } from "@/lib/newwave/hubDelivery";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  dst: "application/octet-stream",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/** En produktionsfil från hubben; `?dl=1` laddar ner den med sitt riktiga namn. */
export async function GET(req: Request, ctx: { params: Promise<{ key: string; name: string }> }) {
  const { key, name } = await ctx.params;
  const data = await readHubFile(key, name);
  if (!data) return new Response("Hittades inte", { status: 404 });
  const download = new URL(req.url).searchParams.has("dl");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[name.split(".").pop()!] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
