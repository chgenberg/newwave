"use client";

import { useEffect, useState } from "react";
import { BOOTH_ASPECTS, type BoothFormat, cropOf, lineTotal, type Product, SWATCHES, sek } from "@/lib/demoCatalog";
import { CropThumb, Icons, Primary, Stepper } from "./parts";

export type Line = { qty: number; model: string; color: string; style: string };
/** The booth photo a product crop is cut from, and the framing its crop coordinates belong to. */
export type BoothView = { url: string; format: BoothFormat };

export function productImage(p: Product, modelId: string, mockups: Record<string, string>) {
  const m = p.models.find((x) => x.id === modelId) ?? p.models[0];
  return mockups[`${p.id}:${m.id}`] ?? m.mockup?.blank ?? null;
}

export function ProductVisual({ product, model, mockups, boothFor, className = "", aspect = 4 / 3 }: { product: Product; model: string; mockups: Record<string, string>; boothFor: (p: Product) => BoothView; className?: string; aspect?: number }) {
  if (product.crop) {
    const b = boothFor(product);
    return <CropThumb url={b.url} crop={cropOf(product, b.format) ?? product.crop} source={BOOTH_ASPECTS[b.format]} aspect={aspect} className={className} />;
  }
  const src = productImage(product, model, mockups);
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-white ${className}`} style={{ aspectRatio: String(aspect) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={product.name} className="h-full w-full object-contain" />}
    </div>
  );
}

export function ProductDrawer(props: {
  product: Product;
  line: Line | null;
  brandColor: string;
  mockups: Record<string, string>;
  boothFor: (p: Product) => BoothView;
  onSave: (line: Line) => void;
  onClose: () => void;
}) {
  const { product: p } = props;
  const [model, setModel] = useState(props.line?.model ?? p.models[0].id);
  const [color, setColor] = useState(props.line?.color ?? props.brandColor);
  const [qty, setQty] = useState(props.line?.qty ?? p.defaultQty);
  const current = p.models.find((m) => m.id === model) ?? p.models[0];
  const swatches = [props.brandColor, ...SWATCHES.filter((s) => s.toLowerCase() !== props.brandColor.toLowerCase())];
  const style = props.line?.style ?? p.styles[0];

  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-label={p.name}>
      <button type="button" aria-label="Stäng" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={props.onClose} />
      <aside className="ifk-pop relative flex h-full w-full max-w-[420px] flex-col overflow-y-auto bg-white shadow-[-20px_0_60px_rgba(0,0,0,0.15)] sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-2xl">
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-[22px] font-semibold tracking-tight">{p.name}</h2>
          <button type="button" onClick={props.onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F5F5F7]" aria-label="Stäng">
            {Icons.close}
          </button>
        </div>

        <div className="mx-6 mt-4 overflow-hidden rounded-2xl bg-[#F5F5F7]">
          <ProductVisual product={p} model={model} mockups={props.mockups} boothFor={props.boothFor} />
        </div>

        {p.models.length > 1 && (
          <div className="mx-6 mt-6">
            <p className="text-[13px] font-medium">Modell</p>
            <div className="mt-2 space-y-2">
              {p.models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  aria-pressed={m.id === model}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${m.id === model ? "border-[#1D1D1F] ring-1 ring-[#1D1D1F]" : "border-black/10 hover:border-black/25"}`}
                >
                  <span className="text-[14px] font-medium">{m.name}</span>
                  <span className="text-[13px] tabular-nums text-[#6E6E73]">
                    {sek(m.priceSek)}
                    {p.booth ? "" : `/${p.unit}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mx-6 mt-3 text-[13px] leading-snug text-[#6E6E73]">{current.desc}</p>

        <div className="mx-6 mt-6">
          <p className="text-[13px] font-medium">Färg</p>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {swatches.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={i === 0 ? "Varumärkesfärg" : c}
                aria-label={i === 0 ? "Varumärkesfärg" : `Färg ${c}`}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full border border-black/10 ring-offset-2 transition ${color === c ? "ring-2 ring-[#1D1D1F]" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="mx-6 mt-6">
          <p className="text-[13px] font-medium">Antal</p>
          <div className="mt-2">
            <Stepper value={qty} step={p.step} onChange={setQty} />
          </div>
        </div>

        <div className="mt-auto px-6 pb-6 pt-8">
          <Primary className="w-full" onClick={() => props.onSave({ qty, model, color, style })}>
            {props.line ? "Spara" : "Lägg till"} · {sek(lineTotal(qty, current.priceSek))}
          </Primary>
        </div>
      </aside>
    </div>
  );
}
