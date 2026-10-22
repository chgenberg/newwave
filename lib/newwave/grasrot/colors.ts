import { type Cmyk, cmykSuggestion, type Lab, deltaE2000, hexToLab, nearestPantone, pantone } from "@/lib/pantone";
import { colorsOf } from "@/lib/newwave/vector/svg";
import { type GrasrotClub, grasrotClub } from "./clubs";
import { emblemSet } from "./emblem";

/**
 * Kulörerna i klubbens märke som tryckeriet behöver dem: Pantone, CMYK och varifrån värdet kommer. Klubbens låsta
 * profil (från klubben eller New Wave Group) gäller alltid; annars föreslås närmaste Pantone och ett CMYK-värde som
 * klubben bekräftar. Brodyr matchar tråden mot Pantone-koden.
 */

export type ClubInk = {
  /** Färgen som den står i märkesfilen. */
  hex: string;
  pantone: string;
  cmyk: Cmyk;
  source: "profil" | "förslag";
  /** Avvikelse som någon behöver ta ställning till innan tryck. */
  note?: string;
};

/** Över det här syns skillnaden tydligt mellan märket på skärm och färgen som trycks. */
const VISIBLE = 6;
/** Neutralt svart i en fil menar tryckets svarta, inte närmaste mörkgrå Pantone. */
const isBlack = ([l, a, b]: Lab) => l < 22 && Math.hypot(a, b) < 6;

export function inkFor(club: GrasrotClub, hex: string): ClubInk {
  const lab = hexToLab(hex);
  const locked = club.colors?.find((c) => deltaE2000(lab, hexToLab(c.hex)) < 5);
  if (locked) {
    const ref = pantone(locked.pantone);
    const d = ref ? deltaE2000(lab, ref.lab) : 0;
    return {
      hex,
      pantone: locked.pantone,
      cmyk: locked.cmyk,
      source: "profil",
      note: d > VISIBLE ? `${locked.pantone} avviker tydligt från färgen i märkesfilen (ΔE ${d.toFixed(0)}, närmast ${nearestPantone(hex).code}) – bekräfta med föreningen vilken som gäller.` : undefined,
    };
  }
  if (isBlack(lab)) return { hex, pantone: "PANTONE Black C", cmyk: [0, 0, 0, 100], source: "förslag" };
  const near = nearestPantone(hex);
  if (near.code === "White") return { hex, pantone: "White", cmyk: [0, 0, 0, 0], source: "förslag" };
  return { hex, pantone: near.code, cmyk: cmykSuggestion(hex), source: "förslag", note: near.deltaE > 3 ? `Ingen Pantone ligger nära (ΔE ${near.deltaE}) – provtryck före serie.` : undefined };
}

/** Kulörerna i klubbens märke, i märkesfilens ordning. */
export async function clubInks(id: string): Promise<ClubInk[]> {
  const club = grasrotClub(id);
  const set = emblemSet(id);
  if (!club || !set) return [];
  return colorsOf((await set).original).map((hex) => inkFor(club, hex));
}
