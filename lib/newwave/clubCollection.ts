import { listProducts, type ShopProduct } from "@/lib/intersport";
import { type loadClubShop, mockupUrl, wordmarkSpec } from "./clubShop";

/**
 * Det klubben godkänt under Material och publicerat hos Intersport: veckans kollektion i klubbens butik och i
 * klubbshoppen. Bilderna ligger i demots filarkiv och visas via klubbens egen adress, så att den som bara har klubbens
 * eller butikens länk ser just de här bilderna och inga andra filer.
 */
export const COLLECTION_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png)$/;
const FILE_URL = /^(?:https?:\/\/[^/]+)?\/api\/v1\/files\/([0-9a-f-]{36}\.(?:jpg|png))$/;

export type CollectionItem = {
  id: string;
  sku: string;
  slogan: string;
  name: string;
  title: string;
  description: string;
  priceSek: number;
  sizes: string[];
  images: { url: string; alt: string; kind: "foto" | "mockup" }[];
  dropId: string;
  publishedAt: string;
};
export type CollectionDrop = { id: string; slogan: string; latest: boolean; items: CollectionItem[] };

export const collectionFile = (url: string) => FILE_URL.exec(url)?.[1];

/** "Åsa IF – Slogan – Hoodie svart" → sloganen och produktens namn. */
export function splitTitle(title: string) {
  const [, slogan, ...rest] = title.split(" – ");
  return { slogan: slogan ?? title, name: rest.join(" – ") || title };
}

function toItem(clubId: string, p: ShopProduct): CollectionItem {
  const image = (url: string) => {
    const file = collectionFile(url);
    return file ? `/api/v1/newwave/clubshop/${clubId}/kollektion/${file}` : url;
  };
  const photo = p.images.filter((i) => i.kind === "foto");
  return {
    id: p.id,
    sku: p.sku,
    ...splitTitle(p.title),
    title: p.title,
    description: p.description,
    priceSek: p.priceSek,
    sizes: p.sizes,
    images: [...photo, ...p.images.filter((i) => i.kind !== "foto")].map((i) => ({ ...i, url: image(i.url) })),
    dropId: p.dropId,
    publishedAt: p.publishedAt,
  };
}

/** Alla publicerade produkter, nyast först, och de synliga grupperade per kollektion. */
export async function loadCollection(clubId: string, hidden: readonly string[] = []) {
  const products = await listProducts(clubId);
  const all = products.map((p) => toItem(clubId, p));
  const hide = new Set(hidden);
  const drops: CollectionDrop[] = [];
  for (const it of all) {
    if (hide.has(it.id)) continue;
    const drop = drops.find((d) => d.id === it.dropId) ?? drops[drops.push({ id: it.dropId, slogan: it.slogan, latest: drops.length === 0, items: [] }) - 1];
    drop.items.push(it);
  }
  return { all, drops, visible: drops.flatMap((d) => d.items), files: new Set(products.flatMap((p) => p.images.map((i) => collectionFile(i.url)).filter(Boolean))) };
}

type ClubShop = NonNullable<Awaited<ReturnType<typeof loadClubShop>>>;
export type Sellable = { id: string; name: string; group: string; priceSek: number; flock: boolean; image: string };

/** Allt klubben säljer, dolt eller inte: kollektionerna och ordmärkena. Priserna här gäller, inte webbläsarens. */
export async function sellables(shop: ClubShop): Promise<Sellable[]> {
  const id = shop.club.id;
  const { all } = await loadCollection(id);
  return [
    ...all.map((c) => ({ id: c.id, name: c.name, group: `Kollektion ”${c.slogan}”`, priceSek: c.priceSek, flock: false, image: c.images[0]?.url ?? "" })),
    ...shop.assortment.flatMap((g) => g.items.map((it) => ({ id: it.id, name: it.name, group: g.name, priceSek: it.product.priceSek, flock: it.flock, image: mockupUrl(it.product, wordmarkSpec(it.template.id, it.worn), id, shop.v, 480) }))),
  ];
}
