import { type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { onChest } from "@/lib/newwave/marking";
import { logoFor, markBox, type QuoteLineInput } from "@/lib/newwave/reseller";

type Props = {
  product: NwProduct;
  logo?: string;
  logoDark?: string;
  /** Liten logga på vänster bröst i stället för stor mitt på. */
  chest?: boolean;
  className?: string;
};

/** Produktfotot med en logga där den trycks. */
export function ProductMock({ product, logo, logoDark, chest = false, className = "" }: Props) {
  const src = logoFor(product, { logo, logoDark });
  return (
    <div className={`relative aspect-square overflow-hidden bg-[#F4F4F2] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.photo} alt={product.name} className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          className={`absolute object-contain object-top transition-all duration-300 ${product.dark ? "" : "mix-blend-multiply"}`}
          style={markBox(product, chest)}
        />
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
