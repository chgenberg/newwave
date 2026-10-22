import { grasrotPackage, parseFileName, printFile } from "@/lib/newwave/grasrot/files";

export const maxDuration = 120;

/**
 * En Gräsrot 360-tryckfil, byggd på begäran: `ordmarke-negativ-spot.pdf`, `klubbmarke-original.svg` – eller hela
 * paketet som `paket.zip`. `?dl=1` laddar ner filen med sitt riktiga namn.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const download = new URL(req.url).searchParams.has("dl");
  const headers = (name: string, mime: string) => ({
    "Content-Type": mime,
    "Cache-Control": "private, no-cache",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
  });
  if (file === "paket.zip") {
    const pack = await grasrotPackage(id);
    if (!pack) return new Response("Hittades inte", { status: 404 });
    return new Response(new Uint8Array(pack.data), { headers: { ...headers(pack.name, "application/zip"), "Content-Disposition": `attachment; filename="${pack.name}"` } });
  }
  const parsed = parseFileName(file);
  const out = parsed && (await printFile(id, parsed.artwork, parsed.opts));
  if (!out) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(out.data), { headers: headers(out.name, out.mime) });
}
