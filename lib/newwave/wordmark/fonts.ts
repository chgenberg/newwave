/**
 * Typsnitten som ordmärkena ritas med. Alla har en licens som tillåter att servern ritar dem åt kunder
 * (SIL Open Font License 1.1, Yellowtail och Ultra Apache 2.0). Adobe Fonts får inte användas så – köps en app- eller
 * serverlicens för t.ex. Casey och Espiritu läggs filerna i assets/fonts/wordmark och pekas ut i ROLE_FONT.
 */

export const FONTS = {
  "alfa-slab-one": { label: "Alfa Slab One", file: "alfa-slab-one.ttf", role: "slab", license: "OFL" },
  "zilla-slab-bold": { label: "Zilla Slab Bold", file: "zilla-slab-bold.ttf", role: "caps", license: "OFL" },
  graduate: { label: "Graduate", file: "graduate.ttf", role: "varsity", license: "OFL" },
  "kaushan-script": { label: "Kaushan Script", file: "kaushan-script.ttf", role: "script", license: "OFL" },
  lobster: { label: "Lobster", file: "lobster.ttf", role: "script", license: "OFL" },
  yellowtail: { label: "Yellowtail", file: "yellowtail.ttf", role: "script", license: "Apache-2.0" },
  damion: { label: "Damion", file: "damion.ttf", role: "script", license: "OFL" },
  pacifico: { label: "Pacifico", file: "pacifico.ttf", role: "script", license: "OFL" },
  anton: { label: "Anton", file: "anton.ttf", role: "condensed", license: "OFL" },
  "oswald-bold": { label: "Oswald Bold", file: "oswald-bold.ttf", role: "condensed", license: "OFL" },
  "archivo-black": { label: "Archivo Black", file: "archivo-black.ttf", role: "block", license: "OFL" },
  bungee: { label: "Bungee", file: "bungee.ttf", role: "block", license: "OFL" },
  "playfair-display-black": { label: "Playfair Display Black", file: "playfair-display-black.ttf", role: "serif", license: "OFL" },
  "cinzel-extrabold": { label: "Cinzel ExtraBold", file: "cinzel-extrabold.ttf", role: "serif", license: "OFL" },
  "racing-sans-one": { label: "Racing Sans One", file: "racing-sans-one.ttf", role: "sport", license: "OFL" },
  ultra: { label: "Ultra", file: "ultra.ttf", role: "slab", license: "Apache-2.0" },
  shrikhand: { label: "Shrikhand", file: "shrikhand.ttf", role: "sport", license: "OFL" },
  "big-shoulders-black": { label: "Big Shoulders Black", file: "big-shoulders-black.ttf", role: "condensed", license: "OFL" },
  "grand-hotel": { label: "Grand Hotel", file: "grand-hotel.ttf", role: "script", license: "OFL" },
  "bowlby-one-sc": { label: "Bowlby One SC", file: "bowlby-one-sc.ttf", role: "block", license: "OFL" },
  bevan: { label: "Bevan", file: "bevan.ttf", role: "slab", license: "OFL" },
  "holtwood-one-sc": { label: "Holtwood One SC", file: "holtwood-one-sc.ttf", role: "serif", license: "OFL" },
} as const;

export type FontId = keyof typeof FONTS;
export type FontRole = (typeof FONTS)[FontId]["role"];
export const FONT_ROLES = ["caps", "script", "slab", "varsity", "condensed", "block", "serif", "sport"] as const satisfies readonly FontRole[];

/** Vilket typsnitt en roll ritas med; mallar som anger "role:script" byter typsnitt härifrån. */
export const ROLE_FONT: Record<FontRole, FontId> = {
  caps: "zilla-slab-bold",
  script: "kaushan-script",
  slab: "alfa-slab-one",
  varsity: "graduate",
  condensed: "anton",
  block: "archivo-black",
  serif: "playfair-display-black",
  sport: "racing-sans-one",
};

export const isFontId = (v: string): v is FontId => Object.hasOwn(FONTS, v);
const isRole = (v: string): v is FontRole => (FONT_ROLES as readonly string[]).includes(v);
export const isFontRef = (v: string) => isFontId(v) || (v.startsWith("role:") && isRole(v.slice(5)));

/** "role:script" eller ett typsnitts-id till det typsnitt som ritar det. */
export function fontFor(ref: string): FontId {
  if (isFontId(ref)) return ref;
  const role = ref.slice(5);
  return isRole(role) ? ROLE_FONT[role] : ROLE_FONT.caps;
}

const SCRIPT = /script|brush|hand|sign|espiritu|lobster|yellowtail|damion|pacifico|kaushan|casual|marker|swash/i;
const SLAB = /slab|casey|clarendon|rockwell|egypt/i;
const VARSITY = /varsity|college|graduate|athletic|freshman/i;
const CONDENSED = /condensed|compressed|narrow|anton|oswald|bebas|league gothic|impact/i;
const SERIF = /serif|playfair|cinzel|garamond|didot|bodoni|times|trajan/i;

/** Gissar rollen ur ett typsnittsnamn från en Illustrator-fil, så att importen kan välja ett licensierat typsnitt i samma stil. */
export function roleFromFamily(family: string): FontRole {
  if (SCRIPT.test(family)) return "script";
  if (VARSITY.test(family)) return "varsity";
  if (SLAB.test(family)) return "caps";
  if (CONDENSED.test(family)) return "condensed";
  if (/sans/i.test(family)) return "block";
  if (SERIF.test(family)) return "serif";
  return "caps";
}
