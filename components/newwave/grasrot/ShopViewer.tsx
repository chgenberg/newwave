"use client";

import { useEffect, useMemo, useState } from "react";
import { nwProduct } from "@/lib/newwave/catalog";
import { type Method, sizeCmFor, zonesFor } from "@/lib/newwave/marking";
import { buildLogoArt, type LogoArt } from "../studio/logoArt";
import { fallbackKind, type Layer, ProductScene } from "../studio/ProductScene";

/** Gräsrot-metoderna som 3D-modellen visar dem. */
const LOOK: Record<string, Method> = { screentryck: "screentryck", transfer: "transfer", brodyr: "brodyr", digitaltryck: "digitaltryck", lasergravyr: "gravyr" };

/** Produkten i 3D i plaggfärgen, med tryckfilens PNG i rätt storlek på rätt zon; den snurrar tills någon tar tag i den. */
export function ShopViewer({ catalog, zone, color, art, method, widthMm }: { catalog: string; zone: string; color: string; art: string; method: string; widthMm: number }) {
  const product = nwProduct(catalog)!;
  const zones = useMemo(() => zonesFor(product), [product]);
  const [logo, setLogo] = useState<{ key: string; art: LogoArt } | null>(null);
  const key = `${art}|${method}|${color}`;

  useEffect(() => {
    let live = true;
    buildLogoArt(art, { method: LOOK[method] ?? "screentryck", colors: 4, shape: "original" }, color).then((a) => live && setLogo({ key, art: a }));
    return () => {
      live = false;
    };
  }, [art, method, color, key]);

  const layers: Layer[] = logo?.key === key ? [{ key: "tryck", zone, sizeCm: widthMm / 10, method: LOOK[method] ?? "screentryck", art: logo.art }] : [];
  return (
    <ProductScene
      modelUrl={product.model}
      fallback={fallbackKind(product)}
      color={color}
      layers={layers}
      active="tryck"
      zones={zones}
      sizeCm={sizeCmFor(product)}
      onPlace={() => {}}
      onSelect={() => {}}
      onReady={() => {}}
      preview
    />
  );
}
