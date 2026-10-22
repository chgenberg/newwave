"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ShopColor, ShopDesign, ShopProduct } from "@/lib/newwave/grasrot/shop";
import { grasrotBase, mockupSrc } from "@/lib/newwave/grasrot/urls";

const ShopViewer = dynamic(() => import("./ShopViewer").then((m) => m.ShopViewer), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center text-[13px] text-[#6F6B63]">Laddar 3D…</p>,
});

/** Produkten i 3D med trycket i rätt storlek, eller fotot i färgen; vävda produkter finns bara som foto. */
export function ProductStage({ id, product, color, design, className = "" }: { id: string; product: ShopProduct; color: ShopColor; design: ShopDesign; className?: string }) {
  const [mode, setMode] = useState<"3d" | "foto">("3d");
  return (
    <div className={`relative aspect-square overflow-hidden bg-[#F3F2EF] ${className}`}>
      {product.model && mode === "3d" ? (
        <ShopViewer key={product.id} catalog={product.model} zone={design.zone} color={color.hex} art={`${grasrotBase(id)}/${design.art}`} method={design.method} widthMm={design.widthMm} />
      ) : (
        <img src={mockupSrc(id, product.id, color.id)} alt={`${product.short} i ${color.name}`} className="absolute inset-0 h-full w-full object-contain" />
      )}
      {product.model ? (
        <div className="absolute right-3 top-3 flex rounded-full bg-white/90 p-0.5 text-[12.5px] shadow-sm ring-1 ring-black/5">
          {(["3d", "foto"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 font-medium ${mode === m ? "bg-[#111] text-white" : "text-[#111]"}`}>
              {m === "3d" ? "3D" : "Foto"}
            </button>
          ))}
        </div>
      ) : (
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[12px] text-[#6F6B63] shadow-sm">Vävd – visas som foto</span>
      )}
    </div>
  );
}

/** Färgerna som runda knappar; tvåfärgade kepsar visar skärmen nedtill. */
export function Swatches({ product, color, onPick, size = "h-8 w-8" }: { product: ShopProduct; color: ShopColor; onPick: (id: string) => void; size?: string }) {
  if (product.colors.length < 2) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Färg">
      {product.colors.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={c.id === color.id}
          aria-label={c.name}
          title={c.name}
          onClick={() => onPick(c.id)}
          className={`${size} overflow-hidden rounded-full ring-offset-2 transition-shadow ${c.id === color.id ? "ring-2 ring-[#111]" : "ring-1 ring-black/15"}`}
          style={{ background: c.visor ? `linear-gradient(180deg, ${c.hex} 55%, ${c.visor} 55%)` : c.hex }}
        />
      ))}
    </div>
  );
}
