import { type NwProduct, nwProduct, printOf } from "@/lib/newwave/catalog";
import { onChest } from "@/lib/newwave/marking";
import { surfaceLayer } from "@/lib/newwave/printSurface";
import { logoFor, type QuoteLineInput } from "@/lib/newwave/reseller";

type Props = {
  product: NwProduct;
  logo?: string;
  logoDark?: string;
  /** Liten logga på vänster bröst i stället för stor mitt på. */
  chest?: boolean;
  className?: string;
};

/** Produktfotot med loggan lagd på tryckytan i 3D: rätt vinkel, perspektiv och böjd runt runda produkter. */
export function ProductMock({ product, logo, logoDark, chest = false, className = "" }: Props) {
  const src = logoFor(product, { logo, logoDark });
  const layer = surfaceLayer(printOf(product, chest));
  return (
    <div className={`relative aspect-square overflow-hidden bg-[#F4F4F2] [container-type:inline-size] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.photo} alt={product.name} className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
      {src ? (
        <div aria-hidden className={`pointer-events-none absolute h-0 w-0 ${product.dark ? "opacity-[0.94]" : "mix-blend-multiply"}`} style={layer.holder}>
          <div className="absolute [transform-style:preserve-3d]" style={layer.plane}>
            {layer.strips.map(({ strip, image }, i) => (
              <div key={i} className="absolute inset-y-0 overflow-hidden" style={strip}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="absolute inset-y-0 h-full max-w-none object-contain" style={image} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** En offertrads bild: designstudions bild, annars produktfotot med kundens logga. */
export function LineMock({ line, className = "" }: { line: Pick<QuoteLineInput, "productId" | "design" | "logo" | "logoDark" | "preview">; className?: string }) {
  const p = nwProduct(line.productId);
  if (!p) return null;
  if (line.preview)
    return (
      <div className={`relative aspect-square overflow-hidden bg-[#F4F4F2] ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={line.preview} alt={p.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      </div>
    );
  return <ProductMock product={p} logo={line.design.logo ?? line.logo} logoDark={line.design.logo ? line.design.logoDark : line.logoDark} chest={onChest(line.design)} className={className} />;
}
