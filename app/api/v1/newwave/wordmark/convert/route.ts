import { clientIp, createLimiter, envInt } from "@/lib/demoLimit";
import { errorMessage } from "@/lib/openai";
import { ConvertError, convertDesign } from "@/lib/newwave/wordmark/convert";

export const maxDuration = 60;

const MAX_BYTES = 10_000_000;
const limiter = createLimiter(() => ({ perKey: envInt("NW_WORDMARK_CONVERT_PER_IP_HOUR", 60), global: envInt("NW_WORDMARK_CONVERT_GLOBAL_HOUR", 400), windowMs: 60 * 60 * 1000 }));

/** En AI-, PDF- eller bildfil in som den är, en SVG ut som importen kan dela upp – ingen AI, bara omvandling. */
export async function POST(req: Request) {
  const tooBig = Response.json({ error: "Filen är för stor – max 10 MB." }, { status: 413 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return tooBig;
  if (!limiter.take(clientIp(req)).ok) return Response.json({ error: "Många filer på kort tid – försök igen om en stund." }, { status: 429 });
  const buf = Buffer.from(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (!buf.length) return Response.json({ error: "Filen är tom." }, { status: 400 });
  if (buf.length > MAX_BYTES) return tooBig;
  try {
    return Response.json(await convertDesign(buf));
  } catch (err) {
    if (err instanceof ConvertError) return Response.json({ error: err.message }, { status: err.status });
    console.error("newwave/wordmark/convert", errorMessage(err));
    return Response.json({ error: "Kunde inte läsa filen. Försök igen eller exportera som SVG." }, { status: 500 });
  }
}
