import type { Metadata } from "next";
import type { ProductOption, SavedDesign } from "@/components/poc/craft/CollectionBuilder";
import { ShopEditor } from "@/components/poc/craft/ShopEditor";
import { requireRole } from "@/lib/poc/auth";
import { garmentOptions, recolorable } from "@/lib/poc/build";
import { baseProduct, methodLabelOf, POC_CATALOG } from "@/lib/poc/catalog";
import { listDesigns } from "@/lib/poc/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Shoppar" };

/** Klubbens id som i klubbregistret. */
const CLUB = /^[a-z0-9-]{1,80}$/;

export default async function CraftShops({ searchParams }: { searchParams: Promise<{ klubb?: string | string[] }> }) {
  const raw = (await searchParams).klubb;
  const klubb = typeof raw === "string" && CLUB.test(raw) ? raw : "";
  await requireRole("craft", `/newwave/craft/shoppar${klubb ? `?klubb=${klubb}` : ""}`);
  const designs = await listDesigns().catch(() => []);
  const products: ProductOption[] = POC_CATALOG.map((p) => {
    const base = baseProduct(p);
    return base ? { ...p, photo: base.photo, method: methodLabelOf(base), colorOptions: garmentOptions(p, base), clubColor: recolorable(base) && !(p.colors && p.colors.length >= 2) } : p;
  });
  const saved: SavedDesign[] = designs.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.source.type,
    template: d.source.type === "ordmall" ? d.source.template : undefined,
    art: d.source.type === "fil" ? `/api/v1/craft/designs/${d.id}/art` : undefined,
    createdAt: d.createdAt,
  }));
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Shoppar</h1>
      <p className="mt-1 max-w-[64ch] text-[14.5px] text-[var(--nw-muted)]">
        Det som ligger i en klubbs Intersport-shop: ta bort en produkt, lägg tillbaka den, lägg till en ny eller ändra priset. En borttagen produkt försvinner ur shoppen men finns kvar i ordrarna som redan gjorts.
      </p>
      <ShopEditor initialClub={klubb} designs={saved} products={products} />
    </div>
  );
}
