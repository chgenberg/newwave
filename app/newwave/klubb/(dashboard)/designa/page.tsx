import type { Metadata } from "next";
import { Workspace } from "@/components/newwave/workspace/Workspace";
import type { BrandKit } from "@/lib/newwave/brandKit";
import { ASA_IF } from "@/lib/newwave/club";
import { readBrand } from "@/lib/newwave/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${ASA_IF.name} · Designa` };

export default async function ClubDesign() {
  const brand = await readBrand(ASA_IF.id);
  const palette = brand.palette?.length ? brand.palette : [
    { name: "Svart", hex: ASA_IF.brand.primary },
    { name: "Gul", hex: ASA_IF.brand.accent },
  ];
  const kit: BrandKit = {
    name: ASA_IF.name,
    colors: palette.map((c) => ({ name: c.name, hex: c.hex.toUpperCase() })),
    fonts: [ASA_IF.brand.headingFont],
    tone: brand.toneApproved ? (brand.tone ?? "") : "",
    rules: brand.ownRules?.map((r) => r.text) ?? [],
    logo: ASA_IF.logo,
    logoDark: null,
    site: ASA_IF.website,
    source: { kind: "profil", label: "Klubbens profil från Varumärke" },
  };
  return <Workspace role={{ kind: "klubb", clubId: ASA_IF.id, kit }} embedded />;
}
