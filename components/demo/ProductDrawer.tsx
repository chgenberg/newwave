"use client";

import { useEffect, useState } from "react";
import { lineTotal, type Product, SWATCHES, sek } from "@/lib/demoCatalog";
import { CropThumb, Icons, Primary, Stepper } from "./parts";

export type Line = { qty: number; model: string; color: string; style: string };

export function productImage(p: Product, modelId: string, mockups: Record<string, string>) {
  const m = p.models.find((x) => x.id === modelId) ?? p.models[0];
  return mockups[`${p.id}:${m.id}`] ?? m.mockup?.blank ?? null;
}

export function ProductVisual({ product, model, mockups, boothFor, className = "", aspect = 4 / 3 }: { product: Product; model: string; mockups: Record<string, string>; boothFor: (p: Product) => string; className?: string; aspect?: number }) {
  if (product.crop) return <CropThumb url={boothFor(product)} crop={product.crop} aspect={aspect} className={className} />;
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
  boothFor: (p: Product) => string;
  onSave: (line: Line) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { product: p } = props;
  const [model, setModel] = useState(props.line?.model ?? p.models[0].id);
  const [color, setColor] = useState(props.line?.color ?? props.brandColor);
  const [style, setStyle] = useState(props.line?.style ?? p.styles[0]);
  const [qty, setQty] = useState(props.line?.qty ?? p.defaultQty);
  const current = p.models.find((m) => m.id === model) ?? p.models[0];
  const index = p.models.indexOf(current);
  const swatches = [props.brandColor, ...SWATCHES.filter((s) => s.toLowerCase() !== props.brandColor.toLowerCase())];
  const shift = (d: number) => setModel(p.models[(index + d + p.models.length) % p.models.length].id);

  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-label={p.name}>
      <button type="button" aria-label="Stäng" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={props.onClose} />
      <aside className="ifk-pop relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto bg-white shadow-[-20px_0_60px_rgba(0,0,0,0.15)] sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-3xl">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="text-[24px] font-semibold tracking-tight">{p.name}</h2>
            <p className="mt-0.5 text-[14px] text-[#6E6E73]">Välj modell, färg och antal</p>
          </div>
          <button type="button" onClick={props.onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F5F5F7]" aria-label="Stäng">
            {Icons.close}
          </button>
        </div>

        <div className="relative mx-6 mt-5 overflow-hidden rounded-2xl border border-black/[0.06]">
          <ProductVisual product={p} model={model} mockups={props.mockups} boothFor={props.boothFor} />
          {p.models.length > 1 && (
            <>
              <button type="button" onClick={() => shift(-1)} aria-label="Föregående modell" className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 rotate-180 items-center justify-center rounded-full bg-white/90 shadow">
                {Icons.arrow}
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Nästa modell" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow">
                {Icons.arrow}
              </button>
            </>
          )}
        </div>

        {p.models.length > 1 && (
          <div className="mx-6 mt-3 grid grid-cols-4 gap-2">
            {p.models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                aria-label={m.name}
                className={`overflow-hidden rounded-xl border-2 transition ${m.id === model ? "border-[#1D1D1F]" : "border-transparent ring-1 ring-black/[0.06] hover:ring-black/20"}`}
              >
                <ProductVisual product={p} model={m.id} mockups={props.mockups} boothFor={props.boothFor} aspect={1} />
              </button>
            ))}
          </div>
        )}

        <div className="mx-6 mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[16px] font-semibold">{current.name}</p>
            <p className="mt-1 text-[13px] leading-snug text-[#6E6E73]">{current.desc}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-[#86868B]">Från</p>
            <p className="text-[18px] font-semibold tabular-nums">
              {sek(current.priceSek)}
              {p.unit === "förp" ? "/förp" : p.booth ? "" : "/st"}
            </p>
          </div>
        </div>

        <div className="mx-6 mt-6 grid grid-cols-2 gap-5">
          <div>
            <p className="text-[13px] font-medium">Färg</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {swatches.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={i === 0 ? "Varumärkesfärg" : c}
                  aria-label={i === 0 ? "Varumärkesfärg" : `Färg ${c}`}
                  className={`h-7 w-7 rounded-full border border-black/10 ring-offset-2 transition ${color === c ? "ring-2 ring-[#2563EB]" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-[13px] font-medium">Stil</span>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#2563EB]">
              {p.styles.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mx-6 mt-6">
          <p className="text-[13px] font-medium">Antal</p>
          <div className="mt-2 flex items-center justify-between">
            <Stepper value={qty} step={p.step} onChange={setQty} />
            <p className="text-[14px] text-[#6E6E73]">
              Summa <span className="font-semibold text-[#1D1D1F] tabular-nums">{sek(lineTotal(qty, current.priceSek))}</span>
            </p>
          </div>
        </div>

        <div className="mt-auto space-y-2 px-6 pb-6 pt-8">
          <Primary className="w-full" onClick={() => props.onSave({ qty, model, color, style })}>
            {Icons.cart}
            {props.line ? "Uppdatera i montern" : "Lägg till i montern"}
          </Primary>
          {props.line && (
            <button type="button" onClick={props.onRemove} className="h-10 w-full text-[13px] font-medium text-[#6E6E73] hover:text-[#B42318]">
              Ta bort från montern
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
