import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/newwave/workspace/Workspace";
import type { BrandKit } from "@/lib/newwave/brandKit";
import { CURRENT_RESELLER, getReseller } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Återförsäljare · Designa" };

export default async function ResellerDesign() {
  const r = await getReseller(CURRENT_RESELLER);
  if (!r) notFound();
  const { primary, accent } = r.theme;
  const book = r.brandbook;
  const kit: BrandKit = {
    name: r.name,
    colors: book?.colors.length
      ? book.colors
      : [{ name: "Märkesfärg", hex: primary.toUpperCase() }, ...(accent.toUpperCase() !== primary.toUpperCase() ? [{ name: "Accent", hex: accent.toUpperCase() }] : [])],
    fonts: book?.fonts ?? [],
    tone: book?.tone ?? "",
    rules: book?.rules ?? [],
    logo: r.logo ?? null,
    logoDark: r.logoDark ?? null,
    site: r.website ?? "",
    source: { kind: "profil", label: !r.logo ? "Ladda upp loggan under Butiken" : book ? "Er logga och grafiska profil från butiken" : "Er logga och era färger från butiken" },
  };
  return <Workspace role={{ kind: "shop", slug: r.slug, kit, markup: r.markup, products: r.products }} embedded />;
}
