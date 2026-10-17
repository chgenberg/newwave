import { useCallback, useSyncExternalStore } from "react";
import type { QuoteLineInput } from "@/lib/newwave/reseller";

/** Kundens logga och offertkorg, sparade i webbläsaren per butik. */

export type CustomerLogo = { light: string; dark: string; name: string };
export type CartLine = QuoteLineInput & { key: string };
export type Cart = { logo: CustomerLogo | null; lines: CartLine[] };

const EMPTY: Cart = { logo: null, lines: [] };
const storageKey = (slug: string) => `nw-shop:${slug}`;
const cache = new Map<string, { raw: string | null; value: Cart }>();

function read(slug: string): Cart {
  const raw = localStorage.getItem(storageKey(slug));
  const hit = cache.get(slug);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<Cart>) : {};
    // Korgen ligger i webbläsaren; rader utan design kan inte prissättas eller visas.
    value = { ...EMPTY, ...saved, lines: (saved.lines ?? []).filter((l) => l?.design && typeof l.design === "object") };
  } catch {}
  cache.set(slug, { raw, value });
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("nw-cart", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("nw-cart", cb);
  };
}

export function useCart(slug: string) {
  const cart = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => EMPTY,
  );
  const update = useCallback(
    (fn: (c: Cart) => Cart) => {
      localStorage.setItem(storageKey(slug), JSON.stringify(fn(read(slug))));
      window.dispatchEvent(new Event("nw-cart"));
    },
    [slug],
  );
  return [cart, update] as const;
}

export const PLACEHOLDER = { light: "/newwave/resellers/kunder/din-logga.png", dark: "/newwave/resellers/kunder/din-logga-vit.png" };
