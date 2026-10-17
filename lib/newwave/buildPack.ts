import { PRINT_H, PRINT_W, composeCampaignImage, composePrintFile, loadClubCrest, qrDataUrl } from "@/lib/compose";
import type { Concept, ContentPack, RuleCheck, Signal } from "@/lib/types";
import { nwProduct } from "./catalog";
import { photoMockup } from "./photoMockup";
import type { PackAssets, PackPhoto } from "./store";

export type Stage = (label: string, percent: number, ms: number) => void;
export type Artwork = { url: string; passed: boolean; attempts: number; imageChecks: RuleCheck[]; mode: "ai" | "demo" };
export type Made = {
  concept: Concept;
  artwork: Artwork;
  preview: { light: string; dark: string };
  printFiles: { light: string; dark: string };
  mockups: Record<string, string>;
  /** Mockups som data-URL:er, för att bygga kanalbilderna utan att ladda ner dem igen. */
  photos: Record<string, string>;
  content: ContentPack;
  shopUrl: string;
};

const PREVIEW_SCALE = 0.25;

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Fel ${res.status}`);
  return json as T;
}

const upload = (dataUrl: string) => post<{ url: string }>("/api/v1/files", { dataUrl }).then((r) => r.url);

export const clubFont = () => {
  const el = document.querySelector(".nw-club") ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue("--font-club").trim() || "Impact, sans-serif";
};

/** Motiv → tryckfil → mockups på produkterna → texter till alla kanaler. */
export async function makeMaterial(o: { clubId: string; concept: Concept; signal: Signal; footer: string; primary: string; note?: string; stage: Stage }): Promise<Made> {
  const { clubId, concept, stage } = o;
  stage("Designagenten ritar motivet", 58, 45000);
  const artwork = await post<Artwork>("/api/v1/artwork", { clubId, concept, feedback: o.note || undefined });
  stage("Lägger märket och sloganen på tryckfilen", 70, 5000);
  await loadClubCrest(clubId);
  const base = { artworkUrl: artwork.url, slogan: concept.slogan, footer: o.footer, font: clubFont(), primary: o.primary };
  const [light, dark, lightFull, darkFull] = await Promise.all([
    composePrintFile({ ...base, variant: "light", scale: PREVIEW_SCALE }),
    composePrintFile({ ...base, variant: "dark", scale: PREVIEW_SCALE }),
    composePrintFile({ ...base, variant: "light" }),
    composePrintFile({ ...base, variant: "dark" }),
  ]);
  stage("Gör mockups på produkterna", 80, 6000);
  const products = concept.products.map(nwProduct).filter((p) => p !== undefined);
  const photoList = await Promise.all(products.map(async (p) => [p.id, await photoMockup(p, p.dark ? dark : light, p.dark)] as const));
  const [printLight, printDark, mockupList] = await Promise.all([
    upload(lightFull),
    upload(darkFull),
    Promise.all(photoList.map(async ([id, url]) => [id, await upload(url)] as const)),
  ]);
  const printFiles = { light: printLight, dark: printDark };
  stage("Contentagenten skriver inläggen", 97, 20000);
  const { results } = await post<{ results: { content: ContentPack; shopUrl: string }[] }>("/api/v1/content", {
    clubId,
    signals: [o.signal],
    items: [{ concept, printFiles: { ...printFiles, vector: artwork.url } }],
    printPixels: { width: PRINT_W, height: PRINT_H },
    hub: true,
  });
  return {
    concept,
    artwork,
    preview: { light, dark },
    printFiles,
    mockups: Object.fromEntries(mockupList),
    photos: Object.fromEntries(photoList),
    content: results[0].content,
    shopUrl: results[0].shopUrl,
  };
}

/** Produktfotot i en ram med samma proportioner som kampanjbildernas produktyta. */
const framed = (photo: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="440" viewBox="0 0 400 440"><defs><clipPath id="r"><rect x="0" y="20" width="400" height="400" rx="32"/></clipPath></defs><image href="${photo}" x="0" y="20" width="400" height="400" preserveAspectRatio="xMidYMid slice" clip-path="url(#r)"/></svg>`;

/** Inlägg, story, hemsidebanner och affisch med QR – samma motiv och tryck på allt. */
export async function makeAssets(o: { made: Made; primary: string; accent: string; shopName: string }): Promise<PackAssets> {
  const { made } = o;
  const hero = made.concept.products.map((id) => made.photos[id]).find(Boolean);
  if (!hero) throw new Error("Saknar produktbild till inläggen");
  const banner = made.content.banner ?? { headline: made.concept.slogan, subline: made.concept.story, altText: made.concept.slogan };
  const base = { mockupSvg: framed(hero), font: clubFont(), primary: o.primary, accent: o.accent, cta: o.shopName, subline: banner.subline };
  const qr = await qrDataUrl(made.shopUrl, o.primary);
  const [feed, story, wide, poster] = await Promise.all([
    composeCampaignImage({ ...base, headline: made.concept.slogan, width: 1080, height: 1350 }),
    composeCampaignImage({ ...base, headline: made.concept.slogan, width: 1080, height: 1920 }),
    composeCampaignImage({ ...base, headline: banner.headline, width: 1920, height: 600 }),
    composeCampaignImage({ ...base, headline: made.concept.slogan, width: 1240, height: 1754, qr: { dataUrl: qr, caption: "Skanna och handla" } }),
  ]);
  const [f, s, b, p] = await Promise.all([feed, story, wide, poster].map(upload));
  return { feed: f, story: s, banner: b, poster: p };
}

/** AI-foton med det exakta trycket: en modell som bär plagget och en hemmiljö. */
export async function takePhotos(clubId: string, concept: Concept, printFiles: { light: string; dark: string }): Promise<PackPhoto[]> {
  try {
    const top = concept.products.map(nwProduct).find((p) => p?.kind === "top");
    const garment = top?.dark ? "dark" : "light";
    const { photos } = await post<{ photos: PackPhoto[] }>("/api/v1/photos", { clubId, concept, printFiles, scenes: ["livsstil", "filt"], garment });
    return photos.map(({ id, label, url }) => ({ id, label, url }));
  } catch {
    return [];
  }
}
