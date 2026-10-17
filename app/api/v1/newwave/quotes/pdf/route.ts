import { clientIp, createLimiter, envInt } from "@/lib/demoLimit";
import { quoteArt, quoteLinks, quotePdf } from "@/lib/newwave/quoteDoc";
import { quoteByToken } from "@/lib/newwave/shopState";
import { workspaceId } from "@/lib/newwave/workspace";

export const maxDuration = 30;

const limiter = createLimiter(() => ({
  perKey: envInt("NW_QUOTE_PDF_PER_IP_HOUR", 30),
  global: envInt("NW_QUOTE_PDF_GLOBAL_HOUR", 300),
  windowMs: 60 * 60 * 1000,
}));

/** Offerten som PDF; den hemliga länken till kundens offertsida är det som ger åtkomst. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const found = /^[a-f0-9]{20}$/.test(token) ? await quoteByToken(token) : null;
  if (!found) return new Response("Hittades inte", { status: 404 });

  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return new Response("För många nedladdningar. Försök igen om en stund.", { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });

  const { quote, reseller } = found;
  const links = quoteLinks(reseller, token, await workspaceId());
  const pdf = await quoteArt(quote, reseller)
    .then((art) => quotePdf(quote, reseller, links, art))
    .catch(() => null);
  if (!pdf) return new Response("Kunde inte skapa PDF", { status: 500 });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Offert-${quote.id}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
