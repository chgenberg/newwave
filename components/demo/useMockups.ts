"use client";

import { useEffect, useState } from "react";
import { PROMO_PRODUCTS } from "@/lib/demoCatalog";
import type { LogoResult } from "@/lib/logo";
import type { ProductLibrary } from "@/lib/merch";
import { composeMerch } from "@/lib/merchCompose";

const libraries: Partial<Record<"products" | "demo", Promise<ProductLibrary>>> = {};
const library = (which: "products" | "demo") =>
  (libraries[which] ??= fetch(which === "demo" ? "/demo/products/library.json" : "/products/library.json").then((r): Promise<ProductLibrary> => (r.ok ? r.json() : Promise.resolve({}))));

/** Composes the logo onto every product photo in the browser, default models first. Keyed by product:model. */
export function useMockups(logo: LogoResult | null) {
  const [state, setState] = useState<{ key: string; urls: Record<string, string> }>({ key: "", urls: {} });
  useEffect(() => {
    if (!logo) return;
    let cancelled = false;
    const key = logo.light;
    const jobs = [0, 1, 2].flatMap((i) => PROMO_PRODUCTS.flatMap((p) => (p.models[i]?.mockup ? [{ p, m: p.models[i] }] : [])));
    const wide = logo.width / logo.height > 3.5;
    (async () => {
      for (const { p, m } of jobs) {
        const mock = m.mockup!;
        try {
          const entry = (await library(mock.library))[mock.product.id];
          if (!entry || cancelled) continue;
          const url = await composeMerch({
            product: mock.product,
            entry,
            blankUrl: mock.blank,
            artUrl: mock.product.variant === "dark" ? logo.dark : logo.light,
            size: 640,
            artScale: mock.product.art === "crest" ? 1 : Math.min(1, mock.artScale * (wide ? 1.2 : 1)),
          });
          if (cancelled) return;
          setState((s) => ({ key, urls: { ...(s.key === key ? s.urls : {}), [`${p.id}:${m.id}`]: url } }));
        } catch {}
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logo]);
  return logo && state.key === logo.light ? state.urls : {};
}
