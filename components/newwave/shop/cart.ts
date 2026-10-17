import { useCallback, useSyncExternalStore } from "react";
import type { Proof } from "@/components/newwave/studio/DesignStudio";
import type { BrandColor } from "@/lib/newwave/brandKit";
import type { Design } from "@/lib/newwave/marking";
import type { OccasionId } from "@/lib/newwave/occasions";
import type { QuoteLineInput } from "@/lib/newwave/reseller";

/** Kundens logga, varukorg och eventplan, sparade i webbläsaren per butik. */

/** `color` är loggans huvudfärg som logghämtningen hittade. */
export type CustomerLogo = { light: string; dark: string; name: string; color?: string };
export type CartLine = QuoteLineInput & { key: string };
/** Återförsäljaren som provar sin egen butik som en av sina kunder. */
export type Tester = { name: string; contact: string; email: string };
export type Cart = { logo: CustomerLogo | null; lines: CartLine[]; tester?: Tester };

/** En produkt i eventets kollektion. Utan egna `sizes` fördelas antalet på vanliga storlekar. */
export type PlanItem = { productId: string; qty: number; sizes?: Record<string, number>; design?: Design; color?: string; preview?: string; proofs?: Proof[]; off?: boolean };
export type EventPlan = {
  occasion: OccasionId | null;
  people: number;
  /** Märkesfärgen scenen och designerna utgår från. */
  color: string;
  brandbook?: { name: string; colors: BrandColor[] };
  items: PlanItem[];
  /** Den brandade scenen och vad den gjordes av, så att den bara visas för samma tillfälle, logga och färg. */
  scene?: { for: string; url: string };
};

const EMPTY: Cart = { logo: null, lines: [] };
const EMPTY_PLAN: EventPlan = { occasion: null, people: 50, color: "", items: [] };

function store<T>(key: (slug: string) => string, empty: T, parse: (saved: Partial<T>) => T) {
  const cache = new Map<string, { raw: string | null; value: T }>();
  const read = (slug: string): T => {
    const raw = localStorage.getItem(key(slug));
    const hit = cache.get(slug);
    if (hit && hit.raw === raw) return hit.value;
    let value = empty;
    try {
      value = parse(raw ? (JSON.parse(raw) as Partial<T>) : {});
    } catch {}
    cache.set(slug, { raw, value });
    return value;
  };
  const write = (slug: string, value: T) => {
    localStorage.setItem(key(slug), JSON.stringify(value));
    window.dispatchEvent(new Event("nw-cart"));
  };
  return function useStored(slug: string) {
    const value = useSyncExternalStore(
      subscribe,
      () => read(slug),
      () => empty,
    );
    const update = useCallback((fn: (v: T) => T) => write(slug, fn(read(slug))), [slug]);
    return [value, update] as const;
  };
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("nw-cart", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("nw-cart", cb);
  };
}

const cartKey = (slug: string) => `nw-shop:${slug}`;

// Korgen ligger i webbläsaren; rader utan design kan inte prissättas eller visas.
export const useCart = store<Cart>(cartKey, EMPTY, (saved) => ({ ...EMPTY, ...saved, lines: (saved.lines ?? []).filter((l) => l?.design && typeof l.design === "object") }));

export const usePlan = store<EventPlan>((slug) => `nw-shop:${slug}:event`, EMPTY_PLAN, (saved) => ({ ...EMPTY_PLAN, ...saved, items: (saved.items ?? []).filter((i) => typeof i?.productId === "string" && i.qty >= 0) }));

/** Startar ett test av butiken som en kund: kundens logga ligger redan på produkterna och uppgifterna är ifyllda. */
export function startTest(slug: string, c: { name: string; contact: string; email: string; logo: string; logoDark: string; color?: string }) {
  localStorage.setItem(cartKey(slug), JSON.stringify({ logo: { light: c.logo, dark: c.logoDark, name: c.name, color: c.color }, lines: [], tester: { name: c.name, contact: c.contact, email: c.email } } satisfies Cart));
  window.dispatchEvent(new Event("nw-cart"));
}

export const PLACEHOLDER = { light: "/newwave/resellers/kunder/din-logga.png", dark: "/newwave/resellers/kunder/din-logga-vit.png" };
