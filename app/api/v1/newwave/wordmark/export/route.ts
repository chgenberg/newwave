import { nwProduct } from "@/lib/newwave/catalog";
import { artZone, maxCmIn, type Method, methodsFor } from "@/lib/newwave/marking";
import { EXPORT_METHODS, wordmarkJob, wordmarkZip } from "@/lib/newwave/wordmark/printJob";
import { parseWordmarkQuery } from "@/lib/newwave/wordmark/spec";
import { isBackTemplate } from "@/lib/newwave/wordmark/templates";

export const maxDuration = 120;

/**
 * Tryckfiler för ett ordmärke: ordmärkets parametrar plus m=metod, p=produkt, cm=bredd och g=plaggets färg.
 * `info=1` ger färger, Pantone, stygn och pris som JSON; annars en zip med allt tryckeriet behöver.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  params.set("s", "3543");
  params.delete("f");
  const q = parseWordmarkQuery(params);
  const product = nwProduct(params.get("p") ?? "p001");
  const method = params.get("m") as Method;
  if (!q || !product || !EXPORT_METHODS.includes(method) || !methodsFor(product).includes(method)) return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  const sizeCm = Math.min(maxCmIn(product, artZone(product, method, isBackTemplate(q.template)), Infinity), Math.max(3, Math.round(Number(params.get("cm")) || 25)));
  const g = params.get("g") ?? "";
  const garment = /^#[0-9a-f]{6}$/i.test(g) ? g.toUpperCase() : product.garmentHex;
  const w = await wordmarkJob(q, product, method, sizeCm, garment);
  if (!w) return Response.json({ error: "Kunde inte göra tryckfilerna." }, { status: 404 });
  if (params.get("info") === "1") {
    const { job } = w;
    return Response.json({
      method: job.methodLabel,
      placement: job.placement,
      sizeMm: job.sizeMm.map(Math.round),
      inks: job.inks,
      facts: job.facts,
      notes: job.notes,
      colors: w.colors,
      prices: w.prices,
      files: [...job.files.map((f) => ({ name: f.name, label: f.label, format: f.format })), { name: `${w.slug}-original.svg`, label: "Original, vektor", format: "SVG" }],
    });
  }
  const zip = await wordmarkZip(w, product, garment);
  return new Response(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${w.slug}-${method}.zip"`, "Cache-Control": "private, no-store" },
  });
}
