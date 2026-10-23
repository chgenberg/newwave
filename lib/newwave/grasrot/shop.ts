import type { WordmarkClub } from "../wordmark/render";
import { grasrotClub } from "./clubs";
import { emblemSet, type Variant } from "./emblem";
import { heroImage } from "./hero";
import { productionFiles, productionJobs } from "./production";
import { featuredColor, GRASROT_PRODUCTS, METHOD_TEXT } from "./products";
import { grasrotWordmark } from "./wordmark";

export type ShopColor = { id: string; name: string; hex: string; visor?: string };
export type ShopDesign = { label: string; method: string; methodText: string; art: string; widthMm: number; heightMm: number; zone: string; zoneLabel: string };
export type ShopProduct = {
  id: string;
  short: string;
  name: string;
  supplier: string;
  url?: string;
  article?: string;
  model?: string;
  colors: ShopColor[];
  /** Standarddesignen per färg-id. */
  designs: Record<string, ShopDesign>;
  zones: { label: string; size: string; methods: string }[];
  files: string[];
};

const VARIANT_LABEL: Record<Variant, string> = { original: "original", solid: "solid", negativ: "negativ" };

/**
 * Bilaga 2 som webbshoppen visar den: varje produkt med färgerna, designen per färg (variant, metod och storlek ur
 * produktionsunderlaget), tryckytorna och produktionsfilerna – och färgen produkten visas i först, samma som i herobilden.
 */
export async function shopProducts(id: string): Promise<{ products: ShopProduct[]; featured: Record<string, string> } | null> {
  if (!grasrotClub(id) || !emblemSet(id)) return null;
  const [hero, wordmark] = await Promise.all([heroImage(id), grasrotWordmark(id, "original")]);
  const clubHex = wordmark?.colors[0] ?? "#111111";
  const products = await Promise.all(
    GRASROT_PRODUCTS.map(async (p): Promise<ShopProduct> => {
      const jobs = await productionJobs(id, p);
      const designs = Object.fromEntries(
        p.colors.map((c) => {
          const d = p.design(c);
          const job = jobs.find((j) => j.colors.includes(c));
          const label = d.art === "halsduk" ? "Halsduksdesign i föreningens färger" : `${d.art === "ordmarke" ? "Wordmark" : "Klubbmärke"}, ${VARIANT_LABEL[d.variant]}`;
          const design: ShopDesign = {
            label,
            method: d.method,
            methodText: METHOD_TEXT[d.method],
            art: `${d.art}-${d.variant}.png`,
            widthMm: job?.widthMm ?? d.box[0],
            heightMm: job?.heightMm ?? d.box[1],
            zone: d.zone,
            zoneLabel: p.zones.find((z) => z.id === d.zone)?.label ?? d.zone,
          };
          return [c.id, design];
        }),
      );
      return {
        id: p.id,
        short: p.short,
        name: p.name,
        supplier: p.supplier,
        url: p.url,
        article: p.article,
        model: p.model,
        colors: p.colors.map(({ id: cid, name, hex, visor }) => ({ id: cid, name, hex, visor })),
        designs,
        zones: p.zones.map((z) => ({ label: z.label, size: `${z.widthMm} × ${z.heightMm} mm`, methods: z.techniques.map((m) => METHOD_TEXT[m]).join(", ") })),
        files: (await productionFiles(id, p)).map((f) => f.name),
      };
    }),
  );
  const featured = Object.fromEntries(GRASROT_PRODUCTS.map((p) => [p.id, (hero?.info.colors[p.id] ?? featuredColor(p, clubHex)).id]));
  return { products, featured };
}

/** Föreningen som butiken och wordmarken ser den, när den inte finns i klubbregistret: namnet, wordmarkets färger och klubbmärket. */
export const grasrotClubName = (id: string) => grasrotClub(id)?.name ?? null;

export async function grasrotWordmarkClub(id: string): Promise<WordmarkClub | null> {
  const club = grasrotClub(id);
  const wordmark = club && emblemSet(id) ? await grasrotWordmark(id, "original") : null;
  if (!club || !wordmark) return null;
  const logo = `/api/v1/newwave/grasrot/${id}/klubbmarke-original.png`;
  return { id, name: club.name, colors: wordmark.colors, logo, logoDark: logo, sports: [club.sport] };
}
