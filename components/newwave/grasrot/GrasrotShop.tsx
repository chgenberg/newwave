"use client";

import { useState } from "react";
import type { ShopProduct } from "@/lib/newwave/grasrot/shop";
import { grasrotBase, mockupSrc } from "@/lib/newwave/grasrot/urls";
import { ProductStage, Swatches } from "./ProductStage";

const link = "nw-hit font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 hover:decoration-[var(--nw-ink)]";

/** Bilaga 2 som New Wave Group granskar den: produkten i 3D eller som foto i varje färg, med tryckytor och produktionsfiler. */
export function GrasrotShop({ id, products, featured }: { id: string; products: ShopProduct[]; featured: Record<string, string> }) {
  const [pi, setPi] = useState(0);
  const product = products[pi];
  const [colors, setColors] = useState<Record<string, string>>(featured);
  const color = product.colors.find((c) => c.id === colors[product.id]) ?? product.colors[0];
  const design = product.designs[color.id];
  const base = grasrotBase(id);
  const mockup = mockupSrc(id, product.id, color.id);

  return (
    <div className="mt-4">
      <div role="tablist" aria-label="Produkter" className="flex flex-wrap gap-2">
        {products.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === pi}
            onClick={() => setPi(i)}
            className={`rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${i === pi ? "border-[var(--club)] bg-[var(--club)] text-white" : "border-[var(--nw-line)] text-[var(--nw-ink)] hover:border-[var(--nw-ink)]/40"}`}
          >
            {p.short}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ProductStage id={id} product={product} color={color} design={design} className="rounded-[var(--nw-radius)]" />

        <div className="min-w-0">
          <p className="nw-club-heading text-[19px] text-[var(--club)]">{product.short}</p>
          <p className="text-[13px] text-[var(--nw-muted)]">
            {product.name} · {product.supplier}
            {product.article ? ` · ${product.article}` : ""}
            {product.url ? (
              <>
                {" · "}
                <a href={product.url} target="_blank" rel="noreferrer" className={link}>
                  Leverantören
                </a>
              </>
            ) : null}
          </p>

          <p className="mt-4 text-[12.5px] font-medium text-[var(--nw-muted)]">Färg: {color.name}</p>
          <Swatches product={product} color={color} onPick={(c) => setColors({ ...colors, [product.id]: c })} />

          <div className="mt-4 rounded-xl bg-[var(--nw-soft)] p-3.5 text-[13.5px]">
            <p className="font-semibold text-[var(--nw-ink)]">{design.label}</p>
            <p className="mt-0.5 text-[var(--nw-muted)]">
              {design.methodText} · {design.zoneLabel} · {design.widthMm} × {design.heightMm} mm
            </p>
          </div>

          <table className="mt-4 w-full text-[12.5px]">
            <caption className="mb-1 text-left text-[12.5px] font-medium text-[var(--nw-muted)]">Tryckytor enligt Bilaga 2</caption>
            <tbody>
              {product.zones.map((z) => (
                <tr key={z.label} className="border-t border-[var(--nw-line)]">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-[var(--nw-ink)]">
                    {z.label}
                  </th>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-[var(--nw-muted)]">{z.size}</td>
                  <td className="py-1.5 text-right text-[var(--nw-muted)]" style={{ fontVariantNumeric: "normal" }}>
                    {z.methods}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 text-[12.5px] font-medium text-[var(--nw-muted)]">Produktion</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13px]">
            <li>
              <a href={`${base}/produktionsblad-${product.id}.pdf?dl=1`} className={link}>
                Produktionsblad (PDF)
              </a>
            </li>
            {product.files.map((f) => (
              <li key={f} className="min-w-0 truncate">
                <a href={`${base}/${f}?dl=1`} className={`${link} nw-mono text-[12px]`}>
                  {f}
                </a>
              </li>
            ))}
            <li>
              <a href={`${mockup}?dl=1`} className={link}>
                Produktbild i {color.name} (JPG)
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
