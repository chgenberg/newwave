import type { Metadata } from "next";
import { CollectionBuilder, type Preset, type ProductOption, type SavedDesign } from "@/components/poc/craft/CollectionBuilder";
import { allTemplates } from "@/lib/newwave/wordmark/store";
import { METHOD_INFO } from "@/lib/newwave/marking";
import { requireRole } from "@/lib/poc/auth";
import { garmentOptions, pocDesign, recolorable, scarfPreviewUrl } from "@/lib/poc/build";
import { baseProduct, POC_CATALOG } from "@/lib/poc/catalog";
import { seasonById } from "@/lib/poc/seasons";
import { designUsage, listDesigns } from "@/lib/poc/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Klubbkollektion" };

/** Klubben som halsduken visas med i produktvalet. */
const SAMPLE = "storvreta-ibk";

/** Förvalen i adressen: kontraktet med säsongerna i docs/poc-flode.md. */
const PARAMS = ["mall", "design", "produkter", "namn", "sport", "lan", "kommun", "sasong"] as const;
type Params = Partial<Record<(typeof PARAMS)[number], string | string[]>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 120) || undefined;
const many = (v: string | string[] | undefined) =>
  [...new Set((one(v) ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 12);

export default async function CraftCollection({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const here = new URLSearchParams(PARAMS.flatMap((k) => (one(p[k]) ? [[k, one(p[k])!] as [string, string]] : [])));
  await requireRole("craft", `/newwave/craft/klubbkollektion${here.size ? `?${here}` : ""}`);
  const [templates, designs, usage] = await Promise.all([allTemplates(), listDesigns().catch(() => []), designUsage().catch(() => ({}) as Awaited<ReturnType<typeof designUsage>>)]);
  const products: ProductOption[] = POC_CATALOG.map((p) => {
    const base = baseProduct(p);
    if (!base) return { ...p, photo: scarfPreviewUrl(SAMPLE, 480) };
    // Klubbens mörkaste färg går när tryckkedjan klarar färgade plagg och Craft inte har egna färger för plagget.
    return { ...p, photo: base.photo, method: METHOD_INFO[pocDesign(base).method].label, colorOptions: garmentOptions(p, base), clubColor: recolorable(base) && !(p.colors && p.colors.length >= 2) };
  });
  const saved: SavedDesign[] = designs.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.source.type,
    template: d.source.type === "ordmall" ? d.source.template : undefined,
    art: d.source.type === "fil" ? `/api/v1/craft/designs/${d.id}/art` : undefined,
    createdAt: d.createdAt,
    published: usage[d.id]?.published ?? 0,
    clubs: usage[d.id]?.clubs ?? 0,
  }));
  const sasong = one(p.sasong);
  const season = sasong ? await seasonById(sasong).catch(() => null) : null;
  const shown = templates.filter((t) => !t.hidden && t.style !== "Rygg").map((t) => ({ id: t.id, name: t.name, style: t.style, own: t.source !== "inbyggd" }));
  const preset: Preset = {
    templates: many(p.mall).filter((id) => shown.some((t) => t.id === id)),
    designIds: many(p.design).filter((id) => saved.some((d) => d.id === id)),
    name: one(p.namn)?.slice(0, 60),
    skus: many(p.produkter),
    sport: one(p.sport),
    county: one(p.lan),
    municipality: one(p.kommun),
    season: sasong ? { id: sasong, label: season?.name ?? season?.label, date: season?.date, hook: season?.hook } : undefined,
  };
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Klubbkollektion</h1>
      <p className="mt-1 max-w-[64ch] text-[14.5px] text-[var(--nw-muted)]">
        Gör designerna en gång och publicera dem som varje klubbs egna i klubbarnas Intersport-shoppar – med klubbens namn, färger och märke. Plaggen trycks hos tryckeriet och halsduken stickas hos stickeriet när kunderna beställer.
      </p>
      <CollectionBuilder templates={shown} products={products} designs={saved} preset={preset} />
    </div>
  );
}
