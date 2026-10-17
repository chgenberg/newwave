import { luminance } from "./theme";

export type BrandColor = { name: string; hex: string };

/** Det AI:n läser ut ur en grafisk profil (PDF). */
export type Brandbook = {
  name: string;
  colors: BrandColor[];
  fonts: string[];
  tone: string;
  rules: string[];
};

/** Varumärket som studion designar med. Sparas bara i webbläsaren. */
export type BrandKit = Brandbook & {
  logo: string | null;
  logoDark: string | null;
  site: string;
  /** Var varumärket kom ifrån, för att visa rätt kvitto i panelen. */
  source: { kind: "standard" | "profil" | "logga" | "webb" | "brandbook"; label: string };
};

export const MAX_COLORS = 6;

export const DEFAULT_KIT: BrandKit = {
  name: "Ditt varumärke",
  colors: [
    { name: "Grafit", hex: "#1B1A17" },
    { name: "Benvit", hex: "#F4F3EF" },
  ],
  fonts: [],
  tone: "",
  rules: [],
  logo: null,
  logoDark: null,
  site: "",
  source: { kind: "standard", label: "Ingen logga ännu" },
};

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9A-F]{6}$/i.test(v);

/** Läser ett sparat varumärke och faller tillbaka fält för fält på `base`. */
export function readKit(raw: unknown, base: BrandKit = DEFAULT_KIT): BrandKit {
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<BrandKit>;
  const colors = Array.isArray(r.colors) ? r.colors.filter((c) => c && isHex(c.hex) && typeof c.name === "string").slice(0, MAX_COLORS) : [];
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name : base.name,
    colors: colors.length ? colors.map((c) => ({ name: c.name, hex: c.hex.toUpperCase() })) : base.colors,
    fonts: strings(r.fonts),
    tone: typeof r.tone === "string" ? r.tone : "",
    rules: strings(r.rules),
    logo: typeof r.logo === "string" ? r.logo : null,
    logoDark: typeof r.logoDark === "string" ? r.logoDark : null,
    site: typeof r.site === "string" ? r.site : "",
    source: r.source && typeof r.source.label === "string" ? r.source : base.source,
  };
}

/** Accentfärg till knappar och markeringar: den första färgen i profilen som bär vit text, annars grafit. */
export const kitAccent = (kit: Pick<BrandKit, "colors">) => kit.colors.find((c) => luminance(c.hex) < 0.2)?.hex ?? "#1B1A17";
