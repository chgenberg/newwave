import type { BrandKit } from "@/lib/newwave/brandKit";

/** En klubb som Craft kan skicka kollektionen till; loggan visas på produkterna i förhandsvisningen. */
export type WorkspaceClub = { id: string; name: string; city: string; logo: string; logoDark?: string; colors: string[]; live: boolean };

/**
 * Vem som designar avgör varumärket studion startar med, vilka produkter som går att välja och vart kollektionen tar vägen:
 * klubben lägger ut den i sin butik, Craft skickar den till klubbarna och återförsäljaren gör en offert.
 */
export type Role =
  | { kind: "studio" }
  | { kind: "klubb"; clubId: string; kit: BrandKit }
  | { kind: "craft"; clubs: WorkspaceClub[]; products: string[] }
  | { kind: "shop"; slug: string; reseller: string; markup: number; products: string[] };

export const STORAGE_PREFIX = "nw.studio.";
export const storageKey = (role: Role) => `${STORAGE_PREFIX}${role.kind === "studio" ? "home" : role.kind}`;

/** Craft designar med klubbens logga; förhandsvisningen visar en riktig klubb. */
export const clubKit = (c: WorkspaceClub): BrandKit => ({
  name: c.name,
  colors: c.colors.map((hex, i) => ({ name: i ? "Accent" : "Klubbfärg", hex })),
  fonts: [],
  tone: "",
  rules: [],
  logo: c.logo,
  logoDark: c.logoDark ?? null,
  site: "",
  source: { kind: "profil", label: `Förhandsvisas med ${c.name}` },
});
