import { z } from "zod";
import { CLUBS } from "@/lib/club";
import type { Customized } from "@/lib/newwave/marking";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";
import { readData, writeData } from "@/lib/newwave/workspace";

export const MOCK_API_KEY = process.env.INTERSPORT_API_KEY || "demo-intersport-key";

/** Klubbshoppen hos Intersport i demot, eller en vara i den. */
export const intersportPath = (clubId: string, item?: string) => `/intersport/${clubId}${item ? `/${item}` : ""}`;

/** Klubben som har en klubbshop hos Intersport: demots egna klubbar och klubbarna i klubbregistret. */
export async function intersportClub(id: string) {
  const own = CLUBS[id];
  const reg = await wordmarkClub(id);
  if (!own && !reg) return null;
  return {
    id,
    name: own?.name ?? reg!.name,
    logo: own ? `/api/v1/brand/${id}/${own.brand.crest.farg}` : reg!.logo,
    color: reg?.colors[0] ?? own!.palette[0].hex,
    tagline: own?.tagline,
  };
}

export const ProductSchema = z.object({
  sku: z.string().min(3),
  title: z.string().min(3),
  description: z.string(),
  priceSek: z.number().positive(),
  sizes: z.array(z.string()).min(1),
  images: z.array(z.object({ url: z.string(), alt: z.string(), kind: z.enum(["foto", "mockup"]) })).min(1),
  printFileUrl: z.string(),
  fulfilment: z.literal("print-on-demand"),
  dropId: z.string(),
  signal: z.string(),
  tags: z.array(z.string()),
  personalization: z.unknown().optional(),
});

/** `custom` finns när någon anpassat produkten i designstudion. */
export type ShopProduct = z.infer<typeof ProductSchema> & { id: string; publishedAt: string; clubShopId: string; custom?: Omit<Customized, "mockupUrl"> };

const file = (shopId: string) => `intersport/${shopId.replace(/[^a-z0-9-]/g, "")}.json`;

export async function listProducts(shopId: string): Promise<ShopProduct[]> {
  try {
    return JSON.parse((await readData(file(shopId))) ?? "[]");
  } catch {
    return [];
  }
}

export async function addProducts(shopId: string, products: (z.infer<typeof ProductSchema> & Pick<ShopProduct, "custom">)[]) {
  const existing = await listProducts(shopId);
  const now = new Date().toISOString();
  const added: ShopProduct[] = products.map((p) => ({ ...p, id: `isp-${Math.random().toString(36).slice(2, 10)}`, publishedAt: now, clubShopId: shopId }));
  const bySku = new Map(existing.map((p) => [p.sku, p]));
  for (const p of added) bySku.set(p.sku, p);
  await writeData(file(shopId), JSON.stringify([...bySku.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), null, 2));
  return added;
}

/** Ny bild och design på en publicerad produkt, efter att den anpassats i designstudion. */
export async function customizeProduct(shopId: string, id: string, c: Customized) {
  const list = await listProducts(shopId);
  const p = list.find((x) => x.id === id);
  if (!p) return null;
  p.images = [{ url: c.mockupUrl, alt: p.images[0]?.alt ?? p.title, kind: "mockup" }];
  p.custom = { design: c.design, color: c.color };
  await writeData(file(shopId), JSON.stringify(list, null, 2));
  return p;
}
