import { hubFileFor } from "@/lib/poc/hub/files";

const TYPES: Record<string, string> = {
  bmp: "image/bmp",
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  json: "application/json",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/**
 * En produktionsfil i en order till New Waves hubb, via länken i ordern (`HubOrderLine.files`). Länken är signerad och
 * tidsbegränsad (lib/poc/hub/files.ts) och är själv nyckeln: inget lösenord eller API-nyckel behövs. Filen byggs vid
 * hämtningen ur klubbproduktens specifikation, med samma kod som producenternas filer. 403 för en ogiltig länk, 410 när
 * den gått ut eller ordern är avbruten, 404 när filen inte finns.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const r = await hubFileFor(decodeURIComponent(token));
    if ("error" in r) return Response.json({ error: r.error }, { status: r.status, headers: { "Cache-Control": "no-store" } });
    const name = r.file.name;
    const ascii = name.replace(/[^\w.-]/g, "_");
    return new Response(new Uint8Array(r.file.data), {
      headers: {
        "Content-Type": TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(r.file.data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    console.error("hub/filer", e instanceof Error ? e.message : e);
    return Response.json({ error: "Filen kunde inte byggas just nu. Försök igen om en stund." }, { status: 503 });
  }
}
