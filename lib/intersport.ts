import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIR = path.join(process.cwd(), ".data", "intersport");

export const MOCK_API_KEY = process.env.INTERSPORT_API_KEY || "demo-intersport-key";

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

export type ShopProduct = z.infer<typeof ProductSchema> & { id: string; publishedAt: string; clubShopId: string };

const file = (shopId: string) => path.join(DIR, `${shopId.replace(/[^a-z0-9-]/g, "")}.json`);

export async function listProducts(shopId: string): Promise<ShopProduct[]> {
  try {
    return JSON.parse(await readFile(file(shopId), "utf8"));
  } catch {
    return [];
  }
}

export async function addProducts(shopId: string, products: z.infer<typeof ProductSchema>[]) {
  await mkdir(DIR, { recursive: true });
  const existing = await listProducts(shopId);
  const now = new Date().toISOString();
  const added: ShopProduct[] = products.map((p) => ({ ...p, id: `isp-${Math.random().toString(36).slice(2, 10)}`, publishedAt: now, clubShopId: shopId }));
  const bySku = new Map(existing.map((p) => [p.sku, p]));
  for (const p of added) bySku.set(p.sku, p);
  await writeFile(file(shopId), JSON.stringify([...bySku.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), null, 2));
  return added;
}
