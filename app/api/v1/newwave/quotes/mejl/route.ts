import { dataUri, quoteArt, quoteLinks } from "@/lib/newwave/quoteDoc";
import { quoteMailHtml } from "@/lib/newwave/quoteMail";
import { CURRENT_RESELLER, getReseller, quotesFor } from "@/lib/newwave/shopState";
import { workspaceId } from "@/lib/newwave/workspace";

/** Mejlet som kunden får, för återförsäljarens egen offert. Bilderna är inbäddade i stället för bifogade. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const [reseller, quotes] = await Promise.all([getReseller(CURRENT_RESELLER), quotesFor(CURRENT_RESELLER)]);
  const quote = quotes.find((q) => q.id === id);
  if (!reseller || !quote) return new Response("Hittades inte", { status: 404 });
  const art = await quoteArt(quote, reseller);
  const html = quoteMailHtml(quote, reseller, quoteLinks(reseller, quote.token, await workspaceId()), {
    logo: art.logo ? dataUri(art.logo, "png") : null,
    lines: art.lines.map((b) => dataUri(b, "jpeg")),
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'", "Cache-Control": "private, no-store" },
  });
}
