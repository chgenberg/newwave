import type { Metadata } from "next";
import { Workspace } from "@/components/newwave/workspace/Workspace";
import { CRAFT_CLUBS } from "@/lib/newwave/craft";
import { readCraftRules } from "@/lib/newwave/craftState";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Designa" };

export default async function CraftDesign() {
  const rules = await readCraftRules();
  const clubs = CRAFT_CLUBS.flatMap((c) => (c.logo ? [{ id: c.id, name: c.name, city: c.city, logo: c.logo, logoDark: c.logoDark, colors: c.colors, live: c.live }] : []));
  return <Workspace role={{ kind: "craft", clubs, products: rules.products }} embedded />;
}
