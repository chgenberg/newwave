import { METHOD_INFO } from "@/lib/newwave/marking";
import { garmentOptions, pocDesign } from "@/lib/poc/build";
import { baseProduct, POC_CATALOG } from "@/lib/poc/catalog";

/**
 * Katalogen: Crafts plagg (platshållare tills Crafts produktdata importerats) och halsduken, med plaggens produktfoto,
 * tryckmetod och färgerna plagget kan få (`colorOptions`; klubbens mörkaste färg kan tillkomma per klubb).
 */
export function GET() {
  const products = POC_CATALOG.map((p) => {
    const base = baseProduct(p);
    // Metoden som plagget verkligen trycks med i flödet (inget broderi, se pocDesign).
    return { ...p, ...(base ? { photo: base.photo, method: METHOD_INFO[pocDesign(base).method].label, colorOptions: garmentOptions(p, base) } : {}) };
  });
  return Response.json({ products });
}
