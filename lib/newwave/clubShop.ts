import { type NwProduct, nwProduct } from "./catalog";
import { readContent } from "./clubShopContent";
import { defaultDesign, METHOD_INFO } from "./marking";
import { readPrefs } from "./wordmark/clubPrefs";
import { COLLECTIONS } from "./wordmark/collections";
import { lacksText, textsFor, type WordmarkClub } from "./wordmark/render";
import { fitScore, type Template } from "./wordmark/schema";
import { type WordmarkSpec, wordmarkUrl } from "./wordmark/spec";
import { type TemplateStat, templateStats } from "./wordmark/stats";
import { allTemplates, featuredTemplates, wordmarkClub } from "./wordmark/store";

/**
 * Klubbens demobutik: katalogens produkter med klubbens ordmärken, utan AI. Sortimentet är klubbens favoriter (eller
 * de mallar som passar namnet bäst) på tröjorna, och kollektionerna – samma stil över hela sortimentet.
 */

export const shopPath = (clubId: string) => `/newwave/klubbar/${clubId}/butik`;

/**
 * Mallarna som passar klubben, bäst först: klubbens favoriter i klubbens ordning, sedan designerna Craft tilldelat alla
 * klubbar, sedan namnets längd och vad andra valt.
 */
export function rankTemplates(templates: Template[], club: WordmarkClub, favorites: string[], featured: string[], stats: Record<string, TemplateStat>) {
  const texts = textsFor(club, {});
  const chars = [...texts.name2].length;
  const order = (list: string[]) => (t: Template) => (list.includes(t.id) ? list.indexOf(t.id) : Infinity);
  const [fav, feat] = [order(favorites), order(featured)];
  return templates
    .filter((t) => !t.hidden && t.style !== "Rygg" && !lacksText(t, texts))
    .sort((a, b) => fav(a) - fav(b) || feat(a) - feat(b) || fitScore(b, chars) - fitScore(a, chars) || (stats[b.id]?.score ?? 0) - (stats[a.id]?.score ?? 0));
}

export const wordmarkSpec = (template: string, worn?: boolean): WordmarkSpec => ({ template, icon: true, ornament: true, ...(worn ? { worn: true } : {}) });

/** Ordmärket som det trycks på produkten: mörk variant på mörka plagg och den lilla versionen för små tryck. `v` tömmer webbläsarens cache när klubben rättat något. */
export const printArt = (p: NwProduct, spec: WordmarkSpec, clubId: string, v: string, size = 1200) =>
  `${wordmarkUrl(spec, clubId, p.dark ? "dark" : "light", size, "png", defaultDesign(p).sizeCm)}&u=${encodeURIComponent(v)}`;

/** Produktfotot med ordmärket på, ritat på servern och sparat. */
export function mockupUrl(p: NwProduct, spec: WordmarkSpec, clubId: string, v: string, size: 480 | 800 | 1200 = 800) {
  return `/api/v1/newwave/mockup?p=${p.id}&l=${encodeURIComponent(printArt(p, spec, clubId, v))}&s=${size}&z=${defaultDesign(p).zone}`;
}

/** Plaggen som kan få namn och nummer på ryggen. */
const FLOCKABLE = new Set(["p001", "p002", "p004", "p005", "p008"]);
/** Tröjorna som klubbens utvalda mallar visas på, i den ordningen. */
const PICKS = ["p004", "p001", "p005", "p002"];

export type ShopItem = {
  id: string;
  product: NwProduct;
  template: Template;
  worn: boolean;
  group: string;
  name: string;
  flock: boolean;
  method: string;
};
export type ShopGroup = { id: string; name: string; blurb: string; items: ShopItem[] };

export function clubAssortment(club: WordmarkClub, ranked: Template[], favorites: string[]): ShopGroup[] {
  const byId = new Map(ranked.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const item = (group: string, productId: string, templateId: string, worn = false): ShopItem[] => {
    const product = nwProduct(productId);
    const template = byId.get(templateId);
    const id = `${templateId}-${productId}${worn ? "-w" : ""}`;
    if (!product || !template || seen.has(id)) return [];
    seen.add(id);
    return [{ id, product, template, worn, group, name: `${product.name} ${template.name}`, flock: FLOCKABLE.has(product.id), method: METHOD_INFO[defaultDesign(product).method].label }];
  };
  const favs = favorites.some((f) => byId.has(f));
  const picks: ShopGroup = {
    id: "utvalt",
    name: favs ? "Klubbens favoriter" : `Utvalt för ${club.name}`,
    blurb: favs ? "Ordmärkena som klubben själv valt ut." : "Ordmärkena som passar klubben bäst.",
    items: PICKS.flatMap((p, i) => (ranked[i] ? item("utvalt", p, ranked[i].id) : [])),
  };
  const collections = COLLECTIONS.map((c) => ({ id: c.id, name: c.name, blurb: c.blurb, items: c.items.flatMap((it) => item(c.id, it.product, it.template, c.worn)) }));
  return [picks, ...collections].filter((g) => g.items.length);
}

export const findItem = (groups: ShopGroup[], id: string) => groups.flatMap((g) => g.items).find((i) => i.id === id);

/**
 * Klubben med sina val, mallarna i ordning och butikens sortiment: `assortment` är allt, `groups` det som syns – utan
 * varorna klubben dolt. `v` ändras när klubben rättat något.
 */
export async function loadClubShop(id: string) {
  const club = await wordmarkClub(id);
  if (!club) return null;
  const [prefs, templates, featured, stats, content] = await Promise.all([readPrefs(id), allTemplates(), featuredTemplates(), templateStats(), readContent(id)]);
  const ranked = rankTemplates(templates, club, prefs.favorites, featured, stats);
  const assortment = clubAssortment(club, ranked, prefs.favorites);
  const hidden = new Set(content.hidden);
  const groups = assortment.map((g) => ({ ...g, items: g.items.filter((i) => !hidden.has(i.id)) })).filter((g) => g.items.length);
  return { club, prefs, ranked, content, assortment, groups, v: prefs.updatedAt ?? "" };
}
