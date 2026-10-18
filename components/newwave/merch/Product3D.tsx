"use client";

import { useEffect, useState } from "react";
import type { NwProduct } from "@/lib/newwave/catalog";
import { type Design, sizeCmFor, zonesFor } from "@/lib/newwave/marking";
import { buildLogoArt, isDark, type LogoArt } from "../studio/logoArt";
import { fallbackKind, ProductScene } from "../studio/ProductScene";

const noop = () => {};

/** Produkten i 3D med trycket på, att snurra på – samma scen som designstudion men utan verktygen. */
export function Product3D({ product, design, art, color }: { product: NwProduct; design: Design; art: { light: string; dark: string }; color: string }) {
  const dark = isDark(color);
  const logo = design.logo ? (dark ? (design.logoDark ?? design.logo) : design.logo) : dark ? art.dark : art.light;
  const [built, setBuilt] = useState<{ key: string; art: LogoArt } | null>(null);
  const [model, setModel] = useState<{ url: string; ok: boolean } | null>(null);
  const key = JSON.stringify([logo, design.method, design.colors, design.shape, dark]);

  useEffect(() => {
    let live = true;
    buildLogoArt(logo, design, dark ? "#111111" : "#FFFFFF").then((a) => live && setBuilt({ key, art: a }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nyckeln täcker det som ändrar trycket
  }, [key]);

  useEffect(() => {
    const url = product.model;
    if (!url) return;
    let live = true;
    fetch(url, { method: "HEAD" })
      .then((r) => live && setModel({ url, ok: r.ok }))
      .catch(() => live && setModel({ url, ok: false }));
    return () => {
      live = false;
    };
  }, [product.model]);

  const modelUrl = !product.model ? null : model?.url === product.model ? (model.ok ? model.url : null) : undefined;
  if (modelUrl === undefined) return <div className="h-full w-full animate-pulse bg-[#F4F4F2]" aria-hidden />;

  return (
    <ProductScene
      modelUrl={modelUrl}
      fallback={fallbackKind(product)}
      color={color}
      layers={[{ key: "main", zone: design.zone, point: design.point, normal: design.normal, sizeCm: design.sizeCm, method: design.method, art: built?.key === key ? built.art : null }]}
      active="main"
      zones={zonesFor(product)}
      sizeCm={sizeCmFor(product)}
      onPlace={noop}
      onSelect={noop}
      onReady={noop}
      preview
    />
  );
}
