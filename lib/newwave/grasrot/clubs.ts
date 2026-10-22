import type { Cmyk } from "@/lib/pantone";

/**
 * Gräsrot 360 – betan med New Wave Group: tio föreningar som får klubbmärke i tre varianter, kulörer, ordmärke,
 * produkter, herobild, material för sociala medier och tryckfiler till leverantörerna.
 *
 * Märkena ligger i assets/grasrot/<id>/: original.svg (och solid.svg) när klubben eller New Wave Group
 * lämnat vektorfiler, annars emblem.png – den största bilden som gick att hitta – som vektoriseras och märks som
 * provisorisk tills originalet kommit in.
 */

export type GrasrotColor = { hex: string; pantone: string; cmyk: Cmyk };

export type GrasrotClub = {
  id: string;
  name: string;
  city: string;
  sport: string;
  site: string;
  /** Klubbens id i klubbregistret, där webbplatsen, färgerna och kanalerna skrapats. */
  registry?: string;
  /** Var märket kom ifrån, och om det inte är föreningens rätta märke: varför och vad som behövs. */
  source: { from: string; wrong?: string };
  /** Ordmärkets två rader, när den automatiska uppdelningen inte är den klubben använder. */
  words?: { caps: string; script: string };
  /** Kulörer som klubben eller New Wave Group angett; saknas = förslag från märket som klubben bekräftar. */
  colors?: GrasrotColor[];
  /** Var de angivna kulörerna kommer ifrån, t.ex. Bilaga 1. */
  colorsFrom?: string;
};

export const GRASROT_CLUBS: GrasrotClub[] = [
  { id: "arbra-bk", name: "Arbrå BK", city: "Arbrå", sport: "Fotboll", site: "https://www.arbrabk.se", registry: "arbra-bk", source: { from: "svenskalag.se" } },
  { id: "byttorps-if", name: "Byttorps IF", city: "Borås", sport: "Fotboll", site: "https://byttorpsif.se", registry: "byttorps-if", source: { from: "laget.se" } },
  {
    id: "farsta-ibk",
    name: "Farsta Sharks IBK",
    city: "Stockholm",
    sport: "Innebandy",
    site: "https://www.farstaibk.se",
    registry: "farsta-ibk",
    source: { from: "svenskalag.se" },
    words: { caps: "Farsta", script: "Sharks" },
  },
  {
    id: "lilla-torg-ff",
    name: "Lilla Torg FF",
    city: "Malmö",
    sport: "Fotboll",
    site: "https://lillatorgff.se",
    source: { from: "lillatorgff.se" },
    words: { caps: "FF", script: "Lilla Torg" },
  },
  { id: "hisingsbacka-fc", name: "Hisingsbacka FC", city: "Göteborg", sport: "Fotboll", site: "https://www.hbfc.se", registry: "hisingsbacka-fc", source: { from: "svenskalag.se" } },
  {
    id: "if-hallby",
    name: "IF Hallby",
    city: "Jönköping",
    sport: "Fotboll",
    site: "https://hallbyfotboll.se",
    source: { from: "hallbyfotboll.se", wrong: "Fotbollssektionens märke med texten FOTBOLL – huvudföreningens originalmärke behövs för tryck" },
  },
  { id: "if-warta", name: "IF Warta", city: "Göteborg", sport: "Fotboll", site: "https://ifwarta.se", registry: "if-warta", source: { from: "ifwarta.se" } },
  { id: "ik-ymer", name: "IK Ymer", city: "Borås", sport: "Fotboll", site: "https://ikymer.se", registry: "ik-ymer", source: { from: "ikymer.se" } },
  {
    id: "saro-kullavik-if",
    name: "Särö Kullavik IF",
    city: "Kungsbacka",
    sport: "Fotboll",
    site: "https://www.skif.nu",
    source: { from: "New Wave Group, Gräsrot 360 – Bilaga 1 (vektor, original, solid och negativ)" },
    words: { caps: "Särö", script: "Kullavik" },
    colorsFrom: "Bilaga 1",
    colors: [
      { hex: "#0E467B", pantone: "PANTONE 2738 C", cmyk: [100, 50, 0, 40] },
      { hex: "#23A355", pantone: "PANTONE 2419 C", cmyk: [85, 0, 85, 10] },
    ],
  },
  { id: "asa-if", name: "Åsa IF", city: "Åsa", sport: "Fotboll", site: "https://asaif.com", registry: "asa-if", source: { from: "asaif.com" } },
];

export const grasrotClub = (id: string) => GRASROT_CLUBS.find((c) => c.id === id) ?? null;

/** Varifrån kulören kommer, som den står i Craft-sidan och i paketet. */
export const inkSource = (club: GrasrotClub, source: "profil" | "förslag") => (source === "förslag" ? "Förslag" : club.colorsFrom ? `Enligt ${club.colorsFrom}` : "Föreningens profil");
