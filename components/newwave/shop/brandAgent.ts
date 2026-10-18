import { useEffect, useSyncExternalStore } from "react";
import type { Idea } from "@/lib/newwave/eventIdeas";
import type { OccasionId } from "@/lib/newwave/occasions";
import { call } from "./api";
import type { CustomerLogo } from "./cart";

/**
 * Scenerna med kundens logga, delade mellan karusellen, mosaiken och eventsidan. En scen som redan är gjord hämtas ur
 * serverns cache; en ny ritas bara när eventsidan ber om det.
 */
const scenes = new Map<string, string>();
const asked = new Set<string>();
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const keep = (key: string, url: string) => {
  scenes.set(key, url);
  listeners.forEach((l) => l());
};

const sceneKey = (o: OccasionId, logo: CustomerLogo) => `${o}|${logo.light}|${(logo.color ?? "").toUpperCase()}`;
const about = (logo: CustomerLogo) => (logo.profile ? [logo.profile.industry, logo.profile.offering].filter(Boolean).join(" – ").slice(0, 200) : "");
const sceneBody = (o: OccasionId, logo: CustomerLogo) => ({ occasion: o, logo: logo.light, name: logo.name, color: logo.color ?? "", about: about(logo) || undefined });

export function useBrandedScene(o: OccasionId, logo: CustomerLogo | null): string | null {
  const key = logo ? sceneKey(o, logo) : "";
  const url = useSyncExternalStore(
    subscribe,
    () => (key ? (scenes.get(key) ?? null) : null),
    () => null,
  );
  useEffect(() => {
    if (!logo || asked.has(key)) return;
    asked.add(key);
    call<{ image: string | null }>("/api/v1/newwave/scene", { ...sceneBody(o, logo), cachedOnly: true })
      .then(({ image }) => image && keep(key, image))
      .catch(() => asked.delete(key));
    // `key` täcker loggan och tillfället.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/** Scenagenten ritar tillfället med kundens logga och märkesfärg. */
export async function renderScene(o: OccasionId, logo: CustomerLogo) {
  const key = sceneKey(o, logo);
  const hit = scenes.get(key);
  if (hit) return hit;
  const { image } = await call<{ image: string | null }>("/api/v1/newwave/scene", sceneBody(o, logo));
  if (image) keep(key, image);
  return image;
}

/** Produktagenten: fyra produkter för företaget på tillfället. Kräver det varumärkesagenten läste av på webbplatsen. */
export async function fetchIdeas(slug: string, o: OccasionId, logo: CustomerLogo): Promise<Idea[]> {
  if (!logo.profile?.industry) return [];
  const { ideas } = await call<{ ideas: Idea[] }>("/api/v1/newwave/ideas", { slug, occasion: o, name: logo.name, industry: logo.profile.industry, offering: logo.profile.offering, tone: logo.profile.tone });
  return ideas;
}

/** "Volvo Cars" → "Volvo Cars", "IKEA" → "IKEA:s", "Lyktan" → "Lyktans". */
export const genitive = (name: string) => (/[A-ZÅÄÖ]{2,}$/.test(name) ? `${name}:s` : /[sxz]$/i.test(name) ? name : `${name}s`);

/** Webbadressen som kunden skrev, utan protokoll, www och sökväg. */
export const hostOf = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
export const validHost = (h: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && h.length <= 120;
