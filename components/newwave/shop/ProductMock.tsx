import { type NwProduct, nwProduct, printOf } from "@/lib/newwave/catalog";
import { MOCKUP_VERSION } from "@/lib/newwave/printSurface";
import { logoFor, type QuoteLineInput } from "@/lib/newwave/reseller";

type Props = {
  product: NwProduct;
  logo?: string;
  logoDark?: string;
  /** Designens zon, när den ändrar var trycket sitter på fotot (vänster bröst eller mitt på). */
  zone?: string;
  className?: string;
};

/** Ändras när tryckytan eller renderingen ändras, så att webbläsaren inte visar en gammal bild. */
function version(p: NwProduct, zone?: string) {
  const s = JSON.stringify([MOCKUP_VERSION, p.photo, printOf(p, zone)]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const mockupSrc = (p: NwProduct, logo: string, zone?: string) =>
  `/api/v1/newwave/mockup?${new URLSearchParams({ p: p.id, l: logo, s: "800", ...(zone ? { z: zone } : {}), v: version(p, zone) })}`;

/** Produktfotot med loggan tryckt på ytan: rätt vinkel, böjd runt runda produkter och med fotots ljus och veck. */
export function ProductMock({ product, logo, logoDark, zone, className = "" }: Props) {
  const src = logoFor(product, { logo, logoDark });
  return (
    <div className={`relative aspect-square overflow-hidden bg-[#F4F4F2] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.photo} alt={product.name} className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mockupSrc(product, src, zone)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
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
  return <ProductMock product={p} logo={line.design.logo ?? line.logo} logoDark={line.design.logo ? line.design.logoDark : line.logoDark} zone={line.design.zone} className={className} />;
}
