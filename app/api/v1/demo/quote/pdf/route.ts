import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { clientIp, createLimiter, envInt } from "@/lib/demoLimit";
import { type QuoteDoc, quotePdf } from "@/lib/demoPdf";

export const maxDuration = 30;

const DIR = path.join(process.cwd(), ".data", "demo", "quotes");
const limiter = createLimiter(() => ({
  perKey: envInt("DEMO_PDF_PER_IP_HOUR", 20),
  global: envInt("DEMO_PDF_GLOBAL_HOUR", 300),
  windowMs: 60 * 60 * 1000,
}));

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The reference is guessable, so the random token handed out with the quote is what grants access. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ref = q.get("ref") ?? "";
  const token = q.get("t") ?? "";
  if (!/^MF-\d{4}-\d{4}-\d{3}$/.test(ref) || !/^[A-Za-z0-9_-]{22}$/.test(token)) return new Response("Hittades inte", { status: 404 });
  const record = await readFile(path.join(DIR, `${ref}.json`), "utf8")
    .then((s) => JSON.parse(s) as QuoteDoc & { token?: string })
    .catch(() => null);
  if (!record?.token || !same(record.token, token)) return new Response("Hittades inte", { status: 404 });

  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return new Response("För många nedladdningar. Försök igen om en stund.", { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });

  const pdf = await quotePdf(record).catch(() => null);
  if (!pdf) return new Response("Kunde inte skapa PDF", { status: 500 });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Offert-${ref}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
