type Color = { name: string; hex: string };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const mix = (hex: string, into: string, amount: number) =>
  `#${rgb(hex)
    .map((c, i) => Math.round((c + (rgb(into)[i] - c) * amount) * 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();

/**
 * Dashboardens tema ur klubbens färger. Ytor med vit text (sidomeny, rubriker, knappar) kräver en mörk
 * huvudfärg, så en ljus förstafärg byts mot den mörkaste i paletten.
 */
export function clubTheme(palette: Color[]) {
  const dark = [...palette].sort((a, b) => luminance(a.hex) - luminance(b.hex))[0];
  const primary = luminance(palette[0].hex) < 0.2 ? palette[0].hex : luminance(dark.hex) < 0.2 ? dark.hex : "#111111";
  const accent = palette.find((c) => c.hex !== primary && c.hex !== "#FFFFFF")?.hex ?? palette.find((c) => c.hex !== primary)?.hex ?? "#FFFFFF";
  return {
    primary,
    accent,
    onAccent: luminance(accent) > 0.4 ? "#0D0C0C" : "#FFFFFF",
    soft: mix(accent, "#FFFFFF", 0.86),
  };
}

const on = (hex: string) => (luminance(hex) > 0.4 ? "#0D0C0C" : "#FFFFFF");

/** En butik i en enda märkesfärg, till exempel en kundbutik i kundens färg. */
export const brandTheme = (color: string) => ({ primary: color, accent: color, background: mix(color, "#FFFFFF", 0.93) });

/** CSS-variabler för en återförsäljares webbshop. */
export function shopVars(theme: { primary: string; accent: string; background: string }) {
  return {
    "--shop": theme.primary,
    "--shop-on": on(theme.primary),
    "--shop-accent": theme.accent,
    "--shop-on-accent": on(theme.accent),
    "--shop-bg": theme.background,
    "--shop-line": mix(theme.primary, theme.background, 0.85),
  } as React.CSSProperties;
}
