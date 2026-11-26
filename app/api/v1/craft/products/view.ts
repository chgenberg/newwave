import { variantLabel } from "@/components/poc/craft/variants";
import { readSpec } from "@/lib/poc/build";
import { catalogProduct } from "@/lib/poc/catalog";
import type { ClubProduct, Design } from "@/lib/poc/types";

/** En klubbprodukt som Crafts shopvy visar den: med designens namn, variantens texter, plaggets färg och katalogpriset. */
export function shopProductView(p: ClubProduct, design: Pick<Design, "name" | "source"> | undefined, orders = 0) {
  const spec = readSpec(p.spec);
  const variant = spec?.kind === "halsduk" ? spec.variant : spec?.design.type === "ordmall" ? spec.design.variant : undefined;
  const color = spec?.kind === "plagg" ? (spec.color ?? { name: "", hex: spec.product.garment, how: "auto" as const }) : undefined;
  return {
    id: p.id,
    designId: p.designId,
    designName: design?.name ?? spec?.design.name ?? "Design",
    designType: design?.source.type ?? null,
    sku: p.sku,
    kind: p.kind,
    productName: catalogProduct(p.sku)?.name ?? p.sku,
    title: p.title,
    priceSek: p.priceSek,
    catalogPriceSek: catalogProduct(p.sku)?.priceSek ?? null,
    customPrice: Boolean(p.customPrice),
    mockupUrl: p.mockupUrl,
    status: p.status,
    variant: p.variant ?? "",
    label: variant ? variantLabel(variant) : "",
    color: color ? { name: color.name, hex: color.hex } : null,
    orders,
    createdAt: p.createdAt,
  };
}

export type ShopProductView = ReturnType<typeof shopProductView>;
