"use client";

import { useState } from "react";
import type { ShopProduct } from "@/lib/newwave/grasrot/shop";
import { ProductStage, Swatches } from "./ProductStage";

/** En Bilaga 2-produkt i klubbens butik: 3D eller foto i färgen man väljer, och trycket den får. `children` är vad man gör med den. */
export function ShopProductView({ id, product, featured, clubName, children }: { id: string; product: ShopProduct; featured: string; clubName: string; children: React.ReactNode }) {
  const [pick, setPick] = useState(featured);
  const color = product.colors.find((c) => c.id === pick) ?? product.colors[0];
  const design = product.designs[color.id];
  const cm = (mm: number) => (mm / 10).toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  const details = [
    ["Produkt", `${product.name} · ${product.supplier}`],
    ["Tryck", `${design.label} · ${design.methodText}`],
    ["Placering", `${design.zoneLabel}, ${cm(design.widthMm)} × ${cm(design.heightMm)} cm`],
    ["Kollektion", "Gräsrot 360 med New Wave Group"],
  ];
  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
      <ProductStage id={id} product={product} color={color} design={design} className="rounded-[24px]" />

      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#6F6B63]">{clubName} · Klubbkollektionen</p>
        <h1 className="mt-1 text-[30px] font-black leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[38px]">{product.short}</h1>
        <p className="mt-4 text-[13.5px] font-medium text-[#6F6B63]">Färg: {color.name}</p>
        <Swatches product={product} color={color} onPick={setPick} size="h-9 w-9" />
        {children}
        <dl className="mt-8 divide-y divide-[#ECEAE5] border-y border-[#ECEAE5] text-[14px]">
          {details.map(([k, val]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-3">
              <dt className="text-[#6F6B63]">{k}</dt>
              <dd className="min-w-0">{val}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
